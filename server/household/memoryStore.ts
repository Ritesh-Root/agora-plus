import { randomUUID } from 'crypto';
import { readJson, writeJson } from './store';

export type HouseholdSource = 'voice' | 'mcp' | 'ui' | 'agent';

export interface MemoryEntry {
  id: string;
  text: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  source: HouseholdSource;
}

const FILE = 'memory.json';

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

async function readEntries(): Promise<MemoryEntry[]> {
  const entries = await readJson<MemoryEntry[]>(FILE, []);
  return Array.isArray(entries) ? entries : [];
}

export async function addMemory(text: string, tags: string[], source: HouseholdSource): Promise<MemoryEntry> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Memory text is required.');
  const now = new Date().toISOString();
  const entry: MemoryEntry = {
    id: randomUUID(),
    text: trimmed,
    tags: cleanTags(tags),
    createdAt: now,
    updatedAt: now,
    source,
  };
  await exclusive(async () => {
    const entries = await readEntries();
    entries.push(entry);
    await writeJson(FILE, entries);
  });
  return entry;
}

export async function listMemory(): Promise<MemoryEntry[]> {
  const entries = await readEntries();
  return entries.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function keywords(query: string): string[] {
  return query.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 0);
}

/** Case-insensitive keyword overlap, best first. An empty query is newest first. */
export async function searchMemory(query: string): Promise<MemoryEntry[]> {
  const entries = await listMemory();
  const words = keywords(query);
  if (words.length === 0) return entries;
  const scored = entries.map((entry) => {
    const hay = new Set(keywords(`${entry.text} ${entry.tags.join(' ')}`));
    let score = 0;
    for (const word of words) {
      if (hay.has(word)) score += 1;
    }
    return { entry, score };
  }).filter((item) => item.score > 0);
  scored.sort((a, b) => b.score - a.score || b.entry.createdAt.localeCompare(a.entry.createdAt));
  return scored.map((item) => item.entry);
}

export async function updateMemory(id: string, patch: { text?: string; tags?: string[] }): Promise<MemoryEntry | null> {
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
      lines.push(`- ${entry.text}${more.length ? ` (${more.join(', ')})` : ''}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
