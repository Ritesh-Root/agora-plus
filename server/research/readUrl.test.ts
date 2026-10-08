import { describe, expect, it, vi } from 'vitest';

vi.mock('../proxyGuard', async () => {
  const actual = await vi.importActual<typeof import('../proxyGuard')>('../proxyGuard');
  return {
    ...actual,
    fetchPinned: vi.fn(async () => new Response('pinned page about peanuts')),
  };
});

import { fetchPinned, pinnedAddresses } from '../proxyGuard';
import { readUrl } from './readUrl';

const publicResolve = async () => ['93.184.216.34'];

describe('readUrl pin', () => {
  it('connects to the Jina reader on the addresses the guard checked', async () => {
    const text = await readUrl('https://example.com/notes', fetch, publicResolve);
    expect(text).toContain('peanuts');
    expect(fetchPinned).toHaveBeenCalledTimes(1);
    const url = vi.mocked(fetchPinned).mock.calls[0][0];
    expect(url.hostname).toBe('r.jina.ai');
    expect(url.pathname).toBe('/https://example.com/notes');
    expect(pinnedAddresses(url)).toEqual(['93.184.216.34']);
  });
});
