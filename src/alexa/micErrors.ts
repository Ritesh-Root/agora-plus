/** Short line for a speech-recognition error. `null` means stay quiet (our own abort). */
export function recognitionError(code: string): string | null {
  if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'audio-capture') return 'Microphone blocked';
  if (code === 'no-speech') return "Didn't catch that";
  if (code === 'network') return 'Network error';
  return null;
}

/**
 * Why voice input cannot work right now, or `null` when a retry may succeed.
 * A denied or missing microphone, and a browser without a speech service, all leave typing.
 */
export function micBlockedReason(code: string): string | null {
  if (code === 'not-allowed' || code === 'service-not-allowed') {
    return 'Microphone blocked. Allow it for this site in the address bar, or type below.';
  }
  if (code === 'audio-capture') return 'No microphone found. Type below.';
  if (code === 'network') return 'Voice input needs Chrome or Edge with its speech service. Type below.';
  return null;
}
