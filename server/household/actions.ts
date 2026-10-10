import { getHub } from '../hub';
import type { BedrockCreateParams, BedrockProvider } from '../llm/bedrockProvider';
import { defaultServerProvider } from '../llm/serverProvider';
import { runToolLoop, type ToolCreate, type ToolDefinition } from '../llm/toolLoop';
import { listRecentRuns, getRunRecord, startSocietyRun, type RunRecord } from '../runEngine';
import { quickResearch, researchConfigured, type ResearchSource } from '../research/research';
import { planSociety, type SocietyTask } from '../society/Orchestrator';
import type { ServerProvider } from '../society/provider';
import { listPendingApprovals, registerApprovalHandler, requestApproval } from './approvals';
import { buildBriefing, isSafetyFact } from './briefing';
import { resolveDueText } from './clock';
import {
  answerRecall,
  listMemory,
  normaliseFact,
  removeMemory,
  saveMemory,
  searchMemory,
  speakRecall,
  updateMemory,
  type HouseholdSource,
  type MemoryEntry,
} from './memoryStore';
import { addTask as createTask, completeTask as finishTask, listTasks as readTasks, reopenTask as reopenStored, removeTask as removeStored, type TaskFields } from './taskStore';
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

/** Bedrock or the OpenAI-compatible endpoint (AGORA_SERVER_LLM), otherwise the server API key. */
let providerFactory: ProviderFactory = defaultServerProvider;

export function setServerProviderFactory(fn: ProviderFactory): void {
  providerFactory = fn;
}

export function getServerProvider(): Promise<ServerProvider> {
  return providerFactory();
}

function receipt(action: string, id: string, verified: boolean): Receipt {
  return { action, id, verified, at: new Date().toISOString() };
}

/**
 * What the team should know for a plan: every safety fact (an allergy matters to a dinner plan
 * even when the goal never names it), then the facts that match the goal. Same text once.
 */
export function planningMemory(matched: MemoryEntry[], all: MemoryEntry[]): MemoryEntry[] {
  const seen = new Set<string>();
  const picked: MemoryEntry[] = [];
  for (const entry of [...all.filter(isSafetyFact), ...matched]) {
    const key = normaliseFact(entry.text);
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(entry);
  }
  return picked;
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

function asTasks(value: unknown): SocietyTask[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const tasks: SocietyTask[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    const role = typeof item.role === 'string' ? item.role.trim() : '';
    if (!title || !role) continue;
    const prompt = typeof item.prompt === 'string' && item.prompt.trim() ? item.prompt : title;
    const id = typeof item.id === 'string' && item.id.trim() ? item.id : `t${tasks.length + 1}`;
    const deps = Array.isArray(item.deps)
      ? item.deps.filter((dep): dep is string => typeof dep === 'string')
      : undefined;
    tasks.push({ id, title, role, prompt, deps });
  }
  return tasks.length > 0 ? tasks : undefined;
}

registerApprovalHandler('start_run', async (payload) => {
  const record = payload && typeof payload === 'object'
    ? payload as { goal?: unknown; brief?: unknown; presetTasks?: unknown }
    : {};
  const goal = typeof record.goal === 'string' ? record.goal.trim() : '';
  if (!goal) throw new Error('A goal is required.');
  const memories = await searchMemory(goal);
  const brief = typeof record.brief === 'string' && record.brief.trim()
    ? record.brief
    : householdBrief(goal, memories);
  const presetTasks = asTasks(record.presetTasks);
  if (!presetTasks) return { ok: false as const, error: PLAN_UNAVAILABLE };
  const provider = await getServerProvider();
  return startSocietyRun({
    brief,
    provider,
    team: HOUSEHOLD_TEAM,
    source: 'household',
    presetTasks,
  });
});

export async function remember(text: string, tags: string[] | undefined, source: HouseholdSource, who?: string) {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false as const, error: 'Memory text is required.' };
  const saved = await saveMemory(trimmed, tags ?? [], source, who);
  const back = (await listMemory()).find((item) => item.id === saved.entry.id);
  return {
    ok: true as const,
    memory: saved.entry,
    created: saved.created,
    receipt: receipt('remember', saved.entry.id, !!back && back.text === saved.entry.text),
  };
}

