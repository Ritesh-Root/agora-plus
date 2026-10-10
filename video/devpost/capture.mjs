#!/usr/bin/env node
/**
 * Captures the household Home for the Devpost video: 2x viewport screenshots of each moment,
 * typing frames, real scroll sequences, a time-lapse of a live team run, and element boxes
 * for the camera and the cursor.
 *
 *   node video/devpost/capture.mjs http://127.0.0.1:3300 ~/Downloads/agora-plus-devpost/assets
 *
 * Run it against a server with a freshly seeded AGORA_DATA_DIR. Headless Chromium has no
 * microphone or voices, so the page gets a stand-in for both. Every request is typed for real
 * and every answer, receipt, and plan comes from the running server.
 */
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { chromium } from '@playwright/test';

const BASE = process.argv[2] ?? 'http://127.0.0.1:3300';
const OUT = process.argv[3] ?? path.join(process.env.HOME ?? '.', 'Downloads', 'agora-plus-devpost', 'assets');
mkdirSync(OUT, { recursive: true });
const manifest = { viewport: { width: 1440, height: 900, scale: 2 }, shots: {}, seqs: {}, boxes: {}, run: null, log: [] };
const save = () => writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
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
    speaking: false, pending: false, paused: false, onvoiceschanged: null, current: null, timers: [],
    getVoices: () => [], addEventListener() {}, removeEventListener() {}, pause() {}, resume() {},
    cancel() {
      for (const id of synth.timers) clearTimeout(id);
      synth.timers = [];
      const line = synth.current;
      synth.current = null;
      if (line) setTimeout(() => line.onend?.(), 0);
    },
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
const page = await ctx.newPage();
page.on('pageerror', (error) => note(`page error: ${error.message}`));

async function shot(name) {
  const file = `${name}.jpg`;
  await page.screenshot({ path: path.join(OUT, file), type: 'jpeg', quality: 90 });
  manifest.shots[name] = { file, scrollY: await page.evaluate(() => Math.round(window.scrollY)) };
  return file;
}
/** Boxes are page coordinates (viewport box + scrollY), so the composition can follow a scroll. */
async function box(name, locator) {
  const first = locator.first();
  if (!(await first.count())) return null;
  const b = await first.boundingBox();
  if (!b) return null;
  const scrollY = await page.evaluate(() => window.scrollY);
  manifest.boxes[name] = { x: b.x, y: b.y + scrollY, width: b.width, height: b.height };
  return manifest.boxes[name];
}
const card = (title) => page.locator('section').filter({ has: page.getByRole('heading', { name: title, exact: true }) });

async function boxes(prefix = '') {
  await box(`${prefix}assistant`, page.getByTestId('alexa-device'));
  await box(`${prefix}input`, page.locator('#alexa-utterance'));
  await box(`${prefix}ring`, page.getByTestId('alexa-ring'));
  await box(`${prefix}caption`, page.getByTestId('alexa-caption'));
  await box(`${prefix}today`, card('Today'));
  await box(`${prefix}shopping`, card('Shopping'));
  await box(`${prefix}todo`, card('To-do'));
  await box(`${prefix}plans`, card('Plans'));
  await box(`${prefix}family`, card('Family'));
  await box(`${prefix}greeting`, page.locator('main > section').first());
}

/** A real scroll from one position to another, one screenshot per step. */
async function scrollSeq(name, from, to, frames) {
  const list = [];
  for (let i = 0; i < frames; i++) {
    const p = i / (frames - 1);
    const y = Math.round(from + (to - from) * p);
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await sleep(90);
    list.push({ file: await shot(`${name}-${String(i).padStart(2, '0')}`), y: await page.evaluate(() => Math.round(window.scrollY)) });
  }
  manifest.seqs[name] = list;
  save();
}
const maxScroll = () => page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
const scrollTop = async () => { await page.evaluate(() => window.scrollTo(0, 0)); await sleep(150); };

const input = page.locator('#alexa-utterance');
async function ask(name, text, waits = [150, 900, 2000, 3400]) {
  await scrollTop();
  await input.click();
  const frames = [];
  for (let i = 0; i <= text.length; i += 2) {
    await input.fill(text.slice(0, i));
    frames.push(await shot(`${name}-type-${String(frames.length).padStart(2, '0')}`));
  }
  await input.fill(text);
  frames.push(await shot(`${name}-type-${String(frames.length).padStart(2, '0')}`));
  manifest.seqs[`${name}-type`] = frames.map((file) => ({ file, y: 0 }));
  await input.press('Enter');
  const start = Date.now();
  for (const [k, ms] of waits.entries()) {
    await sleep(Math.max(0, start + ms - Date.now()));
    await shot(`${name}-after-${k}`);
  }
  note(`${name}: typed and answered`);
}

// ---- Home at rest ----
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await sleep(2500);
await shot('home-idle');
await boxes('idle-');
await box('hoodBtn', page.getByRole('button', { name: 'Under the hood', exact: true }));
await box('connectBtn', page.getByRole('button', { name: 'Connect', exact: true }));
await scrollSeq('tour', 0, await maxScroll(), 44);
await scrollTop();
note('home tour captured');

// ---- 01 memory ----
await ask('remember', 'Remember Mia is allergic to peanuts');
await sleep(1200);
await shot('remember-done');
await box('receipt', page.getByText(/Saved to memory/));
await box('briefing-chips', page.locator('main > section ul').first());
const familyTop = (await card('Family').boundingBox())?.y ?? 900;
await scrollSeq('family', 0, Math.min(await maxScroll(), Math.round(familyTop - 90)), 22);
await box('family-mia', page.getByText('Mia is allergic to peanuts', { exact: true }));
await box('family-card', card('Family'));
await shot('family-allergy');
await scrollTop();

