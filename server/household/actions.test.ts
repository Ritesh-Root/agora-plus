import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getRunRecord } from '../runEngine';
import { defaultServerProvider } from '../llm/serverProvider';
import type { ServerProvider } from '../society/provider';
import { askAgora, askTimeoutMs, forget, requestRun, setServerProviderFactory } from './actions';
import { clearPendingApprovals, listPendingApprovals, resolveApproval } from './approvals';
import { addMemory } from './memoryStore';
import { setDataDir } from './store';

let dir = '';
const saved = new Map<string, string | undefined>();
const ENV = ['AGORA_SERVER_LLM', 'AGORA_DECIDER', 'DASHSCOPE_API_KEY', 'EXA_API_KEY', 'FIRECRAWL_API_KEY'] as const;

beforeEach(async () => {
  for (const key of ENV) saved.set(key, process.env[key]);
  for (const key of ENV) delete process.env[key];
  clearPendingApprovals();
  dir = await mkdtemp(path.join(tmpdir(), 'agora-actions-'));
  setDataDir(dir);
});

afterEach(async () => {
  setServerProviderFactory(defaultServerProvider);
  clearPendingApprovals();
  await rm(dir, { recursive: true, force: true });
  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('askAgora', () => {
  it('answers with the fact a recall tool returned', async () => {
    await addMemory('Mia is allergic to peanuts', ['allergy'], 'ui');
    const answer = await askAgora('What is Mia allergic to?', {
      create: async (params) => {
        const last = params.messages[params.messages.length - 1];
        const sawResult = JSON.stringify(last?.content ?? '').includes('tool_result');
        if (!sawResult) {
          return {
            stop_reason: 'tool_use',
            content: [{ type: 'tool_use', id: 'call_1', name: 'recall', input: { query: 'allergic' } }],
          };
        }
        const recalled = JSON.stringify(last?.content ?? '');
        const text = recalled.includes('peanuts')
          ? 'Mia is allergic to peanuts.'
          : 'I do not know.';
        return { stop_reason: 'end_turn', content: [{ type: 'text', text }] };
      },
    });
    expect(answer.ok).toBe(true);
    if (!answer.ok) return;
    expect(answer.answer).toContain('peanuts');
    expect(answer.speech).toContain('peanuts');
    expect(answer.toolCalls[0]).toMatchObject({ name: 'recall', ok: true });
  });
});

describe('requestRun', () => {
  it('lists the planned steps and starts those tasks after approval', async () => {
    let plans = 0;
    const provider: ServerProvider = {
      prepareRequest() {},
      takeUsage() {
        return { calls: plans, promptTokens: 0, completionTokens: 0, missingUsage: 0 };
      },
      async generateCompletion(_messages, _tools, systemInstruction) {
        const system = systemInstruction ?? '';
        if (system.includes('You lead this team')) {
          plans += 1;
          if (plans > 1) {
            return {
              content: JSON.stringify([{ id: 'z', title: 'Second plan', role: 'Scout', prompt: 'no' }]),
            };
          }
          return {
            content: JSON.stringify([
              { id: 'a', title: 'Check the pantry', role: 'Scout', prompt: 'Look in the kitchen' },
              { id: 'b', title: 'Draft the menu', role: 'Planner', prompt: 'Draft seven dinners' },
              { id: 'c', title: 'Flag allergies', role: 'Keeper', prompt: 'Check memory for conflicts' },
              { id: 'd', title: 'Write the week', role: 'Agora', prompt: 'Write the meal plan' },
            ]),
          };
        }
        if (system.includes('ONLY a JSON array')) {
          return {
            content: JSON.stringify([
              { agent: 'Check the pantry', score: 90, reason: 'specific' },
              { agent: 'Draft the menu', score: 40, reason: 'thin' },
            ]),
          };
        }
        if (system.includes('spoken summary')) {
          return { content: 'The week of dinners is planned.' };
        }
        if (system.includes('You are Keeper')) {
          return { content: 'Conflict: Mia is allergic to peanuts.' };
        }
        return { content: 'Pasta on Monday.' };
      },
    };
    setServerProviderFactory(async () => provider);

    const pending = await requestRun('Plan dinners this week');
    expect(pending.ok).toBe(true);
    if (!pending.ok) return;
    expect(pending.summary).toBe('Plan: 4 steps — Check the pantry; Draft the menu; Flag allergies; Write the week');
    expect(pending.tasks).toEqual([
      { title: 'Check the pantry', role: 'Scout' },
      { title: 'Draft the menu', role: 'Planner' },
      { title: 'Flag allergies', role: 'Keeper' },
      { title: 'Write the week', role: 'Agora' },
    ]);

    const approved = await resolveApproval(pending.approvalId, 'approve');
    expect(approved.ok).toBe(true);
    if (!approved.ok) return;
    const started = approved.result as { ok?: boolean; runId?: string };
    expect(started.ok).toBe(true);
    const runId = started.runId ?? '';

    const startedAt = Date.now();
    let saved: { status?: string; tasks?: { title: string }[]; spokenSummary?: string } | null = null;
    while (Date.now() - startedAt < 5000) {
      const record = await getRunRecord(runId);
      if (record && record.status !== 'running' && record.status !== 'cancel_requested') {
        saved = record;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
    expect(saved?.status).toBe('complete');
    expect(saved?.tasks?.map((task) => task.title)).toEqual([
      'Check the pantry',
      'Draft the menu',
      'Flag allergies',
      'Write the week',
    ]);
    expect(plans).toBe(1);
    expect(saved?.spokenSummary).toMatch(/allergic to peanuts/);
  });

  it('does not create an approval when the preview fails', async () => {
    const provider: ServerProvider = {
      prepareRequest() {},
      takeUsage() {
        return { calls: 0, promptTokens: 0, completionTokens: 0, missingUsage: 0 };
      },
      async generateCompletion() {
        throw Object.assign(new Error('ThrottlingException (429)'), { status: 429 });
      },
    };
    setServerProviderFactory(async () => provider);
    const pending = await requestRun('Plan dinners this week');
    expect(pending.ok).toBe(false);
    if (pending.ok) return;
    expect(pending.error).toMatch(/unavailable/i);
    expect(listPendingApprovals()).toHaveLength(0);
  });

  it('refuses an order and still plans a week of meals', async () => {
    const refused = await requestRun('Order lunch');
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.error).toMatch(/cannot place orders/i);
    expect('approvalId' in refused).toBe(false);
    expect(listPendingApprovals()).toHaveLength(0);

    for (const goal of ['buy milk', 'book a table', 'make a reservation', 'pay the bill', 'call Mom']) {
      const blocked = await requestRun(goal);
      expect(blocked.ok).toBe(false);
    }

    const provider: ServerProvider = {
      prepareRequest() {},
      takeUsage() {
        return { calls: 0, promptTokens: 0, completionTokens: 0, missingUsage: 0 };
      },
      async generateCompletion() {
        return {
          content: JSON.stringify([
            { id: 'a', title: 'List dinners', role: 'Planner', prompt: 'List seven dinners' },
          ]),
        };
      },
    };
    setServerProviderFactory(async () => provider);
    const meals = await requestRun('Plan dinners for this week and add the groceries');
    expect(meals.ok).toBe(true);
    if (!meals.ok) return;
    expect(meals.approvalId).toEqual(expect.any(String));
    expect(meals.summary).toContain('List dinners');
  });
});

describe('forget', () => {
  it('names the fact a yes would remove', async () => {
    await addMemory('Mia is allergic to peanuts', ['allergy'], 'ui');
    const pending = await forget('peanuts');
    expect(pending.ok).toBe(true);
    if (!pending.ok) return;
    expect(pending.summary).toBe('Forget that Mia is allergic to peanuts? Say yes or no.');
    expect(pending.approvalId).toEqual(expect.any(String));
  });
});

describe('askAgora timeout', () => {
  it('uses about 4 seconds for Alexa and 9 seconds for the simulator', () => {
    expect(askTimeoutMs('alexa')).toBe(4_000);
    expect(askTimeoutMs('simulator')).toBe(9_000);
  });

  it('answers from memory when the model does not finish in time', async () => {
    await addMemory('Mia is allergic to peanuts', ['allergy'], 'ui');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const pending = askAgora('What is Mia allergic to?', {
        timeoutMs: 4_000,
        create: () => new Promise(() => {}),
      });
      await new Promise((resolve) => setImmediate(resolve));
      await vi.advanceTimersByTimeAsync(3_999);
      let settled = false;
      void pending.then(() => {
        settled = true;
      });
      await Promise.resolve();
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      const answer = await pending;
      expect(answer.ok).toBe(true);
      if (!answer.ok) return;
      expect(answer.speech).toContain('peanuts');
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps waiting on the simulator budget past 4 seconds', async () => {
    await addMemory('Mia is allergic to peanuts', ['allergy'], 'ui');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      let answered = false;
      const pending = askAgora('What is Mia allergic to?', {
        timeoutMs: 9_000,
        create: async () => {
          await new Promise((resolve) => setTimeout(resolve, 5_000));
          answered = true;
          return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'From the model.' }] };
        },
      });
      await new Promise((resolve) => setImmediate(resolve));
      await vi.advanceTimersByTimeAsync(4_000);
      expect(answered).toBe(false);
      await vi.advanceTimersByTimeAsync(1_000);
      const answer = await pending;
      expect(answered).toBe(true);
      expect(answer.ok).toBe(true);
      if (!answer.ok) return;
      expect(answer.speech).toContain('From the model');
    } finally {
      vi.useRealTimers();
    }
  });
});
