import { randomUUID } from 'crypto';
import { toSpeech } from './speech';
import { loadJsonFile, writeJson } from './store';

export type HouseholdSource = 'voice' | 'mcp' | 'ui' | 'agent';

export interface MemoryEntry {
  id: string;
  text: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  source: HouseholdSource;
  /** The person this fact is about, for example "Mia". */
  who?: string;
}

const FILE = 'memory.json';
const NAME_STOP = new Set([
  'The', 'This', 'That', 'There', 'Then', 'Please', 'Remember', 'Note', 'My', 'Our', 'We',
  'He', 'She', 'They', 'It', 'An', 'And', 'But', 'For', 'Her', 'His', 'Its', 'When', 'What',
  'Where', 'Why', 'How', 'Today', 'Tomorrow', 'Yesterday',
]);
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'to', 'of', 'and', 'or', 'for', 'my', 'me', 'what', 'whats', 'who',
  'does', 'do', 'you', 'your', 'know', 'about', 'like', 'likes', 'i', 'we', 'our', 'on', 'in',
  'at', 'it', 'that', 'this', 'are', 'was', 'be', 'have', 'has', 'with', 'from', 'did', 's',
]);

let chain: Promise<unknown> = Promise.resolve();

function exclusive<T>(job: () => Promise<T>): Promise<T> {
  const run = chain.then(job, job);
  chain = run.then(() => undefined, () => undefined);
  return run;
}

export function cleanTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const tag of tags) {
    if (typeof tag !== 'string') continue;
    const value = tag.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(value);
  }
  return cleaned;
}

function isSource(value: unknown): value is HouseholdSource {
  return value === 'voice' || value === 'mcp' || value === 'ui' || value === 'agent';
}

function isMemoryFile(value: unknown): value is Record<string, unknown>[] {
  if (!Array.isArray(value)) return false;
  return value.every((row) => {
    if (!row || typeof row !== 'object') return false;
    const item = row as Record<string, unknown>;
    return typeof item.id === 'string' && item.id.trim().length > 0 && typeof item.text === 'string';
  });
}

function asMemory(row: Record<string, unknown>): MemoryEntry {
  const tags = Array.isArray(row.tags)
    ? cleanTags(row.tags.filter((tag): tag is string => typeof tag === 'string'))
    : [];
  const now = new Date().toISOString();
  const entry: MemoryEntry = {
    id: String(row.id).trim(),
    text: String(row.text),
    tags,
    createdAt: typeof row.createdAt === 'string' && row.createdAt ? row.createdAt : now,
    updatedAt: typeof row.updatedAt === 'string' && row.updatedAt ? row.updatedAt : now,
    source: isSource(row.source) ? row.source : 'ui',
  };
  if (typeof row.who === 'string' && row.who.trim()) entry.who = row.who.trim();
  return entry;
}

async function readEntries(): Promise<MemoryEntry[]> {
  const parsed = await loadJsonFile(FILE, isMemoryFile);
  if (!Array.isArray(parsed)) return [];
  return parsed.map((row) => asMemory(row as Record<string, unknown>));
}

/** Compare facts ignoring case, extra space, and trailing punctuation. */
export function normaliseFact(text: string): string {
  return text.trim().replace(/\s+/g, ' ').replace(/[.!?…]+$/u, '').trim().toLowerCase();
}