// ---- 02 recall, with the trace open beside the page ----
await page.getByRole('button', { name: 'Under the hood', exact: true }).click();
await sleep(600);
await ask('recall', 'What is Mia allergic to?');
await sleep(800);
await shot('recall-hood');
await box('trace', page.getByTestId('alexa-trace'));
await box('trace-fast', page.getByTestId('alexa-trace').getByText('fast path · no model'));
await page.getByRole('button', { name: 'Under the hood', exact: true }).click();
await sleep(500);

// ---- 03 lists ----
await ask('shopping', 'Add milk to my shopping list');
await sleep(1500);
await shot('shopping-done');
await boxes('shop-');
await box('milk', page.getByRole('checkbox', { name: 'Mark milk done' }));
await page.getByRole('checkbox', { name: 'Mark milk done' }).click();
await sleep(350);
await shot('milk-ticked-0');
await sleep(1500);
await shot('milk-ticked-1');
await box('basket', page.getByText(/In the basket/));
await page.getByText(/In the basket/).click();
await sleep(600);
await shot('basket-open');
await page.getByText(/In the basket/).click();
await sleep(300);

// ---- 04 briefing ----
await ask('briefing', "What's my briefing?", [150, 900, 2000, 3800]);

// ---- 05 approval ----
await ask('plan', 'Plan dinners for this week', [150, 1000, 2500]);
const approval = page.getByTestId('alexa-approval');
const thinkStart = Date.now();
let thinking = 0;
while (!(await approval.isVisible()) && Date.now() - thinkStart < 150_000) {
  await shot(`plan-think-${String(thinking++).padStart(2, '0')}`);
  await sleep(1000);
}
note(`approval card after ${Math.round((Date.now() - thinkStart) / 1000)} s (${thinking} thinking frames)`);
manifest.seqs['plan-think'] = Array.from({ length: thinking }, (_, i) => ({ file: `plan-think-${String(i).padStart(2, '0')}.jpg`, y: 0 }));
await sleep(1200);
await shot('plan-approval');
await box('approvalCard', approval);
await box('approve', approval.getByRole('button', { name: 'Approve' }));
await approval.getByRole('button', { name: 'Approve' }).click();
await sleep(400);
await shot('plan-approved-0');
await sleep(1600);
await shot('plan-approved-1');

// ---- 06 the team, live on the Plans card ----
const team = [];
const runStart = Date.now();
let run = null;
for (let i = 0; Date.now() - runStart < 420_000; i++) {
  const file = await shot(`team-${String(i).padStart(3, '0')}`);
  run = await page.evaluate(async () => (await (await fetch('/api/household')).json()).recentRuns?.[0] ?? null);
  team.push({ file, at: Math.round((Date.now() - runStart) / 100) / 10, status: run?.status, tasks: (run?.tasks ?? []).map((t) => `${t.role}:${t.status}`) });
  if (i === 2) await box('plans-running', card('Plans'));
  if (run && run.status !== 'running' && run.status !== 'cancel_requested') break;
  await sleep(1500);
}
manifest.seqs.team = team;
manifest.run = run ? { status: run.status, brief: run.brief, spokenSummary: run.spokenSummary, error: run.error, tasks: run.tasks } : null;
note(`run ${run?.status ?? 'timeout'} after ${Math.round((Date.now() - runStart) / 1000)} s · ${run?.spokenSummary ?? run?.error ?? ''}`);
await sleep(4000);
await shot('plan-done');
await box('plans-done', card('Plans'));
await box('readPlan', page.getByRole('button', { name: 'Read plan' }));
await box('done-caption', page.getByTestId('alexa-caption'));

// ---- the finished plan, in the page ----
if (await page.getByRole('button', { name: 'Read plan' }).count()) {
  await page.getByRole('button', { name: 'Read plan' }).first().click();
  await sleep(1800);
  await shot('plan-sheet');
  await page.locator('[role="dialog"] .markdown-content').first().evaluate((el) => el.parentElement?.scrollBy(0, 420)).catch(() => {});
  await sleep(500);
  await shot('plan-sheet-2');
  await page.keyboard.press('Escape');
  await sleep(500);
}

// ---- 07 under the hood and connect ----
await page.getByRole('button', { name: 'Under the hood', exact: true }).click();
await sleep(800);
await shot('hood');
await box('hood-panel', page.getByTestId('alexa-trace'));
await page.getByRole('button', { name: 'Under the hood', exact: true }).click();
await sleep(400);
await page.getByRole('button', { name: 'Connect', exact: true }).click();
await sleep(800);
await shot('connect');
await box('connect-panel', page.getByRole('dialog', { name: 'Use your household from anywhere' }));
await page.keyboard.press('Escape');
await sleep(400);
await shot('home-final');
await boxes('final-');
await scrollSeq('tour-final', 0, await maxScroll(), 36);
await scrollTop();

// ---- phone ----
const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await phoneCtx.addInitScript(STAND_INS);
const phone = await phoneCtx.newPage();
await phone.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await sleep(2500);
const phoneMax = await phone.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
const phoneFrames = [];
for (let i = 0; i < 40; i++) {
  const y = Math.round((phoneMax * i) / 39);
  await phone.evaluate((top) => window.scrollTo(0, top), y);
  await sleep(90);
  const file = `phone-${String(i).padStart(2, '0')}.jpg`;
  await phone.screenshot({ path: path.join(OUT, file), type: 'jpeg', quality: 90 });
  phoneFrames.push({ file, y });
}
manifest.seqs.phone = phoneFrames;
note(`saved ${Object.keys(manifest.shots).length} shots and ${Object.keys(manifest.seqs).length} sequences to ${OUT}`);
await browser.close();
