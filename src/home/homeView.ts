import type { MemoryItem, RunItem, TaskItem } from '../interface/householdView';

/** Same words as `isSafetyFact` in server/household/briefing.ts, split so the badge can name the kind. */
const ALLERGY = /\ballerg(?:y|ic|ies)\b/i;
const MEDICAL = /\b(?:medicine|medication|medical)\b/i;
const DIET = /\b(?:vegetarian|vegan|gluten|lactose|intoleran\w*|diet(?:ary)?|halal|kosher)\b/i;
/** Words worth a warning colour in a plan summary. Diets are preferences there, not alarms. */
const ALERT_WORDS = /\b(?:allerg(?:y|ic|ies)|anaphyla\w*|medicine|medication|conflicts?)\b/gi;

export type SafetyKind = 'allergy' | 'diet' | 'medical';

export function safetyKind(text: string, tags: string[] = []): SafetyKind | null {
  const blob = `${text} ${tags.join(' ')}`;
  if (ALLERGY.test(blob)) return 'allergy';
  if (MEDICAL.test(blob)) return 'medical';
  if (DIET.test(blob)) return 'diet';
  return null;
}

export interface MemoryGroup {
  who: string;
  facts: MemoryItem[];
}

/** Named people A to Z, then Home for facts with no `who`. Safety facts lead each block. */
export function groupMemory(memory: MemoryItem[]): MemoryGroup[] {
  const buckets = new Map<string, MemoryItem[]>();
  for (const entry of memory) {
    const who = entry.who?.trim() || 'Home';
    const list = buckets.get(who);
    if (list) list.push(entry);
    else buckets.set(who, [entry]);
  }
  const names = [...buckets.keys()].filter((name) => name !== 'Home').sort((left, right) => left.localeCompare(right));
  if (buckets.has('Home')) names.push('Home');
  return names.map((who) => ({
    who,
    facts: (buckets.get(who) ?? []).slice().sort((left, right) => {
      const leftSafe = safetyKind(left.text, left.tags) ? 0 : 1;
      const rightSafe = safetyKind(right.text, right.tags) ? 0 : 1;
      return leftSafe - rightSafe;
    }),
  }));
}

export function greetingForHour(hour: number): string {
  if (hour < 12) return 'Good morning.';
  if (hour < 17) return 'Good afternoon.';
  return 'Good evening.';
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Sat 10 Oct · 7:42 pm" in local time. */
export function formatHomeStamp(date: Date): string {
  const hours24 = date.getHours();
  const suffix = hours24 >= 12 ? 'pm' : 'am';
  const hours = hours24 % 12 || 12;
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]} · ${hours}:${minutes} ${suffix}`;
}

/** "Tue 13 Oct" in local time, or "" when the date does not parse. */
export function formatDay(dueAt: string): string {
  const date = new Date(dueAt);
  if (Number.isNaN(date.getTime())) return '';
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

export function formatClock(dueAt: string): string {
  const date = new Date(dueAt);
  if (Number.isNaN(date.getTime())) return '';
  const suffix = date.getHours() >= 12 ? 'pm' : 'am';
  const hours = date.getHours() % 12 || 12;
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes} ${suffix}`;
}

