#!/usr/bin/env node
/**
 * Renders a seek(t) composition folder to MP4 and lays the narration under it.
 *
 *   node video/demo/render-demo.mjs ~/Downloads/agora-plus-demo                 full render
 *   node video/demo/render-demo.mjs ~/Downloads/agora-plus-demo --stills 5,20    review frames
 *   node video/demo/render-demo.mjs ~/Downloads/agora-plus-demo --audio-only     keep the frames, redo the sound
 *
 * The page defines window.DURATION, window.AUDIO_CUES ([{ file, at }]), optionally window.MUSIC (a bed
 * that ducks under the voice), and an async window.seek(t)
 * that resolves once every image for that frame has decoded.
 */
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { spawn, spawnSync } from 'child_process';
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
const music = await page.evaluate(() => window.MUSIC ?? null);
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
// --audio-only keeps the frames already in video-only.mp4 and redoes the sound.
if (!args.includes('--audio-only') || !existsSync(silent)) {
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
}
await browser.close();
server.close();

// Narration: each clip delayed to its cue and mixed. When the page names window.MUSIC, the bed sits under
// the voice and ducks while it speaks. Speech peaks too high for plain gain to reach -14 LUFS, so the mix
// gets a measured gain into a limiter at -1.7 dBFS, measured again, and corrected once.
const TARGET = -14;
const inputs = [...cues.flatMap((cue) => ['-i', path.join(dir, cue.file)]), ...(music ? ['-i', path.join(dir, music)] : [])];
const delays = cues.map((cue, i) => `[${i + 1}:a]adelay=${Math.round(cue.at * 1000)}|${Math.round(cue.at * 1000)}[a${i}]`);
const voice = `${delays.join(';')};${cues.map((_, i) => `[a${i}]`).join('')}amix=inputs=${cues.length}:normalize=0,apad,atrim=0:${duration},aformat=channel_layouts=stereo`;
const graph = music
  ? `${voice},asplit=2[v][key];[${cues.length + 1}:a]aresample=48000,volume=0.42,apad,atrim=0:${duration}[bed];`
    + '[bed][key]sidechaincompress=threshold=0.02:ratio=5:attack=25:release=420[duck];[v][duck]amix=inputs=2:normalize=0[mix]'
  : `${voice}[mix]`;
// The narration clips are mono; keep the mix stereo so the music keeps its width.
const master = (gain) => `volume=${gain.toFixed(2)}dB,alimiter=limit=0.82:attack=3:release=60:level=0,aresample=48000,aformat=channel_layouts=stereo`;
/** Integrated loudness of the mix after `chain`. */
const loudness = (chain) => {
  const run = spawnSync('ffmpeg', ['-hide_banner', '-i', silent, ...inputs, '-filter_complex', `${graph};[mix]${chain}ebur128=framelog=quiet[m]`,
    '-map', '[m]', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const found = [...run.stderr.matchAll(/I:\s+(-?[\d.]+) LUFS/g)].pop();
  if (!found) throw new Error(`could not measure loudness: ${run.stderr.slice(-400)}`);
  return Number(found[1]);
};
const raw = loudness('');
let gain = TARGET - raw;
gain += TARGET - loudness(`${master(gain)},`);
const final = loudness(`${master(gain)},`);
const mux = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', silent, ...inputs,
  '-filter_complex', `${graph};[mix]${master(gain)}[aout]`, '-map', '0:v', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
  '-movflags', '+faststart', '-shortest', out], { stdio: 'inherit' });
const code = await new Promise((resolve) => mux.on('close', resolve));
console.log(code === 0 ? `wrote ${out} (mix ${raw} LUFS, +${gain.toFixed(1)} dB, master ${final} LUFS)` : `ffmpeg exited ${code}`);
