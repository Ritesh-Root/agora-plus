import { mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setDataDir } from './household/store';
import { getRunRecord, startSocietyRun } from './runEngine';
import type { ServerProvider } from './society/provider';

let dir = '';

beforeEach(async () => {
  delete process.env.AGORA_DECIDER;
  dir = await mkdtemp(path.join(tmpdir(), 'agora-run-'));
  setDataDir(dir);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function fakeProvider(): ServerProvider {
  return {
    prepareRequest() {},
    takeUsage() {
      return { calls: 1, promptTokens: 0, completionTokens: 0, missingUsage: 0 };
    },
    async generateCompletion(_messages, _tools, systemInstruction) {
      await new Promise((resolve) => setTimeout(resolve, 40));
      if (systemInstruction?.includes('You are the Manager') || systemInstruction?.includes('You lead this team')) {
        return { content: JSON.stringify([{ id: 't1', title: 'Note', role: 'worker', prompt: 'Write a short note' }]) };
      }
      return { content: 'A short finished note.' };
    },
  };
}

describe('runEngine', () => {
  it('finishes with no sockets, saves the run, and refuses a second start while busy', async () => {
    const first = await startSocietyRun({
      brief: 'Plan dinner',
      provider: fakeProvider(),
      team: [],
      source: 'household',
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = await startSocietyRun({
      brief: 'Plan breakfast',
      provider: fakeProvider(),
      team: [],
      source: 'household',
    });
    expect(second).toEqual({ ok: false, error: 'A run is already in progress.' });

    const started = Date.now();
    let saved: { status?: string; synthesis?: string } | null = null;
    while (Date.now() - started < 5000) {
      const record = await getRunRecord(first.runId);
      if (record && record.status !== 'running' && record.status !== 'cancel_requested') {
        saved = record;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
    expect(saved?.status).toBe('complete');
    const markdown = await readFile(path.join(dir, 'runs', `${first.runId}.md`), 'utf8');
    expect(markdown).toBe(saved?.synthesis);
    expect(markdown).toContain('short finished note');
  });
});
