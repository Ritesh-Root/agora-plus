import { describe, expect, it } from 'vitest';
import { assertPublicWebTarget } from '../proxyGuard';
import { beginResearch, quickResearch, researchForTask, researchSearchCount, researchSources } from './research';
import { readUrl } from './readUrl';
import type { DecisionRecord } from '../society/decider';

const publicResolve = async () => ['93.184.216.34'];

function record(policy: DecisionRecord['policy']): DecisionRecord {
  return {
    question: 'needs_web',
    answer: { type: 'noul', noul: policy === 'proceed' ? 0.95 : 0.5 },
    probabilities: null,
    policy,
    latencyMs: 10,
    pinnedModel: 'jev-1.13.0',
    returnedModel: 'jev-1.13.0',
    tokens: null,
  };
}

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

  it('searches only when Jev says proceed, and stops after five searches', async () => {
    process.env.AGORA_DECIDER = 'jev';
    try {
      beginResearch();
      const search = async (query: string) => [{ title: query, url: 'https://example.com/a', snippet: 'a fact' }];
      const read = async () => 'page body';
      const first = await researchForTask(
        { title: 'Check the price', prompt: 'today' },
        'brief',
        { decideImpl: async () => [record('proceed')], search, read },
      );
      expect(first).toContain('https://example.com/a');
      expect(researchSources()).toHaveLength(1);

      const skipped = await researchForTask(
        { title: 'Rewrite the intro', prompt: 'from the brief' },
        'brief',
        { decideImpl: async () => [record('ask_boss')], search, read },
      );
      expect(skipped).toBe('');
      expect(researchSearchCount()).toBe(1);

      for (let i = 0; i < 5; i++) {
        await researchForTask(
          { title: `Topic ${i}`, prompt: 'latest' },
          'brief',
          { decideImpl: async () => [record('proceed')], search, read },
        );
      }
      expect(researchSearchCount()).toBe(5);
      const blocked = await researchForTask(
        { title: 'One more', prompt: 'latest' },
        'brief',
        { decideImpl: async () => [record('proceed')], search, read },
      );
      expect(blocked).toBe('');
    } finally {
      delete process.env.AGORA_DECIDER;
    }
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
