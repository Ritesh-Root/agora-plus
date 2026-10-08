import type { PendingAction } from './approvals';
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

function localDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function dueDay(due: string | undefined): string | null {
  if (!due) return null;
  const match = due.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
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
  const today = localDay(input.now);
  const open = input.tasks.filter((task) => task.status === 'open');
  const overdue = open.filter((task) => {
    const due = dueDay(task.due);
    return due !== null && due < today;
  }).sort((a, b) => (a.due ?? '').localeCompare(b.due ?? ''));
  const dueToday = open.filter((task) => dueDay(task.due) === today);
  const cutoff = input.now.getTime() - 24 * 60 * 60 * 1000;
  const finishedRecently = input.recentRuns.filter((run) => {
    if (!run.finishedAt) return false;
    const at = Date.parse(run.finishedAt);
    return Number.isFinite(at) && at >= cutoff && at <= input.now.getTime();
  });

  const items: string[] = [];
  for (const task of overdue) items.push(`${task.title} is overdue (due ${task.due}).`);
  for (const task of dueToday) items.push(`${task.title} is due today.`);
  items.push(`${plural(open.length, 'open task')}.`);
  if (input.pendingApprovals.length > 0) {
    items.push(`${plural(input.pendingApprovals.length, 'approval')} waiting.`);
  }
  if (finishedRecently.length > 0) {
    items.push(`${plural(finishedRecently.length, 'run')} finished in the last 24 hours.`);
  }

  const speechParts: string[] = [];
  if (overdue.length === 1) speechParts.push(`${overdue[0].title} is overdue.`);
  else if (overdue.length > 1) speechParts.push(`${plural(overdue.length, 'task')} are overdue.`);
  else if (dueToday.length === 1) speechParts.push(`${dueToday[0].title} is due today.`);
  else if (dueToday.length > 1) speechParts.push(`${plural(dueToday.length, 'task')} are due today.`);
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
  else if (input.memory.length === 0) suggestion = 'Tell me a preference or allergy to remember.';

  return {
    speech: toSpeech(speechParts.join(' ')),
    items,
    suggestions: suggestion ? [suggestion] : [],
  };
}
