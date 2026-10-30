import { afterEach, describe, expect, it } from 'vitest';
import { fakeQloo } from './fakeQloo';
import { callQloo, normalizeEnvelope, qlooInFlight, qlooReady, setQlooCaller } from './qlooClient';

afterEach(() => {
  setQlooCaller(null);
  delete process.env.QLOO_API_KEY;
});

describe('normalizeEnvelope', () => {
  it('keeps the harness fields and tolerates odd shapes', () => {
    expect(normalizeEnvelope({ structuredContent: { status: 'ok', summary: 's', results: [{ name: 'Coco' }], result_count: 1 } }))
      .toEqual({ status: 'ok', summary: 's', results: [{ name: 'Coco' }], result_count: 1 });
    expect(normalizeEnvelope({ structuredContent: { status: 'weird', results: { entities: [1, 2] } } }))
      .toMatchObject({ status: 'ok', results: [1, 2], result_count: 2 });
    expect(normalizeEnvelope({ content: [{ type: 'text', text: '{"status":"empty","results":[]}' }] }).status).toBe('empty');
    expect(normalizeEnvelope({ content: [{ type: 'text', text: 'not json' }], isError: true })).toMatchObject({ status: 'error', summary: 'not json' });
    expect(normalizeEnvelope(undefined).status).toBe('error');
  });

  it('reads the error and needs_input issues', () => {
    const envelope = normalizeEnvelope({
      structuredContent: {
        status: 'needs_input',
        summary: 'Choose',
        results: [],
        error: { code: 'QLOO_AUTH', layer: 'qloo', retryable: false, recovery: 'Run qloo setup' },
        resolution: { issues: [{ input: 'Coco', field: 'signals', kind: 'ambiguous', candidates: [{ id: 'u1', name: 'Coco (2017)' }, { bad: true }] }] },
      },
    });
    expect(envelope.error).toEqual({ code: 'QLOO_AUTH', recovery: 'Run qloo setup' });
    expect(envelope.issues).toEqual([{ input: 'Coco', field: 'signals', kind: 'ambiguous', candidates: [{ id: 'u1', name: 'Coco (2017)' }] }]);
  });
});

describe('callQloo', () => {
  it('returns a record, caches ok results by tool and args, and not errors', async () => {
    let n = 0;
    const fake = fakeQloo((tool) => {
      n += 1;
      return tool === 'qloo_rank' ? { status: 'error', summary: 'nope' } : { results: [{ name: `R${n}` }] };
    });
    setQlooCaller(fake);
    const first = await callQloo('qloo_recommend', { target_type: 'movie', signals: ['Coco'] }, 'Mia');
    expect(first.record).toMatchObject({ tool: 'qloo_recommend', status: 'ok', resultCount: 1, forWho: 'Mia' });
    const again = await callQloo('qloo_recommend', { signals: ['Coco'], target_type: 'movie' });
    expect(again.envelope.results).toEqual([{ name: 'R1' }]);
    expect(again.record.forWho).toBeUndefined();
    await callQloo('qloo_rank', { options: ['a'] });
    await callQloo('qloo_rank', { options: ['a'] });
    expect(fake.calls.map((call) => call.tool)).toEqual(['qloo_recommend', 'qloo_rank', 'qloo_rank']);
  });

  it('keeps at most two calls in flight', async () => {
    const fake = fakeQloo(async (_tool, args) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { results: [{ name: String(args.n) }] };
    });
    setQlooCaller(fake);
    await Promise.all(Array.from({ length: 7 }, (_, n) => callQloo('qloo_recommend', { n })));
    expect(fake.maxConcurrent).toBe(2);
    expect(fake.calls).toHaveLength(7);
    expect(qlooInFlight()).toBe(0);
  });

  it('turns a throw into an error envelope without leaking the key', async () => {
    process.env.QLOO_API_KEY = 'sk-secret-123';
    setQlooCaller(fakeQloo(() => {
      throw new Error('bad key sk-secret-123');
    }));
    const { envelope, record } = await callQloo('qloo_recommend', { target_type: 'movie' });
    expect(envelope.status).toBe('error');
    expect(record.summary).not.toContain('sk-secret-123');
    expect(JSON.stringify(record)).not.toContain('sk-secret-123');
  });

  it('reports readiness from the caller', async () => {
    setQlooCaller(fakeQloo(() => ({}), 'ready'));
    await expect(qlooReady()).resolves.toBe(true);
    setQlooCaller(fakeQloo(() => ({}), 'unconfigured'));
    await expect(qlooReady()).resolves.toBe(false);
  });
});
