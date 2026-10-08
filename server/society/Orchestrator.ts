/**
 * Society Orchestrator.
 *
 * Lifecycle:
 *   1. Planning decomposes a brief into subtasks.
 *   2. Workers execute concurrently.
 *   3. An invalid worker output can be retried once.
 *
 * Depends only on the LLMLike shape. Free of DOM and React so it runs in the room server.
 */

import { judgeWorkerOutput } from './decider/gates';
import {
  constraintsFromBrief,
  countDocumentWords,
  documentProblems,
  MAX_DOCUMENT_REPAIRS,
  revisionLabel,
} from './documentCheck';
import { takeBossEdit } from './decider/live';
import { beginResearch, researchForTask, sourcesMarkdown } from '../research/research';

/** Minimal structural type any LLM provider satisfies. */
export interface LLMLike {
  generateCompletion(
    messages: { role: string; content: string }[],
    tools?: unknown[],
    systemInstruction?: string,
    modelName?: string,
  ): Promise<{ content: string | null; usage?: { promptTokens: number; completionTokens: number } }>;
}

export interface SocietyTask {
  id: string;
  title: string;
  /** Worker specialization, e.g. "researcher", "designer". */
  role: string;
  /** What this worker must produce. */
  prompt: string;
  /** Task ids this depends on. Execution waits for those outputs. */
  deps?: string[];
  acceptanceCriteria?: string[];
}

export type TaskStatus = 'done' | 'escalated';

export interface TaskResult {
  id: string;
  title: string;
  role: string;
  status: TaskStatus;
  output: string;
  /** 1 = first try; 2 = one self-heal retry. */
  attempts: number;
  /** True if a retry turned an invalid output into a valid one. */
  healed: boolean;
}

export interface SocietyResult {
  brief: string;
  tasks: TaskResult[];
  /** Lead-merged final deliverable (empty if every worker failed). */
  synthesis: string;
  wordCount: number;
  /** Set when the draft is kept but must not be treated as a successful document. */
  revisionLabel?: string;
  documentStatus: 'accepted' | 'needs_revision' | 'stopped';
  metrics: {
    taskCount: number;
    /** Peak simultaneous workers — proves real parallelism. */
    maxConcurrency: number;
    escalated: number;
    healed: number;
    wallMs: number;
    calls: number;
    promptTokens: number;
    completionTokens: number;
    repairCalls: number;
    phases: {
      managerMs: number;
      workersMs: number;
      beforeSynthesisMs: number;
      leadMs: number;
    };
  };
}

export interface OrchestratorOptions {
  models?: { manager?: string; worker?: string };
  /** Returns false to mark a worker output invalid (triggers self-heal). */
  isValidOutput?: (task: SocietyTask, output: string) => boolean;
  /** Jev path. `legacy` means use isValidOutput. */
  judgeOutput?: (
    task: SocietyTask,
    output: string,
  ) => Promise<'accept' | 'retry' | 'escalate' | 'legacy'>;
  onEvent?: (event: { type: string; [key: string]: any }) => void;
  /** Called with worker results before the Lead writes the deliverable. */
  beforeSynthesis?: (results: TaskResult[]) => Promise<string | void>;
  /** Selected team. When present, the run uses these names and models instead of Manager/Worker/Lead. */
  team?: { name: string; description: string; model?: string }[];
  /** Skip the manager decomposition and run these tasks. */
  presetTasks?: SocietyTask[];
  /** True after cancel. In-flight provider calls may still finish; later stages must not start. */
  shouldStop?: () => boolean;
}

function prepareRequest(provider: LLMLike, info: { stage: string; agent: string; attempt?: number }): void {
  const tagged = provider as LLMLike & { prepareRequest?: (info: { stage: string; agent: string; attempt?: number }) => void };
  tagged.prepareRequest?.(info);
}

