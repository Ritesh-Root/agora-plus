import { describe, expect, it } from 'vitest';
import { approvalDecision, qualifiedApproval } from './approvalWords';

describe('approvalDecision', () => {
  it('matches a whole yes or no after folding case and punctuation', () => {
    for (const utterance of ['yes', 'Yeah!', 'yep', 'go ahead', 'do it', 'approve', 'Yes, go ahead.', 'sure', 'ok, go ahead', 'OKAY GO AHEAD']) {
      expect(approvalDecision(utterance)).toBe('approve');
    }
    for (const utterance of ['no', 'nope', 'cancel', "don't", 'Don’t', 'stop', 'No, cancel that.']) {
      expect(approvalDecision(utterance)).toBe('reject');
    }
  });

  it('does not match a qualified yes or a word that only starts with yes', () => {
    expect(approvalDecision('yes but not Tuesday')).toBeNull();
    expect(approvalDecision('yes, but not Tuesday')).toBeNull();
    expect(approvalDecision('yesterday')).toBeNull();
    expect(approvalDecision('I approve')).toBeNull();
    expect(approvalDecision('cancel that')).toBeNull();
    expect(approvalDecision('ok')).toBeNull();
  });
});

describe('qualifiedApproval', () => {
  it('flags a yes or no that is not the whole phrase', () => {
    expect(qualifiedApproval('yes but not Tuesday')).toBe(true);
    expect(qualifiedApproval('I approve')).toBe(true);
    expect(qualifiedApproval('cancel that')).toBe(true);
    expect(qualifiedApproval('go ahead tomorrow')).toBe(true);
    expect(qualifiedApproval('yes')).toBe(false);
    expect(qualifiedApproval('yesterday')).toBe(false);
    expect(qualifiedApproval('plan dinners')).toBe(false);
    expect(qualifiedApproval("don't forget the keys")).toBe(false);
  });
});
