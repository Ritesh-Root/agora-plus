/** How often the open simulator asks the household what is due. */
export const REMINDER_POLL_MS = 30_000;

/** A task already this late when the page opened is not announced. */
export const STALE_DUE_MS = 60 * 60 * 1000;

export interface ReminderTask {
  id: string;
  title: string;
  status?: string;
  dueAt?: string;
}

export interface RunNotice {
  id: string;
  status: string;
  startedAt?: string;
  spokenSummary?: string;
}

const STILL_GOING = new Set(['running', 'cancel_requested']);

export function reminderLine(title: string): string {
  return `Reminder: ${title.trim()}.`;
}

/**
 * Open tasks whose dueAt is already past.
 * Skip anything that was due more than an hour before the page opened.
 */
export function dueReminders(
  tasks: ReminderTask[],
  now: number,
  openedAt: number,
  announced: ReadonlySet<string>,
): ReminderTask[] {
  const staleBefore = openedAt - STALE_DUE_MS;
  const found: ReminderTask[] = [];
  for (const task of tasks) {
    if (!task.id || announced.has(task.id)) continue;
    if (task.status === 'done') continue;
    if (!task.dueAt) continue;
    const due = Date.parse(task.dueAt);
    if (!Number.isFinite(due) || due > now) continue;
    if (due < staleBefore) continue;
    if (!task.title.trim()) continue;
    found.push(task);
  }
  return found;
}

/** Runs that started after the approval and have left `running`. */
export function finishedRunNotices(
  runs: RunNotice[],
  approvedAt: number,
  announced: ReadonlySet<string>,
): RunNotice[] {
  const found: RunNotice[] = [];
  for (const run of runs) {
    if (!run.id || announced.has(run.id)) continue;
    if (!run.status || STILL_GOING.has(run.status)) continue;
    const summary = run.spokenSummary?.trim();
    if (!summary) continue;
    if (!run.startedAt) continue;
    const started = Date.parse(run.startedAt);
    if (!Number.isFinite(started) || started < approvedAt) continue;
    found.push({ ...run, spokenSummary: summary });
  }
  return found;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function readTasks(body: unknown): ReminderTask[] {
  const record = asRecord(body);
  if (!record || !Array.isArray(record.tasks)) return [];
  const tasks: ReminderTask[] = [];
  for (const item of record.tasks) {
    const row = asRecord(item);
    if (!row || typeof row.id !== 'string' || typeof row.title !== 'string') continue;
    const task: ReminderTask = { id: row.id, title: row.title };
    if (typeof row.status === 'string') task.status = row.status;
    if (typeof row.dueAt === 'string') task.dueAt = row.dueAt;
    tasks.push(task);
  }
  return tasks;
}

export function readRuns(body: unknown): RunNotice[] {
  const record = asRecord(body);
  if (!record || !Array.isArray(record.recentRuns)) return [];
  const runs: RunNotice[] = [];
  for (const item of record.recentRuns) {
    const row = asRecord(item);
    if (!row || typeof row.id !== 'string' || typeof row.status !== 'string') continue;
    const run: RunNotice = { id: row.id, status: row.status };
    if (typeof row.startedAt === 'string') run.startedAt = row.startedAt;
    if (typeof row.spokenSummary === 'string') run.spokenSummary = row.spokenSummary;
    runs.push(run);
  }
  return runs;
}

export interface HouseholdNotices {
  taskIds: string[];
  runIds: string[];
  lines: string[];
}

export function householdNotices(
  body: unknown,
  now: number,
  openedAt: number,
  approvedAt: number | null,
  seenTasks: ReadonlySet<string>,
  seenRuns: ReadonlySet<string>,
): HouseholdNotices {
  const due = dueReminders(readTasks(body), now, openedAt, seenTasks);
  const lines = due.map((task) => reminderLine(task.title));
  const runIds: string[] = [];
  if (approvedAt !== null) {
    for (const run of finishedRunNotices(readRuns(body), approvedAt, seenRuns)) {
      runIds.push(run.id);
      if (run.spokenSummary) lines.push(run.spokenSummary);
    }
  }
  return { taskIds: due.map((task) => task.id), runIds, lines };
}

/** Poll immediately, then on the interval. The caller stops it when the page closes. */
export function startHouseholdWatch(poll: () => void, interval = REMINDER_POLL_MS): () => void {
  poll();
  const id = setInterval(poll, interval);
  return () => clearInterval(id);
}
