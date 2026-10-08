import { EventEmitter } from 'events';
import type { IncomingMessage, ServerResponse } from 'http';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setDataDir } from './household/store';
import { handleApiRoutes } from './routes';

let dir = '';
const savedPasscode = process.env.AGORA_HOUSEHOLD_PASSCODE;

beforeEach(async () => {
  delete process.env.AGORA_HOUSEHOLD_PASSCODE;
  dir = await mkdtemp(path.join(tmpdir(), 'agora-routes-'));
  setDataDir(dir);
});

afterEach(async () => {
  if (savedPasscode === undefined) delete process.env.AGORA_HOUSEHOLD_PASSCODE;
  else process.env.AGORA_HOUSEHOLD_PASSCODE = savedPasscode;
  await rm(dir, { recursive: true, force: true });
});

function call(method: string, url: string, headers: Record<string, string>): Promise<{ status: number; body: string; handled: boolean }> {
  const req = new EventEmitter() as IncomingMessage;
  req.method = method;
  req.url = url;
  req.headers = headers;
  req.resume = () => req;
  const res = new EventEmitter() as ServerResponse & { statusCode: number; body: string };
  res.statusCode = 0;
  res.body = '';
  res.writeHead = ((status: number) => {
    res.statusCode = status;
    return res;
  }) as ServerResponse['writeHead'];
  res.end = ((body?: string) => {
    res.body = body ?? '';
    res.emit('done');
    return res;
  }) as ServerResponse['end'];
  const handled = handleApiRoutes(req, res);
  return new Promise((resolve) => {
    if (!handled) {
      resolve({ status: 0, body: '', handled: false });
      return;
    }
    if (res.body || res.statusCode) {
      resolve({ status: res.statusCode, body: res.body, handled: true });
      return;
    }
    res.once('done', () => resolve({ status: res.statusCode, body: res.body, handled: true }));
  });
}

describe('household routes', () => {
  it('rejects a write whose Origin host is not the Host header', async () => {
    const result = await call('POST', '/api/memory', {
      origin: 'https://evil.example',
      host: 'localhost:3000',
      'content-type': 'application/json',
    });
    expect(result.handled).toBe(true);
    expect(result.status).toBe(403);
    expect(result.body).not.toContain('stack');
  });

  it('returns the household snapshot', async () => {
    const result = await call('GET', '/api/household', { host: 'localhost:3000' });
    expect(result.status).toBe(200);
    const body = JSON.parse(result.body) as Record<string, unknown>;
    expect(body.memory).toEqual([]);
    expect(body.tasks).toEqual([]);
    expect(body.pendingApprovals).toEqual([]);
    expect(body.recentRuns).toEqual([]);
  });

  it('leaves other paths to the rest of the server', async () => {
    const result = await call('GET', '/', { host: 'localhost:3000' });
    expect(result.handled).toBe(false);
  });
});
