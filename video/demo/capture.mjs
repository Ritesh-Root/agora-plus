#!/usr/bin/env node
/**
 * Captures the real AGORA+ app for the narrated demo: 2x screenshots of each moment, typing
 * frames, a live screencast of the 3D office, and element boxes for the cursor.
 *
 *   node video/demo/capture.mjs http://127.0.0.1:3300 ~/Downloads/agora-plus-demo/assets
 *
 * Run it against a server with an empty AGORA_DATA_DIR. Headless Chromium has no microphone
 * or speech voices, so the page gets a stand-in for both: the talk button shows the state a
 * Chrome user sees, and spoken lines take a realistic time. Every request is typed for real.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { chromium } from '@playwright/test';

const BASE = process.argv[2] ?? 'http://127.0.0.1:3300';
const OUT = process.argv[3] ?? path.join(process.env.HOME ?? '.', 'Downloads', 'agora-plus-demo', 'assets');
mkdirSync(OUT, { recursive: true });
// `--from plan` resumes after the five quick requests, rebuilding their entries from the files on disk.
const FROM = process.argv.includes('--from') ? process.argv[process.argv.indexOf('--from') + 1] : 'start';
const manifestPath = path.join(OUT, 'manifest.json');
const manifest = existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, 'utf8'))
  : { viewport: { width: 1440, height: 900, scale: 2 }, shots: {}, typing: {}, boxes: {}, clips: {}, log: [] };
const save = () => writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
if (FROM !== 'start') {
  const files = readdirSync(OUT).filter((f) => f.endsWith('.jpg')).sort();
  for (const f of files) manifest.shots[f.replace(/\.jpg$/, '')] = f;
  for (const name of ['remember', 'recall', 'briefing', 'shopping', 'reminder']) {
    manifest.typing[name] = files.filter((f) => f.startsWith(`${name}-type-`));
  }
  if (!manifest.clips['office-clip'] && existsSync(path.join(OUT, 'office-clip'))) {
    const frames = readdirSync(path.join(OUT, 'office-clip')).filter((f) => f.endsWith('.jpg')).sort();
    manifest.clips['office-clip'] = frames.map((f, i) => ({ file: `office-clip/${f}`, t: Number(((i * 7) / frames.length).toFixed(4)) }));
  }
}
const note = (line) => { console.log(line); manifest.log.push(`${new Date().toISOString()} ${line}`); save(); };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const STAND_INS = () => {
  class Recognition {
    constructor() { this.lang = 'en-US'; this.onresult = null; this.onerror = null; this.onend = null; this.onstart = null; }
    start() { setTimeout(() => this.onstart?.(), 10); }
    stop() { setTimeout(() => this.onend?.(), 10); }
    abort() { this.stop(); }
  }
  window.SpeechRecognition = Recognition;
  window.webkitSpeechRecognition = Recognition;
  const query = navigator.permissions.query.bind(navigator.permissions);
  navigator.permissions.query = (descriptor) => (descriptor && descriptor.name === 'microphone'
    ? Promise.resolve({ state: 'granted', addEventListener() {}, removeEventListener() {} })
    : query(descriptor));
  const synth = {
    speaking: false, pending: false, paused: false, onvoiceschanged: null,
    getVoices: () => [], addEventListener() {}, removeEventListener() {}, pause() {}, resume() {},
    // Like a browser: cancel() ends the line in progress (firing onend) and drops the rest.
    current: null,
    cancel() {
      for (const id of synth.timers) clearTimeout(id);
      synth.timers = [];
      const line = synth.current;
      synth.current = null;
      if (line) setTimeout(() => line.onend?.(), 0);
    },
    timers: [],
    speak(utterance) {
      const ms = Math.min(2600, 500 + utterance.text.length * 45);
      synth.current = utterance;
      synth.timers.push(setTimeout(() => utterance.onstart?.(), 40));
      synth.timers.push(setTimeout(() => { if (synth.current === utterance) synth.current = null; utterance.onend?.(); }, 40 + ms));
    },
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
};

const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--enable-gpu', '--use-gl=angle', '--use-angle=gl'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await ctx.addInitScript(STAND_INS);

let shotCount = 0;
async function shot(page, name) {
  const file = `${name}.jpg`;
  await page.screenshot({ path: path.join(OUT, file), type: 'jpeg', quality: 92 });
  manifest.shots[name] = file;
  shotCount += 1;
  return file;
}
async function box(page, locator, name) {
  const b = await locator.boundingBox();
  if (b) manifest.boxes[name] = b;
  return b;
}

// Screencast: real frames from the compositor, with their timestamps.
async function screencast(page, name, seconds) {
  const dir = path.join(OUT, name);
  mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  let first = null;
  cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
    const t = metadata.timestamp;
    if (first === null) first = t;
    const file = `${name}/f${String(frames.length).padStart(4, '0')}.jpg`;
    writeFileSync(path.join(OUT, file), Buffer.from(data, 'base64'));
    frames.push({ file, t: Number((t - first).toFixed(4)) });
    await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: 2880, maxHeight: 1800, everyNthFrame: 1 });
  await sleep(seconds * 1000);
  await cdp.send('Page.stopScreencast');
  await cdp.detach();
  manifest.clips[name] = frames;
  note(`${name}: ${frames.length} frames over ${seconds}s`);
}

// ---- office: join first, so a household run animates here ----
const office = await ctx.newPage();
await office.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await office.locator('input[placeholder="e.g. Alex"]').fill('Ritesh');
await office.getByRole('button', { name: 'Join', exact: true }).click();
await sleep(4000);
if (FROM === 'start') {
  await shot(office, 'office-idle');
  await screencast(office, 'office-clip', 7);
}

// ---- voice page ----
const voice = await ctx.newPage();
await voice.goto(`${BASE}/alexa`, { waitUntil: 'networkidle' });
await sleep(1500);

// A small, real household to start from (the allergy is added on camera).
if (FROM === 'start') await voice.evaluate(async () => {
  const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  await post('/api/memory', { text: 'Jen goes to North School', tags: ['school'], who: 'Jen' });
  await post('/api/memory', { text: 'Sam is vegetarian', tags: ['diet'], who: 'Sam' });
  await post('/api/memory', { text: 'Jen likes Thai food', tags: ['food'], who: 'Jen' });
  const six = new Date();
  six.setHours(18, 0, 0, 0);
  const offset = -six.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const pad = (n) => String(Math.floor(Math.abs(n))).padStart(2, '0');
  const local = `${six.getFullYear()}-${pad(six.getMonth() + 1)}-${pad(six.getDate())}T18:00:00${sign}${pad(offset / 60)}:${pad(offset % 60)}`;
  await post('/api/tasks', { title: 'Call Grandma', who: 'Jen', dueAt: local });
});
await voice.reload({ waitUntil: 'networkidle' });
await sleep(1500);
if (FROM === 'start') await shot(voice, 'alexa-idle');
const input = voice.locator('#alexa-utterance');
await box(voice, input, 'input');
await box(voice, voice.locator('#talk-btn'), 'talk');
await box(voice, voice.locator('[data-testid="alexa-trace"]'), 'trace');
await box(voice, voice.locator('[data-testid="alexa-device"]'), 'device');

async function ask(name, text, waits = [150, 900, 2000, 3600]) {
  await input.click();
  const frames = [];
  for (let i = 0; i <= text.length; i += 2) {
    await input.fill(text.slice(0, i));
    frames.push(await shot(voice, `${name}-type-${String(frames.length).padStart(2, '0')}`));
  }
  await input.fill(text);
  frames.push(await shot(voice, `${name}-type-${String(frames.length).padStart(2, '0')}`));
  manifest.typing[name] = frames;
  await input.press('Enter');
  const start = Date.now();
  for (const [k, ms] of waits.entries()) {
    await sleep(Math.max(0, start + ms - Date.now()));
    await shot(voice, `${name}-after-${k}`);
  }
  note(`${name}: typed and answered`);
}

if (FROM === 'start') {
  await ask('remember', 'Remember Mia is allergic to peanuts');
  await ask('recall', 'What is Mia allergic to?');
  await ask('briefing', "What's my briefing?");
  await ask('shopping', 'Add milk to my shopping list');
  await ask('reminder', 'Remind me in 10 minutes to check the oven');
}

// Plan: the server model writes the steps, then the page waits for a person.
await ask('plan', 'Plan dinners for this week', [150, 900]);
const approval = voice.locator('[data-testid="alexa-approval"]');
await approval.waitFor({ state: 'visible', timeout: 120_000 });
await sleep(1200);
await shot(voice, 'plan-approval');
const approve = approval.getByRole('button', { name: 'Approve' });
await box(voice, approve, 'approve');
await box(voice, approval, 'approvalCard');
await approve.click();
await sleep(400);
await shot(voice, 'plan-approved-0');
await sleep(2000);
await shot(voice, 'plan-approved-1');
note('plan approved');

// ---- the team at work in the office ----
await office.bringToFront();
await sleep(2500);
await shot(office, 'office-run-0');
await sleep(12_000);
await shot(office, 'office-run-1');
const done = await (async () => {
  for (let i = 0; i < 60; i++) {
    const run = await office.evaluate(async () => (await (await fetch('/api/household')).json()).recentRuns?.[0]);
    if (run && run.status !== 'running') return run;
    await sleep(5000);
  }
  return null;
})();
note(`run finished: ${done?.status ?? 'timeout'} · ${done?.spokenSummary ?? ''}`);
manifest.run = done;
await sleep(2500);
await shot(office, 'office-done');
const keeper = office.getByText('Keeper says', { exact: false }).first();
if (await keeper.count()) await box(office, keeper, 'keeper');

// The voice page announces the finished plan.
await voice.bringToFront();
await sleep(32_000);
await shot(voice, 'plan-finished');

// ---- household panel ----
await office.bringToFront();
// The header keeps animating, so click through the DOM rather than waiting for it to settle.
const closeView = office.getByRole('button', { name: /close view/i });
if (await closeView.count()) await closeView.first().evaluate((el) => el.click());
await sleep(1500);
await shot(office, 'office-after');
await office.locator('[data-testid=household-btn]').evaluate((el) => el.click());
await sleep(1800);
await shot(office, 'household-panel');

note(`saved ${shotCount} shots to ${OUT}`);
await browser.close();
