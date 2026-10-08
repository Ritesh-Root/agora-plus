import type { SearchHit } from './webSearch';

const SEARCH_URL = 'https://api.firecrawl.dev/v2/search';
const MARKDOWN_LIMIT = 800;

export interface FirecrawlHit extends SearchHit {
  /** Main-content markdown, clipped. Empty when the search result had none. */
  markdown: string;
}

interface FirecrawlWebRow {
  title?: string;
  description?: string;
  url?: string;
  markdown?: string;
}

/**
 * Firecrawl v2 search. No key returns no hits and does not call the network.
 * A failed response throws, without the response body.
 */
export async function firecrawlSearch(
  query: string,
  limit = 3,
  fetchImpl: typeof fetch = fetch,
): Promise<FirecrawlHit[]> {
  const key = process.env.FIRECRAWL_API_KEY?.trim();
  const trimmed = query.trim();
  if (!key || !trimmed || limit <= 0) return [];
  const response = await fetchImpl(SEARCH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: trimmed.slice(0, 500),
      limit,
      scrapeOptions: { formats: ['markdown'], onlyMainContent: true },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`firecrawl http ${response.status}`);
  const body = await response.json() as { success?: boolean; data?: { web?: FirecrawlWebRow[] } };
  if (body.success === false) return [];
  return (body.data?.web ?? []).slice(0, limit).flatMap((row) => {
    const url = row.url ?? '';
    if (!url.startsWith('http')) return [];
    const markdown = (row.markdown ?? '').slice(0, MARKDOWN_LIMIT);
    const snippet = (row.description ?? markdown).slice(0, 300);
    return [{
      title: row.title?.trim() || url,
      url,
      snippet,
      markdown,
    }];
  });
}
