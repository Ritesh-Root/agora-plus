import { randomUUID } from 'crypto';
import type { HouseholdSource } from './memoryStore';
import { readJson, writeJson } from './store';

export type { HouseholdSource };

export interface HouseholdTask {
  id: string;
  title: string;
  due?: string;
  status: 'open' | 'done';
  createdAt: string;
  completedAt?: string;
  source: HouseholdSource;
}

const FILE = 'tasks.json';

let chain: Promise<unknown> = Promise.resolve();

function exclusive<T>(job: () => Promise<T>): Promise<T> {
  const run = chain.then(job, job);
  chain = run.then(() => undefined, () => undefined);
  return run;
}

async function readTasks(): Promise<HouseholdTask[]> {
  const tasks = await readJson<HouseholdTask[]>(FILE, []);
  return Array.isArray(tasks) ? tasks : [];
}

export async function addTask(title: string, due: string | undefined, source: HouseholdSource): Promise<HouseholdTask> {
  const trimmed = title.trim();
  if (!trimmed) throw new Error('A task title is required.');
  const task: HouseholdTask = {
    id: randomUUID(),
    title: trimmed,
    status: 'open',
    createdAt: new Date().toISOString(),
    source,
  };
  const when = due?.trim();
  if (when) task.due = when;
  await exclusive(async () => {
    const tasks = await readTasks();
    tasks.push(task);
    await writeJson(FILE, tasks);
  });
  return task;
}

export async function listTasks(status?: 'open' | 'done'): Promise<HouseholdTask[]> {
  const tasks = await readTasks();
  if (!status) return tasks;
  return tasks.filter((task) => task.status === status);
}

/**
 * Exact id first, then a case-insensitive title. An open task wins a title tie.
 * Completing a task that is already done returns it unchanged.
 */
export async function completeTask(idOrTitle: string): Promise<HouseholdTask | null> {
  const needle = idOrTitle.trim();
  if (!needle) return null;
  return exclusive(async () => {
    const tasks = await readTasks();
    const byId = tasks.find((task) => task.id === needle);
    const byTitleOpen = tasks.find((task) => task.status === 'open' && task.title.toLowerCase() === needle.toLowerCase());
    const byTitle = tasks.find((task) => task.title.toLowerCase() === needle.toLowerCase());
    const task = byId ?? byTitleOpen ?? byTitle;
    if (!task) return null;
    if (task.status === 'done') return { ...task };
    task.status = 'done';
    task.completedAt = new Date().toISOString();
    await writeJson(FILE, tasks);
    return { ...task };
  });
}
