#!/usr/bin/env node
/**
 * Renders a seek(t) composition folder to MP4 and lays the narration under it.
 *
 *   node video/demo/render-demo.mjs ~/Downloads/agora-plus-demo                 full render
 *   node video/demo/render-demo.mjs ~/Downloads/agora-plus-demo --stills 5,20    review frames
 *
 * The page defines window.DURATION, window.AUDIO_CUES ([{ file, at }]) and an async window.seek(t)
 * that resolves once every image for that frame has decoded.
 */
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { mkdirSync, writeFileSync } from 'fs';
import { spawn } from 'child_process';
import path from 'path';
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const dir = path.resolve(args[0] ?? '.');
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const FPS = Number(flag('fps', '60'));
const stills = flag('stills', '');
const out = flag('out', path.join(dir, 'agora-plus-demo.mp4'));

const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const file = path.normalize(path.join(dir, decodeURIComponent(url.pathname)));
  if (!file.startsWith(dir)) { res.writeHead(403).end(); return; }
  try {
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream' }).end(await readFile(file));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;

const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--enable-gpu', '--use-gl=angle', '--use-angle=gl'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
page.on('pageerror', (error) => console.error('[page]', error.message));
page.on('console', (msg) => { if (msg.type() === 'error') console.error('[console]', msg.text()); });
await page.goto(`http://127.0.0.1:${port}/index.html?render=1`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.ready === true, null, { timeout: 120_000 });
const duration = await page.evaluate(() => window.DURATION);
const cues = await page.evaluate(() => window.AUDIO_CUES ?? []);
console.log(`duration ${duration}s · ${cues.length} narration clips`);

const frameAt = async (t) => {
  await page.evaluate((time) => window.seek(time), t);
  return page.screenshot({ type: 'png' });
};

if (stills) {
  const stillDir = flag('dir', path.join(dir, 'stills'));
  mkdirSync(stillDir, { recursive: true });
  for (const t of stills.split(',').map(Number)) {
    const file = path.join(stillDir, `t${t.toFixed(2).padStart(6, '0')}.png`);
    writeFileSync(file, await frameAt(t));
    console.log(file);
  }
  await browser.close();
  server.close();
  process.exit(0);
}

const silent = path.join(dir, 'video-only.mp4');
const ff = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
  '-c:v', 'h264_nvenc', '-preset', 'p7', '-tune', 'hq', '-rc', 'vbr', '-cq', '17', '-b:v', '0', '-profile:v', 'high',
  '-pix_fmt', 'yuv420p', silent], { stdio: ['pipe', 'inherit', 'inherit'] });
const frames = Math.round(duration * FPS);
const started = Date.now();
for (let f = 0; f < frames; f++) {
  const png = await frameAt(f / FPS);
  if (!ff.stdin.write(png)) await new Promise((resolve) => ff.stdin.once('drain', resolve));
  if (f % (FPS * 5) === 0) {
    const done = f / frames;
    const eta = done > 0 ? ((Date.now() - started) / done) * (1 - done) / 1000 : 0;
    console.log(`frame ${f}/${frames} · ${(done * 100).toFixed(1)}% · eta ${Math.round(eta)}s`);
  }
}
ff.stdin.end();
await new Promise((resolve) => ff.on('close', resolve));
await browser.close();
server.close();

// Narration: each clip delayed to its cue, mixed, then loudness-normalised for social and YouTube (-14 LUFS).
const inputs = cues.flatMap((cue) => ['-i', path.join(dir, cue.file)]);
const delays = cues.map((cue, i) => `[${i + 1}:a]adelay=${Math.round(cue.at * 1000)}|${Math.round(cue.at * 1000)}[a${i}]`);
const mix = `${delays.join(';')};${cues.map((_, i) => `[a${i}]`).join('')}amix=inputs=${cues.length}:normalize=0,apad,atrim=0:${duration},loudnorm=I=-14:TP=-1.5:LRA=11[aout]`;
const mux = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', silent, ...inputs,
  '-filter_complex', mix, '-map', '0:v', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
  '-movflags', '+faststart', '-shortest', out], { stdio: 'inherit' });
const code = await new Promise((resolve) => mux.on('close', resolve));
console.log(code === 0 ? `wrote ${out}` : `ffmpeg exited ${code}`);
