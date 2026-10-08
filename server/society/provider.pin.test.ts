import { describe, expect, it, vi } from 'vitest';

vi.mock('../proxyGuard', async () => {
  const actual = await vi.importActual<typeof import('../proxyGuard')>('../proxyGuard');
  return {
    ...actual,
    fetchPinned: vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: 'pinned' } }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })),
  };
});

import { assertPublicHttpsTarget, fetchPinned } from '../proxyGuard';
import { createServerProvider } from './provider';

describe('pinned model fetch', () => {
  it('sends a checked model URL through the pinned connection', async () => {
    const url = await assertPublicHttpsTarget('https://example.com/v1/chat/completions', async () => ['93.184.216.34']);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const provider = createServerProvider('caller-key', { baseUrl: url.toString(), endpoint: url });
    const result = await provider.generateCompletion([{ role: 'user', content: 'hi' }]);
    expect(result.content).toBe('pinned');
    expect(fetchPinned).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetchPinned).mock.calls[0][0]).toBe(url);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
