import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { readFile, stat } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

export const HOUSEHOLD_CARD_URI = 'ui://daily_briefing/household-card.html';

const CARD_FILE = 'household-card.html';

function cardCandidates(): string[] {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  return [
    join(moduleDir, 'dist', CARD_FILE),
    join(process.cwd(), 'server', 'mcp', 'apps', 'dist', CARD_FILE),
    join(process.cwd(), 'dist', CARD_FILE),
    join(moduleDir, CARD_FILE),
  ];
}

async function sourceMtime(): Promise<number> {
  const dir = join(process.cwd(), 'server', 'mcp', 'apps');
  let newest = 0;
  for (const name of ['householdCard.ts', 'householdCardState.ts', 'householdCard.html', 'buildCard.ts']) {
    try {
      const info = await stat(join(dir, name));
      if (info.mtimeMs > newest) newest = info.mtimeMs;
    } catch {
      // That source file is not on this machine. A built card is still usable.
    }
  }
  return newest;
}

async function freshCard(): Promise<string | null> {
  const source = await sourceMtime();
  for (const file of cardCandidates()) {
    try {
      const info = await stat(file);
      if (source === 0 || info.mtimeMs >= source) return file;
    } catch {
      // This copy is missing. Try the next one.
    }
  }
  return null;
}

function buildScript(): string {
  const beside = join(dirname(fileURLToPath(import.meta.url)), 'buildCard.ts');
  if (existsSync(beside)) return beside;
  return join(process.cwd(), 'server', 'mcp', 'apps', 'buildCard.ts');
}

function runBuild(): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [buildScript()], { cwd: process.cwd() });
    const errors: Buffer[] = [];
    child.stderr.on('data', (chunk: Buffer) => errors.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(Buffer.concat(errors).toString('utf8').trim() || `Household card build exited ${code}.`));
    });
  });
}

let loading: Promise<string> | null = null;

/** HTML for the MCP App resource. Builds the card when the file is missing or older than its source. */
export function loadHouseholdCardHtml(): Promise<string> {
  loading ??= loadOnce().finally(() => {
    loading = null;
  });
  return loading;
}

async function loadOnce(): Promise<string> {
  const ready = await freshCard();
  if (ready) return readFile(ready, 'utf8');
  await runBuild();
  const built = await freshCard();
  if (!built) throw new Error('The household card HTML was not built.');
  return readFile(built, 'utf8');
}
