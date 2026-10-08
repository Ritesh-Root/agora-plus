import { randomUUID } from 'crypto';
import type { HouseholdSource } from './memoryStore';
import { loadJsonFile, writeJson } from './store';

export type { HouseholdSource };

export interface HouseholdTask {
  id: string;
  title: string;
  due?: string;
  status: 'open' | 'done';
  createdAt: string;
  completedAt?: string;
  source: HouseholdSource;
  /** Person who owns the task. */
  who?: string;
  /** Named list such as "shopping". Absent means the main to-do list. */
  list?: string;
  /** ISO 8601 with a numeric offset. The free-text `due` stays beside it. */
  dueAt?: string;
}

export interface TaskFields {
  who?: string;
  list?: string;
  dueAt?: string;
}

const FILE = 'tasks.json';

let chain: Promise<unknown> = Promise.resolve();

function exclusive<T>(job: () => Promise<T>): Promise<T> {
  const run = chain.then(job, job);
  chain = run.then(() => undefined, () => undefined);
  return run;
}

function isTaskFile(value: unknown): value is Record<string, unknown>[] {
  if (!Array.isArray(value)) return false;
  return value.every((row) => {
    if (!row || typeof row !== 'object') return false;
    const item = row as Record<string, unknown>;
    if (typeof item.id !== 'string' || item.id.trim().length === 0 || typeof item.title !== 'string') return false;
    if (item.status !== undefined && item.status !== 'open' && item.status !== 'done') return false;
    return true;
  });
}

function cleanOptional(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function asTask(row: Record<string, unknown>): HouseholdTask {
  const source = row.source === 'voice' || row.source === 'mcp' || row.source === 'ui' || row.source === 'agent'
    ? row.source
    : 'ui';
  const task: HouseholdTask = {
    id: String(row.id).trim(),
    title: String(row.title),
    status: row.status === 'done' ? 'done' : 'open',
    createdAt: typeof row.createdAt === 'string' && row.createdAt ? row.createdAt : new Date().toISOString(),
    source,
  };
  const due = cleanOptional(row.due);
  const who = cleanOptional(row.who);
  const list = cleanOptional(row.list);
  const dueAt = cleanOptional(row.dueAt);
  const completedAt = cleanOptional(row.completedAt);
  if (due) task.due = due;
  if (who) task.who = who;
  if (list) task.list = list;
  if (dueAt) task.dueAt = dueAt;
  if (completedAt) task.completedAt = completedAt;
  return task;
}

async function readTasks(): Promise<HouseholdTask[]> {
  const parsed = await loadJsonFile(FILE, isTaskFile);
  if (!Array.isArray(parsed)) return [];
  return parsed.map((row) => asTask(row as Record<string, unknown>));
}

export async function addTask(
  title: string,
  due: string | undefined,
  source: HouseholdSource,
  fields?: TaskFields,
): Promise<HouseholdTask> {
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
  const who = fields?.who?.trim();
  const list = fields?.list?.trim();
  const dueAt = fields?.dueAt?.trim();
  if (who) task.who = who;
  if (list) task.list = list;
  if (dueAt) task.dueAt = dueAt;
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
