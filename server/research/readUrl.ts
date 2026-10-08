import { assertPublicHttpsTarget, assertPublicWebTarget, fetchPinned } from '../proxyGuard';

const READ_LIMIT = 4_000;
const READ_TIMEOUT_MS = 8_000;

/** Fetch a public page as markdown through the Jina reader. Private URLs are refused before any request. */
export async function readUrl(
  raw: string,
  fetchImpl: typeof fetch = fetch,
  resolve?: (hostname: string) => Promise<string[]>,
): Promise<string> {
  const page = await assertPublicWebTarget(raw, resolve);
  const jina = await assertPublicHttpsTarget(`https://r.jina.ai/${page.toString()}`, resolve);
  const headers = { accept: 'text/markdown' };
  const signal = AbortSignal.timeout(READ_TIMEOUT_MS);
  const response = fetchImpl === fetch
    ? await fetchPinned(jina, { headers, signal, timeoutMs: READ_TIMEOUT_MS })
    : await fetchImpl(jina.toString(), { headers, signal });
  if (!response.ok) throw new Error(`read http ${response.status}`);
  const text = await response.text();
  return text.slice(0, READ_LIMIT);
}
