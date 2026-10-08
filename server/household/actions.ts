import { isFailed, resolveRoutedAccess } from '../modelAccess';
import { listRecentRuns, startSocietyRun } from '../runEngine';
import { createRoutingProvider } from '../routingProvider';
import type { ServerProvider } from '../society/provider';
import { listPendingApprovals, registerApprovalHandler, requestApproval } from './approvals';
import { buildBriefing } from './briefing';
import {
  addMemory,
  listMemory,
  removeMemory,
  searchMemory,
  updateMemory,
  type HouseholdSource,
  type MemoryEntry,
} from './memoryStore';
import { addTask as createTask, completeTask as finishTask, listTasks as readTasks } from './taskStore';
import { toSpeech } from './speech';
import { HOUSEHOLD_TEAM } from './team';

export type { HouseholdSource };

export interface Receipt {
  action: string;
  id: string;
  verified: boolean;
  at: string;
}

type ProviderFactory = () => Promise<ServerProvider>;

/** Server key only. Phase 3 replaces this factory with Bedrock. */
let providerFactory: ProviderFactory = async () => {
  const access = await resolveRoutedAccess({});
  if (isFailed(access.fallback)) {
    const reason = access.fallback.error;
    throw reason instanceof Error ? reason : new Error('No server model is configured.');
  }
  return createRoutingProvider(access);
};

export function setServerProviderFactory(fn: ProviderFactory): void {
  providerFactory = fn;
}

export function getServerProvider(): Promise<ServerProvider> {
  return providerFactory();
}

function receipt(action: string, id: string, verified: boolean): Receipt {
  return { action, id, verified, at: new Date().toISOString() };
}