export async function recall(query: string) {
  return answerRecall(query);
}

export async function forget(memoryIdOrQuery: string) {
  const query = memoryIdOrQuery.trim();
  if (!query) return { ok: false as const, error: 'Say which memory to forget.' };
  const byId = (await listMemory()).find((entry) => entry.id === query);
  const target = byId ?? (await searchMemory(query))[0];
  if (!target) return { ok: false as const, error: 'No matching memory.' };
  const approval = requestApproval('forget', `Forget that ${target.text.trim()}? Say yes or no.`, { id: target.id });
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

export async function addTask(title: string, due: string | undefined, source: HouseholdSource, fields?: TaskFields) {
  const trimmed = title.trim();
  if (!trimmed) return { ok: false as const, error: 'A task title is required.' };
  const dueAt = fields?.dueAt?.trim();
  if (dueAt && !Number.isFinite(Date.parse(dueAt))) return { ok: false as const, error: 'A reminder time must be a date.' };
  const task = await createTask(trimmed, resolveDueText(due, new Date()), source, {
    who: fields?.who,
    list: fields?.list,
    dueAt,
  });
  const back = (await readTasks()).find((item) => item.id === task.id);
  return {
    ok: true as const,
    task,
    receipt: receipt('add_task', task.id, !!back && back.title === task.title && back.status === 'open'),
  };
}

export async function listTasks(status?: 'open' | 'done', list?: string) {
  let tasks = await readTasks(status);
  const named = list?.trim().toLowerCase();
  if (named === 'main') tasks = tasks.filter((task) => !task.list);
  else if (named) tasks = tasks.filter((task) => (task.list ?? '').toLowerCase() === named);
  return { tasks };
}

export async function completeTask(idOrTitle: string) {
  const task = await finishTask(idOrTitle);
  if (!task) return { ok: false as const, error: 'Task not found.' };
  const back = (await readTasks()).find((item) => item.id === task.id);
  const verified = !!back && back.status === 'done' && back.completedAt === task.completedAt;
  return { ok: true as const, task, receipt: receipt('complete_task', task.id, verified) };
}

export async function reopenTask(id: string) {
  const task = await reopenStored(id);
  if (!task) return { ok: false as const, error: 'Task not found.' };
  const back = (await readTasks()).find((item) => item.id === task.id);
  const verified = !!back && back.status === 'open' && back.completedAt === undefined;
  return { ok: true as const, task, receipt: receipt('reopen_task', task.id, verified) };
}

export async function removeTask(id: string) {
  const task = await removeStored(id);
  if (!task) return { ok: false as const, error: 'Task not found.' };
  const verified = !(await readTasks()).some((item) => item.id === task.id);
  return { ok: true as const, task, receipt: receipt('remove_task', task.id, verified) };
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

const ASK_SYSTEM = [
  "You are Agora, the household's assistant.",
  'Answer in at most two short spoken sentences.',
  'Never claim an action was done unless a tool result says so.',
  'Say "I don\'t know" rather than guess.',
  'When a web result was used, cite the source name.',
].join(' ');

const FAST_FALLBACK = 'anthropic.claude-haiku-4-5';
const ASK_ALEXA_TIMEOUT_MS = 4_000;
const ASK_SIMULATOR_TIMEOUT_MS = 9_000;
const PLAN_UNAVAILABLE = 'Planning is unavailable right now.';
const CANNOT_CARRY_OUT = 'AGORA+ can plan and list, but it cannot place orders, buy, book, pay, or call.';

/** Alexa gets about 4 seconds. The voice simulator may wait the longer 9 seconds. */
export function askTimeoutMs(caller: 'alexa' | 'simulator'): number {
  return caller === 'simulator' ? ASK_SIMULATOR_TIMEOUT_MS : ASK_ALEXA_TIMEOUT_MS;
}

/** Orders, purchases, bookings, payments, and phone calls are not something this household can do. */
function cannotCarryOut(goal: string): boolean {
  const text = goal.toLowerCase();
  if (/\b(order|ordering|buy|buying|purchase|purchasing|booking|reservation|reservations|payment|payments|paying)\b/.test(text)) return true;
  if (/\b(pay|call|calling|phone)\b/.test(text)) return true;
  if (/\bbook\b/.test(text)) return true;
  return false;
}

const RESEARCH_UNAVAILABLE = "Web research isn't set up on this server.";

let researchLookup: typeof quickResearch = quickResearch;

/** Tests swap the lookup so a configured key does not call the network. */
export function setResearchLookup(fn: typeof quickResearch): void {
  researchLookup = fn;
}

const READ_TOOLS: ToolDefinition[] = [
  {
    name: 'recall',
    description: 'Search household memory for facts such as allergies and preferences.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Words to look for.' } },
      required: ['query'],
    },
  },
  {
    name: 'list_tasks',
    description: 'List household tasks. Omit status for every task.',
    input_schema: {
      type: 'object',
      properties: { status: { type: 'string', enum: ['open', 'done'] } },
    },
  },
  {
    name: 'daily_briefing',
    description: 'The morning briefing from due tasks, waiting approvals, and recent runs. It does not call a model.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_run_status',
    description: 'Status of a household run. Omit runId for the latest run.',
    input_schema: {
      type: 'object',
      properties: { runId: { type: 'string' } },
    },
  },
];

