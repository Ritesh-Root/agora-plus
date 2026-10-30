import { useCallback, useEffect, useRef, useState } from 'react';
import type { CouncilRequest, CouncilResult, TasteSnapshot } from '../../shared/taste';
import { mergeRecent, parseCouncilResult, parseTasteSnapshot } from './tasteView';

type Fetch = typeof fetch;

/** `missing` is a 404: the route is not deployed, so Home hides the card instead of showing an error. */
export type TasteLoad =
  | { kind: 'ready'; snapshot: TasteSnapshot }
  | { kind: 'missing' }
  | { kind: 'locked' }
  | { kind: 'failed' };

export async function loadTaste(fetchImpl: Fetch = fetch): Promise<TasteLoad> {
  try {
    const response = await fetchImpl('/api/taste');
    if (response.status === 404) return { kind: 'missing' };
    if (response.status === 401) return { kind: 'locked' };
    if (!response.ok) return { kind: 'failed' };
    const snapshot = parseTasteSnapshot(await response.json());
    return snapshot ? { kind: 'ready', snapshot } : { kind: 'failed' };
  } catch {
    return { kind: 'failed' };
  }
}

export type CouncilOutcome =
  | { kind: 'result'; result: CouncilResult }
  | { kind: 'locked' }
  | { kind: 'failed'; message: string };

const UNREACHABLE = 'The council could not reach Qloo. Nothing was saved; try again in a minute.';
/** The council makes many Qloo calls (5 to 20 s). Past this, the wait is not worth it. */
export const COUNCIL_TIMEOUT_MS = 60_000;

export async function askCouncil(request: CouncilRequest, fetchImpl: Fetch = fetch, signal?: AbortSignal): Promise<CouncilOutcome> {
  try {
    const response = await fetchImpl('/api/taste/council', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal,
    });
    if (response.status === 401) return { kind: 'locked' };
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    // An error can come back as a CouncilResult with status 'error' even on a non-2xx.
    const result = parseCouncilResult(body);
    if (result) return { kind: 'result', result };
    if (response.status === 404) return { kind: 'failed', message: 'Taste Council is not available on this server yet.' };
    const note = body && typeof body === 'object' && 'error' in body && typeof (body as { error: unknown }).error === 'string'
      ? (body as { error: string }).error
      : '';
    return { kind: 'failed', message: note || UNREACHABLE };
  } catch (error) {
    if (error instanceof DOMException && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
      return { kind: 'failed', message: 'Qloo took too long to answer. Try again with fewer people.' };
    }
    return { kind: 'failed', message: UNREACHABLE };
  }
}

/**
 * Loads the household's taste members once, again when household memory changes (a new "loves"
 * fact makes a new signal), and after an unlock. Councils run one at a time.
 */
export function useTaste({ memoryKey, locked, onLocked }: { memoryKey: string; locked: boolean; onLocked: () => void }) {
  const [load, setLoad] = useState<TasteLoad | null>(null);
  const [recent, setRecent] = useState<CouncilResult[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const lockedRef = useRef(onLocked);
  lockedRef.current = onLocked;

  const refresh = useCallback(async () => {
    const next = await loadTaste();
    if (next.kind === 'locked') lockedRef.current();
    setLoad((previous) => (next.kind === 'failed' && previous?.kind === 'ready' ? previous : next));
    if (next.kind === 'ready') {
      setRecent((current) => {
        // Keep a council this tab just ran if the server's list does not have it yet.
        const fresh = current[0];
        return fresh ? mergeRecent(fresh, next.snapshot.recent) : next.snapshot.recent.slice(0, 3);
      });
    }
  }, []);

  useEffect(() => {
    if (locked) return;
    void refresh();
  }, [locked, memoryKey, refresh]);

  useEffect(() => () => controller.current?.abort(), []);

  const ask = useCallback(async (request: CouncilRequest): Promise<CouncilResult | null> => {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const timer = window.setTimeout(() => abort.abort(new DOMException('Timed out', 'TimeoutError')), COUNCIL_TIMEOUT_MS);
    setPending(true);
    setError(null);
    try {
      const outcome = await askCouncil(request, fetch, abort.signal);
      if (controller.current !== abort) return null;
      if (outcome.kind === 'locked') {
        lockedRef.current();
        return null;
      }
      if (outcome.kind === 'failed') {
        setError(outcome.message);
        return null;
      }
      setRecent((current) => mergeRecent(outcome.result, current));
      return outcome.result;
    } finally {
      window.clearTimeout(timer);
      if (controller.current === abort) {
        controller.current = null;
        setPending(false);
      }
    }
  }, []);

  return { load, recent, pending, error, ask, refresh, clearError: () => setError(null) };
}
