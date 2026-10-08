import { randomUUID } from 'crypto';
import { readdir } from 'fs/promises';
import path from 'path';
import { WebSocket, type WebSocket as WsSocket } from 'ws';
import type { ServerMessage } from '../shared/protocol';
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
}

export type StartRunResult = { ok: true; runId: string } | { ok: false; error: string };

const metas = new Map<string, { source: RunRecord['source']; startedAt: string }>();

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

async function persistFinished(
  runId: string,
  status: 'complete' | 'needs_revision' | 'stopped',
  snapshot: { brief: string; tasks: RunRecord['tasks']; synthesis: string; wordCount: number },
): Promise<void> {
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
  await writeText(`runs/${runId}.md`, snapshot.synthesis);
  await writeJson(`runs/${runId}.json`, record);
}

async function saveQuietly(
  runId: string,
  status: 'complete' | 'needs_revision' | 'stopped',
  snapshot: { brief: string; tasks: RunRecord['tasks']; synthesis: string; wordCount: number },
): Promise<void> {
  try {
    await persistFinished(runId, status, snapshot);
  } catch (error) {
    console.error('[run] could not save the run:', error instanceof Error ? error.message : error);
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
  const records: RunRecord[] = [];
  for (const name of names) {
    if (!RUN_FILE.test(name)) continue;
    try {
      const record = await readJson<RunRecord | null>(`runs/${name}`, null);
      if (record && typeof record.id === 'string') records.push(record);
    } catch {
      // Skip a file that is not a run record.
    }
  }
  records.sort((a, b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? ''));
  return records.slice(0, n);
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
  if (!begun.ok) return { ok: false, error: 'A run is already in progress.' };
  const runId = begun.run.id;
  const requester = input.requester;
  metas.set(runId, { source: input.source, startedAt: new Date().toISOString() });

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
  runSociety(input.brief, provider, {
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
    if (!room.ownsRun(runId)) return;
    if (result.documentStatus === 'stopped') {
      room.markStopped(runId);
      deliver({ type: 'society-run-status', runId, status: 'stopped' });
      endRunStats();
      clearBoss();
      await saveQuietly(runId, 'stopped', {
        brief: result.brief,
        tasks: result.tasks.map((task) => ({ id: task.id, title: task.title, role: task.role, status: task.status })),
        synthesis: result.synthesis,
        wordCount: result.wordCount,
      });
      return;
    }
    const recorded = room.finishRun(runId, {
      status: result.revisionLabel ? 'needs_revision' : 'complete',
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
    await saveQuietly(runId, result.revisionLabel ? 'needs_revision' : 'complete', {
      brief: result.brief,
      tasks: result.tasks.map((task) => ({ id: task.id, title: task.title, role: task.role, status: task.status })),
      synthesis: result.synthesis,
      wordCount: result.wordCount,
    });
  }).catch(async (err) => {
    endRunStats();
    clearBoss();
    if (room.ownsRun(runId)) {
      room.markStopped(runId);
      deliver({ type: 'society-run-status', runId, status: 'stopped' });
      deliver({ type: 'society-error', error: publicModelError(err) });
      await saveQuietly(runId, 'stopped', roomSnapshot(runId, input.brief));
    }
  });

  return { ok: true, runId };
}