function noteCall(
  tally: { calls: number; promptTokens: number; completionTokens: number },
  res: { usage?: { promptTokens: number; completionTokens: number } },
): void {
  tally.calls += 1;
  tally.promptTokens += res.usage?.promptTokens || 0;
  tally.completionTokens += res.usage?.completionTokens || 0;
}

function modelFor(team: OrchestratorOptions['team'], role: string, fallback: string): string {
  const hit = team?.find((agent) => agent.name.toLowerCase() === role.toLowerCase());
  const model = hit?.model?.trim();
  return model || fallback;
}

const DEFAULT_MANAGER_MODEL = 'deepseek-v4.1-flash';
const DEFAULT_WORKER_MODEL = 'qwen3.7-plus';
const MAX_ATTEMPTS = 2; // first attempt + one self-heal retry

function defaultIsValid(_task: SocietyTask, output: string): boolean {
  const trimmed = output.trim();
  return trimmed.length > 0 && !trimmed.toUpperCase().startsWith('ERROR');
}

/** Tracks peak concurrency across overlapping workers. */
function makeConcurrencyTracker() {
  let current = 0;
  let peak = 0;
  return {
    enter() {
      current += 1;
      if (current > peak) peak = current;
    },
    exit() {
      current -= 1;
    },
    peak: () => peak,
  };
}

function normalizeTask(raw: unknown, index: number): SocietyTask {
  const obj = (raw && typeof raw === 'object') ? (raw as Record<string, unknown>) : {};
  const str = (v: unknown, fallback: string): string =>
    typeof v === 'string' && v.trim() ? v : fallback;
  const deps = Array.isArray(obj.deps)
    ? obj.deps.filter((d): d is string => typeof d === 'string')
    : undefined;
  const acceptanceCriteria = Array.isArray(obj.acceptanceCriteria)
    ? obj.acceptanceCriteria.filter((c): c is string => typeof c === 'string' && !!c.trim())
    : undefined;
  return {
    id: str(obj.id, `t${index + 1}`),
    title: str(obj.title, `Task ${index + 1}`),
    role: str(obj.role, 'worker'),
    prompt: str(obj.prompt, str(obj.title, `Task ${index + 1}`)),
    deps,
    acceptanceCriteria,
  };
}

/** Parse the Manager's plan, tolerating code fences and surrounding prose. */
export function parsePlan(content: string | null): SocietyTask[] {
  if (!content || !content.trim()) {
    throw new Error('Manager returned an empty plan');
  }
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    // qwen3.5 sometimes emits trailing commas, which JSON.parse rejects
    .replace(/,\s*([}\]])/g, '$1')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('Manager plan is not valid JSON');
    parsed = JSON.parse(match[0]);
  }

  if (!Array.isArray(parsed)) {
    throw new Error('Manager plan must be a JSON array of tasks');
  }
  return parsed.map((raw, i) => normalizeTask(raw, i));
}

