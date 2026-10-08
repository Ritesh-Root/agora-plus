import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addMemory, listMemory, memoryMarkdown, removeMemory, searchMemory, updateMemory } from './memoryStore';
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
    const first = await addMemory('Mia likes pasta', ['food'], 'ui');
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await addMemory('Mia is allergic to peanuts', ['allergy', 'mia'], 'voice');
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
});
