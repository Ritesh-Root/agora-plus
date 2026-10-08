import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveRoutedAccess } from './modelAccess';
import { createRoutingProvider } from './routingProvider';

const publicResolve = async () => ['93.184.216.34'];

describe('routed model access', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.DASHSCOPE_API_KEY;
  });

  it('keeps a custom endpoint off the server key and off another agent key', async () => {
    process.env.DASHSCOPE_API_KEY = 'server-key';
    const access = await resolveRoutedAccess({
      apiKey: 'default-key',
      baseUrl: 'https://token-plan.maas.qwencloudapi.com/compatible-mode/v1',
      agents: [
        { name: 'Writer', own: true, apiKey: '', baseUrl: 'https://example.com/v1', model: 'writer-model' },
        { name: 'Editor', own: true, apiKey: 'editor-key', baseUrl: 'https://example.com/v1', model: 'editor-model' },
      ],
    }, publicResolve);
    expect(access.fallback).toMatchObject({ apiKey: 'default-key' });
    expect(access.agents[0]).toMatchObject({ name: 'Writer' });
    expect('error' in access.agents[0]).toBe(true);
    expect(JSON.stringify(access.agents[0])).not.toContain('server-key');
    expect(JSON.stringify(access.agents[0])).not.toContain('editor-key');
    expect(access.agents[1]).toMatchObject({ name: 'Editor', apiKey: 'editor-key' });
  });

  it('sends each agent to its own endpoint and does not retry a failure with the other key', async () => {
    const seen: Array<{ url: string; key: string; model: string }> = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      const headers = init.headers as Record<string, string>;
      const body = JSON.parse(String(init.body));
      seen.push({ url, key: headers.Authorization, model: body.model });
      if (headers.Authorization === 'Bearer key-a') {
        return new Response('no', { status: 401 });
      }
      return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    const provider = createRoutingProvider({
      fallback: { apiKey: 'fallback-key', baseUrl: 'https://fallback.example/v1/chat/completions' },
      agents: [
        { name: 'Writer', apiKey: 'key-a', baseUrl: 'https://a.example/v1/chat/completions', model: 'model-a' },
        { name: 'Editor', apiKey: 'key-b', baseUrl: 'https://b.example/v1/chat/completions', model: 'model-b' },
      ],
    });
    provider.prepareRequest({ stage: 'worker', agent: 'Writer', attempt: 1 });
    await expect(provider.generateCompletion([{ role: 'user', content: 'go' }])).rejects.toThrow(/401/);
    provider.prepareRequest({ stage: 'worker', agent: 'Editor', attempt: 1 });
    const editor = await provider.generateCompletion([{ role: 'user', content: 'go' }]);
    expect(editor.content).toBe('ok');
    expect(seen.map((call) => call.key)).toEqual(['Bearer key-a', 'Bearer key-b']);
    expect(seen[0].url).toContain('a.example');
    expect(seen[1].url).toContain('b.example');
    expect(seen[0].model).toBe('model-a');
    expect(seen[1].model).toBe('model-b');
    expect(seen.some((call) => call.key === 'Bearer fallback-key')).toBe(false);
  });
});
