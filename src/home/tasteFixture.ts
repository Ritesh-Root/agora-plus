/** A realistic council for tests and the e2e mock. Ranks are made up; names are real titles. */
import type { CouncilResult, TasteSnapshot } from '../../shared/taste';

export const TASTE_MEMBERS: TasteSnapshot['members'] = [
  { who: 'Mia', loves: ['Encanto', 'Moana', 'Coco'], likesTags: ['animation'], ageBand: '0-17', constraints: [], factIds: ['m1'] },
  { who: 'Dadi', loves: ['Raj Kapoor films', 'Awara'], likesTags: [], ageBand: '55+', constraints: [], factIds: ['m2', 'm3'] },
  { who: 'Arjun', loves: ['A. R. Rahman', 'Lagaan'], likesTags: ['street food'], ageBand: '35-44', constraints: ['vegetarian'], factIds: ['m4', 'm5'] },
];

export const COUNCIL_RESULT: CouncilResult = {
  occasion: 'movie_night',
  members: TASTE_MEMBERS,
  picks: [
    {
      entityId: 'q-coco',
      name: 'Coco',
      subtitle: '2017 · Animation, Family',
      worstRank: 3,
      meanRank: 2,
      tags: ['Animation', 'Family', 'Music'],
      fits: [
        { who: 'Mia', rank: 1, of: 12, because: ['Encanto', 'Moana'] },
        { who: 'Dadi', rank: 3, of: 12, because: ['Awara'] },
        { who: 'Arjun', rank: 2, of: 12, because: ['A. R. Rahman'] },
      ],
    },
    {
      entityId: 'q-lagaan',
      name: 'Lagaan',
      subtitle: '2001 · Drama, Sport',
      worstRank: 9,
      meanRank: 4,
      tags: ['Bollywood'],
      fits: [
        { who: 'Mia', rank: 9, of: 12, because: [] },
        { who: 'Dadi', rank: 2, of: 12, because: ['Raj Kapoor films'] },
        { who: 'Arjun', rank: 1, of: 12, because: ['Lagaan'] },
      ],
    },
  ],
  vetoes: [{ name: 'Chicken Run', fact: 'Arjun is vegetarian', who: 'Arjun' }],
  speech: 'Coco works for everyone: nobody ranks it lower than third.',
  calls: [
    { tool: 'qloo_search', args: { query: 'Encanto', types: ['movie'] }, status: 'ok', summary: 'Found Encanto', resultCount: 3, ms: 412, forWho: 'Mia' },
    { tool: 'qloo_rank', args: { signals: ['Awara'], age: '55_and_older' }, status: 'degraded', summary: 'Partial rank', resultCount: 12, ms: 1830, forWho: 'Dadi' },
  ],
  status: 'ok',
  startedAt: '2026-10-31T10:00:00.000Z',
  ms: 8200,
};
