/** Short text safe to show in the room. Never returns the provider body. */
export function publicModelError(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (message.startsWith('Add an API key')) return message;
  if (message === 'The run finished without a document.') return message;

  const text = `${name} ${message}`.toLowerCase();
  if (
    text.includes('(404)') ||
    text.includes(' 404') ||
    text.includes('model_not_found') ||
    text.includes('model not found') ||
    text.includes('unpurchased')
  ) {
    return 'That model is not available.';
  }
  if (
    text.includes('429') ||
    text.includes('throttl') ||
    text.includes('too many requests') ||
    text.includes('rate limit') ||
    text.includes('rate_limit')
  ) {
    return 'The model is busy right now. Try again in a moment.';
  }
  if (
    text.includes('invalid_api_key') ||
    text.includes('invalid api-key') ||
    text.includes('invalid api key') ||
    text.includes('(401)') ||
    text.includes('(403)') ||
    text.includes(' 401') ||
    text.includes(' 403')
  ) {
    return 'The API key was rejected.';
  }
  if (
    text.includes('timeout') ||
    text.includes('abort') ||
    text.includes('enotfound') ||
    text.includes('econnrefused') ||
    text.includes('fetch failed') ||
    text.includes('network') ||
    text.includes('not allowed') ||
    text.includes('only https') ||
    text.includes('invalid target')
  ) {
    return 'The model service could not be reached.';
  }
  return 'The model could not answer just now.';
}
