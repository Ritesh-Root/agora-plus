import { afterEach, describe, expect, it } from 'vitest';
import { resolveModelAccess } from './modelAccess';
import { pinnedAddresses } from './proxyGuard';

const publicResolve = async () => ['93.184.216.34'];

describe('server key routing', () => {
  const previous = process.env.DASHSCOPE_API_KEY;
  afterEach(() => {
    if (previous === undefined) delete process.env.DASHSCOPE_API_KEY;
    else process.env.DASHSCOPE_API_KEY = previous;
  });

  it('sends the server key only to the approved host', async () => {
    process.env.DASHSCOPE_API_KEY = 'server-key';
    const access = await resolveModelAccess(
      { baseUrl: 'https://token-plan.maas.qwencloudapi.com/compatible-mode/v1' },
      publicResolve,
    );
    expect(access.apiKey).toBe('server-key');
    expect(access.baseUrl).toContain('token-plan.maas.qwencloudapi.com');
    expect(access.endpoint?.toString()).toBe(access.baseUrl);
    expect(pinnedAddresses(access.endpoint as URL)).toEqual(['93.184.216.34']);
  });

  it('refuses to send the server key to a custom endpoint', async () => {
    process.env.DASHSCOPE_API_KEY = 'server-key';
    await expect(
      resolveModelAccess({ baseUrl: 'https://example.com/v1' }, publicResolve),
    ).rejects.toThrow(/Add an API key for that model endpoint/);
  });

  it('uses the caller key for a custom endpoint and never the server key', async () => {
    process.env.DASHSCOPE_API_KEY = 'server-key';
    const access = await resolveModelAccess(
      { apiKey: 'caller-key', baseUrl: 'https://example.com/v1' },
      publicResolve,
    );
    expect(access.apiKey).toBe('caller-key');
  });
});
