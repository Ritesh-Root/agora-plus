import type { TasteMember } from '../../shared/taste';
import { listMemory, type MemoryEntry } from '../household/memoryStore';

/**
 * Household memory -> per-person taste, with no model in the loop.
 * "Mia loves Encanto" is a love, "Rohan likes street food" is a tag, "Dadi is 74" is an age band,
 * "Arjun is vegetarian" / "Mia is allergic to peanuts" / "Arjun hates horror" are constraints.
 */

export interface TasteProfile {
  members: TasteMember[];
  /** `${who lowercased}|${constraint}` -> the memory text that produced it, for Keeper's quotes. */
  constraintFacts: Map<string, string>;
}

const PRONOUNS = /^(?:she|he|they)(?:\s+|['’](?:s|re)\s+)/i;
const NOT_A_NAME = new Set([
  'The', 'This', 'That', 'There', 'Then', 'Please', 'Remember', 'Note', 'My', 'Our', 'We', 'He', 'She',
  'They', 'It', 'An', 'A', 'And', 'But', 'For', 'Her', 'His', 'Its', 'When', 'What', 'Where', 'Why', 'How',
  'Today', 'Tomorrow', 'Yesterday', 'Everyone', 'Everybody', 'Nobody', 'Family', 'Buy', 'Get', 'Call',
]);
const DIETS = [
  'vegetarian', 'vegan', 'pescatarian', 'pescetarian', 'halal', 'kosher', 'jain', 'lactose intolerant',
  'gluten free', 'gluten-free', 'dairy free', 'dairy-free', 'teetotal', 'teetotaler', 'diabetic', 'coeliac', 'celiac',
];
const LIKE_VERBS = String.raw`(?:(?:really|absolutely|totally|just|also)\s+)?(?:loves?|likes?|adores?|enjoys?|is\s+(?:a\s+)?(?:(?:big|huge|massive|great)\s+)?fan\s+of|is\s+into|is\s+obsessed\s+with|is\s+crazy\s+about|is\s+mad\s+about|can['’]?t\s+get\s+enough\s+of|listens\s+to|watches|reads|prefers)`;
const AVOID_VERBS = String.raw`(?:hates?|dislikes?|detests?|can['’]?t\s+stand|cannot\s+stand|does\s*n['’]?o?t\s+like|doesn['’]t\s+like|does\s+not\s+like|won['’]t\s+watch|will\s+not\s+watch|avoids?|is\s+scared\s+of|is\s+afraid\s+of|is\s+not\s+into|isn['’]t\s+into)`;
const GERUNDS = /^(?:watching|reading|listening\s+to|eating|playing|going\s+to|visiting|cooking)\s+/i;
const TRAILING_KIND = /\s+(?:films?|movies?|songs?|music|books?|novels?|shows?|series|albums?|records?|games?|podcasts?)$/i;

function clean(text: string): string {
  return text.trim().replace(/\s+/g, ' ').replace(/[.!?;:,]+$/u, '').trim();
}

function unquote(text: string): { text: string; quoted: boolean } {
  const match = text.match(/^["“'‘](.+)["”'’]$/u);
  return match ? { text: match[1].trim(), quoted: true } : { text, quoted: false };
}

/** "Encanto, Coco and Taylor Swift" -> three items. Quoted titles are kept whole. */
function splitList(text: string): string[] {
  const quoted: string[] = [];
  const masked = text.replace(/["“][^"”]+["”]/gu, (match) => {
    quoted.push(match);
    return `\u0000${quoted.length - 1}\u0000`;
  });
  return masked
    .split(/\s*,\s*(?:and\s+|or\s+)?|\s+and\s+|\s+or\s+|\s*&\s*|\s+as\s+well\s+as\s+/i)
    .map((part) => part.replace(/\u0000(\d+)\u0000/g, (_, index: string) => quoted[Number(index)]))
    .map(clean)
    .filter((part) => part.length > 0);
}

type Classified = { kind: 'love' | 'tag'; value: string } | null;

/** Named (capitalised, quoted, has a digit) -> love. Lowercase concept -> tag. */
export function classifyItem(raw: string): Classified {
  let item = clean(raw).replace(GERUNDS, '').replace(/^to\s+/i, '');
  const { text, quoted } = unquote(item);
  item = text;
  if (!item) return null;
  if (quoted) return { kind: 'love', value: item };
  const withoutArticle = item.replace(/^(?:the|a|an|some|all|any)\s+/, '');
  const named = /^[A-Z0-9]/.test(withoutArticle) || /[A-Z]/.test(withoutArticle.slice(1).replace(/\b(?:I)\b/g, ''));
  if (named) {
    const stripped = withoutArticle.replace(TRAILING_KIND, '').trim();
    const value = /^[A-Z]/.test(item) ? item.replace(TRAILING_KIND, '').trim() : stripped;
    return value ? { kind: 'love', value } : null;
  }
  const tag = withoutArticle.toLowerCase();
  if (tag.length < 2 || tag.length > 40) return null;
  if (/^(?:it|them|that|this|him|her|everything|anything|nothing|food|stuff|things)$/.test(tag)) return null;
  return { kind: 'tag', value: tag };
}

export function ageToBand(age: number): TasteMember['ageBand'] | undefined {
  if (!Number.isFinite(age) || age < 0 || age > 120) return undefined;
  if (age < 18) return '0-17';
  if (age < 25) return '18-24';
  if (age < 35) return '25-34';
  if (age < 45) return '35-44';
  if (age < 55) return '45-54';
  return '55+';
}

export interface ParsedFact {
  who?: string;
  loves: string[];
  likesTags: string[];
  constraints: string[];
  age?: number;
}

function leadingName(text: string): { name?: string; rest: string } {
  const match = text.match(/^([A-Z][a-zA-Z]+(?:-[A-Z]?[a-z]+)?)(?:['’]s)?\b\s*(.*)$/s);
  if (!match || NOT_A_NAME.has(match[1])) return { rest: text };
  const possessive = /^[A-Z][a-zA-Z]+(?:-[A-Z]?[a-z]+)?['’]s\b/.test(text);
  return { name: match[1], rest: possessive ? `'s ${match[2]}` : match[2] };
}

function constraintFromAvoid(object: string): string[] {
  return splitList(object)
    .map((item) => clean(item.replace(GERUNDS, '')).replace(/^(?:the|any|all)\s+/i, ''))
    .filter((item) => item.length > 1 && item.length <= 40)
    .map((item) => `no ${item.toLowerCase().replace(TRAILING_KIND, '')}`);
}

/** Parse one clause whose subject (the person) is already removed. */
function parseClause(clause: string, into: ParsedFact): void {
  const rest = clean(clause);
  if (!rest) return;

  // Ages: "is 74", "is 9 years old", "is aged 9", "turned 16", "is a 9-year-old", "'s age is 9"
  const age = rest.match(/^(?:is\s+(?:aged\s+|now\s+)?|turned\s+|turns\s+|['’]s\s+age\s+is\s+|age\s*:?\s*|aged\s+)(\d{1,3})(?:\s*(?:years?|yrs?)(?:\s*old)?)?(?:\s+now)?$/i)
    ?? rest.match(/^is\s+an?\s+(\d{1,3})[- ]year[- ]old\b/i);
  if (age) {
    into.age = Number(age[1]);
    return;
  }

  // Allergies: "is allergic to peanuts and shellfish", "has a peanut allergy", "'s allergic to"
  const allergic = rest.match(/^(?:is\s+|['’]s\s+)?(?:severely\s+|very\s+|mildly\s+)?allergic\s+to\s+(.+)$/i);
  if (allergic) {
    for (const item of splitList(allergic[1])) into.constraints.push(item.toLowerCase().replace(/^(?:the|any)\s+/, ''));
    return;
  }
  const allergy = rest.match(/^has\s+(?:an?\s+|a\s+severe\s+|a\s+mild\s+)?(.+?)\s+allergy$/i);
  if (allergy) {
    into.constraints.push(allergy[1].toLowerCase());
    return;
  }

  // Diets: "is vegetarian", "is a vegan", "eats halal", "is strictly vegetarian"
  const diet = rest.match(/^(?:is\s+|['’]s\s+|eats\s+|keeps\s+|follows\s+(?:a\s+)?)?(?:strictly\s+|fully\s+|mostly\s+|an?\s+)?(.+?)(?:\s+diet)?$/i);
  if (diet) {
    const word = diet[1].toLowerCase();
    const known = DIETS.find((name) => word === name || word === `${name}s` || word === `a ${name}`);
    if (known) {
      into.constraints.push(known.replace(/-/g, ' ').replace(/^pescetarian$/, 'pescatarian').replace(/^celiac$/, 'coeliac').replace(/^teetotaler$/, 'teetotal'));
      return;
    }
  }

  // Avoid: "hates horror", "doesn't eat meat", "no spicy food", "can't have dairy"
  const avoid = rest.match(new RegExp(`^${AVOID_VERBS}\\s+(.+)$`, 'i'));
  if (avoid) {
    into.constraints.push(...constraintFromAvoid(avoid[1]));
    return;
  }
  const noEat = rest.match(/^(?:does\s*n['’]?o?t|doesn['’]t|does\s+not|can['’]?t|cannot|won['’]t|will\s+not|must\s+not|should\s+not|never)\s+(?:eat|drink|have|watch|eat\s+any)\s+(.+)$/i)
    ?? rest.match(/^(?:eats|drinks|watches)\s+no\s+(.+)$/i)
    ?? rest.match(/^(?:says\s+)?no\s+(.+)$/i);
  if (noEat) {
    into.constraints.push(...constraintFromAvoid(noEat[1]));
    return;
  }

  // Favourites: "'s favourite movie is Coco", "'s favorite singers are X and Y"
  const favourite = rest.match(/^['’]s\s+(?:all[- ]time\s+)?favou?rites?\s+(?:[\w-]+\s+){0,2}(?:is|are)\s+(.+)$/i)
    ?? rest.match(/^['’]s\s+favou?rites?\s+(?:is|are)\s+(.+)$/i);
  const likes = favourite ?? rest.match(new RegExp(`^${LIKE_VERBS}\\s+(.+)$`, 'i'));
  if (likes) {
    for (const item of splitList(likes[1])) {
      const classified = classifyItem(item);
      if (!classified) continue;
      if (classified.kind === 'love') into.loves.push(classified.value);
      else into.likesTags.push(classified.value);
    }
  }
}

/** Parse one memory fact. `who` from the entry wins over the leading name. */
export function parseTasteFact(text: string, entryWho?: string, tags: string[] = []): ParsedFact {
  const out: ParsedFact = { loves: [], likesTags: [], constraints: [] };
  let body = text.trim().replace(/\s+/g, ' ');
  if (!body) return out;
  const { name, rest } = leadingName(body);
  if (entryWho?.trim()) {
    out.who = entryWho.trim();
    if (name && name.toLowerCase() === out.who.toLowerCase()) body = rest;
    else if (PRONOUNS.test(body)) body = body.replace(PRONOUNS, (match) => (/['’]s\s+$/.test(match) ? 'is ' : ''));
  } else if (name) {
    out.who = name;
    body = rest;
  } else {
    return out;
  }

  // Several sentences: split only after a lowercase word, so "A. R. Rahman" stays whole.
  const sentences = body.split(/(?<=[a-z]{2}[.!?])\s+/);
  for (const sentence of sentences) {
    // "loves Coco but hates horror" -> two clauses with the same subject.
    const clauses = sentence.split(/\s*(?:,\s*)?\bbut\b\s*|\s*;\s*/i);
    for (const clause of clauses) {
      let piece = clause.trim();
      const again = leadingName(piece);
      if (again.name && out.who && again.name.toLowerCase() === out.who.toLowerCase()) piece = again.rest;
      piece = piece.replace(PRONOUNS, '');
      parseClause(piece, out);
    }
  }

  const tagSet = new Set(tags.map((tag) => tag.toLowerCase()));
  const empty = out.loves.length === 0 && out.likesTags.length === 0 && out.constraints.length === 0 && out.age === undefined;
  if (empty && tagSet.has('taste')) {
    // A fact tagged taste with no verb we know: treat the remainder as the thing they like.
    const classified = classifyItem(body.replace(/^\s*[:\-–—]\s*/, '').replace(/^(?:is|['’]s)\s+/i, ''));
    if (classified?.kind === 'love') out.loves.push(classified.value);
    else if (classified?.kind === 'tag') out.likesTags.push(classified.value);
  }
  return out;
}

function pushUnique(list: string[], value: string): void {
  if (!list.some((item) => item.toLowerCase() === value.toLowerCase())) list.push(value);
}

/** Pure: entries -> members. Members with nothing parsed are left out. Sorted by name. */
export function profileFromEntries(entries: MemoryEntry[]): TasteProfile {
  const byWho = new Map<string, TasteMember>();
  const constraintFacts = new Map<string, string>();
  // Oldest first, so a newer age fact wins.
  const ordered = entries.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const entry of ordered) {
    const parsed = parseTasteFact(entry.text, entry.who, entry.tags);
    if (!parsed.who) continue;
    const touched = parsed.loves.length + parsed.likesTags.length + parsed.constraints.length > 0 || parsed.age !== undefined;
    if (!touched) continue;
    const key = parsed.who.toLowerCase();
    let member = byWho.get(key);
    if (!member) {
      member = { who: parsed.who, loves: [], likesTags: [], constraints: [], factIds: [] };
      byWho.set(key, member);
    }
    for (const love of parsed.loves) pushUnique(member.loves, love);
    for (const tag of parsed.likesTags) pushUnique(member.likesTags, tag);
    for (const constraint of parsed.constraints) {
      pushUnique(member.constraints, constraint);
      constraintFacts.set(`${key}|${constraint.toLowerCase()}`, entry.text);
    }
    if (parsed.age !== undefined) {
      const band = ageToBand(parsed.age);
      if (band) member.ageBand = band;
    }
    if (!member.factIds.includes(entry.id)) member.factIds.push(entry.id);
  }
  const members = [...byWho.values()].sort((a, b) => a.who.localeCompare(b.who));
  return { members, constraintFacts };
}

export async function buildTasteProfile(): Promise<TasteProfile> {
  return profileFromEntries(await listMemory());
}

export async function listTasteMembers(): Promise<TasteMember[]> {
  return (await buildTasteProfile()).members;
}
