import { describe, expect, it, vi } from 'vitest';
import { COUNCIL_RESULT, TASTE_MEMBERS } from './tasteFixture';
import {
  becauseLine,
  buildCouncilRequest,
  fitPercent,
  lowestFit,
  lowestFitLine,
  mergeRecent,
  parseCouncilResult,
  parseTasteSnapshot,
  progressSteps,
  rankLabel,
  taskTitle,
  whyWinner,
} from './tasteView';
import { askCouncil, loadTaste } from './useTaste';

function reply(status: number, body: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('taste council view', () => {
  it('asks for everyone by leaving `who` out, and names the people when someone sits out', () => {
    expect(buildCouncilRequest('movie_night', TASTE_MEMBERS, new Set(), '  ')).toEqual({ occasion: 'movie_night' });
    expect(buildCouncilRequest('movie_night', TASTE_MEMBERS, new Set(['Dadi']), 'Pune')).toEqual({ occasion: 'movie_night', who: ['Mia', 'Arjun'] });
    expect(buildCouncilRequest('dinner_out', TASTE_MEMBERS, new Set(), ' Indiranagar ')).toEqual({ occasion: 'dinner_out', location: 'Indiranagar' });
  });

  it('walks the progress copy through each person, then the shortlist and Keeper', () => {
    expect(progressSteps(['Mia', 'Dadi'])).toEqual([
      'Asking Qloo about Mia…',
      'Asking Qloo about Dadi…',
      'Ranking one shortlist for everyone…',
      'Keeper is checking diets and allergies…',
    ]);
  });

  it('finds the person each pick suits least and explains the maximin win', () => {
    const [coco, lagaan] = COUNCIL_RESULT.picks;
    expect(lowestFit(coco!)?.who).toBe('Dadi');
    expect(lowestFitLine(coco!)).toBe('Lowest fit: Dadi #3');
    expect(lowestFitLine(lagaan!)).toBe('Lowest fit: Mia #9');
    expect(whyWinner(COUNCIL_RESULT.picks)).toBe('Coco leaves nobody lower than #3. Every other option leaves someone at #9 or lower.');
    expect(lowestFit({ ...coco!, fits: [{ who: 'Mia', rank: 1, of: 5, because: [] }, { who: 'Sam', rank: null, of: 5, because: [] }] })?.who).toBe('Sam');
  });

  it('labels ranks, bars, and reasons', () => {
    expect(rankLabel({ rank: 2, of: 12 })).toBe('#2 of 12');
    expect(rankLabel({ rank: null, of: 12 })).toBe('Not ranked');
    expect(fitPercent({ rank: 1, of: 12 })).toBe(100);
    expect(fitPercent({ rank: 12, of: 12 })).toBe(8);
    expect(fitPercent({ rank: null, of: 12 })).toBe(0);
    expect(becauseLine({ who: 'Mia', rank: 1, of: 3, because: ['Encanto', 'Moana', 'Coco'] })).toBe('because they love Encanto, Moana and Coco');
    expect(becauseLine({ who: 'Mia', rank: 1, of: 3, because: [] })).toBe('');
    expect(taskTitle(COUNCIL_RESULT)).toBe('Movie night: Coco');
  });

  it('parses a partial body without crashing and drops what it cannot use', () => {
    const parsed = parseTasteSnapshot({
      members: [{ who: 'Mia', loves: ['Encanto', 7], ageBand: 'toddler' }, { loves: ['no name'] }],
      qlooReady: 'yes',
      recent: [COUNCIL_RESULT, { occasion: 'karaoke' }],
    });
    expect(parsed?.members).toEqual([{ who: 'Mia', loves: ['Encanto'], likesTags: [], ageBand: undefined, constraints: [], factIds: [] }]);
    expect(parsed?.qlooReady).toBe(false);
    expect(parsed?.recent).toHaveLength(1);
    expect(parseCouncilResult({ occasion: 'movie_night', picks: [{ name: 'X', imageUrl: 'javascript:alert(1)', fits: [] }] })?.picks[0]?.imageUrl).toBeUndefined();
    expect(parseCouncilResult({ occasion: 'movie_night', status: 'weird' })?.status).toBe('error');
  });

  it('keeps the newest three councils without repeating one', () => {
    const older = { ...COUNCIL_RESULT, startedAt: '2026-10-30T10:00:00.000Z' };
    expect(mergeRecent(COUNCIL_RESULT, [COUNCIL_RESULT, older, older, older]).map((item) => item.startedAt)).toEqual([
      COUNCIL_RESULT.startedAt,
      older.startedAt,
      older.startedAt,
    ]);
  });
});

describe('taste api', () => {
  it('loads the snapshot, and reads a 404 as "not deployed" and a 401 as locked', async () => {
    const ok = vi.fn(async () => reply(200, { members: TASTE_MEMBERS, qlooReady: true, recent: [] }));
    const loaded = await loadTaste(ok as unknown as typeof fetch);
    expect(ok).toHaveBeenCalledWith('/api/taste');
    expect(loaded.kind === 'ready' && loaded.snapshot.members.map((member) => member.who)).toEqual(['Mia', 'Dadi', 'Arjun']);
    expect(await loadTaste((async () => reply(404, { error: 'not found' })) as unknown as typeof fetch)).toEqual({ kind: 'missing' });
    expect(await loadTaste((async () => reply(401, {})) as unknown as typeof fetch)).toEqual({ kind: 'locked' });
    expect(await loadTaste((async () => { throw new TypeError('offline'); }) as unknown as typeof fetch)).toEqual({ kind: 'failed' });
  });

  it('posts the council request as JSON and returns the result', async () => {
    const post = vi.fn(async () => reply(200, COUNCIL_RESULT));
    const outcome = await askCouncil({ occasion: 'movie_night', who: ['Mia'] }, post as unknown as typeof fetch);
    const [path, init] = post.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe('/api/taste/council');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ occasion: 'movie_night', who: ['Mia'] });
    expect(outcome.kind === 'result' && outcome.result.picks[0]?.name).toBe('Coco');
  });

  it('keeps an error CouncilResult from a non-2xx so its note and calls can show', async () => {
    const body = { ...COUNCIL_RESULT, picks: [], status: 'error', note: 'Qloo is unreachable.' };
    const outcome = await askCouncil({ occasion: 'playlist' }, (async () => reply(502, body)) as unknown as typeof fetch);
    expect(outcome.kind === 'result' && outcome.result.note).toBe('Qloo is unreachable.');
  });

  it('falls back to a plain message when the body is not a result', async () => {
    const outcome = await askCouncil({ occasion: 'playlist' }, (async () => reply(500, { error: 'Qloo key missing' })) as unknown as typeof fetch);
    expect(outcome).toEqual({ kind: 'failed', message: 'Qloo key missing' });
    const missing = await askCouncil({ occasion: 'playlist' }, (async () => new Response('nope', { status: 404 })) as unknown as typeof fetch);
    expect(missing.kind).toBe('failed');
    const timedOut = await askCouncil({ occasion: 'playlist' }, (async () => { throw new DOMException('Timed out', 'TimeoutError'); }) as unknown as typeof fetch);
    expect(timedOut).toEqual({ kind: 'failed', message: 'Qloo took too long to answer. Try again with fewer people.' });
  });
});
