export interface MemoryItem {
  id: string;
  text: string;
  tags: string[];
  who?: string;
}

export interface TaskItem {
  id: string;
  title: string;
  due?: string;
  dueAt?: string;
  status: string;
  who?: string;
  list?: string;
}

export interface ApprovalItem {
  id: string;
  summary: string;
  kind: string;
}

export interface RunItem {
  id: string;
  brief: string;
  status: string;
  startedAt?: string;
  spokenSummary?: string;
}

export interface Snapshot {
  memory: MemoryItem[];
  tasks: TaskItem[];
  pendingApprovals: ApprovalItem[];
  recentRuns: RunItem[];
  suggestions: string[];
}

export const emptySnapshot: Snapshot = {
  memory: [],
  tasks: [],
  pendingApprovals: [],
  recentRuns: [],
  suggestions: [],
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function optionalText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function personName(who: unknown): string | null {
  return optionalText(who) ?? null;
}

/** Absent list is the main to-do list. "shopping" is its own block. */
export function listName(list: unknown): string {
  const text = optionalText(list);
  if (!text) return 'To-do';
  if (text.toLowerCase() === 'shopping') return 'Shopping';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function groupTasks<T extends { list?: string }>(tasks: T[]): { name: string; tasks: T[] }[] {
  const preferred = ['To-do', 'Shopping'];
  const groups = new Map<string, T[]>();
  for (const task of tasks) {
    const name = listName(task.list);
    const bucket = groups.get(name);
    if (bucket) bucket.push(task);
    else groups.set(name, [task]);
  }
  const names = [...groups.keys()].sort((left, right) => {
    const leftIndex = preferred.indexOf(left);
    const rightIndex = preferred.indexOf(right);
    if (leftIndex !== -1 || rightIndex !== -1) {
      if (leftIndex === -1) return 1;
      if (rightIndex === -1) return -1;
      return leftIndex - rightIndex;
    }
    return left.localeCompare(right);
  });
  return names.map((name) => ({ name, tasks: groups.get(name) ?? [] }));
}

/** Local wall time. Pass `format` in tests so the zone does not matter. */
export function formatDueAt(dueAt: string, format?: (date: Date) => string): string {
  const date = new Date(dueAt);
  if (Number.isNaN(date.getTime())) return dueAt;
  if (format) return format(date);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function parseSnapshot(value: unknown): Snapshot | null {
  const body = asRecord(value);
  if (!body) return null;
  const memory: MemoryItem[] = [];
  if (Array.isArray(body.memory)) {
    for (const item of body.memory) {
      const row = asRecord(item);
      if (!row || typeof row.id !== 'string' || typeof row.text !== 'string') continue;
      const entry: MemoryItem = {
        id: row.id,
        text: row.text,
        tags: Array.isArray(row.tags) ? row.tags.filter((tag): tag is string => typeof tag === 'string') : [],
      };
      const who = personName(row.who);
      if (who) entry.who = who;
      memory.push(entry);
    }
  }
  const tasks: TaskItem[] = [];
  if (Array.isArray(body.tasks)) {
    for (const item of body.tasks) {
      const row = asRecord(item);
      if (!row || typeof row.id !== 'string' || typeof row.title !== 'string') continue;
      const task: TaskItem = {
        id: row.id,
        title: row.title,
        status: typeof row.status === 'string' ? row.status : 'open',
      };
      const due = optionalText(row.due);
      const dueAt = optionalText(row.dueAt);
      const who = personName(row.who);
      const list = optionalText(row.list);
      if (due) task.due = due;
      if (dueAt) task.dueAt = dueAt;
      if (who) task.who = who;
      if (list) task.list = list;
      tasks.push(task);
    }
  }
  const pendingApprovals: ApprovalItem[] = [];
  if (Array.isArray(body.pendingApprovals)) {
    for (const item of body.pendingApprovals) {
      const row = asRecord(item);
      if (!row || typeof row.id !== 'string') continue;
      pendingApprovals.push({
        id: row.id,
        summary: typeof row.summary === 'string' ? row.summary : '',
        kind: typeof row.kind === 'string' ? row.kind : '',
      });
    }
  }
  const recentRuns: RunItem[] = [];
  if (Array.isArray(body.recentRuns)) {
    for (const item of body.recentRuns) {
      const row = asRecord(item);
      if (!row || typeof row.id !== 'string') continue;
      const run: RunItem = {
        id: row.id,
        brief: typeof row.brief === 'string' ? row.brief : '',
        status: typeof row.status === 'string' ? row.status : '',
      };
      const startedAt = optionalText(row.startedAt);
      const spokenSummary = optionalText(row.spokenSummary);
      if (startedAt) run.startedAt = startedAt;
      if (spokenSummary) run.spokenSummary = spokenSummary;
      recentRuns.push(run);
    }
  }
  const suggestions = Array.isArray(body.suggestions)
    ? body.suggestions.filter((item): item is string => typeof item === 'string')
    : [];
  return { memory, tasks, pendingApprovals, recentRuns, suggestions };
}
