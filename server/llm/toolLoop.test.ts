import { describe, expect, it } from 'vitest';
import { runToolLoop, type ToolCreateResult, type ToolDefinition } from './toolLoop';

const tools: ToolDefinition[] = [
  {
    name: 'recall',
    description: 'Remember',
    input_schema: { type: 'object', properties: { query: { type: 'string' } } },
  },
  {
    name: 'list_tasks',
    description: 'Tasks',
    input_schema: { type: 'object', properties: {} },
  },
];

describe('tool loop', () => {
  it('sends assistant content back unchanged and returns parallel results in order', async () => {
    const content = [
      { type: 'tool_use', id: 'call_recall', name: 'recall', input: { query: 'milk' } },
      { type: 'tool_use', id: 'call_tasks', name: 'list_tasks', input: {} },
    ];
    let sentBack: unknown;
    const result = await runToolLoop({
      model: 'anthropic.claude-haiku-4-5',
      system: 'Be brief.',
      tools,
      messages: [{ role: 'user', content: 'What is in the fridge?' }],
      maxSteps: 4,
      create: async (params) => {
        if (params.messages.length === 1) return { stop_reason: 'tool_use', content };
        sentBack = params.messages[1]?.content;
        return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Milk is in the fridge.' }] };
      },
      execute: async (name) => {
        if (name === 'list_tasks') await new Promise((resolve) => setTimeout(resolve, 20));
        return name === 'recall' ? { memories: ['milk'] } : { tasks: [] };
      },
    });

    expect(sentBack).toBe(content);
    expect(result.messages[1]?.content).toBe(content);
    expect(result.messages[2]).toMatchObject({
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 'call_recall', is_error: false, content: '{"memories":["milk"]}' },
        { type: 'tool_result', tool_use_id: 'call_tasks', is_error: false, content: '{"tasks":[]}' },
      ],
    });
    expect(result.text).toBe('Milk is in the fridge.');
    expect(result.stopReason).toBe('end_turn');
    expect(result.steps).toBe(1);
    expect(result.toolCalls.map((call) => call.name)).toEqual(['recall', 'list_tasks']);
    expect(result.toolCalls.every((call) => call.ok)).toBe(true);
  });

  it('marks a throwing tool as an error and keeps the other result', async () => {
    const result = await runToolLoop({
      model: 'anthropic.claude-haiku-4-5',
      system: 'Be brief.',
      tools,
      messages: [{ role: 'user', content: 'go' }],
      create: async (params) => {
        if (params.messages.some((message) => message.role === 'assistant')) {
          return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Done.' }] };
        }
        const content: ToolCreateResult['content'] = [
          { type: 'tool_use', id: 'ok', name: 'recall', input: { query: 'a' } },
          { type: 'tool_use', id: 'bad', name: 'list_tasks', input: {} },
        ];
        return { stop_reason: 'tool_use', content };
      },
      execute: async (name) => {
        if (name === 'list_tasks') throw new Error('nope');
        return { memories: ['milk'] };
      },
    });
    const results = result.messages[2]?.content as { is_error: boolean; content: string; tool_use_id: string }[];
    expect(results.map((block) => block.tool_use_id)).toEqual(['ok', 'bad']);
    expect(results[0]?.is_error).toBe(false);
    expect(results[1]).toMatchObject({ is_error: true, content: 'nope' });
    expect(result.toolCalls.map((call) => call.ok)).toEqual([true, false]);
  });

  it('marks a tool that returns an error', async () => {
    const result = await runToolLoop({
      model: 'anthropic.claude-haiku-4-5',
      system: 'Be brief.',
      tools,
      messages: [{ role: 'user', content: 'go' }],
      create: async (params) => {
        if (params.messages.length > 1) {
          return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] };
        }
        return { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'e', name: 'recall', input: {} }] };
      },
      execute: async () => ({ ok: false, error: 'missing' }),
    });
    const block = (result.messages[2]?.content as { is_error: boolean }[])[0];
    expect(block?.is_error).toBe(true);
    expect(result.toolCalls[0]?.ok).toBe(false);
  });

  it('stops after maxSteps tool rounds', async () => {
    let creates = 0;
    const result = await runToolLoop({
      model: 'anthropic.claude-haiku-4-5',
      system: 'Be brief.',
      tools,
      messages: [{ role: 'user', content: 'go' }],
      maxSteps: 2,
      create: async () => {
        creates += 1;
        return {
          stop_reason: 'tool_use',
          content: [{ type: 'tool_use', id: `t${creates}`, name: 'recall', input: { query: 'x' } }],
        };
      },
      execute: async () => ({ memories: [] }),
    });
    expect(creates).toBe(2);
    expect(result.steps).toBe(2);
    expect(result.toolCalls).toHaveLength(2);
    expect(result.stopReason).toBe('tool_use');
  });
});
