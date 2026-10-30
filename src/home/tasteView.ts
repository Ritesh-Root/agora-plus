/**
 * Pure helpers for the Taste Council card and result sheet. Kept out of the components so the
 * maximin explanation, request shape, and parsing are tested without a DOM.
 */
import {
  OCCASION_LABEL,
  type CouncilPick,
  type CouncilRequest,
  type CouncilResult,
  type KeeperVeto,
  type MemberFit,
  type QlooCallRecord,
  type TasteMember,
  type TasteOccasion,
  type TasteSnapshot,
} from '../../shared/taste';

export const AFFINITY_NOTE = 'Qloo results are aggregate cultural affinities, not predictions about any one person.';

export const OCCASIONS = Object.keys(OCCASION_LABEL) as TasteOccasion[];

/** Short names for a to-do title: "Movie night: Coco". */
export const OCCASION_SHORT: Record<TasteOccasion, string> = {
  movie_night: 'Movie night',
  dinner_out: 'Dinner out',
  playlist: 'Playlist',
  tv_show: 'Watch together',
  book_club: 'Book club',
  outing: 'Outing',
};

export function needsLocation(occasion: TasteOccasion): boolean {
  return occasion === 'dinner_out' || occasion === 'outing';
}

const AGE_LABEL: Record<NonNullable<TasteMember['ageBand']>, string> = {
  '0-17': 'under 18',
  '18-24': '18–24',
  '25-34': '25–34',
  '35-44': '35–44',
  '45-54': '45–54',
  '55+': '55+',
};

export function ageLabel(band: TasteMember['ageBand']): string {
  return band ? AGE_LABEL[band] : '';
}

/** Everyone when nobody is left out, so the server can apply its own "everyone with a taste fact" rule. */
export function buildCouncilRequest(occasion: TasteOccasion, members: TasteMember[], excluded: ReadonlySet<string>, location: string): CouncilRequest {
  const request: CouncilRequest = { occasion };
  const included = members.filter((member) => !excluded.has(member.who)).map((member) => member.who);
  if (included.length < members.length) request.who = included;
  const where = location.trim();
  if (needsLocation(occasion) && where) request.location = where;
  return request;
}

/** Step lines shown while the council runs. The server does not stream, so these advance on a timer. */
export function progressSteps(names: string[]): string[] {
  return [
    ...names.map((name) => `Asking Qloo about ${name}…`),
    'Ranking one shortlist for everyone…',
    'Keeper is checking diets and allergies…',
  ];
}

/** The member a pick suits least: the maximin key. Unranked counts as worst. */
export function lowestFit(pick: CouncilPick): MemberFit | null {
  let worst: MemberFit | null = null;
  for (const fit of pick.fits) {
    if (!worst) {
      worst = fit;
      continue;
    }
    const a = fit.rank ?? Number.POSITIVE_INFINITY;
    const b = worst.rank ?? Number.POSITIVE_INFINITY;
    if (a > b) worst = fit;
  }
  return worst;
}

export function rankLabel(fit: Pick<MemberFit, 'rank' | 'of'>): string {
  if (fit.rank === null) return 'Not ranked';
  return fit.of > 0 ? `#${fit.rank} of ${fit.of}` : `#${fit.rank}`;
}

/** 0 to 100, how high on that person's list the option sits. Rank 1 fills the bar. */
export function fitPercent(fit: Pick<MemberFit, 'rank' | 'of'>): number {
  if (fit.rank === null || fit.of <= 0) return 0;
  const share = (fit.of - fit.rank + 1) / fit.of;
  return Math.max(6, Math.min(100, Math.round(share * 100)));
}

export function lowestFitLine(pick: CouncilPick): string {
  const worst = lowestFit(pick);
  if (!worst) return '';
  return worst.rank === null ? `Lowest fit: ${worst.who}, not ranked` : `Lowest fit: ${worst.who} #${worst.rank}`;
}

export function becauseLine(fit: MemberFit): string {
  const things = fit.because.filter(Boolean).slice(0, 3);
  if (things.length === 0) return '';
  if (things.length === 1) return `because they love ${things[0]}`;
  return `because they love ${things.slice(0, -1).join(', ')} and ${things[things.length - 1]}`;
}

/** One sentence that says why the winner beat the rest, in maximin terms. */
export function whyWinner(picks: CouncilPick[]): string {
  const [winner, ...rest] = picks;
  if (!winner) return '';
  const worst = lowestFit(winner);
  if (!worst || worst.rank === null) return '';
  if (rest.length === 0) return `${winner.name} leaves nobody lower than #${worst.rank}.`;
  const nextWorst = rest
    .map((pick) => lowestFit(pick))
    .map((fit) => (fit && fit.rank !== null ? fit.rank : Number.POSITIVE_INFINITY))
    .reduce((best, rank) => Math.min(best, rank), Number.POSITIVE_INFINITY);
  if (!Number.isFinite(nextWorst)) return `${winner.name} leaves nobody lower than #${worst.rank}; the others leave someone unranked.`;
  if (nextWorst === worst.rank) return `${winner.name} leaves nobody lower than #${worst.rank}, and wins the tie on its average rank.`;
  return `${winner.name} leaves nobody lower than #${worst.rank}. Every other option leaves someone at #${nextWorst} or lower.`;
}