function askTools(): ToolDefinition[] {
  if (!researchConfigured()) return READ_TOOLS;
  return [
    ...READ_TOOLS,
    {
      name: 'web_research',
      description: 'Look up a current public fact when household memory is not enough.',
      input_schema: {
        type: 'object',
        properties: { question: { type: 'string' } },
        required: ['question'],
      },
    },
  ];
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function inputRecord(input: unknown): Record<string, unknown> {
  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input) as unknown;
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (input && typeof input === 'object') return input as Record<string, unknown>;
  return {};
}

function inputString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  return typeof value === 'string' ? value : '';
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.flatMap((block) => {
    if (!block || typeof block !== 'object') return [];
    const item = block as { type?: unknown; text?: unknown };
    return item.type === 'text' && typeof item.text === 'string' ? [item.text] : [];
  }).join('');
}

function bedrockOf(provider: ServerProvider): BedrockProvider | null {
  const named = provider as ServerProvider & Partial<Pick<BedrockProvider, 'createMessage' | 'fastModel'>>;
  if (typeof named.createMessage !== 'function' || typeof named.fastModel !== 'string') return null;
  return named as BedrockProvider;
}

function recallAnswer(question: string, memories: MemoryEntry[]) {
  const spoken = speakRecall(question, memories);
  return {
    ok: true as const,
    speech: spoken.speech,
    answer: spoken.speech,
    memories: spoken.memories,
    toolCalls: [] as { name: string; input: unknown; ok: boolean; ms: number }[],
  };
}

async function findRun(runId?: string): Promise<RunRecord | null> {
  const requested = runId?.trim();
  if (requested) return getRunRecord(requested);
  const current = getHub().room.currentRun();
  if (current) {
    const live = await getRunRecord(current.id);
    if (live) return live;
  }
  const recent = await listRecentRuns(1);
  return recent[0] ?? null;
}

export async function getRunStatus(runId?: string) {
  const requested = runId?.trim();
  const run = await findRun(requested);
  if (!run) {
    const speech = requested ? 'I could not find that run.' : 'There is no household run yet.';
    return { ok: false as const, error: speech, speech };
  }
  const finished = run.status === 'complete' || run.status === 'needs_revision' || run.status === 'stopped';
  const speech = finished
    ? (run.spokenSummary?.trim() || toSpeech(run.synthesis) || 'That run has finished. The document is ready.')
    : 'That run is still going.';
  return { ok: true as const, speech, run, finished };
}