function clip(text: string, max = 1500): string {
  const trimmed = text.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max)}…`;
}

/** Group tasks so a task never runs before the tasks it depends on. */
export function dependencyWaves(tasks: SocietyTask[]): SocietyTask[][] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const remaining = new Set(tasks.map((task) => task.id));
  const done = new Set<string>();
  const waves: SocietyTask[][] = [];

  while (remaining.size > 0) {
    const ready = [...remaining].filter((id) => {
      const deps = byId.get(id)?.deps ?? [];
      return deps.every((dep) => done.has(dep) || !byId.has(dep));
    });
    const ids = ready.length > 0 ? ready : [...remaining];
    waves.push(ids.map((id) => byId.get(id)!));
    for (const id of ids) {
      remaining.delete(id);
      done.add(id);
    }
  }
  return waves;
}

function workerPrompt(
  task: SocietyTask,
  brief: string,
  siblings: string[],
  depText: string,
  attempt: number,
  lastInvalid: string,
  sources: string,
): string {
  const parts = [
    `Brief:\n${brief}`,
    `Your task (${task.role}): ${task.prompt}`,
    task.acceptanceCriteria?.length
      ? `Acceptance criteria:\n- ${task.acceptanceCriteria.join('\n- ')}`
      : '',
    siblings.length ? `Other tasks in this wave, do not duplicate them: ${siblings.join('; ')}` : '',
    depText ? `Outputs you depend on:\n${depText}` : '',
    sources ? `${sources}\n\nCite the sources you use, by URL.` : '',
  ].filter(Boolean);
  const body = parts.join('\n\n');
  if (attempt === 1) return body;
  return `Your previous attempt was rejected as invalid:\n"""${lastInvalid}"""\nDiagnose what went wrong, then produce a corrected deliverable.\n\n${body}`;
}

async function runWorker(
  task: SocietyTask,
  brief: string,
  siblings: string[],
  depText: string,
  provider: LLMLike,
  model: string,
  isValid: (task: SocietyTask, output: string) => boolean,
  judgeOutput: OrchestratorOptions['judgeOutput'] | undefined,
  tracker: ReturnType<typeof makeConcurrencyTracker>,
  onEvent?: (event: { type: string; [key: string]: any }) => void,
  team?: OrchestratorOptions['team'],
  usage?: { calls: number; promptTokens: number; completionTokens: number },
): Promise<TaskResult> {
  tracker.enter();
  onEvent?.({ type: 'task-start', taskId: task.id, title: task.title, role: task.role });
  try {
    let attempts = 0;
    let output = '';
    let lastInvalid = '';

    while (attempts < MAX_ATTEMPTS) {
      attempts += 1;
      if (attempts > 1) {
        onEvent?.({ type: 'task-healing', taskId: task.id, title: task.title, attempt: attempts });
      }
      const member = team?.find((agent) => agent.name.toLowerCase() === task.role.toLowerCase());
      const system = member
        ? `You are ${member.name}. ${member.description} Complete the task and respond with the deliverable only.`
        : `You are a ${task.role} worker in an agent society. Complete the task and respond with the deliverable only.`;
      const sources = await researchForTask(task, brief, {
        onStart: () => onEvent?.({ type: 'task-research', taskId: task.id, title: task.title, role: task.role }),
      });
      const userContent = workerPrompt(task, brief, siblings, depText, attempts, lastInvalid, sources);

      prepareRequest(provider, { stage: 'worker', agent: task.role, attempt: attempts });
      const res = await provider.generateCompletion(
        [{ role: 'user', content: userContent }],
        undefined,
        system,
        model,
      );
      output = res.content ?? '';
      if (usage) noteCall(usage, res);

      const judged = judgeOutput
        ? await judgeOutput(task, output)
        : await judgeWorkerOutput({ brief, task, output });
      const verdict = judged === 'legacy'
        ? (isValid(task, output) ? 'accept' : 'retry')
        : judged;

      if (verdict === 'accept') {
        const edited = takeBossEdit();
        if (edited) output = edited;
        onEvent?.({ type: 'task-done', taskId: task.id, title: task.title, status: 'done', output, attempts, healed: attempts > 1 });
        return {
          id: task.id,
          title: task.title,
          role: task.role,
          status: 'done',
          output,
          attempts,
          healed: attempts > 1,
        };
      }
      if (verdict === 'escalate') break;
      lastInvalid = output;
    }

    // Retries exhausted → escalate to human-in-the-loop.
    onEvent?.({ type: 'task-done', taskId: task.id, title: task.title, status: 'escalated', output, attempts, healed: false });
    return {
      id: task.id,
      title: task.title,
      role: task.role,
      status: 'escalated',
      output,
      attempts,
      healed: false,
    };
  } finally {
    tracker.exit();
  }
}

export interface PlanUsage {
  calls: number;
  promptTokens: number;
  completionTokens: number;
}

/** Step 1: the lead, or the Manager when no team was sent, decomposes the brief. */
export async function planSociety(
  brief: string,
  provider: LLMLike,
  options: OrchestratorOptions = {},
): Promise<{ tasks: SocietyTask[]; usage: PlanUsage }> {
  const managerModel = options.models?.manager ?? DEFAULT_MANAGER_MODEL;
  const team = (options.team ?? []).filter((agent) => agent.name.trim()).slice(0, 8);
  const usage: PlanUsage = { calls: 0, promptTokens: 0, completionTokens: 0 };
  const managerSystem = team.length
    ? [
        'You lead this team:',
        team.map((agent) => `${agent.name}: ${agent.description}`).join('\n'),
        `Decompose the user brief into subtasks. Use only these role names: ${team.map((agent) => agent.name).join(', ')}.`,
        'Tasks that can run together should have no deps. A task that needs another task\'s output lists that id in deps.',
        'Respond with ONLY a JSON array: [{"id","title","role","prompt","deps"?,"acceptanceCriteria"?}].',
      ].join('\n')
    : 'You are the Manager of an agent society. Decompose the user brief into subtasks. ' +
      'Tasks that can run together should have no deps. A task that needs another task\'s output lists that id in deps. ' +
      'Respond with ONLY a JSON array: [{"id","title","role","prompt","deps"?,"acceptanceCriteria"?}]. Aim for at least 3 tasks.';
  prepareRequest(provider, { stage: 'planning', agent: team[0]?.name ?? 'Manager', attempt: 1 });
  const plan = await provider.generateCompletion(
    [{ role: 'user', content: brief }],
    undefined,
    managerSystem,
    modelFor(team, team[0]?.name ?? '', managerModel),
  );
  noteCall(usage, plan);
  return { tasks: parsePlan(plan.content), usage };
}

/** Run a full society pass over a brief. */
export async function runSociety(
  brief: string,
  provider: LLMLike,
  options: OrchestratorOptions = {},
): Promise<SocietyResult> {
  const start = Date.now();
  const managerStarted = Date.now();
  const managerModel = options.models?.manager ?? DEFAULT_MANAGER_MODEL;
  const workerModel = options.models?.worker ?? DEFAULT_WORKER_MODEL;
  const team = (options.team ?? []).filter((agent) => agent.name.trim()).slice(0, 8);
  const usage = { calls: 0, promptTokens: 0, completionTokens: 0 };
  const isValid = options.isValidOutput ?? defaultIsValid;
  const onEvent = options.onEvent;
  beginResearch();

  let tasks: SocietyTask[];
  if (options.presetTasks) {
    tasks = options.presetTasks.map((task, index) => normalizeTask(task, index));
  } else {
    const planned = await planSociety(brief, provider, options);
    tasks = planned.tasks;
    usage.calls += planned.usage.calls;
    usage.promptTokens += planned.usage.promptTokens;
    usage.completionTokens += planned.usage.completionTokens;
  }
  const managerMs = Date.now() - managerStarted;

  const tracker = makeConcurrencyTracker();
  const outputs = new Map<string, string>();
  const results: TaskResult[] = [];
  const workersStarted = Date.now();
  const stopped = () => options.shouldStop?.() === true;
  for (const wave of dependencyWaves(tasks)) {
    if (stopped()) break;
    const waveResults = await Promise.all(wave.map((task) => {
      const siblings = wave.filter((other) => other.id !== task.id).map((other) => other.title);
      const depText = (task.deps ?? [])
        .map((id) => outputs.get(id))
        .filter((text): text is string => !!text)
        .map((text) => clip(text))
        .join('\n\n');
      return runWorker(task, brief, siblings, depText, provider, modelFor(team, task.role, workerModel), isValid, options.judgeOutput, tracker, onEvent, team, usage);
    }));
    for (const result of waveResults) {
      outputs.set(result.id, result.output);
      results.push(result);
    }
  }
  const workersMs = Date.now() - workersStarted;

  const beforeStarted = Date.now();
  const leadNotes = stopped() ? '' : ((await options.beforeSynthesis?.(results)) || '');
  const beforeSynthesisMs = Date.now() - beforeStarted;

  let synthesis = '';
  const doneOutputs = results.filter((r) => r.status === 'done' && r.output);
  const leadStarted = Date.now();
  const leadName = team[0]?.name;
  if (doneOutputs.length > 0 && !stopped()) {
    onEvent?.({ type: 'society-synthesizing' });
    const leadSystem = leadName
      ? `You are ${leadName}. Merge the teammate outputs into ONE coherent, complete, non-redundant deliverable that fully answers the brief. Respond with the final deliverable only.`
      : 'You are the Lead of an agent society. Merge the worker outputs into ONE coherent, ' +
        'complete, non-redundant deliverable that fully answers the brief. Respond with the ' +
        'final deliverable only.';
    prepareRequest(provider, { stage: 'assembling', agent: leadName ?? 'Lead', attempt: 1 });
    const leadRes = await provider.generateCompletion(
      [{
        role: 'user',
        content: `Brief:\n${brief}\n\nWorker outputs:\n${doneOutputs
          .map((r) => `### ${r.title} (${r.role})\n${r.output}`)
          .join('\n\n')}${leadNotes ? `\n\nResolved disagreement:\n${leadNotes}` : ''}`,
      }],
      undefined,
      leadSystem,
      modelFor(team, leadName ?? '', managerModel),
    );
    synthesis = (leadRes.content ?? '').trim();
    noteCall(usage, leadRes);
    const cited = sourcesMarkdown();
    if (cited && synthesis && !synthesis.includes('## Sources')) synthesis += cited;
  }

  const constraints = constraintsFromBrief(brief);
  let repairCalls = 0;
  if (synthesis && !stopped() && (constraints.wordLimit !== null || constraints.sections)) {
    for (let attempt = 1; attempt <= MAX_DOCUMENT_REPAIRS; attempt += 1) {
      const problems = documentProblems(synthesis, constraints);
      if (problems.length === 0 || stopped()) break;
      onEvent?.({ type: 'society-repairing', attempt });
      prepareRequest(provider, { stage: 'repair', agent: leadName ?? 'Lead', attempt });
      const repaired = await provider.generateCompletion(
        [{
          role: 'user',
          content: [
            `Brief:\n${brief}`,
            problems.map((problem) => problem.detail).join('\n'),
            'Rewrite the document. Keep the required content. Stay within the word limit. Do not add budget figures, invented research, or quotes.',
            'Respond with the document only.',
            synthesis,
          ].join('\n\n'),
        }],
        undefined,
        'You revise a document so it meets the brief. Respond with the document only.',
        modelFor(team, leadName ?? '', managerModel),
      );
      repairCalls += 1;
      const next = (repaired.content ?? '').trim();
      if (next) synthesis = next;
    }
  }

  if (!stopped() && doneOutputs.length > 0 && !synthesis.trim()) {
    throw new Error('The run finished without a document.');
  }
  const leadMs = Date.now() - leadStarted;
  const problems = synthesis ? documentProblems(synthesis, constraints) : [];
  const label = stopped() ? undefined : revisionLabel(problems);
  const documentStatus = stopped()
    ? 'stopped'
    : label
      ? 'needs_revision'
      : 'accepted';

  return {
    brief,
    tasks: results,
    synthesis,
    wordCount: countDocumentWords(synthesis),
    revisionLabel: label,
    documentStatus,
    metrics: {
      taskCount: tasks.length,
      maxConcurrency: tracker.peak(),
      escalated: results.filter((r) => r.status === 'escalated').length,
      healed: results.filter((r) => r.healed).length,
      wallMs: Date.now() - start,
      calls: usage.calls,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      repairCalls,
      phases: { managerMs, workersMs, beforeSynthesisMs, leadMs },
    },
  };
}
