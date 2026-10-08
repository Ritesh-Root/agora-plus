import { randomUUID } from 'crypto';
import { readdir } from 'fs/promises';
import path from 'path';
import { WebSocket, type WebSocket as WsSocket } from 'ws';
import type { ServerMessage } from '../shared/protocol';
import { toSpeech } from './household/speech';
import { getDataDir, readJson, writeJson, writeText } from './household/store';
import { getHub } from './hub';
import { publicModelError } from './modelError';
import { researchSearchCount, researchSources } from './research/research';
import { RoomState } from './roomState';
import { setBossAsker, setDecisionSink, toDecisionWire } from './society/decider/live';
import { beginRunStats, currentRunStats, endRunStats } from './society/decider/runStats';
import { leadNotesFromConflict } from './society/leadNotes';
import { runSociety, type SocietyTask } from './society/Orchestrator';
import type { ServerProvider } from './society/provider';

export interface RunRecord {
  id: string;
  brief: string;
  source: 'room' | 'household';
  status: 'running' | 'cancel_requested' | 'stopped' | 'complete' | 'needs_revision';
  startedAt: string;
  finishedAt?: string;
  tasks: { id: string; title: string; role: string; status: string }[];
  synthesis: string;
  wordCount: number;
  /** Two spoken sentences for a finished household run. Room runs leave this unset. */
  spokenSummary?: string;
  /** Set when the finished plan could not be saved. */
  error?: string;
}

export type StartRunResult = { ok: true; runId: string } | { ok: false; error: string };

const metas = new Map<string, { source: RunRecord['source']; startedAt: string }>();
/** Finished records kept in memory when the file write failed. */
const unsaved = new Map<string, RunRecord>();
/** Run ids whose file must not be overwritten with a running snapshot. */
const closing = new Set<string>();

const HOUSEHOLD_BUSY = 'The team is still working on the last plan. Ask me for its status.';
const SAVE_FAILED = 'The finished plan could not be saved.';

const settledRuns = new Map<string, Promise<void>>();
const settleRunNow = new Map<string, () => void>();

/** Resolves when that run's finish path has written its final status. Tests wait on this instead of the clock. */
export function whenRunSettled(runId: string): Promise<void> {
  const existing = settledRuns.get(runId);
  if (existing) return existing;
  let resolve: () => void = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  settledRuns.set(runId, promise);
  settleRunNow.set(runId, resolve);
  return promise;
}

function settleRun(runId: string): void {
  const resolve = settleRunNow.get(runId);
  if (resolve) {
    settleRunNow.delete(runId);
    resolve();
    return;
  }
  settledRuns.set(runId, Promise.resolve());
}

