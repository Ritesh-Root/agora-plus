import { mkdir, mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { WebSocket } from 'ws';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ServerMessage } from '../shared/protocol';
import { getHub } from './hub';
import { setDataDir, writeJson } from './household/store';
import { getRunRecord, keeperLine, listRecentRuns, startSocietyRun, whenRunSettled } from './runEngine';
import type { ServerProvider } from './society/provider';

let dir = '';

beforeEach(async () => {
  delete process.env.AGORA_DECIDER;
  dir = await mkdtemp(path.join(tmpdir(), 'agora-run-'));
  setDataDir(dir);
  getHub().room.endSession();
});

afterEach(async () => {
  getHub().room.endSession();
  await rm(dir, { recursive: true, force: true });
});

function gate(): { promise: Promise<void>; open: () => void } {
  let open: () => void = () => {};
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}

function provider(plan: Promise<void>): ServerProvider {
  return {
    prepareRequest() {},
    takeUsage() {
      return { calls: 1, promptTokens: 0, completionTokens: 0, missingUsage: 0 };
    },
    async generateCompletion(_messages, _tools, systemInstruction) {
      const system = systemInstruction ?? '';
      if (system.includes('You are the Manager') || system.includes('You lead this team')) {
        await plan;
        return {
          content: JSON.stringify([{ id: 't1', title: 'Flag allergies', role: 'Keeper', prompt: 'Check household memory' }]),
        };
      }
      if (system.includes('Write a spoken summary')) {
        return { content: 'Mia is allergic to peanuts.' };
      }
      return { content: 'Skip peanuts. Mia is allergic to peanuts.' };
    },
  };
}

function listen(): { messages: ServerMessage[]; completed: Promise<Extract<ServerMessage, { type: 'society-complete' }>> } {
  const hub = getHub();
  hub.room.endSession();
  const secret = process.env.DEMO_HOST_SECRET?.trim();
  const joined = hub.room.join('w5-host', 'Host', '#111111', undefined, secret || undefined);
  if (!joined.ok || !joined.info.isHost) throw new Error('test host did not join');
  let resolveComplete: (msg: Extract<ServerMessage, { type: 'society-complete' }>) => void = () => {};
  const completed = new Promise<Extract<ServerMessage, { type: 'society-complete' }>>((resolve) => {
    resolveComplete = resolve;
  });
  const messages: ServerMessage[] = [];
  const ws = {
    readyState: WebSocket.OPEN,
    send(data: string) {
      const msg = JSON.parse(data) as ServerMessage;
      messages.push(msg);
      if (msg.type === 'society-complete') resolveComplete(msg);
    },
  } as unknown as WebSocket;
  hub.sockets.set(joined.info.id, ws);
  return { messages, completed };
}

