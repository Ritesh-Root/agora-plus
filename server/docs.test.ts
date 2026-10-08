import { existsSync, readdirSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function markdownFiles(): string[] {
  const docsDir = path.join(root, 'docs');
  const docs = readdirSync(docsDir)
    .filter((name) => name.endsWith('.md'))
    .map((name) => path.join(docsDir, name));
  return [path.join(root, 'README.md'), ...docs];
}

function isExternal(url: string): boolean {
  return /^(https?:|mailto:|tel:|data:)/i.test(url) || url.startsWith('//');
}

/** Inline links and image links, plus relative src/href in HTML. Fenced code is skipped. */
function localTargets(text: string): { line: number; url: string }[] {
  const found: { line: number; url: string }[] = [];
  let fenced = false;
  const lines = text.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim().startsWith('```')) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const md = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
    const html = /\b(?:src|href)="([^"]+)"/g;
    for (const match of line.matchAll(md)) found.push({ line: index + 1, url: match[1] });
    for (const match of line.matchAll(html)) found.push({ line: index + 1, url: match[1] });
  }
  return found;
}

function fileTarget(fromFile: string, raw: string): string | null {
  let url = raw.trim();
  if (url.startsWith('<') && url.endsWith('>')) url = url.slice(1, -1);
  if (!url || url.startsWith('#') || isExternal(url)) return null;
  const hash = url.indexOf('#');
  const query = url.indexOf('?');
  let end = url.length;
  if (hash >= 0) end = Math.min(end, hash);
  if (query >= 0) end = Math.min(end, query);
  url = url.slice(0, end);
  if (!url) return null;
  try {
    url = decodeURIComponent(url);
  } catch {
    return path.join(path.dirname(fromFile), raw);
  }
  return path.resolve(path.dirname(fromFile), url);
}

describe('submission docs', () => {
  it('resolves every relative link in README.md and docs/*.md', () => {
    const missing: string[] = [];
    for (const file of markdownFiles()) {
      const text = readFileSync(file, 'utf8');
      for (const hit of localTargets(text)) {
        const target = fileTarget(file, hit.url);
        if (!target) continue;
        if (!existsSync(target)) {
          missing.push(`${path.relative(root, file)}:${hit.line} -> ${hit.url}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
