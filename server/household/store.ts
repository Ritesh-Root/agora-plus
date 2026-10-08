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