describe('runEngine', () => {
  it('writes a running record at the start, refuses a second household run in plain speech, and sends the spoken summary', async () => {
    const plan = gate();
    const { completed } = listen();
    const first = await startSocietyRun({
      brief: 'Plan dinner',
      provider: provider(plan.promise),
      team: [],
      source: 'household',
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const running = JSON.parse(await readFile(path.join(dir, 'runs', `${first.runId}.json`), 'utf8')) as {
      status?: string;
      brief?: string;
      startedAt?: string;
      tasks?: unknown[];
    };
    expect(running.status).toBe('running');
    expect(running.brief).toBe('Plan dinner');
    expect(running.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(Array.isArray(running.tasks)).toBe(true);

    const householdAgain = await startSocietyRun({
      brief: 'Plan breakfast',
      provider: provider(Promise.resolve()),
      team: [],
      source: 'household',
    });
    expect(householdAgain).toEqual({
      ok: false,
      error: 'The team is still working on the last plan. Ask me for its status.',
    });

    const roomAgain = await startSocietyRun({
      brief: 'Plan lunch',
      provider: provider(Promise.resolve()),
      team: [],
      source: 'room',
    });
    expect(roomAgain).toEqual({ ok: false, error: 'A run is already in progress.' });

    plan.open();
    const done = await completed;
    expect(done.result.spokenSummary).toMatch(/allergic to peanuts/);
    const saved = await getRunRecord(first.runId);
    expect(saved?.status).toBe('complete');
    expect(saved?.spokenSummary).toMatch(/allergic to peanuts/);
    const markdown = await readFile(path.join(dir, 'runs', `${first.runId}.md`), 'utf8');
    expect(markdown).toBe(saved?.synthesis);
    const recent = await listRecentRuns(5);
    expect(recent[0]?.id).toBe(first.runId);
  });

  it('speaks the conflict sentence of a Keeper note without its headings', () => {
    const note = '## Review\nThe menu looks fine. Conflicts Identified: Timing Conflict with Swimming: Mia has swimming on Saturdays, which conflicts with the picnic from 1 PM to 5 PM.';
    expect(keeperLine(note)).toBe('Mia has swimming on Saturdays, which conflicts with the picnic from 1 PM to 5 PM.');
  });

  it('keeps the reason on the record when every worker call fails', async () => {
    listen();
    const down: ServerProvider = {
      ...provider(Promise.resolve()),
      async generateCompletion(_messages, _tools, systemInstruction) {
        const system = systemInstruction ?? '';
        if (system.includes('You are the Manager') || system.includes('You lead this team')) {
          return { content: JSON.stringify([{ id: 't1', title: 'Flag allergies', role: 'Keeper', prompt: 'Check household memory' }]) };
        }
        throw new Error('The operation was aborted due to timeout');
      },
    };
    const started = await startSocietyRun({ brief: 'Plan dinner', provider: down, team: [], source: 'household' });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    await whenRunSettled(started.runId);
    const saved = await getRunRecord(started.runId);
    expect(saved?.status).toBe('stopped');
    expect(saved?.error).toBeTruthy();
  });

  it('lists runs newest first by when they started', async () => {
    await writeJson('runs/00000000-0000-4000-8000-000000000001.json', {
      id: '00000000-0000-4000-8000-000000000001',
      brief: 'older',
      source: 'household',
      status: 'complete',
      startedAt: '2026-10-01T00:00:00.000Z',
      finishedAt: '2026-10-08T00:00:00.000Z',
      tasks: [],
      synthesis: 'old',
      wordCount: 1,
    });
    await writeJson('runs/00000000-0000-4000-8000-000000000002.json', {
      id: '00000000-0000-4000-8000-000000000002',
      brief: 'newer',
      source: 'household',
      status: 'running',
      startedAt: '2026-10-08T12:00:00.000Z',
      tasks: [{ id: 't1', title: 'Shop', role: 'Planner', status: 'running' }],
      synthesis: '',
      wordCount: 0,
    });
    const recent = await listRecentRuns(2);
    expect(recent.map((run) => run.id)).toEqual([
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000001',
    ]);
    // That file says running, but no run is live in this process: a restart cut it off.
    expect(recent[0]).toMatchObject({
      status: 'stopped',
      startedAt: '2026-10-08T12:00:00.000Z',
      error: 'The run was interrupted by a server restart.',
    });
    expect(await getRunRecord('00000000-0000-4000-8000-000000000002')).toMatchObject({ status: 'stopped' });
  });

  it('keeps a visible error when the finished run cannot be saved', async () => {
    const plan = gate();
    const { completed } = listen();
    const started = await startSocietyRun({
      brief: 'Plan dinner',
      provider: provider(plan.promise),
      team: [],
      source: 'household',
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const file = path.join(dir, 'runs', `${started.runId}.json`);
    await rm(file);
    await mkdir(file);
    plan.open();
    const done = await completed;
    expect(done.result.spokenSummary).toMatch(/allergic to peanuts/);
    expect(done.result.error).toBe('The finished plan could not be saved.');
    const saved = await getRunRecord(started.runId);
    expect(saved?.status).toBe('needs_revision');
    expect(saved?.error).toBe('The finished plan could not be saved.');
    expect(saved?.spokenSummary).toMatch(/allergic to peanuts/);
  });
});
