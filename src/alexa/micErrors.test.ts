import { describe, expect, it } from 'vitest';
import { recognitionError } from './micErrors';

describe('recognitionError', () => {
  it('names the microphone failures we can explain', () => {
    expect(recognitionError('not-allowed')).toBe('Microphone blocked');
    expect(recognitionError('service-not-allowed')).toBe('Microphone blocked');
    expect(recognitionError('no-speech')).toBe("Didn't catch that");
    expect(recognitionError('network')).toBe('Network error');
    expect(recognitionError('aborted')).toBeNull();
  });
});
