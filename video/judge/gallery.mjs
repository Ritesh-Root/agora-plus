#!/usr/bin/env node
/**
 * 3:2 stills of the judge cut for the Devpost image gallery (1920x1280 JPG, under 5 MB each).
 * The 16:9 frame sits in a taller stage, so nothing is cropped.
 *
 *   node video/judge/gallery.mjs ~/Downloads/agora-plus-judge ~/Downloads/agora-plus-gallery
 */
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { mkdirSync } from 'fs';
import path from 'path';
import { chromium } from '@playwright/test';

const dir = path.resolve(process.argv[2] ?? '.');
const out = path.resolve(process.argv[3] ?? path.join(process.env.HOME ?? '.', 'Downloads', 'agora-plus-gallery'));
mkdirSync(out, { recursive: true });

const STILLS = [
  ['01-home-after-a-plan', 158.6],
  ['02-remember-with-a-receipt', 26.3],
  ['03-recall-with-no-model-call', 38.0],
  ['04-it-asks-first', 64.5],
  ['05-keeper-flags-the-allergy', 77.5],
  ['06-claude-code-over-mcp', 93.6],
  ['07-locked-by-default', 102.2],
  ['08-waiting-for-a-person', 105.6],
  ['09-architecture', 121.6],
  ['10-built-for-aws', 133.5],
  ['11-alexa-addon-and-skill', 146.0],
  ['12-end-card', 166.0],
];

const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
const server = createServer(async (req, res) => {
  const file = path.normalize(path.join(dir, decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname)));
  if (!file.startsWith(dir)) { res.writeHead(403).end(); return; }
  try {
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream' }).end(await readFile(file));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1280 }, deviceScaleFactor: 1 });
await page.goto(`http://127.0.0.1:${server.address().port}/index.html?render=1`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.ready === true, null, { timeout: 120_000 });
// Every layer moves down 100px, so the 1080 frame sits in the middle of a 1280 stage.
await page.addStyleTag({ content: `
  #stage { height: 1280px !important; }
  #win, #phone, #cursor { top: 100px !important; }
  #term { top: 268px !important; }
  #arch, #cards, #titles, #callouts { top: 100px !important; bottom: auto !important; height: 1080px !important; }
` });
for (const [name, t] of STILLS) {
  await page.evaluate((time) => window.seek(time), t);
  await page.screenshot({ path: path.join(out, `${name}.jpg`), type: 'jpeg', quality: 90 });
  console.log(`${name}.jpg`);
}
await browser.close();
server.close();
