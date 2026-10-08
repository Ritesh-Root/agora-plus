import { afterEach, describe, expect, it } from 'vitest';
import { firecrawlSearch } from './firecrawl';

describe('firecrawl search', () => {
  afterEach(() => {
    delete process.env.FIRECRAWL_API_KEY;
  });

  it('returns no hits and does not fetch when the key is missing', async () => {
    delete process.env.FIRECRAWL_API_KEY;
    let called = false;
    const hits = await firecrawlSearch('pasta', 3, async () => {
      called = true;
      return new Response('{}');
    });
    expect(hits).toEqual([]);
    expect(called).toBe(false);
  });

  it('posts the v2 search body and reads data.web', async () => {
    process.env.FIRECRAWL_API_KEY = 'fc-test';
    let seen: { url: string; init: RequestInit } | null = null;
    const markdown = `${'word '.repeat(200)}tail`;
    const hits = await firecrawlSearch('pasta prices', 3, async (url, init) => {
      seen = { url: String(url), init: init ?? {} };
      return new Response(JSON.stringify({
        success: true,
        data: {
          web: [
            {
              title: 'Pasta prices',
              description: 'A shop page',
              url: 'https://example.com/pasta?utm_source=ads',
              markdown,
            },
            { title: 'Skip', url: 'ftp://example.com/no', markdown: 'no' },
          ],
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    expect(seen?.url).toBe('https://api.firecrawl.dev/v2/search');
    const headers = seen?.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer fc-test');
    expect(JSON.parse(String(seen?.init.body))).toEqual({
      query: 'pasta prices',
      limit: 3,
      scrapeOptions: { formats: ['markdown'], onlyMainContent: true },
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.title).toBe('Pasta prices');
    expect(hits[0]?.url).toBe('https://example.com/pasta?utm_source=ads');
    expect(hits[0]?.snippet).toBe('A shop page');
    expect(hits[0]?.markdown.length).toBe(800);
    expect(hits[0]?.markdown.endsWith('…')).toBe(false);
  });
});
