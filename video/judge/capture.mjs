#!/usr/bin/env node
/**
 * Extra captures for the judge cut: the household Home with an approval that came in over MCP, and the
 * public GitHub repository. The Home scenes reuse the Devpost captures (video/devpost/capture.mjs).
 *
 *   node video/judge/capture.mjs http://127.0.0.1:3300 ~/Downloads/agora-plus-judge/assets
 *
 * Before running it, ask the server to forget a fact over MCP so "Waiting for you" has a card.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { chromium } from '@playwright/test';

const BASE = process.argv[2] ?? 'http://127.0.0.1:3300';
const OUT = process.argv[3] ?? path.join(process.env.HOME ?? '.', 'Downloads', 'agora-plus-judge', 'assets');
const REPO = 'https://github.com/Ritesh-Root/agora-plus';
mkdirSync(OUT, { recursive: true });
const file = path.join(OUT, 'judge.json');
const manifest = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { shots: {}, boxes: {} };
const save = () => writeFileSync(file, JSON.stringify(manifest, null, 2));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: 'light' });
const page = await ctx.newPage();

async function shot(name) {
  await page.screenshot({ path: path.join(OUT, `${name}.jpg`), type: 'jpeg', quality: 90 });
  manifest.shots[name] = { file: `${name}.jpg` };
  save();
}
async function box(name, locator) {
  const b = await locator.first().boundingBox();
  if (b) manifest.boxes[name] = { x: b.x, y: b.y, width: b.width, height: b.height };
  save();
}

// The Home, with the MCP forget request waiting for a person.
// Approvals expire after ten minutes, so a later run keeps the earlier capture.
await page.goto(BASE, { waitUntil: 'networkidle' });
const waiting = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Waiting for you', exact: true }) });
try {
  await waiting.first().waitFor({ timeout: 8_000 });
  await sleep(800);
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(400);
  await shot('mcp-waiting');
  await box('waiting', waiting);
} catch {
  console.log('nothing is waiting for approval; keeping the earlier mcp-waiting capture');
}

// The public repository, scrolled to the README's first screen.
await page.goto(REPO, { waitUntil: 'networkidle' });
await sleep(1200);
await shot('repo-top');
const readme = page.locator('article.markdown-body').first();
if (await readme.count()) {
  await box('readme', readme);
  await page.evaluate(() => {
    const el = document.querySelector('article.markdown-body');
    if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 90);
  });
  await sleep(800);
  await shot('repo-readme');
}
await browser.close();
console.log(`wrote ${Object.keys(manifest.shots).join(', ')} to ${OUT}`);