function citeSources(speech: string, sources: ResearchSource[]): string {
  const named = sources.filter((source) => source.title.trim());
  if (named.length === 0) return speech;
  const missing = named.filter((source) => !speech.toLowerCase().includes(source.title.toLowerCase()));
  if (missing.length === 0) return speech;
  const names = missing.slice(0, 2).map((source) => source.title).join(' and ');
  return toSpeech(`${speech} Source: ${names}.`) || speech;
}

async function fastAnswer(system: string, user: string, create?: ToolCreate): Promise<string> {
  if (create) {
    const message = await create({
      model: FAST_FALLBACK,
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: user }],
    });
    if (message.stop_reason === 'refusal') throw new Error('The model declined this request.');
    return textOf(message.content);
  }
  const provider = await getServerProvider();
  const bedrock = bedrockOf(provider);
  const res = await provider.generateCompletion(
    [{ role: 'user', content: user }],
    undefined,
    system,
    bedrock?.fastModel,
  );
  return res.content ?? '';
}

async function executeAsk(name: string, input: unknown): Promise<unknown> {
  const fields = inputRecord(input);
  switch (name) {
    case 'recall':
      return recall(inputString(fields, 'query'));
    case 'list_tasks': {
      const status = fields.status === 'open' || fields.status === 'done' ? fields.status : undefined;
      const list = inputString(fields, 'list').trim();
      return listTasks(status, list || undefined);
    }
    case 'daily_briefing':
      return dailyBriefing();
    case 'get_run_status':
      return getRunStatus(inputString(fields, 'runId') || undefined);
    case 'web_research':
      return webResearch(inputString(fields, 'question') || inputString(fields, 'query'));
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

/**
 * Plans with the household team, then waits for a yes.
 * Approving starts that same task list. No second planning call.
 */
export async function requestRun(goal: string) {
  const trimmed = goal.trim();
  if (!trimmed) return { ok: false as const, error: 'A goal is required.' };
  if (cannotCarryOut(trimmed)) {
    return { ok: false as const, status: 'error' as const, error: CANNOT_CARRY_OUT, speech: CANNOT_CARRY_OUT };
  }
  const memories = planningMemory(await searchMemory(trimmed), await listMemory());
  const brief = householdBrief(trimmed, memories);
  let tasks: SocietyTask[] = [];
  try {
    const provider = await getServerProvider();
    const planned = await planSociety(brief, provider, { team: HOUSEHOLD_TEAM });
    tasks = planned.tasks;
  } catch (error) {
    console.warn('[household] plan preview failed:', error instanceof Error ? error.message.slice(0, 200) : 'unknown error');
    return { ok: false as const, status: 'error' as const, error: PLAN_UNAVAILABLE, speech: PLAN_UNAVAILABLE };
  }
  if (tasks.length === 0) {
    return { ok: false as const, status: 'error' as const, error: PLAN_UNAVAILABLE, speech: PLAN_UNAVAILABLE };
  }
  const summary = `Plan: ${tasks.length} step${tasks.length === 1 ? '' : 's'} — ${tasks.map((task) => task.title).join('; ')}`;
  const approval = requestApproval('start_run', summary, {
    goal: trimmed,
    brief,
    presetTasks: tasks,
  });
  return {
    ok: true as const,
    status: 'needs_approval' as const,
    approvalId: approval.id,
    summary: approval.summary,
    preview: approval.summary,
    tasks: tasks.map((task) => ({ title: task.title, role: task.role })),
  };
}

export async function planAndRun(goal: string) {
  return requestRun(goal);
}

/** Fast-model tool loop. A missing model or a timeout falls back to saved memory. */
export async function askAgora(question: string, deps?: { create?: ToolCreate; model?: string; timeoutMs?: number }) {
  const trimmed = question.trim();
  if (!trimmed) return { ok: false as const, error: 'Ask a question about the household.' };
  const memories = await searchMemory(trimmed);
  const top = memories.slice(0, 8);
  const user = top.length
    ? `Household memory:\n${top.map((entry) => `- ${entry.text}`).join('\n')}\n\nQuestion: ${trimmed}`
    : `Question: ${trimmed}`;

  const timeoutMs = deps?.timeoutMs ?? askTimeoutMs('alexa');
  let create = deps?.create;
  let model = deps?.model || FAST_FALLBACK;
  if (!create) {
    try {
      const bedrock = bedrockOf(await getServerProvider());
      if (bedrock) {
        model = deps?.model || bedrock.fastModel;
        create = (params) => bedrock.createMessage({
          model: params.model,
          max_tokens: params.max_tokens,
          system: params.system,
          tools: params.tools as BedrockCreateParams['tools'],
          messages: params.messages as BedrockCreateParams['messages'],
        }, { timeout: timeoutMs, maxRetries: 0, signal: params.signal });
      }
    } catch {
      create = undefined;
    }
  }
  if (!create) return recallAnswer(trimmed, memories);

  const sources: ResearchSource[] = [];
  const tools = askTools();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const loop = await withTimeout(runToolLoop({
      create,
      model,
      system: ASK_SYSTEM,
      tools,
      messages: [{ role: 'user', content: user }],
      signal: controller.signal,
      execute: async (name, input) => {
        const value = await executeAsk(name, input);
        if (name === 'web_research' && value && typeof value === 'object' && Array.isArray((value as { sources?: unknown }).sources)) {
          for (const source of (value as { sources: ResearchSource[] }).sources) {
            if (source && typeof source.url === 'string') sources.push({ title: String(source.title ?? ''), url: source.url });
          }
        }
        return value;
      },
    }), timeoutMs);
    if (loop.stopReason === 'refusal' || !loop.text.trim()) {
      const fallback = recallAnswer(trimmed, memories);
      return { ...fallback, toolCalls: loop.toolCalls, ...(sources.length > 0 ? { sources } : {}) };
    }
    const speech = toSpeech(loop.text) || recallAnswer(trimmed, memories).speech;
    return {
      ok: true as const,
      speech,
      answer: loop.text,
      memories: memories.slice(0, 5),
      toolCalls: loop.toolCalls,
      ...(sources.length > 0 ? { sources } : {}),
    };
  } catch {
    return recallAnswer(trimmed, memories);
  } finally {
    clearTimeout(timer);
  }
}

/** Grounded web answer. Unconfigured servers say so and do not invent sources. */
export async function webResearch(question: string, deps?: { create?: ToolCreate }) {
  const trimmed = question.trim();
  if (!trimmed) {
    return { ok: false as const, status: 'error' as const, error: 'Ask a question to research.', speech: 'Ask a question to research.' };
  }
  if (!researchConfigured()) {
    return { ok: false as const, status: 'error' as const, error: RESEARCH_UNAVAILABLE, speech: RESEARCH_UNAVAILABLE };
  }
  const found = await researchLookup(trimmed);
  if (found.sources.length === 0 || !found.context.trim()) {
    const speech = "I don't know.";
    return { ok: true as const, status: 'ok' as const, speech, answer: speech, sources: found.sources };
  }
  const system = 'Answer using only the context below. Cite the source name. If the context does not say, say "I don\'t know." Use at most two short sentences.';
  const user = `Context:\n${found.context}\n\nQuestion: ${trimmed}`;
  try {
    const text = await fastAnswer(system, user, deps?.create);
    const speech = citeSources(toSpeech(text) || "I don't know.", found.sources);
    return { ok: true as const, status: 'ok' as const, speech, answer: text || speech, sources: found.sources };
  } catch {
    const speech = citeSources(toSpeech(found.context) || "I don't know.", found.sources);
    return { ok: true as const, status: 'ok' as const, speech, answer: speech, sources: found.sources };
  }
}

export async function householdSnapshot() {
  const input = await briefingInput();
  const briefing = buildBriefing(input);
  return {
    memory: input.memory,
    tasks: input.tasks,
    pendingApprovals: input.pendingApprovals,
    recentRuns: input.recentRuns,
    briefing: briefing.items,
    suggestions: briefing.suggestions,
  };
}
