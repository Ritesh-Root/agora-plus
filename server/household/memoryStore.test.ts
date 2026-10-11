import { mkdtemp, readdir, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addMemory, listMemory, memoryMarkdown, removeMemory, searchMemory, speakRecall, updateMemory } from './memoryStore';
import { setDataDir } from './store';

let dir = '';

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'agora-memory-'));
  setDataDir(dir);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('memoryStore', () => {
  it('adds, searches, updates, and removes memories', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-08T12:00:00.000Z'));
    let first: Awaited<ReturnType<typeof addMemory>>;
    let second: Awaited<ReturnType<typeof addMemory>>;
    try {
      first = await addMemory('Mia likes pasta', ['food'], 'ui');
      vi.setSystemTime(new Date('2026-10-08T12:00:01.000Z'));
      second = await addMemory('Mia is allergic to peanuts', ['allergy', 'mia'], 'voice');
    } finally {
      vi.useRealTimers();
    }
    const ranked = await searchMemory('peanuts allergy');
    expect(ranked[0]?.id).toBe(second.id);
    expect(ranked.some((entry) => entry.id === first.id)).toBe(false);

    const newest = await searchMemory('  ');
    expect(newest.map((entry) => entry.id)).toEqual([second.id, first.id]);

    const updated = await updateMemory(second.id, { text: 'Mia is allergic to peanuts and tree nuts', tags: ['allergy'] });
    expect(updated?.tags).toEqual(['allergy']);
    expect((await listMemory()).find((entry) => entry.id === second.id)?.text).toContain('tree nuts');

    const markdown = await memoryMarkdown();
    expect(markdown).toContain('## allergy');
    expect(markdown).toContain('tree nuts');

    expect(await removeMemory(second.id)).not.toBeNull();
    expect(await listMemory()).toHaveLength(1);
    expect(await removeMemory(second.id)).toBeNull();
  });

  it('infers who from a leading name and keeps a file that has no who', async () => {
    const saved = await addMemory('Mia is allergic to peanuts', ['allergy'], 'voice');
    expect(saved.who).toBe('Mia');
    expect((await addMemory('The spare key is in the drawer', [], 'ui')).who).toBeUndefined();
    expect((await addMemory('Jen likes tea', [], 'ui', 'Dad')).who).toBe('Dad');

    await writeFile(path.join(dir, 'memory.json'), JSON.stringify([{
      id: 'old',
      text: 'Bins go out Tuesday',
      tags: ['home'],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      source: 'ui',
    }]));
    const loaded = await listMemory();
    expect(loaded.map((entry) => entry.text)).toEqual(['Bins go out Tuesday']);
    expect(loaded[0]?.who).toBeUndefined();
  });

  it('updates the same fact instead of storing a copy', async () => {
    const first = await addMemory('Mia is allergic to peanuts', ['allergy'], 'voice');
    const second = await addMemory('  mia   is allergic to peanuts. ', ['mia'], 'ui');
    expect(second.id).toBe(first.id);
    expect(second.who).toBe('Mia');
    expect(second.tags).toEqual(['allergy', 'mia']);
    expect(await listMemory()).toHaveLength(1);
    const markdown = await memoryMarkdown();
    expect(markdown).toContain('Mia: Mia is allergic to peanuts');
  });

  it('moves a corrupt or wrong-shape memory file aside and still saves the next fact', async () => {
    await writeFile(path.join(dir, 'memory.json'), '{');
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await listMemory()).toEqual([]);
    expect(await listMemory()).toEqual([]);
    expect(errors).toHaveBeenCalledTimes(1);
    const names = await readdir(dir);
    const aside = names.find((name) => name.startsWith('memory.json.corrupt-') && name.endsWith('.json'));
    expect(aside).toBeTruthy();
    expect(await readFile(path.join(dir, aside ?? ''), 'utf8')).toBe('{');

    const saved = await addMemory('Mia is allergic to peanuts', [], 'ui');
    expect(saved.who).toBe('Mia');
    const fresh = JSON.parse(await readFile(path.join(dir, 'memory.json'), 'utf8')) as unknown[];
    expect(fresh).toHaveLength(1);
    expect(await readFile(path.join(dir, aside ?? ''), 'utf8')).toBe('{');
    errors.mockRestore();
  });

  it('moves a JSON object aside instead of treating it as an empty list', async () => {
    await writeFile(path.join(dir, 'memory.json'), '{"entries":[]}');
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await listMemory()).toEqual([]);
    const names = await readdir(dir);
    expect(names.some((name) => name.includes('.corrupt-'))).toBe(true);
    expect(names.includes('memory.json')).toBe(false);
    errors.mockRestore();
  });
});

describe('speakRecall', () => {
  const mia = {
    id: 'mia',
    text: 'Mia is allergic to peanuts',
    tags: ['allergy'],
    createdAt: '2026-10-08T00:00:00.000Z',
    updatedAt: '2026-10-08T00:00:00.000Z',
    source: 'voice' as const,
    who: 'Mia',
  };
  const shellfish = {
    ...mia,
    id: 'shell',
    text: 'Mia is allergic to shellfish',
    createdAt: '2026-10-08T01:00:00.000Z',
  };
  const jen = {
    ...mia,
    id: 'jen',
    text: 'Jen goes to North School',
    tags: ['school'],
    who: 'Jen',
    createdAt: '2026-10-08T02:00:00.000Z',
  };
  const lincoln = {
    ...mia,
    id: 'lincoln',
    text: 'Mia goes to Lincoln',
    tags: ['school'],
    createdAt: '2026-10-08T03:00:00.000Z',
  };

  it('says both facts when they match equally', () => {
    const spoken = speakRecall('allergic', [shellfish, mia]);
    expect(spoken.speech).toContain('peanuts');
    expect(spoken.speech).toContain('shellfish');
    expect(spoken.speech).not.toContain("I'm not sure");
  });

  it('prefers the named person and does not sound sure about a partial match', () => {
    const spoken = speakRecall('what school does Mia go to', [jen, lincoln]);
    expect(spoken.speech).toContain('Lincoln');
    expect(spoken.speech).not.toContain('North');
    expect(spoken.speech).toContain("I'm not sure");
  });

  it('says a fact once when an older file holds two copies of it', () => {
    const copy = { ...mia, id: 'mia-copy', text: 'Mia is allergic to peanuts.', createdAt: '2026-10-07T00:00:00.000Z' };
    const spoken = speakRecall('allergic', [mia, copy]);
    expect(spoken.speech).toBe('I remember this: Mia is allergic to peanuts.');
  });

  it('matches a word by its root, so "allergy" finds "allergic"', () => {
    expect(speakRecall('Mia allergy', [mia, jen]).speech).toBe('I remember this: Mia is allergic to peanuts.');
    expect(speakRecall("Mia's allergies", [mia]).speech).toBe('I remember this: Mia is allergic to peanuts.');
    expect(speakRecall('Mia peanut', [mia]).speech).toBe('I remember this: Mia is allergic to peanuts.');
  });

  it('keeps short or different words apart', () => {
    const veg = { ...mia, id: 'veg', text: 'Sam is vegetarian', who: 'Sam' };
    expect(speakRecall('vegetables', [veg]).speech).toBe("I don't know.");
    expect(speakRecall('spark', [{ ...mia, id: 'key', text: 'The spare key is in the drawer', who: undefined }]).speech).toBe("I don't know.");
  });

  it('marks a weak keyword overlap as unsure', () => {
    const spoken = speakRecall('peanuts school', [mia, jen]);
    expect(spoken.speech).toContain("I'm not sure, but I have:");
    expect(spoken.speech).toContain('peanuts');
  });
});
