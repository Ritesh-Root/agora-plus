import { approvalDecision, PLAIN_APPROVAL, qualifiedApproval } from './approvalWords';

/**
 * Spoken acknowledgement before any model or network call.
 * The phrase is chosen by fixed word rules, in this order.
 */

export const ACK_PHRASES = [
  'Got it, saving that.',
  "On it. I'll get the team on that.",
  "Here's your day.",
  'Okay, going ahead.',
  "Okay, I won't.",
  PLAIN_APPROVAL,
  'Let me check.',
  'On it.',
] as const;

const REMEMBER = 'Got it, saving that.';
const PLAN = "On it. I'll get the team on that.";
const BRIEFING = "Here's your day.";
const YES = 'Okay, going ahead.';
const NO = "Okay, I won't.";
const QUESTION = 'Let me check.';
const DEFAULT = 'On it.';

const QUESTION_WORDS = new Set(['who', 'what', 'when', 'where', 'why', 'how', 'which']);

function wordsOf(utterance: string): string[] {
  return utterance.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 0);
}

/** One short phrase. No model call. */
export function acknowledge(utterance: string): string {
  const words = wordsOf(utterance);
  const seen = new Set(words);
  const has = (...needles: string[]) => needles.some((word) => seen.has(word));
  if (has('remember', 'note')) return REMEMBER;
  if (has('plan', 'organize', 'schedule')) return PLAN;
  if (has('briefing', 'today')) return BRIEFING;
  const decision = approvalDecision(utterance);
  if (decision === 'approve') return YES;
  if (decision === 'reject') return NO;
  if (qualifiedApproval(utterance)) return PLAIN_APPROVAL;
  if (words.some((word) => QUESTION_WORDS.has(word)) || utterance.includes('?')) return QUESTION;
  return DEFAULT;
}