/** First word of "Mia is allergic to peanuts" is Mia. "The spare key" has no person. */
export function inferWho(text: string): string | undefined {
  const match = text.trim().match(/^([A-Z][a-z]+)(?:['’]s)?\b/);
  const name = match?.[1];
  if (!name || NAME_STOP.has(name)) return undefined;
  return name;
}

function cleanWho(who: string | undefined): string | undefined {
  const trimmed = who?.trim();
  return trimmed ? trimmed : undefined;
}

export interface SavedMemory {
  entry: MemoryEntry;
  created: boolean;
}

export async function saveMemory(
  text: string,
  tags: string[],
  source: HouseholdSource,
  who?: string,
): Promise<SavedMemory> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Memory text is required.');
  const named = cleanWho(who) ?? inferWho(trimmed);
  const now = new Date().toISOString();
  return exclusive(async () => {
    const entries = await readEntries();
    const key = normaliseFact(trimmed);
    const index = entries.findIndex((entry) => normaliseFact(entry.text) === key);
    if (index >= 0) {
      const current = entries[index];
      const next: MemoryEntry = {
        ...current,
        tags: tags.length > 0 ? cleanTags([...current.tags, ...tags]) : current.tags,
        updatedAt: now,
      };
      if (named) next.who = named;
      entries[index] = next;
      await writeJson(FILE, entries);
      return { entry: next, created: false };
    }
    const entry: MemoryEntry = {
      id: randomUUID(),
      text: trimmed,
      tags: cleanTags(tags),
      createdAt: now,
      updatedAt: now,
      source,
    };
    if (named) entry.who = named;
    entries.push(entry);
    await writeJson(FILE, entries);
    return { entry, created: true };
  });
}

export async function addMemory(text: string, tags: string[], source: HouseholdSource, who?: string): Promise<MemoryEntry> {
  const saved = await saveMemory(text, tags, source, who);
  return saved.entry;
}

export async function listMemory(): Promise<MemoryEntry[]> {
  const entries = await readEntries();
  return entries.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function keywords(query: string): string[] {
  return query.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 0 && !STOP_WORDS.has(word));
}

interface RankedMemory {
  entry: MemoryEntry;
  score: number;
  keywordHits: number;
}

function rankMemories(query: string, entries: MemoryEntry[]): { ranked: RankedMemory[]; words: string[] } {
  const words = keywords(query);
  const ranked = entries.map((entry) => {
    const hay = new Set(keywords(`${entry.text} ${entry.tags.join(' ')} ${entry.who ?? ''}`));
    let keywordHits = 0;
    for (const word of words) {
      if (hay.has(word)) keywordHits += 1;
    }
    const person = entry.who?.toLowerCase();
    const aboutPerson = !!person && words.includes(person);
    const score = keywordHits + (aboutPerson ? 10 : 0);
    return { entry, score, keywordHits };
  }).filter((item) => item.score > 0);
  ranked.sort((a, b) => b.score - a.score || b.entry.createdAt.localeCompare(a.entry.createdAt));
  return { ranked, words };
}

/** Case-insensitive keyword overlap, best first. An empty query is newest first. */
export async function searchMemory(query: string): Promise<MemoryEntry[]> {
  const entries = await listMemory();
  const words = keywords(query);
  if (words.length === 0) return entries;
  return rankMemories(query, entries).ranked.map((item) => item.entry);
}

export interface RecallSpeech {
  speech: string;
  memories: MemoryEntry[];
}

/**
 * One sure fact, two facts when they tie, or an unsure line when the overlap is partial.
 * A named person outranks a fact that merely shares a word.
 */
export function speakRecall(query: string, entries: MemoryEntry[]): RecallSpeech {
  const words = keywords(query);
  if (words.length === 0) {
    const newest = entries[0];
    const speech = newest ? toSpeech(`I remember this: ${newest.text}`) : "I don't know.";
    return { speech: speech || "I don't know.", memories: entries.slice(0, 5) };
  }
  const { ranked } = rankMemories(query, entries);
  if (ranked.length === 0) return { speech: "I don't know.", memories: [] };
  const best = ranked[0].score;
  // Files written before remember de-duplicated can hold the same fact twice; say it once.
  const seen = new Set<string>();
  const tied = ranked.filter((item) => {
    if (item.score !== best) return false;
    const key = normaliseFact(item.entry.text);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 2);
  const chosen = tied.map((item) => item.entry);
  const weak = ranked[0].keywordHits < words.length;
  const texts = chosen.map((entry) => entry.text.replace(/[.!?…]+$/u, '').trim());
  let speech: string;
  if (weak && texts.length > 1) speech = `I'm not sure, but I have: ${texts[0]}. ${texts[1]}.`;
  else if (weak) speech = `I'm not sure, but I have: ${texts[0]}.`;
  else if (texts.length > 1) speech = `${texts[0]}. ${texts[1]}.`;
  else speech = `I remember this: ${texts[0]}.`;
  return {
    speech: toSpeech(speech) || "I don't know.",
    memories: ranked.slice(0, 5).map((item) => item.entry),
  };
}

export async function answerRecall(query: string): Promise<RecallSpeech> {
  return speakRecall(query, await listMemory());
}

export async function updateMemory(
  id: string,
  patch: { text?: string; tags?: string[]; who?: string },
): Promise<MemoryEntry | null> {
  return exclusive(async () => {
    const entries = await readEntries();
    const index = entries.findIndex((entry) => entry.id === id);
    if (index < 0) return null;
    const current = entries[index];
    const text = patch.text !== undefined ? patch.text.trim() : current.text;
    if (!text) throw new Error('Memory text is required.');
    const next: MemoryEntry = {
      ...current,
      text,
      tags: patch.tags !== undefined ? cleanTags(patch.tags) : current.tags,
      updatedAt: new Date().toISOString(),
    };
    if (patch.who !== undefined) {
      const named = cleanWho(patch.who);
      if (named) next.who = named;
      else delete next.who;
    }
    entries[index] = next;
    await writeJson(FILE, entries);
    return next;
  });
}

export async function removeMemory(id: string): Promise<MemoryEntry | null> {
  return exclusive(async () => {
    const entries = await readEntries();
    const index = entries.findIndex((entry) => entry.id === id);
    if (index < 0) return null;
    const [removed] = entries.splice(index, 1);
    await writeJson(FILE, entries);
    return removed;
  });
}

/** Readable list grouped by first tag. Each memory appears once; its other tags follow the text. */
export async function memoryMarkdown(): Promise<string> {
  const entries = await listMemory();
  if (entries.length === 0) return '# Household memory\n\n_Nothing remembered yet._\n';
  const groups = new Map<string, MemoryEntry[]>();
  for (const entry of entries) {
    const tag = entry.tags[0] ?? 'untagged';
    const list = groups.get(tag) ?? [];
    list.push(entry);
    groups.set(tag, list);
  }
  const lines = ['# Household memory', ''];
  for (const tag of [...groups.keys()].sort((a, b) => a.localeCompare(b))) {
    lines.push(`## ${tag}`, '');
    for (const entry of groups.get(tag) ?? []) {
      const more = entry.tags.slice(1);
      const who = entry.who ? `${entry.who}: ` : '';
      lines.push(`- ${who}${entry.text}${more.length ? ` (${more.join(', ')})` : ''}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
