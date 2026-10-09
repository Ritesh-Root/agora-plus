import { describe, expect, it } from 'vitest';
import { finalSpeech } from './bridge';

describe('finalSpeech', () => {
  it('ends a short summary with a full stop before asking', () => {
    expect(finalSpeech({ status: 'needs_approval', speech: '', summary: 'Forget: Mia is allergic to peanuts' }))
      .toBe('Forget: Mia is allergic to peanuts. Should I go ahead?');
  });

  it('keeps a long plan on screen and speaks the step count', () => {
    const summary = 'Plan: 5 steps — Decompose dinner planning into tasks; Research dinner options and ingredients; Create a weekly dinner schedule and shopping list; Check for conflicts; Finalize';
    expect(finalSpeech({ status: 'needs_approval', speech: 'I can plan that.', summary }))
      .toBe('I have a 5-step plan. The steps are on screen. Should I go ahead?');
  });

  it('speaks a finished result as it came back', () => {
    expect(finalSpeech({ status: 'ok', speech: 'Added milk.', summary: undefined })).toBe('Added milk.');
  });
});
