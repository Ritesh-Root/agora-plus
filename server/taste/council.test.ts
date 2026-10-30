import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MemoryEntry } from '../household/memoryStore';
import { loadJsonFile, setDataDir } from '../household/store';
import {
  candidateFrom,
  conflictWords,
  councilSpeech,
  keeperCheck,
  listRecentCouncils,
  resetRecentCouncils,
  roundRobin,
  runCouncil,
  scoreShortlist,
  selectMembers,
} from './council';
import { entity, fakeQloo } from './fakeQloo';
import { profileFromEntries } from './profile';
import { setQlooCaller } from './qlooClient';

// Pass-through, so one test can slow the recent-results load down.
vi.mock('../household/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../household/store')>();
  return { ...actual, loadJsonFile: vi.fn(actual.loadJsonFile) };
});

let dir = '';
let counter = 0;

function facts(...texts: string[]): MemoryEntry[] {
  return texts.map((text) => {
    counter += 1;
    const at = new Date(Date.UTC(2026, 0, 1, 0, 0, counter)).toISOString();
    return { id: `f${counter}`, text, tags: [], createdAt: at, updatedAt: at, source: 'ui' as const };
  });
}

const FAMILY = profileFromEntries(facts(
  'Mia loves Encanto',
  'Mia is 9',
  'Dadi loves Raj Kapoor films',
  'Dadi is 74',
  'Arjun loves Interstellar',
  'Arjun hates horror',
));

const COCO = entity('a', 'Coco', { release_year: 2017, image: { url: 'https://img.example/coco.jpg' } });
const AWAARA = entity('d', 'Awaara', { release_year: 1951 });
const INCEPTION = entity('f', 'Inception');
const FROZEN = entity('b', 'Frozen');
const UP = entity('c', 'Up');
const SHREE = entity('e', 'Shree 420');
const HORROR = entity('g', 'Horror House');

const RECOMMEND: Record<string, unknown[]> = {
  Encanto: [COCO, FROZEN, UP],
  'Raj Kapoor': [AWAARA, COCO, SHREE],
  Interstellar: [INCEPTION, COCO, HORROR],
};

const BY_ID: Record<string, Record<string, unknown>> = Object.fromEntries(
  [COCO, AWAARA, INCEPTION, FROZEN, UP, SHREE, HORROR].map((item) => [item.entity_id as string, item]),
);

const RANK: Record<string, string[]> = {
  Encanto: ['a', 'b', 'c', 'd', 'f', 'e', 'g'],
  'Raj Kapoor': ['d', 'a', 'e', 'f', 'b', 'c', 'g'],
  Interstellar: ['f', 'a', 'd', 'b', 'c', 'e', 'g'],
};

function firstSignal(args: Record<string, unknown>): string {
  return Array.isArray(args.signals) ? String(args.signals[0]) : '';
}

function family(overrides: { rank?: (signal: string) => Record<string, unknown> | null } = {}) {
  return fakeQloo((tool, args) => {
    const signal = firstSignal(args);
    if (tool === 'qloo_recommend') return { results: RECOMMEND[signal] ?? [] };
    if (tool === 'qloo_rank') {
      const custom = overrides.rank?.(signal);
      if (custom) return custom;
      const options = args.options as string[];
      const order = (RANK[signal] ?? []).filter((id) => options.includes(id));
      return { results: order.map((id) => BY_ID[id]) };
    }
    return { status: 'error', summary: 'unexpected tool' };
  });
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'agora-taste-'));
  setDataDir(dir);
  resetRecentCouncils();
  delete process.env.AGORA_TASTE_LOCATION;
});

afterEach(async () => {
  setQlooCaller(null);
  resetRecentCouncils();
  await rm(dir, { recursive: true, force: true });
});

