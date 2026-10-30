import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SKIP_THOUGHT_SIGNATURE, toChatMessages } from './openaiProvider';
import { getToolModel, serverLlmMode } from './serverProvider';
import {
  VERTEX_DEFAULT_FAST_MODEL,
  VERTEX_DEFAULT_MODEL,
  createVertexProvider,
  vertexModelId,
  vertexReasoningEffort,
  vertexUrl,
} from './vertexProvider';

const ENV = ['GOOGLE_CLOUD_PROJECT', 'GCLOUD_PROJECT', 'VERTEX_LOCATION', 'VERTEX_MODEL', 'VERTEX_FAST_MODEL', 'AGORA_SERVER_LLM'] as const;
const saved: Partial<Record<(typeof ENV)[number], string | undefined>> = {};

beforeEach(() => {
  for (const name of ENV) {
    saved[name] = process.env[name];
    delete process.env[name];
  }
});

afterEach(() => {
  for (const name of ENV) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});

interface Seen { url: string; headers: Record<string, string>; body: Record<string, unknown> }

function recorder(replies: unknown[]) {
  const seen: Seen[] = [];
  const fetch = async (url: string, init: RequestInit) => {
    seen.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) as Record<string, unknown> });
    const reply = replies[Math.min(seen.length - 1, replies.length - 1)];
    return new Response(JSON.stringify(reply), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  return { seen, fetch };
}

const TEXT_REPLY = { choices: [{ finish_reason: 'stop', message: { content: 'Pasta.' } }], usage: { prompt_tokens: 3, completion_tokens: 1 } };
const TOOLS = [{ name: 'get_weather', description: 'Weather', input_schema: { type: 'object' as const, properties: { city: { type: 'string' } } } }];

