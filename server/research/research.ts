import { decide, DecisionRecord } from '../society/decider';
import { deciderMode } from '../society/decider/gates';
import { noteResearchCall } from '../society/decider/runStats';
import { firecrawlSearch, type FirecrawlHit } from './firecrawl';
import { readUrl } from './readUrl';
import { searchWeb, SearchHit } from './webSearch';

const MAX_SEARCHES = 5;

export interface ResearchSource {
  title: string;
  url: string;
}

let searches = 0;
const cache = new Map<string, SearchHit[]>();
const sources: ResearchSource[] = [];

export function beginResearch(): void {
  searches = 0;
  cache.clear();
  sources.length = 0;
}

export function researchSearchCount(): number {
  return searches;
}

export function researchSources(): ResearchSource[] {
  return sources.slice();
}

export function sourcesMarkdown(): string {
  if (sources.length === 0) return '';
  return `\n\n## Sources\n${sources.map((source) => `- [${source.title}](${source.url})`).join('\n')}`;
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

type DecideFn = typeof decide;

export async function researchForTask(
  task: { title: string; prompt: string },
  brief: string,
  deps?: {
    decideImpl?: DecideFn;
    search?: typeof searchWeb;
    read?: typeof readUrl;
    onStart?: () => void;
  },
): Promise<string> {
  if (deciderMode() !== 'jev') return '';
  const decideImpl = deps?.decideImpl ?? decide;
  const records = await decideImpl({
    brief,
    task: { title: task.title, prompt: task.prompt },
  }, {
    needs_web: {
      type: 'noul',
      instructions: 'Does this task need current information from the internet?',
      criteria: {
        true: 'The task depends on facts that change, or on something outside the brief',
        false: 'The brief already contains what the task needs',
      },
    },
  });
  const record: DecisionRecord | undefined = records[0];
  if (!record || record.policy !== 'proceed') return '';

  const query = `${task.title}. ${task.prompt}`.replace(/\s+/g, ' ').trim().slice(0, 240);
  const cached = cache.get(query);
  if (!cached && searches >= MAX_SEARCHES) return '';
  deps?.onStart?.();
  if (!cached) {
    searches += 1;
    noteResearchCall();
    try {
      cache.set(query, await (deps?.search ?? searchWeb)(query));
    } catch {
      cache.set(query, []);
    }
  }
  const hits = cache.get(query) ?? [];
  const blocks: string[] = [];
  for (const hit of hits.slice(0, 2)) {
    if (sources.some((source) => source.url === hit.url)) {
      blocks.push(`- ${hit.title} (${hit.url})\n  ${hit.snippet}`);
      continue;
    }
    try {
      const page = await (deps?.read ?? readUrl)(hit.url);
      sources.push({ title: hit.title, url: hit.url });
      blocks.push(`- ${hit.title} (${hit.url})\n  ${hit.snippet}\n  ${page.slice(0, 800)}`);
    } catch {
      // A blocked or failed page is skipped. The search hit is not cited.
    }
  }
  if (blocks.length === 0) return '';
  return `Sources to cite:\n${blocks.join('\n')}`;
}