function send(ws: WsSocket, msg: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

/** Same event fan-out the relay used while a society run is in flight. */
export function forwardSocietyEvent(
  ws: WsSocket | undefined,
  event: { type: string; [key: string]: any },
  tracked?: { runId: string; room: RoomState; deliver: (msg: ServerMessage) => void },
): void {
  if (tracked && !tracked.room.ownsRun(tracked.runId)) return;
  const deliver = tracked?.deliver ?? ((msg: ServerMessage) => {
    if (ws) send(ws, msg);
  });
  const runId = tracked?.runId;
  const room = tracked?.room;
  if (event.type === 'task-research') {
    if (runId && room) room.noteTask(runId, { id: event.taskId, title: event.title, role: event.role, status: 'running' });
    deliver({
      type: 'society-task-update',
      taskId: event.taskId,
      title: event.title,
      role: event.role,
      status: 'running',
      researching: true,
    });
  } else if (event.type === 'task-start') {
    if (runId && room) room.noteTask(runId, { id: event.taskId, title: event.title, role: event.role, status: 'running' });
    deliver({
      type: 'society-task-update',
      taskId: event.taskId,
      title: event.title,
      role: event.role,
      status: 'running',
    });
  } else if (event.type === 'task-healing') {
    if (runId && room) room.noteTask(runId, { id: event.taskId, title: event.title, role: event.role, status: 'healing', attempt: event.attempt });
    deliver({
      type: 'society-task-update',
      taskId: event.taskId,
      title: event.title,
      role: event.role,
      status: 'healing',
      attempt: event.attempt,
    });
  } else if (event.type === 'task-done') {
    if (runId && room) {
      room.noteTask(runId, {
        id: event.taskId,
        title: event.title,
        role: event.role,
        status: event.status === 'done' ? 'done' : 'escalated',
        output: event.output,
        attempt: event.attempts,
      });
    }
    deliver({
      type: 'society-task-update',
      taskId: event.taskId,
      title: event.title,
      role: event.role,
      status: event.status === 'done' ? 'done' : 'escalated',
      output: event.output,
      attempt: event.attempts,
    });
  } else if (event.type === 'society-synthesizing') {
    if (runId && room) room.noteStage(runId, 'assembling');
    deliver({ type: 'society-stage', stage: 'assembling' });
  } else if (event.type === 'society-repairing') {
    if (runId && room) room.noteStage(runId, 'repairing');
    deliver({ type: 'society-stage', stage: 'repairing' });
  }
  if (tracked) touchRunning(tracked.runId);
}

function emit(requester: WsSocket | undefined, msg: ServerMessage): void {
  const sock = requester ?? getHub().hostSocket();
  if (!sock || sock.readyState !== WebSocket.OPEN) return;
  sock.send(JSON.stringify(msg));
}

function clearBoss(): void {
  setDecisionSink(null);
  setBossAsker(null);
  const waiting = getHub().pendingBoss;
  for (const wait of waiting.values()) wait(null);
  waiting.clear();
}

function keeperFlag(tasks: { role: string; output?: string }[]): string {
  return tasks
    .filter((task) => task.role.trim().toLowerCase() === 'keeper')
    .map((task) => task.output?.trim() ?? '')
    .filter((text) => /\b(conflict|allerg(?:y|ic)?)\b/i.test(text))
    .join(' ')
    .slice(0, 500);
}

/** Keep a flagged allergy or conflict inside the two sentences someone will hear. */
function withFlag(speech: string, flag: string): string {
  if (!flag) return toSpeech(speech);
  const allergy = /allerg/i.test(flag);
  if (allergy && /allerg/i.test(speech)) return toSpeech(speech);
  if (!allergy && /conflict/i.test(speech)) return toSpeech(speech);
  const extra = toSpeech(flag, { maxSentences: 1, maxChars: 140 });
  const base = toSpeech(speech, { maxSentences: 1, maxChars: 160 });
  if (!extra) return base;
  if (!base) return extra;
  return `${base} ${extra}`.trim();
}

async function householdSpokenSummary(
  source: RunRecord['source'],
  provider: ServerProvider,
  synthesis: string,
  tasks: { role: string; output?: string }[],
): Promise<string | undefined> {
  if (source !== 'household') return undefined;
  const flag = keeperFlag(tasks);
  if (!synthesis.trim() && !flag) return undefined;
  const fallback = withFlag(synthesis, flag);
  try {
    const named = provider as ServerProvider & { fastModel?: string };
    const modelName = typeof named.fastModel === 'string' ? named.fastModel : undefined;
    provider.prepareRequest({ stage: 'summary', agent: 'Agora', attempt: 1 });
    const res = await provider.generateCompletion(
      [{
        role: 'user',
        content: flag
          ? `Summarize this for someone listening at home.\n\n${synthesis.slice(0, 4000)}\n\nKeeper flagged: ${flag}`
          : `Summarize this for someone listening at home.\n\n${synthesis.slice(0, 4000)}`,
      }],
      undefined,
      'Write a spoken summary in at most two short sentences. Mention any flagged household conflict, such as an allergy. Do not use Markdown.',
      modelName,
    );
    const spoken = toSpeech(res.content ?? '');
    if (!spoken) return fallback || undefined;
    return withFlag(spoken, flag);
  } catch {
    return fallback || undefined;
  }
}

type RunSnapshot = {
  brief: string;
  tasks: RunRecord['tasks'];
  synthesis: string;
  wordCount: number;
  spokenSummary?: string;
};

function finishedRecord(
  runId: string,
  status: 'complete' | 'needs_revision' | 'stopped',
  snapshot: RunSnapshot,
  error?: string,
): RunRecord {
  const meta = metas.get(runId);
  const record: RunRecord = {
    id: runId,
    brief: snapshot.brief,
    source: meta?.source ?? 'room',
    status,
    startedAt: meta?.startedAt ?? new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    tasks: snapshot.tasks,
    synthesis: snapshot.synthesis,
    wordCount: snapshot.wordCount,
  };
  if (snapshot.spokenSummary) record.spokenSummary = snapshot.spokenSummary;
  if (error) record.error = error;
  return record;
}

function runningRecord(runId: string, brief: string): RunRecord {
  const meta = metas.get(runId);
  const current = getHub().room.currentRun();
  const live = current && current.id === runId ? current : null;
  return {
    id: runId,
    brief: live?.brief || brief,
    source: meta?.source ?? 'household',
    status: 'running',
    startedAt: meta?.startedAt ?? new Date().toISOString(),
    tasks: live ? live.tasks.map((task) => ({ id: task.id, title: task.title, role: task.role, status: task.status })) : [],
    synthesis: live?.synthesis ?? '',
    wordCount: live?.wordCount ?? 0,
  };
}

/** Household runs keep a file from the start so status can see tasks so far. */
function touchRunning(runId: string): void {
  if (closing.has(runId)) return;
  const meta = metas.get(runId);
  if (meta?.source !== 'household') return;
  const current = getHub().room.currentRun();
  if (!current || current.id !== runId) return;
  const record = runningRecord(runId, current.brief);
  void writeJson(`runs/${runId}.json`, record).catch((error) => {
    console.error('[run] could not update the running plan:', error instanceof Error ? error.message : error);
  });
}

async function writeRunning(runId: string, brief: string): Promise<void> {
  if (closing.has(runId)) return;
  await writeJson(`runs/${runId}.json`, runningRecord(runId, brief));
}

async function persistFinished(
  runId: string,
  status: 'complete' | 'needs_revision' | 'stopped',
  snapshot: RunSnapshot,
): Promise<void> {
  await writeText(`runs/${runId}.md`, snapshot.synthesis);
  await writeJson(`runs/${runId}.json`, finishedRecord(runId, status, snapshot));
}

/** Returns a spoken error when the file could not be written. The run still keeps that error. */
async function saveFinished(
  runId: string,
  status: 'complete' | 'needs_revision' | 'stopped',
  snapshot: RunSnapshot,
): Promise<string | null> {
  closing.add(runId);
  try {
    await persistFinished(runId, status, snapshot);
    unsaved.delete(runId);
    return null;
  } catch (error) {
    console.error('[run] could not save the run:', error instanceof Error ? error.message : error);
    const visible = status === 'complete' ? 'needs_revision' : status;
    const failed = finishedRecord(runId, visible, snapshot, SAVE_FAILED);
    unsaved.set(runId, failed);
    try {
      await writeJson(`runs/${runId}.json`, failed);
    } catch {
      // The in-memory record is what status and the office can still show.
    }
    return SAVE_FAILED;
  }
}

function roomSnapshot(runId: string, brief: string): { brief: string; tasks: RunRecord['tasks']; synthesis: string; wordCount: number } {
  const current = getHub().room.currentRun();
  if (!current || current.id !== runId) return { brief, tasks: [], synthesis: '', wordCount: 0 };
  return {
    brief: current.brief || brief,
    tasks: current.tasks.map((task) => ({ id: task.id, title: task.title, role: task.role, status: task.status })),
    synthesis: current.synthesis,
    wordCount: current.wordCount ?? 0,
  };
}

const RUN_FILE = /^[0-9a-f-]{36}\.json$/i;

/** The in-progress room run, otherwise the saved record. */
export async function getRunRecord(runId: string): Promise<RunRecord | null> {
  if (!/^[0-9a-f-]{36}$/i.test(runId)) return null;
  const current = getHub().room.currentRun();
  if (current && current.id === runId && (current.status === 'running' || current.status === 'cancel_requested')) {
    const meta = metas.get(runId);
    return {
      id: current.id,
      brief: current.brief,
      source: meta?.source ?? 'room',
      status: current.status,
      startedAt: meta?.startedAt ?? '',
      tasks: current.tasks.map((task) => ({ id: task.id, title: task.title, role: task.role, status: task.status })),
      synthesis: current.synthesis,
      wordCount: current.wordCount ?? 0,
    };
  }
  const held = unsaved.get(runId);
  if (held) return held;
  try {
    return await readJson<RunRecord | null>(`runs/${runId}.json`, null);
  } catch {
    return null;
  }
}

export async function listRecentRuns(n: number): Promise<RunRecord[]> {
  if (n <= 0) return [];
  let names: string[] = [];
  try {
    names = await readdir(path.join(getDataDir(), 'runs'));
  } catch {
    return [];
  }
  const records = new Map<string, RunRecord>();
  for (const name of names) {
    if (!RUN_FILE.test(name)) continue;
    try {
      const record = await readJson<RunRecord | null>(`runs/${name}`, null);
      if (record && typeof record.id === 'string') records.set(record.id, unsaved.get(record.id) ?? record);
    } catch {
      // Skip a file that is not a run record.
    }
  }
  for (const [id, record] of unsaved) {
    if (!records.has(id)) records.set(id, record);
  }
  const newest = [...records.values()];
  const stamp = (record: RunRecord) => record.startedAt || record.finishedAt || '';
  newest.sort((a, b) => stamp(b).localeCompare(stamp(a)) || (b.finishedAt ?? '').localeCompare(a.finishedAt ?? ''));
  return newest.slice(0, n);
}

/**
 * Starts a society run on the process room. Returns as soon as the run is reserved.
 * Messages go to `requester` when one was passed, otherwise to the host socket.
 * Stage updates still go only to the host, matching the office animation.
 */
export async function startSocietyRun(input: {
  brief: string;
  provider: ServerProvider;
  model?: string;
  team?: { name: string; description: string; model?: string }[];
  presetTasks?: SocietyTask[];
  source: 'room' | 'household';
  requester?: WsSocket;
}): Promise<StartRunResult> {
  const { room } = getHub();
  const begun = room.beginRun(input.brief);
  if (!begun.ok) {
    return {
      ok: false,
      error: input.source === 'household'
        ? HOUSEHOLD_BUSY
        : 'A run is already in progress.',
    };
  }
  const runId = begun.run.id;
  const requester = input.requester;
  metas.set(runId, { source: input.source, startedAt: new Date().toISOString() });
  if (input.source === 'household') {
    try {
      await writeRunning(runId, input.brief);
    } catch (error) {
      console.error('[run] could not save the running plan:', error instanceof Error ? error.message : error);
    }
  }

  const deliver = (message: ServerMessage): void => {
    if (!room.ownsRun(runId)) return;
    const sock = getHub().hostSocket();
    if (!sock || sock.readyState !== WebSocket.OPEN) return;
    sock.send(JSON.stringify(message));
  };

  emit(requester, { type: 'society-started', brief: input.brief, taskCount: 0 });
  beginRunStats();
  setDecisionSink((record) => {
    emit(requester, { type: 'society-decision', decision: toDecisionWire(record) });
  });
  setBossAsker((record) => new Promise((resolve) => {
    const sock = requester ?? getHub().hostSocket();
    if (!sock || sock.readyState !== WebSocket.OPEN) {
      resolve(null);
      return;
    }
    const id = randomUUID();
    const timer = setTimeout(() => {
      getHub().pendingBoss.delete(id);
      resolve(null);
    }, 30_000);
    getHub().pendingBoss.set(id, (reply) => {
      clearTimeout(timer);
      resolve(reply);
    });
    emit(requester, { type: 'decision-request', id, decision: toDecisionWire(record) });
  }));

  const model = input.model?.trim();
  const team = input.team ?? [];
  const provider = input.provider;
  provider.prepareRequest({ runId, stage: 'planning', agent: team[0]?.name ?? 'Manager', attempt: 1 });
  let negotiationRes: any;
  void runSociety(input.brief, provider, {
    models: model ? { manager: model, worker: model } : undefined,
    team,
    presetTasks: input.presetTasks,
    shouldStop: () => room.cancelRequested(runId),
    onEvent: (event) => forwardSocietyEvent(requester, event, { runId, room, deliver }),
    beforeSynthesis: async (tasks) => {
      if (room.cancelRequested(runId)) return '';
      try {
        const prepared = await leadNotesFromConflict(input.brief, tasks, provider, (event) => {
          if (event.type === 'society-debating') {
            if (room.ownsRun(runId)) room.noteStage(runId, 'debating');
            deliver({ type: 'society-stage', stage: 'debating' });
          } else if (event.type === 'negotiation-turn') {
            deliver({
              type: 'society-negotiation',
              topic: event.topic ?? 'Worker outputs',
              round: event.round,
              agent: event.agent,
              argument: event.argument,
            });
          } else if (event.type === 'negotiation-scores') {
            deliver({
              type: 'society-negotiation',
              topic: event.topic ?? 'Worker outputs',
              round: event.round,
              agent: 'Referee',
              argument: `Scoring results for Round ${event.round}`,
              scores: event.scores,
            });
          }
        }, model || 'deepseek-v4.1-flash');
        if (prepared.negotiation) {
          negotiationRes = {
            topic: prepared.negotiation.topic,
            rounds: prepared.negotiation.rounds,
            outcome: prepared.negotiation.outcome,
            winner: prepared.negotiation.winner,
            synthesis: prepared.negotiation.synthesis,
            scores: prepared.negotiation.scores,
            transcript: prepared.negotiation.transcript,
          };
        }
        return prepared.notes;
      } catch (e) {
        console.error('[Relay] Negotiation failed:', e);
      }
    },
  }).then(async (result) => {
    closing.add(runId);
    if (!room.ownsRun(runId)) return;
    const taskRows = result.tasks.map((task) => ({ id: task.id, title: task.title, role: task.role, status: task.status }));
    if (result.documentStatus === 'stopped') {
      room.markStopped(runId);
      deliver({ type: 'society-run-status', runId, status: 'stopped' });
      endRunStats();
      clearBoss();
      const spokenSummary = await householdSpokenSummary(input.source, provider, result.synthesis, result.tasks);
      if (spokenSummary) room.noteSpokenSummary(runId, spokenSummary);
      const saveError = await saveFinished(runId, 'stopped', {
        brief: result.brief,
        tasks: taskRows,
        synthesis: result.synthesis,
        wordCount: result.wordCount,
        spokenSummary,
      });
      if (saveError) deliver({ type: 'society-error', error: saveError });
      return;
    }
    const spokenSummary = await householdSpokenSummary(input.source, provider, result.synthesis, result.tasks);
    if (spokenSummary) room.noteSpokenSummary(runId, spokenSummary);
    const intended = result.revisionLabel ? 'needs_revision' as const : 'complete' as const;
    const saveError = await saveFinished(runId, intended, {
      brief: result.brief,
      tasks: taskRows,
      synthesis: result.synthesis,
      wordCount: result.wordCount,
      spokenSummary,
    });
    const recorded = room.finishRun(runId, {
      status: saveError ? 'needs_revision' : intended,
      synthesis: result.synthesis,
      wordCount: result.wordCount,
      revisionLabel: result.revisionLabel,
    });
    if (!recorded) {
      endRunStats();
      clearBoss();
      return;
    }
    const counted = provider.takeUsage();
    deliver({
      type: 'society-complete',
      result: {
        brief: result.brief,
        tasks: result.tasks.map((t) => ({
          id: t.id,
          title: t.title,
          role: t.role,
          status: t.status,
          output: t.output,
          attempts: t.attempts,
          healed: t.healed,
        })),
        synthesis: result.synthesis,
        wordCount: result.wordCount,
        revisionLabel: result.revisionLabel,
        ...(spokenSummary ? { spokenSummary } : {}),
        ...(saveError ? { error: saveError } : {}),
        negotiation: negotiationRes,
        metrics: {
          ...result.metrics,
          totalCalls: counted.calls,
          totalPromptTokens: counted.promptTokens,
          totalCompletionTokens: counted.completionTokens,
          missingUsage: counted.missingUsage,
        },
        research: {
          searches: currentRunStats()?.researchCalls ?? researchSearchCount(),
          sources: researchSources(),
        },
        summary: {
          decisions: currentRunStats()?.decisionCalls ?? 0,
          inputTokens: currentRunStats()?.inputTokens ?? 0,
          jevCostUsd: ((currentRunStats()?.inputTokens ?? 0) * 0.042) / 1_000_000,
          searches: researchSearchCount(),
          sources: researchSources(),
          comparisonMeasured: false,
          comparisonNote: 'The five-brief comparison was not run. Jev returned HTTP 401, so time saved versus the legacy path was not measured.',
        },
      },
    });
    endRunStats();
    clearBoss();
  }).catch(async (err) => {
    closing.add(runId);
    endRunStats();
    clearBoss();
    if (room.ownsRun(runId)) {
      room.markStopped(runId);
      deliver({ type: 'society-run-status', runId, status: 'stopped' });
      deliver({ type: 'society-error', error: publicModelError(err) });
      const snapshot = roomSnapshot(runId, input.brief);
      const spokenSummary = await householdSpokenSummary(input.source, provider, snapshot.synthesis, snapshot.tasks);
      if (spokenSummary) room.noteSpokenSummary(runId, spokenSummary);
      const saveError = await saveFinished(runId, 'stopped', { ...snapshot, spokenSummary });
      if (saveError) deliver({ type: 'society-error', error: saveError });
    }
  }).finally(() => {
    settleRun(runId);
  });

  return { ok: true, runId };
}