function clip(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`;
}

function householdBrief(goal: string, memories: MemoryEntry[]): string {
  const top = memories.slice(0, 8);
  if (top.length === 0) return goal;
  return `${goal}\n\nHousehold memory:\n${top.map((entry) => `- ${entry.text}`).join('\n')}`;
}

registerApprovalHandler('forget', async (payload) => {
  const id = payload && typeof payload === 'object' && typeof (payload as { id?: unknown }).id === 'string'
    ? (payload as { id: string }).id
    : '';
  if (!id) throw new Error('Memory not found.');
  const removed = await removeMemory(id);
  if (!removed) throw new Error('Memory not found.');
  const verified = !(await listMemory()).some((entry) => entry.id === id);
  return { receipt: receipt('forget', id, verified) };
});

registerApprovalHandler('start_run', async (payload) => {
  const goal = payload && typeof payload === 'object' && typeof (payload as { goal?: unknown }).goal === 'string'
    ? (payload as { goal: string }).goal.trim()
    : '';
  if (!goal) throw new Error('A goal is required.');
  const memories = await searchMemory(goal);
  const provider = await getServerProvider();
  return startSocietyRun({
    brief: householdBrief(goal, memories),
    provider,
    team: HOUSEHOLD_TEAM,
    source: 'household',
  });
});

export async function remember(text: string, tags: string[] | undefined, source: HouseholdSource) {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false as const, error: 'Memory text is required.' };
  const entry = await addMemory(trimmed, tags ?? [], source);
  const back = (await listMemory()).find((item) => item.id === entry.id);
  return {
    ok: true as const,
    memory: entry,
    receipt: receipt('remember', entry.id, !!back && back.text === entry.text),
  };
}

export async function recall(query: string) {
  return { memories: await searchMemory(query) };
}

export async function forget(memoryIdOrQuery: string) {
  const query = memoryIdOrQuery.trim();
  if (!query) return { ok: false as const, error: 'Say which memory to forget.' };
  const byId = (await listMemory()).find((entry) => entry.id === query);
  const target = byId ?? (await searchMemory(query))[0];
  if (!target) return { ok: false as const, error: 'No matching memory.' };
  const approval = requestApproval('forget', `Forget: ${clip(target.text, 80)}`, { id: target.id });
  return {
    ok: true as const,
    status: 'needs_approval' as const,
    approvalId: approval.id,
    summary: approval.summary,
  };
}

/** UI edit. Does not ask for approval. */
export async function editMemory(id: string, patch: { text?: string; tags?: string[] }) {
  if (patch.text !== undefined && !patch.text.trim()) return { ok: false as const, error: 'Memory text is required.' };
  const updated = await updateMemory(id, patch);
  if (!updated) return { ok: false as const, error: 'Memory not found.' };
  const back = (await listMemory()).find((item) => item.id === id);
  const verified = !!back
    && back.text === updated.text
    && back.tags.join('\n') === updated.tags.join('\n');
  return { ok: true as const, memory: updated, receipt: receipt('edit_memory', id, verified) };
}

/** UI delete. Does not ask for approval. */
export async function deleteMemory(id: string) {
  const removed = await removeMemory(id);
  if (!removed) return { ok: false as const, error: 'Memory not found.' };
  const verified = !(await listMemory()).some((entry) => entry.id === id);
  return { ok: true as const, memory: removed, receipt: receipt('delete_memory', id, verified) };
}

export async function addTask(title: string, due: string | undefined, source: HouseholdSource) {
  const trimmed = title.trim();
  if (!trimmed) return { ok: false as const, error: 'A task title is required.' };
  const task = await createTask(trimmed, due?.trim() || undefined, source);
  const back = (await readTasks()).find((item) => item.id === task.id);
  return {
    ok: true as const,
    task,
    receipt: receipt('add_task', task.id, !!back && back.title === task.title && back.status === 'open'),
  };
}

export async function listTasks(status?: 'open' | 'done') {
  return { tasks: await readTasks(status) };
}

export async function completeTask(idOrTitle: string) {
  const task = await finishTask(idOrTitle);
  if (!task) return { ok: false as const, error: 'Task not found.' };
  const back = (await readTasks()).find((item) => item.id === task.id);
  const verified = !!back && back.status === 'done' && back.completedAt === task.completedAt;
  return { ok: true as const, task, receipt: receipt('complete_task', task.id, verified) };
}

async function briefingInput() {
  const [tasks, memory, recentRuns] = await Promise.all([
    readTasks(),
    listMemory(),
    listRecentRuns(10),
  ]);
  return { tasks, memory, pendingApprovals: listPendingApprovals(), recentRuns, now: new Date() };
}

export async function dailyBriefing() {
  return buildBriefing(await briefingInput());
}

/**
 * Phase 2: hold the goal for a yes. The preview is fixed text, not a model plan.
 * Phase 3 fills the preview from planSociety before the same approval.
 */
export async function planAndRun(goal: string) {
  const trimmed = goal.trim();
  if (!trimmed) return { ok: false as const, error: 'A goal is required.' };
  const preview = `Plan: ${clip(trimmed, 120)}. The household team starts only after you approve.`;
  const approval = requestApproval('start_run', preview, { goal: trimmed });
  return {
    ok: true as const,
    status: 'needs_approval' as const,
    approvalId: approval.id,
    summary: approval.summary,
    preview,
  };
}

/** Phase 2 answers from saved memory only. Phase 3 replaces this with the model tool loop. */
export async function askAgora(question: string) {
  const trimmed = question.trim();
  if (!trimmed) return { ok: false as const, error: 'Ask a question about the household.' };
  const memories = await searchMemory(trimmed);
  const best = memories[0];
  const speech = best
    ? toSpeech(`I remember this: ${best.text}`)
    : 'I do not have anything saved about that yet.';
  return { ok: true as const, speech, memories: memories.slice(0, 5) };
}

/** Phase 2 stub. Phase 3 calls Firecrawl or Exa. This does not touch the network. */
export async function webResearch(question: string) {
  if (!question.trim()) return { ok: false as const, error: 'Ask a question to research.' };
  return { ok: false as const, error: 'Web research is not configured yet.' };
}

export async function householdSnapshot() {
  const input = await briefingInput();
  const briefing = buildBriefing(input);
  return {
    memory: input.memory,
    tasks: input.tasks,
    pendingApprovals: input.pendingApprovals,
    recentRuns: input.recentRuns,
    suggestions: briefing.suggestions,
  };
}
