import { describe, expect, it } from 'vitest';
import { micBlockedReason, recognitionError } from './micErrors';

describe('recognitionError', () => {
  it('names the microphone failures we can explain', () => {
    expect(recognitionError('not-allowed')).toBe('Microphone blocked');
    expect(recognitionError('service-not-allowed')).toBe('Microphone blocked');
    expect(recognitionError('audio-capture')).toBe('Microphone blocked');
    expect(recognitionError('no-speech')).toBe("Didn't catch that");
    expect(recognitionError('network')).toBe('Network error');
    expect(recognitionError('aborted')).toBeNull();
  });
});

describe('micBlockedReason', () => {
  it('keeps the talk button honest when voice input cannot work', () => {
    expect(micBlockedReason('not-allowed')).toMatch(/Allow it for this site/);
    expect(micBlockedReason('audio-capture')).toMatch(/No microphone/);
    expect(micBlockedReason('network')).toMatch(/Chrome or Edge/);
  });

  it('leaves a retryable error alone', () => {
    expect(micBlockedReason('no-speech')).toBeNull();
    expect(micBlockedReason('aborted')).toBeNull();
  });
});
