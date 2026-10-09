import { describe, expect, it } from 'vitest';
import { createOpenAiCompatibleProvider, stripThinking, toChatMessages, toMessage, withNoThink } from './openaiProvider';

function fakeFetch(reply: unknown, seen: { url?: string; body?: Record<string, unknown> } = {}) {
  return async (url: string, init: RequestInit) => {
    seen.url = url;
    seen.body = JSON.parse(String(init.body)) as Record<string, unknown>;
    return new Response(JSON.stringify(reply), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
}

describe('OpenAI-compatible provider', () => {
  it('turns tool_use and tool_result blocks into tool_calls and tool messages', () => {
    const chat = toChatMessages('Be brief.', [
      { role: 'user', content: 'Remember Mia is allergic to peanuts' },
      { role: 'assistant', content: [{ type: 'tool_use', id: 'c1', name: 'remember', input: { text: 'Mia is allergic to peanuts' } }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'c1', content: '{"status":"ok"}' }] },
    ]);
    expect(chat).toEqual([
      { role: 'system', content: 'Be brief.' },
      { role: 'user', content: 'Remember Mia is allergic to peanuts' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [{ id: 'c1', type: 'function', function: { name: 'remember', arguments: '{"text":"Mia is allergic to peanuts"}' } }],
      },
      { role: 'tool', tool_call_id: 'c1', content: '{"status":"ok"}' },
    ]);
  });

  it('reads tool calls back as tool_use blocks and stops for the tool', () => {
    const message = toMessage({
      choices: [{
        finish_reason: 'tool_calls',
        message: { content: null, tool_calls: [{ id: 'x', function: { name: 'recall', arguments: '{"query":"Mia"}' } }] },
      }],
      usage: { prompt_tokens: 10, completion_tokens: 4 },
    }, 'Qwen/Qwen3-32B');
    expect(message.stop_reason).toBe('tool_use');
    expect(message.content).toEqual([{ type: 'tool_use', id: 'x', name: 'recall', input: { query: 'Mia' }, caller: { type: 'direct' } }]);
    expect(message.usage.input_tokens).toBe(10);
  });

  it('drops a reasoning block and asks Qwen 3 not to think', () => {
    expect(stripThinking('<think>plan</think>\nDinner is pasta.')).toBe('Dinner is pasta.');
    expect(withNoThink([{ role: 'system', content: 'Be brief.' }], 'Qwen/Qwen3-32B')[0].content).toBe('Be brief.\n/no_think');
    expect(withNoThink([{ role: 'user', content: 'Hi' }], 'Qwen/Qwen3-32B')[0]).toEqual({ role: 'system', content: '/no_think' });
    expect(withNoThink([{ role: 'user', content: 'Hi' }], 'moonshotai/Kimi-K2-Instruct')).toHaveLength(1);
  });

  it('maps a Claude or DeepSeek model name to the configured model and posts to chat completions', async () => {
    const seen: { url?: string; body?: Record<string, unknown> } = {};
    const provider = createOpenAiCompatibleProvider({
      baseUrl: 'https://api.example.test/v1',
      apiKey: 'test-key',
      model: 'Qwen/Qwen3-32B',
      fetch: fakeFetch({ choices: [{ finish_reason: 'stop', message: { content: 'Pasta on Monday.' } }] }, seen),
    });
    const reply = await provider.createMessage({
      model: 'anthropic.claude-haiku-4-5',
      max_tokens: 100,
      system: 'Be brief.',
      tools: [{ name: 'recall', description: 'Look up a fact', input_schema: { type: 'object', properties: {} } }],
      messages: [{ role: 'user', content: 'Plan dinner' }],
    });
    expect(seen.url).toBe('https://api.example.test/v1/chat/completions');
    expect(seen.body?.model).toBe('Qwen/Qwen3-32B');
    expect(seen.body?.tools).toEqual([{ type: 'function', function: { name: 'recall', description: 'Look up a fact', parameters: { type: 'object', properties: {} } } }]);
    expect(reply.stop_reason).toBe('end_turn');
    expect(reply.content).toEqual([{ type: 'text', text: 'Pasta on Monday.', citations: null }]);

    const completion = await provider.generateCompletion([{ role: 'user', content: 'Hi' }], undefined, 'Be brief.', 'deepseek-v4.1-flash');
    expect(seen.body?.model).toBe('Qwen/Qwen3-32B');
    expect(completion.content).toBe('Pasta on Monday.');
  });

  it('says what to set when the endpoint is not configured', async () => {
    const provider = createOpenAiCompatibleProvider({ baseUrl: '', apiKey: '', model: '' });
    await expect(provider.generateCompletion([{ role: 'user', content: 'Hi' }])).rejects.toThrow(/AGORA_LLM_BASE_URL/);
  });
});

describe('OpenAI-compatible provider retries', () => {
  it('tries once more when the endpoint reports an error inside a 200', async () => {
    let calls = 0;
    const provider = createOpenAiCompatibleProvider({
      baseUrl: 'https://api.example.test/v1',
      apiKey: 'test-key',
      model: 'Qwen/Qwen3-14B',
      retryDelayMs: 0,
      fetch: async () => {
        calls += 1;
        const body = calls === 1
          ? { error: { message: 'No successful response received from completion service', code: 'no_response' } }
          : { choices: [{ finish_reason: 'stop', message: { content: 'Tacos on Tuesday.' } }] };
        return new Response(JSON.stringify(body), { status: 200 });
      },
    });
    const reply = await provider.generateCompletion([{ role: 'user', content: 'Plan dinner' }]);
    expect(calls).toBe(2);
    expect(reply.content).toBe('Tacos on Tuesday.');
  });

  it('gives up after the retries with the endpoint message', async () => {
    let calls = 0;
    const provider = createOpenAiCompatibleProvider({
      baseUrl: 'https://api.example.test/v1',
      apiKey: 'test-key',
      model: 'Qwen/Qwen3-14B',
      retryDelayMs: 0,
      fetch: async () => {
        calls += 1;
        return new Response('busy', { status: 503 });
      },
    });
    await expect(provider.generateCompletion([{ role: 'user', content: 'Hi' }])).rejects.toThrow(/503/);
    expect(calls).toBe(3);
  });

  it('keeps at most two requests in flight across providers', async () => {
    let inFlight = 0;
    let peak = 0;
    const slowFetch = async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 20));
      inFlight -= 1;
      return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: 'ok' } }] }), { status: 200 });
    };
    const make = () => createOpenAiCompatibleProvider({
      baseUrl: 'https://api.example.test/v1', apiKey: 'test-key', model: 'Qwen/Qwen3-14B', fetch: slowFetch,
    });
    const a = make();
    const b = make();
    const replies = await Promise.all([a, b, a, b, a].map((provider) => provider.generateCompletion([{ role: 'user', content: 'Hi' }])));
    expect(replies.every((reply) => reply.content === 'ok')).toBe(true);
    expect(peak).toBe(2);
  });
});
