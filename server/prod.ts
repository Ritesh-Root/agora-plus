/**
 * Temporary Cloud Run process. One instance holds the room in memory.
 * When every browser disconnects, Cloud Run may shut this process down and the room is gone.
 * A model call in flight is not a background job and is not saved.
 */
import { createReadStream, existsSync, statSync } from 'fs';
import { createServer } from 'http';
import path, { extname, join, resolve, sep } from 'path';
import { pathToFileURL } from 'url';
import { householdLockEnabled } from './household/session';
import { noteBindHost } from './hub';
import { handleModelTest } from './modelTest';
import { handleMcpRoutes } from './mcp/http';
import { handleApiRoutes } from './routes';
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
  if (handleCorsProxy(req, res) || handleModelTest(req, res) || handleApiRoutes(req, res) || handleMcpRoutes(req, res)) return;
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

/** `0.0.0.0` only when a household passcode is set. Otherwise stay on loopback. */
export function productionBindHost(): '127.0.0.1' | '0.0.0.0' {
  return householdLockEnabled() ? '0.0.0.0' : '127.0.0.1';
}

function isProductionEntry(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(path.resolve(entry)).href;
  } catch {
    return false;
  }
}

if (isProductionEntry()) {
  const host = productionBindHost();
  noteBindHost(host);
  attachRelay(server);
  server.listen(port, host, () => {
    if (host === '127.0.0.1') {
      console.log(`[agora] listening on 127.0.0.1:${port} because AGORA_HOUSEHOLD_PASSCODE is not set. The household stays on this machine.`);
      return;
    }
    if (!process.env.DEMO_HOST_SECRET?.trim()) {
      console.log(`[agora] listening on 0.0.0.0:${port}. DEMO_HOST_SECRET is unset, so the household session is the room host.`);
      return;
    }
    console.log(`[agora] listening on 0.0.0.0:${port}`);
  });
}