describe('Vertex AI provider', () => {
  it('posts to the Vertex OpenAI endpoint with a fresh token on every request', async () => {
    const { seen, fetch } = recorder([TEXT_REPLY]);
    let issued = 0;
    const provider = createVertexProvider({ project: 'demo-project', token: async () => `token-${++issued}`, fetch, retryDelayMs: 0 });
    await provider.generateCompletion([{ role: 'user', content: 'Hi' }]);
    await provider.generateCompletion([{ role: 'user', content: 'Again' }]);
    expect(seen[0].url).toBe('https://aiplatform.googleapis.com/v1/projects/demo-project/locations/global/endpoints/openapi/chat/completions');
    expect(seen[0].headers.Authorization).toBe('Bearer token-1');
    expect(seen[1].headers.Authorization).toBe('Bearer token-2');
  });

  it('uses the regional host outside global', () => {
    expect(vertexUrl('p', 'us-central1')).toBe('https://us-central1-aiplatform.googleapis.com/v1/projects/p/locations/us-central1/endpoints/openapi/chat/completions');
  });

  it('defaults to Gemini Flash, Flash-Lite for fast turns, and maps swarm names to the default', async () => {
    const { seen, fetch } = recorder([TEXT_REPLY]);
    const provider = createVertexProvider({ project: 'p', token: async () => 't', fetch });
    expect(provider.model).toBe(VERTEX_DEFAULT_MODEL);
    expect(provider.fastModel).toBe(VERTEX_DEFAULT_FAST_MODEL);
    await provider.createMessage({ model: 'anthropic.claude-haiku-4-5', max_tokens: 400, messages: [{ role: 'user', content: 'Hi' }] });
    await provider.createMessage({ model: 'anthropic.claude-sonnet-5', max_tokens: 400, messages: [{ role: 'user', content: 'Hi' }] });
    await provider.generateCompletion([{ role: 'user', content: 'Hi' }], undefined, undefined, 'deepseek-v4.1-flash');
    await provider.generateCompletion([{ role: 'user', content: 'Hi' }], undefined, undefined, 'google/gemini-2.5-pro');
    expect(seen.map((item) => item.body.model)).toEqual([
      VERTEX_DEFAULT_FAST_MODEL, VERTEX_DEFAULT_MODEL, VERTEX_DEFAULT_MODEL, 'google/gemini-2.5-pro',
    ]);
  });

  it('reads models and project from the environment and adds the google/ prefix', () => {
    process.env.GCLOUD_PROJECT = 'fallback-project';
    process.env.VERTEX_MODEL = 'gemini-3.8-pro';
    process.env.VERTEX_FAST_MODEL = 'google/gemini-3.5-flash-lite';
    const provider = createVertexProvider({ token: async () => 't' });
    expect(provider.model).toBe('google/gemini-3.8-pro');
    expect(provider.fastModel).toBe('google/gemini-3.5-flash-lite');
    expect(vertexModelId('', 'x')).toBe('x');
  });

  it('sends reasoning_effort and lifts a small max_tokens so thinking cannot eat the answer', async () => {
    const { seen, fetch } = recorder([TEXT_REPLY]);
    const provider = createVertexProvider({ project: 'p', token: async () => 't', fetch });
    await provider.createMessage({ model: 'anthropic.claude-haiku-4-5', max_tokens: 400, messages: [{ role: 'user', content: 'Hi' }] });
    await provider.createMessage({ model: 'anthropic.claude-sonnet-5', max_tokens: 400, messages: [{ role: 'user', content: 'Hi' }] });
    expect(seen[0].body).toMatchObject({ reasoning_effort: 'minimal', max_tokens: 2048 });
    expect(seen[1].body).toMatchObject({ reasoning_effort: 'low', max_tokens: 2048 });
    expect(vertexReasoningEffort('google/gemini-2.5-pro')).toBeUndefined();
  });

  it('carries the Gemini thought signature from a tool call into the next request', async () => {
    const { seen, fetch } = recorder([
      {
        choices: [{
          finish_reason: 'tool_calls',
          message: {
            role: 'assistant',
            tool_calls: [
              { id: 'call_1', type: 'function', function: { name: 'get_weather', arguments: '{"city":"Paris"}' }, extra_content: { google: { thought_signature: 'SIG-ABC' } } },
              { id: 'call_2', type: 'function', function: { name: 'get_weather', arguments: '{"city":"Tokyo"}' } },
            ],
          },
        }],
      },
      TEXT_REPLY,
    ]);
    const provider = createVertexProvider({ project: 'p', token: async () => 't', fetch });
    const first = await provider.createMessage({ model: 'anthropic.claude-sonnet-5', max_tokens: 400, tools: TOOLS, messages: [{ role: 'user', content: 'Weather?' }] });
    expect(first.stop_reason).toBe('tool_use');
    expect(first.content[0]).toMatchObject({ type: 'tool_use', id: 'call_1', thought_signature: 'SIG-ABC' });

    await provider.createMessage({
      model: 'anthropic.claude-sonnet-5',
      max_tokens: 400,
      tools: TOOLS,
      messages: [
        { role: 'user', content: 'Weather?' },
        { role: 'assistant', content: first.content },
        { role: 'user', content: [
          { type: 'tool_result', tool_use_id: 'call_1', content: '17C' },
          { type: 'tool_result', tool_use_id: 'call_2', content: '20C' },
        ] },
      ],
    });
    const messages = seen[1].body.messages as { role: string; tool_calls?: { id: string; extra_content?: unknown }[] }[];
    const assistant = messages.find((message) => message.role === 'assistant');
    expect(assistant?.tool_calls?.[0]).toMatchObject({ id: 'call_1', extra_content: { google: { thought_signature: 'SIG-ABC' } } });
    expect(assistant?.tool_calls?.[1].extra_content).toBeUndefined();
  });

  it('falls back to the documented skip signature when history lost it, and only in Gemini mode', () => {
    const history = [
      { role: 'user' as const, content: 'Weather?' },
      { role: 'assistant' as const, content: [{ type: 'tool_use' as const, id: 'c1', name: 'get_weather', input: {} }] },
    ];
    expect(toChatMessages(undefined, history, { thoughtSignatures: true })[1].tool_calls?.[0].extra_content)
      .toEqual({ google: { thought_signature: SKIP_THOUGHT_SIGNATURE } });
    expect(toChatMessages(undefined, history)[1].tool_calls?.[0].extra_content).toBeUndefined();
  });

  it('says what to set when no project is configured', async () => {
    const provider = createVertexProvider({ token: async () => 't' });
    await expect(provider.generateCompletion([{ role: 'user', content: 'Hi' }])).rejects.toThrow(/GOOGLE_CLOUD_PROJECT/);
  });

  it('is the tool model when AGORA_SERVER_LLM=vertex', () => {
    process.env.AGORA_SERVER_LLM = 'vertex';
    process.env.GOOGLE_CLOUD_PROJECT = 'p';
    expect(serverLlmMode()).toBe('vertex');
    expect(getToolModel()?.model).toBe(VERTEX_DEFAULT_MODEL);
  });
});
