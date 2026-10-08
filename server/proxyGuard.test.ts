import { describe, expect, it } from 'vitest';
import { assertChatProxyTarget, assertPublicHttpsTarget, fetchPinned, isPrivateAddress, pinLookup, pinnedAddresses } from './proxyGuard';

const publicResolve = async () => ['93.184.216.34'];

describe('proxy target guard', () => {
  it('blocks private and loopback addresses', () => {
    expect(isPrivateAddress('127.0.0.1')).toBe(true);
    expect(isPrivateAddress('10.1.2.3')).toBe(true);
    expect(isPrivateAddress('192.168.0.5')).toBe(true);
    expect(isPrivateAddress('172.16.0.1')).toBe(true);
    expect(isPrivateAddress('169.254.169.254')).toBe(true);
    expect(isPrivateAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateAddress('8.8.8.8')).toBe(false);
  });

  it('allows a public https host', async () => {
    const url = await assertPublicHttpsTarget('https://example.com/v1/chat/completions', publicResolve);
    expect(url.hostname).toBe('example.com');
  });

  it('allows only a public chat-completions URL through the proxy', async () => {
    const url = await assertChatProxyTarget('https://example.com/v1/chat/completions', publicResolve);
    expect(url.pathname).toBe('/v1/chat/completions');
    await expect(assertChatProxyTarget('https://example.com/secret', publicResolve)).rejects.toThrow(/not allowed/);
    await expect(assertChatProxyTarget('https://169.254.169.254/v1/chat/completions', publicResolve)).rejects.toThrow(/not allowed/);
  });

  it('connects only to the addresses the guard checked', async () => {
    const url = await assertPublicHttpsTarget('https://example.com/v1/chat/completions', publicResolve);
    expect(pinnedAddresses(url)).toEqual(['93.184.216.34']);
    await new Promise<void>((resolve, reject) => {
      pinLookup(pinnedAddresses(url) ?? [])('example.com', {}, (err, address, family) => {
        try {
          expect(err).toBeNull();
          expect(address).toBe('93.184.216.34');
          expect(family).toBe(4);
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });
    const response = await fetchPinned(url, { method: 'POST' }, async (request) => {
      expect(request.addresses).toEqual(['93.184.216.34']);
      expect(request.url.hostname).toBe('example.com');
      return new Response('ok', { status: 200 });
    });
    expect(response.status).toBe(200);
    await expect(fetchPinned(new URL('https://example.com/other'), {}, async () => new Response('no'))).rejects.toThrow(/not allowed/);
  });

  it('rejects non-https, localhost, and private DNS answers', async () => {
    await expect(assertPublicHttpsTarget('http://example.com', publicResolve)).rejects.toThrow(/https/);
    await expect(assertPublicHttpsTarget('https://localhost/v1', publicResolve)).rejects.toThrow(/not allowed/);
    await expect(assertPublicHttpsTarget('https://example.com', async () => ['127.0.0.1'])).rejects.toThrow(/not allowed/);
  });
});
