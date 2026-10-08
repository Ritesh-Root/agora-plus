/**
 * Temporary Cloud Run process. One instance holds the room in memory.
 * When every browser disconnects, Cloud Run may shut this process down and the room is gone.
 * A model call in flight is not a background job and is not saved.
 */
import { createReadStream, existsSync, statSync } from 'fs';
import { createServer } from 'http';
import { extname, join, resolve, sep } from 'path';
import { handleModelTest } from './modelTest';
import { attachRelay, handleCorsProxy } from './relay';

const port = Number(process.env.PORT) || 8080;
const root = resolve('dist');

const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.jsonl': 'application/jsonl',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

const server = createServer((req, res) => {
  if (handleCorsProxy(req, res) || handleModelTest(req, res)) return;
  const url = new URL(req.url ?? '/', 'http://localhost');
  const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  if (relative.includes('\0')) {
    res.writeHead(400).end();
    return;
  }
  const file = resolve(root, relative);
  const inside = file === root || file.startsWith(root + sep);
  let target = inside && existsSync(file) && statSync(file).isFile() ? file : join(root, 'index.html');
  if (!existsSync(target)) {
    res.writeHead(404).end('Not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': types[extname(target)] || 'application/octet-stream' });
  createReadStream(target).pipe(res);
});

attachRelay(server);
server.listen(port, '0.0.0.0', () => {
  console.log(`[agora] listening on 0.0.0.0:${port}`);
});
