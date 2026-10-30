import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listMemory } from '../household/memoryStore';
import { setDataDir } from '../household/store';
import { DEMO_FAMILY, seedDemoFamily } from './demoSeed';
import { listTasteMembers } from './profile';

let dir = '';
const saved = process.env.AGORA_DEMO_SEED;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'agora-seed-'));
  setDataDir(dir);
});

afterEach(async () => {
  if (saved === undefined) delete process.env.AGORA_DEMO_SEED;
  else process.env.AGORA_DEMO_SEED = saved;
  await rm(dir, { recursive: true, force: true });
});

describe('seedDemoFamily', () => {
  it('does nothing unless AGORA_DEMO_SEED=1', async () => {
    delete process.env.AGORA_DEMO_SEED;
    expect(await seedDemoFamily()).toBe(0);
    expect(await listMemory()).toHaveLength(0);
  });

  it('seeds an empty memory once and parses into four members', async () => {
    process.env.AGORA_DEMO_SEED = '1';
    expect(await seedDemoFamily()).toBe(DEMO_FAMILY.length);
    expect(await seedDemoFamily()).toBe(0);
    const entries = await listMemory();
    expect(entries).toHaveLength(DEMO_FAMILY.length);
    expect(entries.every((entry) => entry.source === 'agent' && entry.tags.includes('demo'))).toBe(true);
    const members = await listTasteMembers();
    expect(members.map((member) => member.who)).toEqual(['Arjun', 'Dadi', 'Mia', 'Rohan']);
    const byName = Object.fromEntries(members.map((member) => [member.who, member]));
    expect(byName.Dadi).toMatchObject({ loves: ['Raj Kapoor', 'Lata Mangeshkar', 'Mughal-e-Azam'], ageBand: '55+' });
    expect(byName.Arjun).toMatchObject({ loves: ['A. R. Rahman', 'Interstellar'], likesTags: ['thrillers'], constraints: ['vegetarian'], ageBand: '35-44' });
    expect(byName.Mia).toMatchObject({ loves: ['Encanto', 'Coco', 'Taylor Swift'], constraints: ['peanuts'], ageBand: '0-17' });
    expect(byName.Rohan).toMatchObject({ loves: ['Spider-Man: Into the Spider-Verse', 'Arijit Singh'], likesTags: ['street food'], ageBand: '0-17' });
  });
});
