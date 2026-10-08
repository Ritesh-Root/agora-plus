import { randomBytes } from 'crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'fs/promises';
import path from 'path';

/**
 * Household files under AGORA_DATA_DIR (default `.agora-data`).
 * A write goes to a temp file in the same directory, then rename, so a reader
 * never sees half-written JSON. One queue per path keeps those renames in order.
 */

let overrideDir: string | null = null;
const tails = new Map<string, Promise<void>>();

export function setDataDir(dir: string): void {
  overrideDir = path.resolve(dir);
}

export function getDataDir(): string {
  if (overrideDir) return overrideDir;
  return path.resolve(process.cwd(), process.env.AGORA_DATA_DIR || '.agora-data');
}

function resolveSafe(name: string): string {
  if (typeof name !== 'string' || name.includes('\0')) throw new Error('Invalid data path');
  if (path.isAbsolute(name)) throw new Error('Invalid data path');
  const parts = name.split(/[\\/]/).filter((part) => part.length > 0);
  if (parts.length === 0 || parts.length > 2) throw new Error('Invalid data path');
  if (parts.some((part) => part === '.' || part === '..')) throw new Error('Invalid data path');
  return path.join(getDataDir(), ...parts);
}

function enqueue(file: string, job: () => Promise<void>): Promise<void> {
  const previous = tails.get(file) ?? Promise.resolve();
  const run = previous.then(job, job);
  tails.set(file, run.then(() => undefined, () => undefined));
  return run;
}

async function atomicWrite(file: string, contents: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${randomBytes(8).toString('hex')}`;
  try {
    await writeFile(tmp, contents, 'utf8');
    await rename(tmp, file);
  } catch (error) {
    await rm(tmp, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function readJson<T>(name: string, fallback: T): Promise<T> {
  const file = resolveSafe(name);
  try {
    const text = await readFile(file, 'utf8');
    return JSON.parse(text) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw error;
  }
}

const loggedCorrupt = new Set<string>();

/**
 * Read a household JSON file on the same queue as its writes.
 * A missing file is undefined. Corrupt JSON, or a value the caller rejects,
 * is renamed to `<name>.corrupt-<timestamp>.json`, logged once, and returned
 * as undefined so the next write can create a fresh file without erasing it.
 */
export async function loadJsonFile(name: string, acceptable: (value: unknown) => boolean): Promise<unknown | undefined> {
  const file = resolveSafe(name);
  let loaded: unknown | undefined;
  await enqueue(file, async () => {
    let text: string;
    try {
      text = await readFile(file, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      await moveAside(file, name, 'unreadable');
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      await moveAside(file, name, 'not valid JSON');
      return;
    }
    if (!acceptable(parsed)) {
      await moveAside(file, name, 'the wrong shape');
      return;
    }
    loaded = parsed;
  });
  return loaded;
}

async function moveAside(file: string, name: string, reason: string): Promise<void> {
  const stamp = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomBytes(3).toString('hex')}`;
  const asideName = `${name}.corrupt-${stamp}.json`;
  const aside = resolveSafe(asideName);
  try {
    await rename(file, aside);
  } catch (error) {
    if (loggedCorrupt.has(file)) return;
    loggedCorrupt.add(file);
    const detail = error instanceof Error ? error.message : 'unknown error';
    console.error(`[household] ${name} was ${reason} and could not be moved aside: ${detail}`);
    return;
  }
  if (!loggedCorrupt.has(file)) {
    console.error(`[household] ${name} was ${reason} and was moved aside to ${asideName}.`);
  }
  loggedCorrupt.add(file);
}

export async function writeJson(name: string, data: unknown): Promise<void> {
  const file = resolveSafe(name);
  const body = JSON.stringify(data);
  await enqueue(file, () => atomicWrite(file, body));
}

/** Raw text, same atomic rename as writeJson. Used for run synthesis markdown. */
export async function writeText(name: string, text: string): Promise<void> {
  const file = resolveSafe(name);
  await enqueue(file, () => atomicWrite(file, text));
}

/** Saved run markdown. Missing files are null. */
export async function readText(name: string): Promise<string | null> {
  const file = resolveSafe(name);
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}
