import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getRunRecord } from '../runEngine';
import { defaultServerProvider } from '../llm/serverProvider';
import type { ServerProvider } from '../society/provider';
import { addTask, dailyBriefing, householdSnapshot, recall, remember, requestRun, setServerProviderFactory, askAgora } from './actions';
import { clearPendingApprovals, resolveApproval } from './approvals';
import { addMemory } from './memoryStore';
import { setDataDir } from './store';

let dir = '';
const saved = new Map<string, string | undefined>();
const ENV = ['AGORA_SERVER_LLM', 'AGORA_DECIDER', 'DASHSCOPE_API_KEY', 'EXA_API_KEY', 'FIRECRAWL_API_KEY', 'AGORA_TIMEZONE'] as const;

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

describe('household memory and tasks', () => {
  it('remembers a person once, recalls a tie as two facts, and keeps due today in the household zone', async () => {
    process.env.AGORA_TIMEZONE = 'America/Los_Angeles';
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-08T20:00:00.000Z'));
    try {
      const first = await remember('Mia is allergic to peanuts', ['allergy'], 'voice');
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      expect(first.memory.who).toBe('Mia');
      expect(first.created).toBe(true);
      const again = await remember('mia is allergic to peanuts.', [], 'ui');
      expect(again.ok).toBe(true);
      if (!again.ok) return;
      expect(again.created).toBe(false);
      expect(again.memory.id).toBe(first.memory.id);

      await remember('Mia is allergic to shellfish', [], 'voice');
      const both = await recall('allergic');
      expect(both.speech).toContain('peanuts');
      expect(both.speech).toContain('shellfish');

      const saved = await addTask('Take the bins out', 'due today', 'ui', { list: 'shopping', who: 'Jen' });
      expect(saved.ok).toBe(true);
      if (!saved.ok) return;
      expect(saved.task.due).toBe('2026-10-08');
      expect(saved.task.list).toBe('shopping');
      expect(saved.task.who).toBe('Jen');
      const snap = await householdSnapshot();
      expect(snap.memory.some((entry) => entry.who === 'Mia')).toBe(true);
      expect(snap.tasks.some((task) => task.list === 'shopping' && task.who === 'Jen')).toBe(true);
      const day = await dailyBriefing();
      expect(day.speech).toContain('Remember:');
      expect(day.speech).toContain('allergic');
      expect(day.speech).toContain('due today');
    } finally {
      vi.useRealTimers();
    }
  });
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
});
