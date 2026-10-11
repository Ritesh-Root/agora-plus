import { describe, expect, it } from 'vitest';
import { assertPublicWebTarget } from '../proxyGuard';
import { quickResearch } from './research';
import { readUrl } from './readUrl';

const publicResolve = async () => ['93.184.216.34'];

describe('research URL guard', () => {
  it('allows a public http page and refuses loopback before any fetch', async () => {
    const url = await assertPublicWebTarget('http://example.com/notes', publicResolve);
    expect(url.protocol).toBe('http:');
    let fetched = false;
    await expect(readUrl('http://127.0.0.1/secret', async () => {
      fetched = true;
      return new Response('no');
    }, async () => ['127.0.0.1'])).rejects.toThrow(/not allowed/);
    expect(fetched).toBe(false);
  });

  it('asks the Jina reader for a public page instead of fetching that host', async () => {
    let requested = '';
    const text = await readUrl('http://example.com/notes', async (input) => {
      requested = String(input);
      return new Response('# Notes about peanuts');
    }, publicResolve);
    expect(requested).toBe('https://r.jina.ai/http://example.com/notes');
    expect(text).toContain('peanuts');
  });

  it('strips utm params and reads only the top two hits', async () => {
    const saved = process.env.FIRECRAWL_API_KEY;
    delete process.env.FIRECRAWL_API_KEY;
    try {
      const reads: string[] = [];
      const found = await quickResearch('prices', {
        search: async () => [
          { title: 'A', url: 'https://example.com/a?utm_source=newsletter&id=1', snippet: 'a' },
          { title: 'B', url: 'https://example.com/b?utm_medium=email', snippet: 'b' },
          { title: 'C', url: 'https://example.com/c', snippet: 'c' },
        ],
        read: async (url) => {
          reads.push(url);
          return 'page body';
        },
      });
      expect(reads).toEqual([
        'https://example.com/a?id=1',
        'https://example.com/b',
      ]);
      expect(found.sources).toEqual([
        { title: 'A', url: 'https://example.com/a?id=1' },
        { title: 'B', url: 'https://example.com/b' },
      ]);
      expect(found.context).toContain('page body');
      expect(found.context).not.toContain('utm_');
    } finally {
      if (saved === undefined) delete process.env.FIRECRAWL_API_KEY;
      else process.env.FIRECRAWL_API_KEY = saved;
    }
  });
});