describe('runCouncil', () => {
  it('picks by maximin, cites ranks, and vetoes a "no horror" conflict', async () => {
    const fake = family();
    setQlooCaller(fake);
    const result = await runCouncil({ occasion: 'movie_night' }, { profile: FAMILY });

    expect(result.status).toBe('ok');
    expect(result.members.map((member) => member.who)).toEqual(['Arjun', 'Dadi', 'Mia']);
    expect(result.picks[0].name).toBe('Coco');
    expect(result.picks[0]).toMatchObject({ entityId: 'a', worstRank: 2, subtitle: '2017', imageUrl: 'https://img.example/coco.jpg' });
    expect(result.picks[0].fits).toEqual([
      { who: 'Arjun', rank: 2, of: 7, because: ['Interstellar'] },
      { who: 'Dadi', rank: 2, of: 7, because: ['Raj Kapoor'] },
      { who: 'Mia', rank: 1, of: 7, because: ['Encanto'] },
    ]);
    expect(result.picks.length).toBeLessThanOrEqual(5);
    for (let index = 1; index < result.picks.length; index += 1) {
      const prev = result.picks[index - 1];
      const next = result.picks[index];
      expect(prev.worstRank < next.worstRank || (prev.worstRank === next.worstRank && prev.meanRank <= next.meanRank)).toBe(true);
    }
    expect(result.vetoes).toEqual([{ name: 'Horror House', fact: 'Arjun hates horror', who: 'Arjun' }]);
    expect(result.picks.some((pick) => pick.name === 'Horror House')).toBe(false);
    expect(result.speech).toBe('For movie night, Coco works for everyone: it ranks in the top 2 for Arjun, Dadi and Mia. Keeper set aside Horror House because Arjun hates horror.');
    expect(result.calls.filter((call) => call.tool === 'qloo_recommend')).toHaveLength(3);
    expect(result.calls.filter((call) => call.tool === 'qloo_rank')).toHaveLength(3);
    expect(result.calls.every((call) => call.forWho)).toBe(true);
    expect(fake.maxConcurrent).toBeLessThanOrEqual(2);

    const recommend = fake.calls.find((call) => call.tool === 'qloo_recommend' && firstSignal(call.args) === 'Interstellar');
    expect(recommend?.args).toMatchObject({ target_type: 'movie', limit: 8, exclude_tags: ['horror'] });
    expect(recommend?.args).not.toHaveProperty('demographic');
    const rank = fake.calls.find((call) => call.tool === 'qloo_rank');
    expect(rank?.args).toMatchObject({ option_type: 'movie', options: ['f', 'd', 'a', 'b', 'g', 'e', 'c'] });
  });

  it('sends a demographic with a location, and filters places to it', async () => {
    const fake = family();
    setQlooCaller(fake);
    await runCouncil({ occasion: 'dinner_out', location: 'Bengaluru' }, { profile: FAMILY });
    const dadi = fake.calls.find((call) => call.tool === 'qloo_recommend' && firstSignal(call.args) === 'Raj Kapoor');
    expect(dadi?.args).toMatchObject({ target_type: 'place', demographic: 'seniors', signal_location: 'Bengaluru', filter_location: 'Bengaluru' });
    const mia = fake.calls.find((call) => call.tool === 'qloo_recommend' && firstSignal(call.args) === 'Encanto');
    expect(mia?.args).toMatchObject({ demographic: 'teens' });
  });

  it('only asks the people named, case-insensitively', async () => {
    setQlooCaller(family());
    const result = await runCouncil({ occasion: 'movie_night', who: ['mia', 'DADI'] }, { profile: FAMILY });
    expect(result.members.map((member) => member.who)).toEqual(['Dadi', 'Mia']);
    expect(result.picks[0].fits.map((fit) => fit.who)).toEqual(['Dadi', 'Mia']);
  });

  it('is degraded when one ranking fails, and leaves that person out of the score', async () => {
    setQlooCaller(family({ rank: (signal) => (signal === 'Raj Kapoor' ? { status: 'error', summary: 'boom' } : null) }));
    const result = await runCouncil({ occasion: 'movie_night' }, { profile: FAMILY });
    expect(result.status).toBe('degraded');
    expect(result.note).toMatch(/missing/);
    const coco = result.picks.find((pick) => pick.name === 'Coco');
    expect(coco?.fits.find((fit) => fit.who === 'Dadi')?.rank).toBeNull();
    expect(coco?.worstRank).toBe(2);
  });

  it('is an error with no picks when Qloo is not configured', async () => {
    const fake = family();
    const unconfigured = { ...fake, readiness: async () => 'unconfigured' as const };
    setQlooCaller(unconfigured);
    const result = await runCouncil({ occasion: 'movie_night' }, { profile: FAMILY });
    expect(result.status).toBe('error');
    expect(result.picks).toEqual([]);
    expect(result.note).toMatch(/qloo setup|QLOO_API_KEY/);
    expect(result.speech).toBe(result.note);
    expect(fake.calls).toHaveLength(0);
  });

  it('is an error when Qloo is unreachable or every call fails', async () => {
    setQlooCaller(fakeQloo(() => ({}), 'unreachable'));
    expect((await runCouncil({ occasion: 'playlist' }, { profile: FAMILY })).note).toMatch(/could not reach Qloo/);

    setQlooCaller(fakeQloo(() => {
      throw new Error('child died');
    }));
    const result = await runCouncil({ occasion: 'playlist' }, { profile: FAMILY });
    expect(result.status).toBe('error');
    expect(result.picks).toEqual([]);
    expect(result.calls.length).toBeGreaterThan(0);
    expect(result.calls.every((call) => call.status === 'error')).toBe(true);
  });

  it('says so when nobody has taste facts', async () => {
    setQlooCaller(family());
    const result = await runCouncil({ occasion: 'movie_night' }, { profile: profileFromEntries(facts('Dadi is 74')) });
    expect(result.status).toBe('error');
    expect(result.speech).toMatch(/Mia loves Encanto/);
    const named = await runCouncil({ occasion: 'movie_night', who: ['Zed'] }, { profile: FAMILY });
    expect(named.note).toMatch(/Zed/);
  });

  it('retries a needs_input call with Qloo\'s first candidate', async () => {
    const fake = fakeQloo((tool, args) => {
      const signal = firstSignal(args);
      if (signal === 'Encanto') {
        return { status: 'needs_input', summary: 'Choose', results: [], resolution: { issues: [{ input: 'Encanto', field: 'signals', kind: 'ambiguous', candidates: [{ id: 'uuid-enc', name: 'Encanto (2021)' }] }] } };
      }
      if (tool === 'qloo_recommend') return { results: [COCO, FROZEN] };
      return { results: [COCO, FROZEN] };
    });
    setQlooCaller(fake);
    const profile = profileFromEntries(facts('Mia loves Encanto'));
    const result = await runCouncil({ occasion: 'movie_night' }, { profile });
    const statuses = result.calls.map((call) => `${call.tool}:${call.status}`);
    expect(statuses).toContain('qloo_recommend:needs_input');
    expect(fake.calls.some((call) => firstSignal(call.args) === 'uuid-enc')).toBe(true);
    expect(result.picks[0].name).toBe('Coco');
    expect(result.status).toBe('ok');
  });

  it('leaves a person with only abstract likes out of the ranking without degrading', async () => {
    const fake = fakeQloo((tool) => ({ results: tool === 'qloo_recommend' ? [COCO, FROZEN] : [FROZEN, COCO] }));
    setQlooCaller(fake);
    const profile = profileFromEntries(facts('Mia loves Encanto', 'Rohan likes thrillers'));
    const result = await runCouncil({ occasion: 'movie_night' }, { profile });
    expect(result.status).toBe('ok');
    expect(result.note).toMatch(/Rohan named no favourite/);
    expect(fake.calls.filter((call) => call.tool === 'qloo_rank')).toHaveLength(1);
    const rohanRecommend = fake.calls.find((call) => call.tool === 'qloo_recommend' && !call.args.signals);
    expect(rohanRecommend?.args).toMatchObject({ signal_tags: ['thrillers'], signal_tags_operator: 'union' });
    expect(result.picks[0].name).toBe('Frozen');
    expect(result.speech).toBe("For movie night, Frozen is Mia's top choice.");
    expect(result.picks[0].fits).toEqual([
      { who: 'Mia', rank: 1, of: 2, because: ['Encanto'] },
      { who: 'Rohan', rank: null, of: 2, because: [] },
    ]);
  });

  it('vetoes a steakhouse for a vegetarian at dinner, quoting the fact', async () => {
    const steak = entity('s', 'Smoky BBQ Steakhouse', { address: '12 MG Road, Bengaluru, India' });
    const dosa = entity('v', 'Dosa Corner', { address: '1 Church St, Bengaluru' });
    setQlooCaller(fakeQloo((tool) => ({ results: tool === 'qloo_recommend' ? [steak, dosa] : [steak, dosa] })));
    const profile = profileFromEntries(facts('Rohan likes street food', 'Rohan is vegetarian', 'Rohan loves Arijit Singh'));
    const result = await runCouncil({ occasion: 'dinner_out', location: 'Bengaluru' }, { profile });
    expect(result.vetoes).toEqual([{ name: 'Smoky BBQ Steakhouse', fact: 'Rohan is vegetarian', who: 'Rohan' }]);
    expect(result.picks.map((pick) => pick.name)).toEqual(['Dosa Corner']);
    expect(result.picks[0].subtitle).toBe('1 Church St, Bengaluru');
    expect(result.speech).toMatch(/Keeper set aside Smoky BBQ Steakhouse because Rohan is vegetarian\./);
  });

  it('keeps the last results across a reload, newest first, errors left out', async () => {
    setQlooCaller(family());
    await runCouncil({ occasion: 'movie_night' }, { profile: FAMILY });
    await runCouncil({ occasion: 'tv_show' }, { profile: FAMILY });
    setQlooCaller(fakeQloo(() => ({}), 'unconfigured'));
    await runCouncil({ occasion: 'book_club' }, { profile: FAMILY });
    resetRecentCouncils();
    const recent = await listRecentCouncils();
    expect(recent.map((item) => item.occasion)).toEqual(['tv_show', 'movie_night']);
  });

  it('keeps both of two councils that finish at the same time', async () => {
    setQlooCaller(family());
    // Both councils reach the recent list while its file is still loading.
    const actual = (await vi.importActual<typeof import('../household/store')>('../household/store')).loadJsonFile;
    vi.mocked(loadJsonFile).mockImplementation(async (...args) => {
      const value = await actual(...args);
      await new Promise((resolve) => setTimeout(resolve, 50));
      return value;
    });
    try {
      await Promise.all([
        runCouncil({ occasion: 'movie_night' }, { profile: FAMILY }),
        runCouncil({ occasion: 'tv_show' }, { profile: FAMILY }),
      ]);
    } finally {
      vi.mocked(loadJsonFile).mockImplementation(actual);
    }
    expect((await listRecentCouncils()).map((item) => item.occasion).sort()).toEqual(['movie_night', 'tv_show']);
    resetRecentCouncils();
    expect((await listRecentCouncils()).map((item) => item.occasion).sort()).toEqual(['movie_night', 'tv_show']);
  });

  it('stops calling Qloo past its deadline and answers with what it has, degraded', async () => {
    const slow = family();
    const handle = slow.callTool.bind(slow);
    slow.callTool = async (tool, args) => {
      await new Promise((resolve) => setTimeout(resolve, 250));
      return handle(tool, args);
    };
    setQlooCaller(slow);
    // Two slots: two recommends finish at ~250 ms, past the 150 ms deadline, so the third
    // recommend and every rank are skipped.
    const result = await runCouncil({ occasion: 'movie_night' }, { profile: FAMILY, deadlineMs: 150 });
    expect(result.status).toBe('degraded');
    expect(result.note).toMatch(/ran out of time/);
    expect(result.picks.length).toBeGreaterThan(0);
    expect(slow.calls.filter((call) => call.tool === 'qloo_recommend')).toHaveLength(2);
    expect(slow.calls.filter((call) => call.tool === 'qloo_rank')).toHaveLength(0);
    expect(result.calls).toHaveLength(2);
  });

  it('is an error that says so when the deadline passes before any answer', async () => {
    const fake = family();
    setQlooCaller(fake);
    const result = await runCouncil({ occasion: 'movie_night' }, { profile: FAMILY, deadlineMs: 0 });
    expect(result.status).toBe('error');
    expect(result.note).toMatch(/too slow/);
    expect(fake.calls).toHaveLength(0);
  });
});

