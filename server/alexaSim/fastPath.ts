/**
 * Rule router for commands that do not need a model.
 * A match still runs through MCP. Anything ambiguous returns null.
 */

import { dueAtFromClock, dueAtFromRelative } from '../household/clock';

export interface FastRoute {
  tool: string;
  args: Record<string, unknown>;
}

const APPROVE = new Set(['yes', 'yeah', 'yep', 'go ahead', 'do it', 'approve', 'yes, go ahead', 'yes go ahead']);
const REJECT = new Set(['no', 'nope', 'cancel', "don't", 'dont', 'no, cancel', 'no, cancel that']);
const BRIEFING = new Set(["what's my briefing", 'whats my briefing', 'brief me', "what's on today", 'whats on today', 'good morning']);
const LIST = new Set(["what's on my list", 'whats on my list', 'what are my tasks', 'list my tasks']);

const REMEMBER = /^(?:remember|note|don['’]?t forget)(?:\s+that)?\s+(.+)$/i;
const ADD_SHOPPING = /^add\s+(.+?)\s+to\s+(?:my\s+|the\s+)(shopping|grocery)\s+list$/i;
const ADD = /^add\s+(.+?)\s+to\s+my\s+(?:list|tasks|to-do|todo)$/i;
const PUT_SHOPPING = /^put\s+(.+?)\s+on\s+(?:my\s+|the\s+)?(shopping|grocery)\s+list$/i;
const REMIND_IN = /^remind\s+me\s+in\s+(.+?)\s+to\s+(.+)$/i;
const REMIND_AT = /^remind\s+me\s+to\s+(.+?)\s+at\s+(.+)$/i;
const REMIND = /^remind\s+me\s+to\s+(.+)$/i;
const KNOW_ABOUT = /^what\s+do\s+you\s+know\s+about\s+(.+)$/i;
const DOES_LIKE = /^what\s+does\s+([A-Za-z][\w'-]*)\s+like$/i;
const WHAT_IS = /^what(?:'s|s| is)\s+(.+)$/i;
const SHOPPING_LIST = /^what(?:'s|s| is)\s+on\s+(?:my|the)\s+(?:shopping|grocery)\s+list$/i;
const MARK = /^mark\s+(.+?)\s+done$/i;
const FINISHED = /^i\s+finished\s+(.+)$/i;
const IS_DONE = /^(.+?)\s+is\s+done$/i;
const PLAN = /^(?:plan|organize|schedule)\b\s+\S/i;

function stripTrailing(utterance: string): string {
  return utterance.trim().replace(/[.!?…,;:]+$/u, '').trim();
}

function fold(text: string): string {
  return text.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
}

function filled(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function remember(text: string): FastRoute | null {
  const fact = filled(REMEMBER.exec(text)?.[1] ?? '');
  return fact ? { tool: 'remember', args: { fact } } : null;
}

function addTask(text: string): FastRoute | null {
  const shopping = ADD_SHOPPING.exec(text) ?? PUT_SHOPPING.exec(text);
  const shopTitle = filled(shopping?.[1] ?? '');
  if (shopTitle) return { tool: 'add_task', args: { title: shopTitle, list: 'shopping' } };

  const relative = REMIND_IN.exec(text);
  const relativeTitle = filled(relative?.[2] ?? '');
  if (relative && relativeTitle) {
    const dueAt = dueAtFromRelative(relative[1] ?? '', new Date());
    if (!dueAt) return null;
    return { tool: 'add_task', args: { title: relativeTitle, due: `in ${relative[1].trim()}`, dueAt } };
  }

  const at = REMIND_AT.exec(text);
  const atTitle = filled(at?.[1] ?? '');
  if (at && atTitle) {
    const dueAt = dueAtFromClock(at[2] ?? '', new Date());
    if (dueAt) return { tool: 'add_task', args: { title: atTitle, due: `at ${at[2].trim()}`, dueAt } };
  }

  const title = filled(ADD.exec(text)?.[1] ?? REMIND.exec(text)?.[1] ?? '');
  return title ? { tool: 'add_task', args: { title } } : null;
}

const NOT_A_NAME = new Set(['The', 'This', 'That', 'There', 'Then', 'Today', 'Tomorrow', 'Yesterday', 'Please']);

function hasNamedPerson(text: string): boolean {
  return text.split(/\s+/).slice(1).some((word) => {
    const letters = word.replace(/[^A-Za-z]/g, '');
    return /^[A-Z][a-z]+$/.test(letters) && !NOT_A_NAME.has(letters);
  });
}

function recall(text: string): FastRoute | null {
  const about = filled(KNOW_ABOUT.exec(text)?.[1] ?? '');
  if (about) return { tool: 'recall', args: { query: text } };
  const likes = filled(DOES_LIKE.exec(text)?.[1] ?? '');
  if (likes && !/^(that|this|it)$/i.test(likes)) return { tool: 'recall', args: { query: text } };
  if (!WHAT_IS.test(text)) return null;
  if (hasNamedPerson(text) || /\b(allerg(?:y|ic|ies)|medicine|medication)\b/i.test(text)) {
    return { tool: 'recall', args: { query: text } };
  }
  return null;
}

function listRoute(text: string): FastRoute | null {
  if (SHOPPING_LIST.test(fold(text))) return { tool: 'list_tasks', args: { list: 'shopping' } };
  return exact(text, LIST, 'list_tasks');
}

function completeTask(text: string): FastRoute | null {
  const title = filled(MARK.exec(text)?.[1] ?? FINISHED.exec(text)?.[1] ?? IS_DONE.exec(text)?.[1] ?? '');
  return title ? { tool: 'complete_task', args: { taskIdOrTitle: title } } : null;
}

function plan(text: string): FastRoute | null {
  if (!PLAN.test(text)) return null;
  return { tool: 'plan_and_run', args: { goal: text } };
}

function exact(text: string, phrases: Set<string>, tool: string): FastRoute | null {
  return phrases.has(fold(text)) ? { tool, args: {} } : null;
}

function approval(text: string, pendingApprovalId: string | undefined): FastRoute | null {
  if (!pendingApprovalId) return null;
  const folded = fold(text);
  if (APPROVE.has(folded)) return { tool: 'approve_action', args: { approvalId: pendingApprovalId, decision: 'approve' } };
  if (REJECT.has(folded)) return { tool: 'approve_action', args: { approvalId: pendingApprovalId, decision: 'reject' } };
  return null;
}

/** Every command this utterance matches. More than one means it is not unambiguous. */
function commands(text: string): FastRoute[] {
  const parts = text.split(/\s+(?:and|then)\s+/i);
  // A plan's goal is the whole utterance, even when it says "and".
  if (parts.length > 1 && PLAN.test(text)) {
    const goal = plan(text);
    return goal ? [goal] : [];
  }
  if (parts.length > 1) {
    const hits = parts.flatMap((part) => commands(part));
    if (hits.length >= 2) return hits;
    const whole = commandsOne(text);
    return whole ? [whole] : [];
  }
  const one = commandsOne(text);
  return one ? [one] : [];
}

function commandsOne(text: string): FastRoute | null {
  const found = [
    exact(text, BRIEFING, 'daily_briefing'),
    listRoute(text),
    remember(text),
    addTask(text),
    completeTask(text),
    plan(text),
    recall(text),
  ].filter((route): route is FastRoute => route !== null);
  return found.length === 1 ? found[0] : null;
}

/**
 * One tool call, or null when the model should choose.
 * Matching is case-insensitive. Captured text keeps the speaker's casing.
 */
export function routeFast(utterance: string, conversation: { pendingApprovalId?: string }): FastRoute | null {
  const text = stripTrailing(utterance);
  if (!text) return null;
  const decided = approval(text, conversation.pendingApprovalId);
  if (APPROVE.has(fold(text)) || REJECT.has(fold(text))) return decided;
  const found = commands(text);
  return found.length === 1 ? found[0] : null;
}

export function fastPathEnabled(): boolean {
  return process.env.ALEXA_SIM_FAST_PATH?.trim() !== '0';
}
