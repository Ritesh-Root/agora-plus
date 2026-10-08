/** Short line for a speech-recognition error. `null` means stay quiet (our own abort). */
export function recognitionError(code: string): string | null {
  if (code === 'not-allowed' || code === 'service-not-allowed') return 'Microphone blocked';
  if (code === 'no-speech') return "Didn't catch that";
  if (code === 'network') return 'Network error';
  return null;
}
