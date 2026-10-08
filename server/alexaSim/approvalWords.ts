/**
 * Whole-phrase yes or no, after case and punctuation are folded.
 * "yes but not Tuesday" and "yesterday" are not decisions.
 */

const APPROVE = new Set([
  'yes',
  'yeah',
  'yep',
  'go ahead',
  'do it',
  'approve',
  'yes go ahead',
  'sure',
  'ok go ahead',
  'okay go ahead',
]);

const REJECT = new Set([
  'no',
  'nope',
  'cancel',
  'dont',
  'stop',
  'no cancel that',
]);

const YES_WORDS = new Set(['yes', 'yeah', 'yep', 'approve']);
const LEADING = new Set(['no', 'nope', 'cancel', 'stop', 'dont', 'sure', 'ok', 'okay']);

export const PLAIN_APPROVAL = 'I need a plain yes or no.';

function fold(utterance: string): string {
  return utterance
    .toLowerCase()
    .replace(/[’‘]/g, '')
    .replace(/'/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Exact yes, exact no, or null when the phrase is anything else. */
export function approvalDecision(utterance: string): 'approve' | 'reject' | null {
  const phrase = fold(utterance);
  if (!phrase) return null;
  if (APPROVE.has(phrase)) return 'approve';
  if (REJECT.has(phrase)) return 'reject';
  return null;
}

/**
 * A yes or no with extra words, such as "yes but not Tuesday" or "cancel that".
 * An exact decision is not qualified. "yesterday" is not either.
 */
export function qualifiedApproval(utterance: string): boolean {
  if (approvalDecision(utterance)) return false;
  const phrase = fold(utterance);
  if (!phrase || phrase.startsWith('dont forget')) return false;
  const words = phrase.split(' ');
  if (words.some((word) => YES_WORDS.has(word))) return true;
  if (words.length > 1 && LEADING.has(words[0] ?? '')) return true;
  return /^(?:go ahead|do it)\b/.test(phrase);
}
