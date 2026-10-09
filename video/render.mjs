#!/usr/bin/env node
/**
 * Renders video/index.html to an MP4, one exact frame at a time.
 *
 *   node video/render.mjs --out ~/Downloads/agora-plus-motion.mp4         full video, 60 fps
 *   node video/render.mjs --stills 3,16,25 --dir /tmp/stills               a few PNG frames to review
 *
 * Frames go straight into ffmpeg. NVENC is used when present, otherwise OpenH264.
 */
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { mkdirSync, writeFileSync } from 'fs';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const FPS = Number(flag('fps', '60'));
const out = flag('out', path.join(process.env.HOME ?? '.', 'Downloads', 'agora-plus-motion.mp4'));
const stills = flag('stills', '');
const stillsDir = flag('dir', path.join(root, 'video', 'stills'));
const encoder = flag('encoder', '');

const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const file = path.normalize(path.join(root, decodeURIComponent(url.pathname)));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;

// GPU first (ANGLE on desktop GL); MOTION_GL=swiftshader falls back to software WebGL.
const glArgs = process.env.MOTION_GL === 'swiftshader'
  ? ['--enable-unsafe-swiftshader', '--use-angle=swiftshader']
  : ['--ignore-gpu-blocklist', '--enable-gpu', '--use-gl=angle', '--use-angle=gl'];
const browser = await chromium.launch({ args: glArgs });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
page.on('pageerror', (error) => console.error('[page]', error.message));
await page.goto(`http://127.0.0.1:${port}/video/index.html?render=1`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.motionReady !== undefined, null, { timeout: 60_000 });
await page.evaluate(() => window.motionReady);
const gl = await page.evaluate(() => {
  const c = document.getElementById('gl');
  const ctx = c.getContext('webgl2');
  const info = ctx?.getExtension('WEBGL_debug_renderer_info');
  return info ? ctx.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'unknown';
});
const duration = await page.evaluate(() => window.DURATION);
console.log(`renderer: ${gl} · duration ${duration}s`);

const shot = async (t) => {
  await page.evaluate((time) => window.renderAt(time), t);
  return page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 1920, height: 1080 } });
};

if (stills) {
  mkdirSync(stillsDir, { recursive: true });
  for (const t of stills.split(',').map(Number)) {
    const png = await shot(t);
    const name = path.join(stillsDir, `t${String(t).padStart(5, '0')}.png`);
    writeFileSync(name, png);
    console.log(name);
  }
} else {
  const codec = encoder || 'h264_nvenc';
  const video = codec === 'libopenh264'
    ? ['-c:v', 'libopenh264', '-b:v', '18M', '-maxrate', '24M']
    : ['-c:v', codec, '-preset', 'p7', '-tune', 'hq', '-rc', 'vbr', '-cq', '17', '-b:v', '0', '-profile:v', 'high'];
  const ff = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
    ...video, '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const frames = Math.round(duration * FPS);
  const started = Date.now();
  for (let f = 0; f < frames; f++) {
    const png = await shot(f / FPS);
    if (!ff.stdin.write(png)) await new Promise((resolve) => ff.stdin.once('drain', resolve));
    if (f % (FPS * 5) === 0) {
      const done = f / frames;
      const eta = done > 0 ? ((Date.now() - started) / done - (Date.now() - started)) / 1000 : 0;
      console.log(`frame ${f}/${frames} · ${(done * 100).toFixed(1)}% · eta ${Math.round(eta)}s`);
    }
  }
  ff.stdin.end();
  const code = await new Promise((resolve) => ff.on('close', resolve));
  console.log(code === 0 ? `wrote ${out}` : `ffmpeg exited ${code}`);
}

await browser.close();
server.close();