/** "in 8 min", or "overdue" once the instant has passed. `now` is epoch ms. */
export function relativeDue(dueAt: string, now: number): string {
  const at = Date.parse(dueAt);
  if (!Number.isFinite(at)) return '';
  if (at < now) return 'overdue';
  const minutes = Math.round((at - now) / 60_000);
  if (minutes < 60) return `in ${Math.max(1, minutes)} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `in ${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  const days = Math.round(hours / 24);
  return `in ${days} ${days === 1 ? 'day' : 'days'}`;
}

export function taskInstant(task: { dueAt?: string; due?: string }): number | null {
  if (task.dueAt) {
    const at = Date.parse(task.dueAt);
    if (Number.isFinite(at)) return at;
  }
  const match = task.due?.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  if (!match) return null;
  const at = new Date(`${match[1]}T00:00:00`).getTime();
  return Number.isFinite(at) ? at : null;
}

/** Open tasks due today or earlier, earliest first. */
export function todayTasks<T extends TaskItem>(tasks: T[], now: Date): T[] {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
  return tasks
    .filter((task) => task.status !== 'done')
    .filter((task) => {
      const at = taskInstant(task);
      return at !== null && at < end;
    })
    .sort((left, right) => (taskInstant(left) ?? 0) - (taskInstant(right) ?? 0));
}

export function suggestionTone(line: string): 'safety' | 'reminder' | 'note' {
  if (safetyKind(line, [])) return 'safety';
  if (/^reminders?:/i.test(line)) return 'reminder';
  return 'note';
}

/** "Plan: 4 steps — a; b; c; d" becomes the step lines. Other text stays one block. */
export function planSteps(summary: string): string[] | null {
  const match = summary.match(/Plan:\s*\d+\s+steps?\s*[—–-]\s*([^\n]+)/);
  if (!match?.[1]) return null;
  const steps = match[1].split(/\s*;\s*/).map((step) => step.trim()).filter(Boolean);
  return steps.length > 0 ? steps : null;
}

/**
 * A summary saved by an older build can stop mid-thought. Keep every word (the cut-off part is often
 * Keeper's warning) and mark the cut.
 */
export function wholeSentences(text: string): string {
  const trimmed = text.trim();
  if (!trimmed || /[.!?…]["')\]]?$/.test(trimmed)) return trimmed;
  return `${trimmed}…`;
}

/** A household brief carries the saved memory after the request. The title is the request. */
export function briefTitle(brief: string): string {
  const head = brief.split(/\n\s*Household memory:/i)[0] ?? '';
  return head.replace(/\s+/g, ' ').trim();
}

/** Household runs only, unless none of the rows say where they came from. Newest stay first. */
export function householdRuns(runs: RunItem[], limit = 5): RunItem[] {
  const tagged = runs.some((run) => run.source !== undefined);
  const picked = tagged ? runs.filter((run) => run.source === 'household') : runs;
  return picked.slice(0, limit);
}

export type PlanTone = 'working' | 'done' | 'stopped' | 'attention';

export function planTone(status: string, error?: string): { label: string; tone: PlanTone } {
  if (error || status === 'needs_revision') return { label: 'Needs a look', tone: 'attention' };
  if (status === 'complete') return { label: 'Done', tone: 'done' };
  if (status === 'stopped') return { label: 'Stopped', tone: 'stopped' };
  return { label: 'Working…', tone: 'working' };
}

export function planIsRunning(status: string, error?: string): boolean {
  if (error) return false;
  return status === 'running' || status === 'cancel_requested';
}

export function taskWorkLabel(status: string): string {
  const value = status.trim().toLowerCase();
  if (value === 'done') return 'Done';
  if (value === 'escalated' || value === 'failed' || value === 'error' || value === 'needs_help') return 'Needs help';
  if (value === 'running' || value === 'working' || value === 'in_progress' || value === 'healing') return 'Working';
  return 'Queued';
}

export function roleLabel(role: string): string {
  const trimmed = role.trim();
  return trimmed || 'Team';
}

/** Agora, Scout, Planner, Keeper — the same four names as server/household/team.ts. */
export const TEAM = [
  { name: 'Agora', blurb: 'lead' },
  { name: 'Scout', blurb: 'research' },
  { name: 'Planner', blurb: 'logistics' },
  { name: 'Keeper', blurb: 'checks memory' },
] as const;

const TINTS = ['#f3e7c3', '#dce8df', '#f6e0d8', '#e4e2f1', '#dce7f0', '#efe3c8'];

export function personTint(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash + char.charCodeAt(0) * 17) % TINTS.length;
  return TINTS[hash] ?? TINTS[0];
}

export function relativePast(iso: string | undefined, now: number): string {
  if (!iso) return '';
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return '';
  const minutes = Math.round((now - at) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}

export function safetySpans(text: string): { text: string; safety: boolean }[] {
  const pattern = new RegExp(ALERT_WORDS.source, 'gi');
  const spans: { text: string; safety: boolean }[] = [];
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) spans.push({ text: text.slice(cursor, index), safety: false });
    spans.push({ text: match[0], safety: true });
    cursor = index + match[0].length;
  }
  if (cursor < text.length) spans.push({ text: text.slice(cursor), safety: false });
  if (spans.length === 0) spans.push({ text, safety: false });
  return spans;
}

export function receiptLine(action: string | undefined, verified: boolean, hint: string): string | null {
  const mark = verified ? 'verified' : 'not verified';
  const name = (action ?? '').toLowerCase();
  if (name === 'remember' || name === 'edit_memory') return `Saved to memory · ${mark}`;
  if (name === 'add_task') return `Added to ${/shopping/i.test(hint) ? 'Shopping' : 'To-do'} · ${mark}`;
  if (name === 'complete_task') return `Marked done · ${mark}`;
  if (name === 'forget' || name === 'delete_memory') return `Removed from memory · ${mark}`;
  return null;
}

export function latestWriteLine(
  tools: { name: string; speech?: string; summary?: string; receipt?: { action?: string; verified?: boolean } }[],
  utterance = '',
): string | null {
  for (let index = tools.length - 1; index >= 0; index -= 1) {
    const card = tools[index];
    if (!card?.receipt) continue;
    const hint = `${utterance} ${card.speech ?? ''} ${card.summary ?? ''}`;
    const line = receiptLine(card.receipt.action ?? card.name, card.receipt.verified === true, hint);
    if (line) return line;
  }
  return null;
}
