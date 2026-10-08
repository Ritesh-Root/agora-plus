import { mkdtemp, readFile, readdir, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readJson, setDataDir, writeJson } from './store';

let dir = '';

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'agora-store-'));
  setDataDir(dir);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('store', () => {
  it('round-trips JSON and leaves no temp file', async () => {
    await writeJson('memory.json', { entries: [{ id: 'a' }] });
    await expect(readJson('memory.json', { entries: [] })).resolves.toEqual({ entries: [{ id: 'a' }] });
    await writeJson('runs/abc.json', { ok: true });
    await expect(readJson('runs/abc.json', { ok: false })).resolves.toEqual({ ok: true });
    const names = await readdir(dir);
    expect(names.some((name) => name.includes('.tmp-'))).toBe(false);
  });

  it('keeps one file valid JSON across parallel writes', async () => {
    let bad = 0;
    const jobs: Promise<unknown>[] = [];
    for (let i = 0; i < 30; i += 1) {
      jobs.push(writeJson('box.json', { n: i }));
      jobs.push((async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
        try {
          const text = await readFile(path.join(dir, 'box.json'), 'utf8');
          const parsed = JSON.parse(text) as { n?: unknown };
          if (typeof parsed.n !== 'number') bad += 1;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') bad += 1;
        }
      })());
    }
    await Promise.all(jobs);
    expect(bad).toBe(0);
    const final = await readJson('box.json', { n: -1 });
    expect(final.n).toBeGreaterThanOrEqual(0);
    expect(final.n).toBeLessThan(30);
  });

  it('rejects paths that escape the data directory', async () => {
    await expect(writeJson('../nope.json', {})).rejects.toThrow(/Invalid data path/);
    await expect(writeJson('/tmp/nope.json', {})).rejects.toThrow(/Invalid data path/);
    await expect(writeJson('a/b/c.json', {})).rejects.toThrow(/Invalid data path/);
  });
});
