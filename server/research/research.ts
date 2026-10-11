import { firecrawlSearch, type FirecrawlHit } from './firecrawl';
import { readUrl } from './readUrl';
import { searchWeb, SearchHit } from './webSearch';

export interface ResearchSource {
  title: string;
  url: string;
}

/** True when Firecrawl or Exa can be called. */
export function researchConfigured(): boolean {
  return Boolean(process.env.FIRECRAWL_API_KEY?.trim() || process.env.EXA_API_KEY?.trim());
}

/** Drop utm and utm_* query params. Other params stay. */
export function stripUtm(raw: string): string {
  try {
    const url = new URL(raw);
    for (const key of [...url.searchParams.keys()]) {
      const name = key.toLowerCase();
      if (name === 'utm' || name.startsWith('utm_')) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return raw;
  }
}

export interface QuickResearch {
  sources: ResearchSource[];
  context: string;
}

function packHits(hits: { title: string; url: string; body: string }[]): QuickResearch {
  const packed: ResearchSource[] = [];
  const blocks: string[] = [];
  for (const hit of hits) {
    const url = stripUtm(hit.url);
    packed.push({ title: hit.title, url });
    blocks.push(`- ${hit.title} (${url})\n  ${hit.body}`);
  }
  return { sources: packed, context: blocks.join('\n') };
}

/**
 * A short lookup for ask_agora and web_research.
 * Firecrawl when FIRECRAWL_API_KEY is set, otherwise Exa search plus a guarded read of the top two hits.
 */
export async function quickResearch(
  question: string,
  deps?: {
    search?: typeof searchWeb;
    read?: typeof readUrl;
    firecrawl?: typeof firecrawlSearch;
  },
): Promise<QuickResearch> {
  const query = question.trim();
  if (!query) return { sources: [], context: '' };
  if (process.env.FIRECRAWL_API_KEY?.trim()) {
    let hits: FirecrawlHit[] = [];
    try {
      hits = await (deps?.firecrawl ?? firecrawlSearch)(query);
    } catch {
      hits = [];
    }
    return packHits(hits.map((hit) => ({
      title: hit.title,
      url: hit.url,
      body: hit.markdown || hit.snippet,
    })));
  }
  let hits: SearchHit[] = [];
  try {
    hits = await (deps?.search ?? searchWeb)(query);
  } catch {
    hits = [];
  }
  const rows: { title: string; url: string; body: string }[] = [];
  for (const hit of hits.slice(0, 2)) {
    const url = stripUtm(hit.url);
    try {
      const page = await (deps?.read ?? readUrl)(url);
      rows.push({ title: hit.title, url: hit.url, body: page.slice(0, 800) });
    } catch {
      // A blocked or failed page is skipped. The search hit is not cited.
    }
  }
  return packHits(rows);
}
