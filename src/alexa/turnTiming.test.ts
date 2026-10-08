import { describe, expect, it } from 'vitest';
import {
  approvalCopy,
  captionAck,
  captionAckFinished,
  captionAnswer,
  createTurnClock,
  emptyCaption,
  isDecline,
  meterCopy,
  noteAudioStart,
  noteFinal,
  noteLineDone,
  noteLineQueued,
  noteStreamDone,
  takeSample,
} from './turnTiming';

describe('turn clock', () => {
  it('does not record first audio from the final event alone', () => {
    expect(takeSample(noteFinal(createTurnClock(), 40)).sample).toBeNull();
    let clock = noteLineQueued(createTurnClock());
    clock = noteFinal(clock, 40);
    expect(takeSample(clock).sample).toBeNull();
  });

  it('records the first playing time and ignores a later line', () => {
    let clock = noteAudioStart(createTurnClock(), 180);
    clock = noteAudioStart(clock, 900);
    clock = noteFinal(clock, 400);
    const taken = takeSample(clock);
    expect(taken.sample).toEqual({ ttfsMs: 180, finalMs: 400 });
    expect(takeSample(taken.clock).sample).toBeNull();
  });

  it('says text only after the turn has finished and no audio started', () => {
    let clock = noteLineQueued(createTurnClock());
    clock = noteFinal(clock, 90);
    clock = noteLineDone(clock);
    expect(takeSample(clock).sample).toBeNull();
    clock = noteStreamDone(clock);
    expect(takeSample(clock).sample).toEqual({ ttfsMs: null, finalMs: 90 });
  });
});

describe('meterCopy', () => {
  it('names time to first audio and text-only turns', () => {
    expect(meterCopy([])).toBe('No spoken turn yet.');
    expect(meterCopy([{ ttfsMs: 320, finalMs: 800 }])).toBe(
      'Last turn 320 ms to first audio, 800 ms to the answer. Median of 1: 320 / 800 ms.',
    );
    expect(meterCopy([{ ttfsMs: null, finalMs: 50 }])).toBe(
      'Last turn text only, 50 ms to the answer. Median of 1: text only / 50 ms.',
    );
  });

  it('leaves text-only turns out of the audio median', () => {
    const copy = meterCopy([
      { ttfsMs: null, finalMs: 10 },
      { ttfsMs: 100, finalMs: 200 },
      { ttfsMs: 300, finalMs: 400 },
    ]);
    expect(copy).toContain('300 ms to first audio');
    expect(copy).toContain('Median of 3: 200 / 200 ms.');
  });
});

describe('caption', () => {
  it('keeps the acknowledgement until that line finishes', () => {
    let caption = captionAck(emptyCaption(), "Here's your day.");
    caption = captionAnswer(caption, 'Nothing urgent at home.');
    expect(caption.visible).toBe("Here's your day.");
    caption = captionAckFinished(caption);
    expect(caption.visible).toBe('Nothing urgent at home.');
  });

  it('shows the answer immediately when there was no acknowledgement', () => {
    const caption = captionAnswer(emptyCaption(), 'Nothing urgent at home.');
    expect(caption.visible).toBe('Nothing urgent at home.');
  });
});

describe('approvalCopy', () => {
  it('shows the full summary, including a longer speech', () => {
    expect(approvalCopy({ summary: 'Forget: Mia is allergic to peanuts' })).toBe(
      'Forget: Mia is allergic to peanuts',
    );
    expect(approvalCopy({
      summary: 'Forget: Mia is…',
      speech: 'Forget: Mia is allergic to peanuts',
    })).toBe('Forget: Mia is allergic to peanuts');
    expect(approvalCopy({
      summary: 'Plan: 2 steps — shop; cook',
      speech: 'Should I go ahead?',
    })).toBe('Plan: 2 steps — shop; cook\nShould I go ahead?');
  });
});

describe('isDecline', () => {
  it('matches a whole no and leaves a qualified sentence alone', () => {
    expect(isDecline('no')).toBe(true);
    expect(isDecline('No.')).toBe(true);
    expect(isDecline('yes')).toBe(false);
    expect(isDecline('no but not Tuesday')).toBe(false);
    expect(isDecline('yesterday')).toBe(false);
  });
});
