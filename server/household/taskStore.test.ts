import { mkdtemp, readdir, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setDataDir } from './store';
import { addTask, completeTask, listTasks, removeTask, reopenTask } from './taskStore';

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

  it('stores who, list, and dueAt, and still loads a task file without them', async () => {
    const call = await addTask('Call Grandma', 'at 6pm', 'voice', {
      who: 'Jen',
      list: 'shopping',
      dueAt: '2026-10-08T18:00:00-07:00',
    });
    expect(call).toMatchObject({ who: 'Jen', list: 'shopping', dueAt: '2026-10-08T18:00:00-07:00', due: 'at 6pm' });
    await writeFile(path.join(dir, 'tasks.json'), JSON.stringify([{
      id: 'old',
      title: 'Old bins',
      status: 'open',
      createdAt: '2026-01-01T00:00:00.000Z',
      source: 'ui',
    }]));
    const loaded = await listTasks();
    expect(loaded.map((task) => task.title)).toEqual(['Old bins']);
    expect(loaded[0]?.list).toBeUndefined();
    expect(loaded[0]?.dueAt).toBeUndefined();
  });

  it('reopens a done task and removes a task by id', async () => {
    const milk = await addTask('Buy milk', undefined, 'ui');
    const done = await completeTask(milk.id);
    expect(done?.status).toBe('done');
    expect(done?.completedAt).toBeTruthy();
    const opened = await reopenTask(milk.id);
    expect(opened?.status).toBe('open');
    expect(opened?.completedAt).toBeUndefined();
    expect((await listTasks('open')).map((task) => task.id)).toContain(milk.id);
    const again = await reopenTask(milk.id);
    expect(again?.status).toBe('open');
    expect(await reopenTask('missing')).toBeNull();
    const removed = await removeTask(milk.id);
    expect(removed?.id).toBe(milk.id);
    expect(await listTasks()).toEqual([]);
    expect(await removeTask(milk.id)).toBeNull();
  });

  it('moves a corrupt task file aside so the next add does not erase it', async () => {
    await writeFile(path.join(dir, 'tasks.json'), '{');
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await listTasks()).toEqual([]);
    expect(await listTasks()).toEqual([]);
    expect(errors).toHaveBeenCalledTimes(1);
    const names = await readdir(dir);
    const aside = names.find((name) => name.startsWith('tasks.json.corrupt-'));
    expect(await readFile(path.join(dir, aside ?? ''), 'utf8')).toBe('{');
    await addTask('Buy milk', undefined, 'ui');
    const fresh = JSON.parse(await readFile(path.join(dir, 'tasks.json'), 'utf8')) as { title: string }[];
    expect(fresh.map((task) => task.title)).toEqual(['Buy milk']);
    expect(await readFile(path.join(dir, aside ?? ''), 'utf8')).toBe('{');
    errors.mockRestore();
  });
});
