import type { PendingAction } from './approvals';
import { householdTimeZone, localDay } from './clock';
import type { MemoryEntry } from './memoryStore';
import { toSpeech } from './speech';
import type { HouseholdTask } from './taskStore';

export interface BriefingRun {
  finishedAt?: string;
}

export interface Briefing {
  speech: string;
  items: string[];
  suggestions: string[];
}

function dueDay(due: string | undefined): string | null {
  if (!due) return null;
  const match = due.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function taskDay(task: HouseholdTask, timeZone: string): string | null {
  if (task.dueAt) {
    const at = Date.parse(task.dueAt);
    if (Number.isFinite(at)) return localDay(new Date(at), timeZone);
  }
  return dueDay(task.due);
}

function isSafety(entry: MemoryEntry): boolean {
  return /\b(allerg(?:y|ic|ies)|medicine|medication|medical)\b/i.test(`${entry.text} ${entry.tags.join(' ')}`);
}

function memorySentence(entries: MemoryEntry[]): string | null {
  if (entries.length === 0) return null;
  const safety = entries.filter(isSafety).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const newest = entries.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const pick = safety[0] ?? newest[0];
  if (!pick) return null;
  const text = pick.text.replace(/[.!?…]+$/u, '').trim();
  return text ? `Remember: ${text}.` : null;
}

function reminderTasks(open: HouseholdTask[], now: Date): HouseholdTask[] {
  return open.filter((task) => {
    if (!task.dueAt) return false;
    const at = Date.parse(task.dueAt);
    return Number.isFinite(at) && at <= now.getTime();
  }).sort((a, b) => (a.dueAt ?? '').localeCompare(b.dueAt ?? ''));
}

function reminderSentence(due: HouseholdTask[]): string | null {
  if (due.length === 0) return null;
  if (due.length === 1) return `Reminder: ${due[0].title}.`;
  return `Reminders: ${due[0].title} and ${due[1].title}.`;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** Fixed briefing. No model call. */
export function buildBriefing(input: {
  tasks: HouseholdTask[];
  memory: MemoryEntry[];
  pendingApprovals: PendingAction[];
  recentRuns: BriefingRun[];
  now: Date;
}): Briefing {
  const timeZone = householdTimeZone();
  const today = localDay(input.now, timeZone);
  const open = input.tasks.filter((task) => task.status === 'open');
  const overdue = open.filter((task) => {
    const due = taskDay(task, timeZone);
    return due !== null && due < today;
  }).sort((a, b) => (a.dueAt ?? a.due ?? '').localeCompare(b.dueAt ?? b.due ?? ''));
  const dueToday = open.filter((task) => taskDay(task, timeZone) === today);
  const reminders = reminderTasks(open, input.now);
  const reminded = new Set(reminders.map((task) => task.id));
  const cutoff = input.now.getTime() - 24 * 60 * 60 * 1000;
  const finishedRecently = input.recentRuns.filter((run) => {
    if (!run.finishedAt) return false;
    const at = Date.parse(run.finishedAt);
    return Number.isFinite(at) && at >= cutoff && at <= input.now.getTime();
  });

  const remembered = memorySentence(input.memory);
  const reminderLine = reminderSentence(reminders);
  const items: string[] = [];
  if (remembered) items.push(remembered);
  for (const task of reminders) items.push(`Reminder: ${task.title}.`);
  for (const task of overdue) items.push(`${task.title} is overdue (due ${task.due ?? task.dueAt}).`);
  for (const task of dueToday) {
    if (reminded.has(task.id)) continue;
    items.push(`${task.title} is due today.`);
  }
  items.push(`${plural(open.length, 'open task')}.`);
  if (input.pendingApprovals.length > 0) {
    items.push(`${plural(input.pendingApprovals.length, 'approval')} waiting.`);
  }
  if (finishedRecently.length > 0) {
    items.push(`${plural(finishedRecently.length, 'run')} finished in the last 24 hours.`);
  }

  const speechOverdue = overdue.filter((task) => !reminded.has(task.id));
  const speechDueToday = dueToday.filter((task) => !reminded.has(task.id));
  const speechParts: string[] = [];
  if (remembered) speechParts.push(remembered);
  if (reminderLine) speechParts.push(reminderLine);
  if (speechOverdue.length === 1) speechParts.push(`${speechOverdue[0].title} is overdue.`);
  else if (speechOverdue.length > 1) speechParts.push(`${plural(speechOverdue.length, 'task')} are overdue.`);
  else if (speechDueToday.length === 1) speechParts.push(`${speechDueToday[0].title} is due today.`);
  else if (speechDueToday.length > 1) speechParts.push(`${plural(speechDueToday.length, 'task')} are due today.`);
  if (input.pendingApprovals.length === 1) speechParts.push('One approval is waiting.');
  else if (input.pendingApprovals.length > 1) speechParts.push(`${plural(input.pendingApprovals.length, 'approval')} are waiting.`);
  if (speechParts.length === 0) {
    speechParts.push(open.length > 0 ? `You have ${plural(open.length, 'open task')}.` : 'Nothing urgent at home.');
  }

  let suggestion: string | undefined;
  if (overdue[0]) suggestion = `Finish "${overdue[0].title}", it is overdue.`;
  else if (input.pendingApprovals.length > 0) suggestion = 'Review a pending approval so the household can continue.';
  else if (dueToday[0]) suggestion = `Start "${dueToday[0].title}", it is due today.`;
  else if (open[0]) suggestion = `You still have "${open[0].title}" open.`;
  else if (remembered) suggestion = remembered;
  else if (input.memory.length === 0) suggestion = 'Tell me a preference or allergy to remember.';

  return {
    speech: toSpeech(speechParts.join(' ')),
    items,
    suggestions: suggestion ? [suggestion] : [],
  };
}