export function taskTitle(result: CouncilResult): string {
  const top = result.picks[0];
  return top ? `${OCCASION_SHORT[result.occasion]}: ${top.name}` : '';
}

export function formatMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '';
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

/** Compact JSON for the provenance list. Long strings stay readable because the cell wraps. */
export function compactArgs(args: Record<string, unknown>): string {
  try {
    return JSON.stringify(args);
  } catch {
    return '{}';
  }
}

// Parsing. The server agent owns the route; these keep a malformed or partial body from crashing Home.

type Loose = Record<string, unknown>;

function isObject(value: unknown): value is Loose {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

const AGE_BANDS = new Set(Object.keys(AGE_LABEL));
const CALL_STATUS = new Set<QlooCallRecord['status']>(['ok', 'empty', 'needs_input', 'partial', 'degraded', 'error']);
const RESULT_STATUS = new Set<CouncilResult['status']>(['ok', 'degraded', 'error']);

function parseMember(value: unknown): TasteMember | null {
  if (!isObject(value) || !str(value.who)) return null;
  const band = typeof value.ageBand === 'string' && AGE_BANDS.has(value.ageBand) ? (value.ageBand as TasteMember['ageBand']) : undefined;
  return {
    who: String(value.who).trim(),
    loves: strings(value.loves),
    likesTags: strings(value.likesTags),
    ageBand: band,
    constraints: strings(value.constraints),
    factIds: strings(value.factIds),
  };
}

function parseFit(value: unknown): MemberFit | null {
  if (!isObject(value) || !str(value.who)) return null;
  return {
    who: String(value.who),
    rank: typeof value.rank === 'number' && Number.isFinite(value.rank) ? value.rank : null,
    of: num(value.of, 0),
    because: strings(value.because),
  };
}

function parsePick(value: unknown): CouncilPick | null {
  if (!isObject(value) || !str(value.name)) return null;
  const fits = Array.isArray(value.fits) ? value.fits.map(parseFit).filter((fit): fit is MemberFit => fit !== null) : [];
  return {
    entityId: str(value.entityId),
    name: String(value.name),
    subtitle: str(value.subtitle),
    imageUrl: typeof value.imageUrl === 'string' && /^https:\/\//i.test(value.imageUrl) ? value.imageUrl : undefined,
    worstRank: num(value.worstRank, Number.POSITIVE_INFINITY),
    meanRank: num(value.meanRank, Number.POSITIVE_INFINITY),
    fits,
    tags: strings(value.tags),
  };
}

function parseVeto(value: unknown): KeeperVeto | null {
  if (!isObject(value) || !str(value.name)) return null;
  return { name: String(value.name), fact: typeof value.fact === 'string' ? value.fact : '', who: typeof value.who === 'string' ? value.who : '' };
}

function parseCall(value: unknown): QlooCallRecord | null {
  if (!isObject(value) || !str(value.tool)) return null;
  const status = typeof value.status === 'string' && CALL_STATUS.has(value.status as QlooCallRecord['status']) ? (value.status as QlooCallRecord['status']) : 'error';
  return {
    tool: String(value.tool),
    args: isObject(value.args) ? value.args : {},
    status,
    summary: typeof value.summary === 'string' ? value.summary : '',
    resultCount: num(value.resultCount, 0),
    ms: num(value.ms, 0),
    forWho: str(value.forWho),
  };
}

function list<T>(value: unknown, parse: (item: unknown) => T | null): T[] {
  return Array.isArray(value) ? value.map(parse).filter((item): item is T => item !== null) : [];
}

export function parseCouncilResult(value: unknown): CouncilResult | null {
  if (!isObject(value)) return null;
  const occasion = value.occasion;
  if (typeof occasion !== 'string' || !(occasion in OCCASION_LABEL)) return null;
  const status = typeof value.status === 'string' && RESULT_STATUS.has(value.status as CouncilResult['status']) ? (value.status as CouncilResult['status']) : 'error';
  return {
    occasion: occasion as TasteOccasion,
    location: str(value.location),
    members: list(value.members, parseMember),
    picks: list(value.picks, parsePick).slice(0, 5),
    vetoes: list(value.vetoes, parseVeto),
    speech: typeof value.speech === 'string' ? value.speech : '',
    calls: list(value.calls, parseCall),
    status,
    note: str(value.note),
    startedAt: typeof value.startedAt === 'string' ? value.startedAt : '',
    ms: num(value.ms, 0),
  };
}

export function parseTasteSnapshot(value: unknown): TasteSnapshot | null {
  if (!isObject(value)) return null;
  return {
    members: list(value.members, parseMember),
    qlooReady: value.qlooReady === true,
    recent: list(value.recent, parseCouncilResult),
  };
}

/** Stable key for a result, so a fresh council and the same one in `recent` are not shown twice. */
export function resultKey(result: CouncilResult): string {
  return `${result.startedAt}|${result.occasion}|${result.picks[0]?.name ?? ''}`;
}

export function mergeRecent(latest: CouncilResult, recent: CouncilResult[], limit = 3): CouncilResult[] {
  const key = resultKey(latest);
  return [latest, ...recent.filter((item) => resultKey(item) !== key)].slice(0, limit);
}
