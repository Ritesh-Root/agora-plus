import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setDataDir } from './store';
import { addTask, completeTask, listTasks } from './taskStore';

let dir = '';

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'agora-tasks-'));
  setDataDir(dir);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('taskStore', () => {
  it('completes by title, prefers an exact id, and leaves a done task unchanged', async () => {
    const milk = await addTask('Buy milk', '2026-10-08', 'ui');
    await addTask(milk.id, undefined, 'ui');
    const byId = await completeTask(milk.id);
    expect(byId?.id).toBe(milk.id);
    expect(byId?.status).toBe('done');
    const stillOpen = await listTasks('open');
    expect(stillOpen).toHaveLength(1);
    expect(stillOpen[0]?.title).toBe(milk.id);

    const bread = await addTask('Buy bread', undefined, 'ui');
    const byTitle = await completeTask('buy bread');
    expect(byTitle?.id).toBe(bread.id);
    expect(byTitle?.status).toBe('done');
    const again = await completeTask('Buy Bread');
    expect(again).toEqual(byTitle);
  });
});
