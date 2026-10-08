import type { Message } from '@anthropic-ai/sdk/resources/messages';
import { describe, expect, it } from 'vitest';
import { createBedrockProvider, PREVIEW_TIMEOUT_MS, SWARM_TIMEOUT_MS, type BedrockClient } from './bedrockProvider';

function message(text: string, extra: Partial<Message> = {}): Message {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'anthropic.claude-sonnet-5',
    content: [{ type: 'text', text, citations: null }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    stop_details: null,
    container: null,
    diagnostics: null,
    usage: {
      input_tokens: 11,
      output_tokens: 7,
      cache_creation: null,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      inference_geo: null,
      output_tokens_details: null,
      server_tool_use: null,
      service_tier: null,
    },
    ...extra,
  } as Message;
}

describe('bedrock provider', () => {
  it('appends system turns, merges consecutive roles, and starts with user', async () => {
    const seen: unknown[] = [];
    const client: BedrockClient = {
      messages: {
        create: async (params) => {
          seen.push(params);
          return message('Plan ready.');
        },
      },
    };
    const provider = createBedrockProvider({ client, model: 'anthropic.claude-sonnet-5' });
    const result = await provider.generateCompletion(
      [
        { role: 'system', content: 'Be brief.' },
        { role: 'assistant', content: 'Earlier.' },
        { role: 'user', content: 'One.' },
        { role: 'user', content: 'Two.' },
        { role: 'assistant', content: 'Ok.' },
        { role: 'assistant', content: 'More.' },
      ],
      undefined,
      'You are Agora.',
    );
    expect(seen[0]).toMatchObject({
      model: 'anthropic.claude-sonnet-5',
      max_tokens: 8000,
      system: 'You are Agora.\n\nBe brief.',
      messages: [
        { role: 'user', content: 'Continue.' },
        { role: 'assistant', content: 'Earlier.' },
        { role: 'user', content: 'One.\n\nTwo.' },
        { role: 'assistant', content: 'Ok.\n\nMore.' },
      ],
    });
    expect((seen[0] as { temperature?: unknown }).temperature).toBeUndefined();
    expect(result.content).toBe('Plan ready.');
  });

  it('maps office model names onto the default and keeps anthropic ids', async () => {
    const models: string[] = [];
    const client: BedrockClient = {
      messages: {
        create: async (params) => {
          models.push(params.model);
          return message('ok', {
            content: [
              { type: 'text', text: 'Plan ', citations: null },
              { type: 'text', text: 'ready.', citations: null },
            ],
          });
        },
      },
    };
    const provider = createBedrockProvider({
      client,
      model: 'anthropic.claude-sonnet-5',
      fastModel: 'anthropic.claude-haiku-4-5',
    });
    expect(provider.model).toBe('anthropic.claude-sonnet-5');
    expect(provider.fastModel).toBe('anthropic.claude-haiku-4-5');
    const joined = await provider.generateCompletion(
      [{ role: 'user', content: 'hi' }],
      undefined,
      undefined,
      'deepseek-v4.1-flash',
    );
    await provider.generateCompletion(
      [{ role: 'user', content: 'hi' }],
      undefined,
      undefined,
      'qwen3.7-plus',
    );
    await provider.generateCompletion(
      [{ role: 'user', content: 'hi' }],
      undefined,
      undefined,
      'anthropic.claude-haiku-4-5',
    );
    expect(models).toEqual([
      'anthropic.claude-sonnet-5',
      'anthropic.claude-sonnet-5',
      'anthropic.claude-haiku-4-5',
    ]);
    expect(joined.content).toBe('Plan ready.');
    expect(joined.usage).toEqual({ promptTokens: 11, completionTokens: 7, totalTokens: 18 });
    expect(provider.takeUsage()).toMatchObject({
      calls: 3,
      promptTokens: 33,
      completionTokens: 21,
      missingUsage: 0,
    });
  });

  it('turns a refusal into a friendly error', async () => {
    const client: BedrockClient = {
      messages: {
        create: async () => message('', { stop_reason: 'refusal' }),
      },
    };
    const provider = createBedrockProvider({ client, model: 'anthropic.claude-sonnet-5' });
    await expect(provider.generateCompletion(
      [{ role: 'user', content: 'hi' }],
    )).rejects.toThrow('The model declined this request.');
    expect(provider.takeUsage()).toMatchObject({ calls: 1, promptTokens: 11, completionTokens: 7, missingUsage: 0 });
  });

  it('bounds preview and summary calls shorter than swarm workers', async () => {
    const seen: { timeout?: number; maxRetries?: number }[] = [];
    const client: BedrockClient = {
      messages: {
        create: async (_params, options) => {
          seen.push({ timeout: options?.timeout, maxRetries: options?.maxRetries });
          return message('ok');
        },
      },
    };
    const provider = createBedrockProvider({ client, model: 'anthropic.claude-sonnet-5' });
    provider.prepareRequest({ stage: 'planning', agent: 'Agora', attempt: 1 });
    await provider.generateCompletion([{ role: 'user', content: 'plan' }]);
    provider.prepareRequest({ stage: 'summary', agent: 'Agora', attempt: 1 });
    await provider.generateCompletion([{ role: 'user', content: 'speak' }]);
    provider.prepareRequest({ stage: 'worker', agent: 'Scout', attempt: 1 });
    await provider.generateCompletion([{ role: 'user', content: 'work' }]);
    expect(seen[0]).toEqual({ timeout: PREVIEW_TIMEOUT_MS, maxRetries: 0 });
    expect(seen[1]).toEqual({ timeout: PREVIEW_TIMEOUT_MS, maxRetries: 0 });
    expect(seen[2]?.timeout).toBe(SWARM_TIMEOUT_MS);
    expect(seen[2]?.maxRetries).toBe(1);
    expect(SWARM_TIMEOUT_MS).toBeGreaterThan(PREVIEW_TIMEOUT_MS);
    expect(SWARM_TIMEOUT_MS).toBeLessThan(10 * 60 * 1000);
  });
});