describe('maximin helpers', () => {
  const cands = ['x', 'y', 'z'].map((id) => candidateFrom(entity(id, id.toUpperCase()))!);

  it('ranks a missing option last for that person but shows it as null', () => {
    const scored = scoreShortlist(cands, [
      { who: 'A', because: [], order: ['id:x', 'id:y'] },
      { who: 'B', because: [], order: ['id:y', 'id:x', 'id:z'] },
    ]);
    expect(scored.map((item) => item.name)).toEqual(['X', 'Y', 'Z']);
    const z = scored.find((item) => item.name === 'Z')!;
    expect(z.fits[0]).toEqual({ who: 'A', rank: null, of: 3, because: [] });
    expect(z.worstRank).toBe(3);
  });

  it('breaks a worst-rank tie by mean rank, then shortlist order', () => {
    const scored = scoreShortlist(cands, [
      { who: 'A', because: [], order: ['id:x', 'id:z', 'id:y'] },
      { who: 'B', because: [], order: ['id:z', 'id:y', 'id:x'] },
    ]);
    // x: 1,3 -> worst 3 mean 2; y: 3,2 -> worst 3 mean 2.5; z: 2,1 -> worst 2
    expect(scored.map((item) => item.name)).toEqual(['Z', 'X', 'Y']);
  });

  it('round-robins so everyone contributes, deduped', () => {
    const [x, y, z] = cands;
    expect(roundRobin([[x, y], [x, z], [z]], 10).map((item) => item.name)).toEqual(['X', 'Z', 'Y']);
    expect(roundRobin([[x, y, z]], 2)).toHaveLength(2);
  });

  it('tolerates odd Qloo items', () => {
    expect(candidateFrom(null)).toBeNull();
    expect(candidateFrom({ id: 'q' })).toBeNull();
    expect(candidateFrom({ id: 'q', name: 'Q', tags: [{ name: 'Animation' }, 'Family', { id: 'urn:tag:x' }], properties: { image: 'http://insecure' } }))
      .toMatchObject({ entityId: 'q', name: 'Q', tags: ['Animation', 'Family'] });
    expect(candidateFrom({ name: 'Only name' })).toMatchObject({ key: 'name:only name' });
  });

  it('applies diet words to places only, "no X" everywhere', () => {
    expect(conflictWords('vegetarian', 'movie')).toEqual([]);
    expect(conflictWords('vegetarian', 'place')).toContain('steakhouse');
    expect(conflictWords('peanuts', 'place')).toContain('satay');
    expect(conflictWords('no horror', 'movie')).toEqual(['horror']);
  });

  it('does not turn a diet with no place words into a word to veto', () => {
    for (const diet of ['kosher', 'coeliac', 'diabetic', 'lactose intolerant']) expect(conflictWords(diet, 'place')).toEqual([]);
    const deli = scoreShortlist([candidateFrom(entity('k', 'Kosher Deli'))!], []);
    const profile = profileFromEntries(facts('Leah keeps kosher'));
    expect(profile.members[0].constraints).toEqual(['kosher']);
    const { kept, vetoes } = keeperCheck(deli, profile.members, 'place', profile.constraintFacts);
    expect(vetoes).toEqual([]);
    expect(kept.map((item) => item.name)).toEqual(['Kosher Deli']);
  });

  it('makes "no X" singular without cutting the word', () => {
    expect(conflictWords('no zombies', 'movie')).toEqual(['zombie']);
    expect(conflictWords('no horses', 'movie')).toEqual(['horse']);
    expect(conflictWords('no musicals', 'movie')).toEqual(['musical']);
    expect(conflictWords('no peaches', 'place')).toEqual(['peach']);
    expect(conflictWords('no boxes', 'movie')).toEqual(['box']);
    expect(conflictWords('no glasses', 'movie')).toEqual(['glass']);
    const films = scoreShortlist(['Zombieland', 'The Zombie Diaries', 'Up'].map((name, index) => candidateFrom(entity(String(index), name))!), []);
    const member = profileFromEntries(facts('Arjun hates zombies')).members;
    expect(keeperCheck(films, member, 'movie', new Map()).vetoes.map((veto) => veto.name)).toEqual(['The Zombie Diaries']);
  });

  it('maps nut allergies to nuts, but not coconut, nutmeg or butternut', () => {
    expect(conflictWords('tree nuts', 'place')).toContain('cashew');
    expect(conflictWords('nuts', 'place')).toContain('almond');
    expect(conflictWords('peanuts', 'place')).toContain('satay');
    expect(conflictWords('coconut', 'place')).toEqual(['coconut']);
    expect(conflictWords('nutmeg', 'place')).toEqual(['nutmeg']);
    expect(conflictWords('butternut squash', 'place')).toEqual(['butternut squash']);
  });

  it('selects members with a taste when nobody is named', () => {
    const profile = profileFromEntries(facts('Mia loves Coco', 'Dadi is 74'));
    expect(selectMembers(profile.members, undefined).members.map((member) => member.who)).toEqual(['Mia']);
    expect(selectMembers(profile.members, ['dadi']).members.map((member) => member.who)).toEqual(['Dadi']);
  });

  it('speaks the fairest pick when nobody is in the top 3', () => {
    const fit = (who: string, rank: number) => ({ who, rank, of: 10, because: [] });
    const pick = { name: 'Up', worstRank: 6, meanRank: 4, tags: [], fits: [fit('A', 2), fit('B', 6)] };
    expect(councilSpeech('book_club', [pick], [])).toBe('For book club, Up is the fairest pick: nobody ranks it lower than 6th of 10.');
    expect(councilSpeech('outing', [], [{ name: 'X', fact: 'Mia is allergic to peanuts', who: 'Mia' }])).toMatch(/Keeper set aside every option/);
  });
});
