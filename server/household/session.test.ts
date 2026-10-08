import { EventEmitter } from 'events';
import type { IncomingMessage, ServerResponse } from 'http';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { verifySessionToken } from './session';
import { setDataDir, writeText } from './store';
import { handleApiRoutes } from '../routes';

const RUN_ID = '11111111-1111-4111-8111-111111111111';

let dir = '';
const saved: Record<string, string | undefined> = {};

function remember(name: string): void {
  saved[name] = process.env[name];
}

beforeEach(async () => {
  remember('AGORA_HOUSEHOLD_PASSCODE');
  remember('AGORA_TOKEN_SECRET');
  process.env.AGORA_HOUSEHOLD_PASSCODE = 'home-pass';
  process.env.AGORA_TOKEN_SECRET = 'session-secret';
  dir = await mkdtemp(path.join(tmpdir(), 'agora-session-'));
  setDataDir(dir);
});

afterEach(async () => {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  await rm(dir, { recursive: true, force: true });
});

function call(
  method: string,
  url: string,
  headers: Record<string, string>,
  json?: unknown,
): Promise<{ status: number; body: string; headers: Record<string, string> }> {
  const req = new EventEmitter() as IncomingMessage;
  req.method = method;
  req.url = url;
  req.headers = headers;
  req.resume = () => req;
  const res = new EventEmitter() as ServerResponse & { statusCode: number; body: string; headers: Record<string, string> };
  res.statusCode = 0;
  res.body = '';
  res.headers = {};
  res.writeHead = ((status: number, extra?: Record<string, string>) => {
    res.statusCode = status;
    res.headers = extra ?? {};
    return res;
  }) as ServerResponse['writeHead'];
  res.end = ((body?: string) => {
    res.body = body ?? '';
    res.emit('done');
    return res;
  }) as ServerResponse['end'];
  const handled = handleApiRoutes(req, res);
  if (!handled) return Promise.resolve({ status: 0, body: '', headers: {} });
  if (json !== undefined) {
    req.emit('data', Buffer.from(JSON.stringify(json)));
    req.emit('end');
  }
  return new Promise((resolve) => {
    const finish = () => resolve({ status: res.statusCode, body: res.body, headers: res.headers });
    if (res.body || res.statusCode) {
      finish();
      return;
    }
    res.once('done', finish);
  });
}

function cookieFrom(headers: Record<string, string>): string {
  const match = /^agora_household=([^;]*)/.exec(headers['Set-Cookie'] ?? '');
  return match?.[1] ?? '';
}

describe('household session', () => {
  it('signs a cookie that verifies, and rejects a tampered one', async () => {
    const result = await call('POST', '/api/session', { host: 'localhost:3000', 'content-type': 'application/json' }, { passcode: 'home-pass' });
    expect(result.status).toBe(200);
    const token = cookieFrom(result.headers);
    expect(token).not.toBe('');
    expect(result.headers['Set-Cookie']).toContain('HttpOnly');
    expect(result.headers['Set-Cookie']).toContain('SameSite=Strict');
    expect(result.headers['Set-Cookie']).toContain('Path=/');
    expect(result.headers['Set-Cookie']).not.toContain('Secure');
    expect(verifySessionToken(token)).toBe(true);
    expect(verifySessionToken(`${token}x`)).toBe(false);
  });

  it('locks household routes until the cookie is presented', async () => {
    const locked = await call('GET', '/api/household', { host: 'localhost:3000' });
    expect(locked.status).toBe(401);
    expect(JSON.parse(locked.body)).toEqual({ error: 'household_locked' });

    const session = await call('GET', '/api/session', { host: 'localhost:3000' });
    expect(JSON.parse(session.body)).toEqual({ required: true, active: false });

    const posted = await call('POST', '/api/session', { host: 'localhost:3000', 'content-type': 'application/json' }, { passcode: 'home-pass' });
    const token = cookieFrom(posted.headers);
    const open = await call('GET', '/api/household', { host: 'localhost:3000', cookie: `agora_household=${token}` });
    expect(open.status).toBe(200);

    const active = await call('GET', '/api/session', { host: 'localhost:3000', cookie: `agora_household=${token}` });
    expect(JSON.parse(active.body)).toEqual({ required: true, active: true });

    const cleared = await call('DELETE', '/api/session', { host: 'localhost:3000', cookie: `agora_household=${token}` });
    expect(cleared.status).toBe(200);
    expect(cleared.headers['Set-Cookie']).toContain('Max-Age=0');
    const again = await call('GET', '/api/memory', { host: 'localhost:3000' });
    expect(again.status).toBe(401);
  });

  it('waits before rejecting a wrong passcode', async () => {
    const started = Date.now();
    const result = await call('POST', '/api/session', { host: 'localhost:3000', 'content-type': 'application/json' }, { passcode: 'nope' });
    expect(result.status).toBe(401);
    expect(JSON.parse(result.body)).toEqual({ error: 'invalid_passcode' });
    expect(Date.now() - started).toBeGreaterThanOrEqual(200);
  });

  it('leaves the routes open when no passcode is configured', async () => {
    delete process.env.AGORA_HOUSEHOLD_PASSCODE;
    const household = await call('GET', '/api/household', { host: 'localhost:3000' });
    expect(household.status).toBe(200);
    const session = await call('GET', '/api/session', { host: 'localhost:3000' });
    expect(JSON.parse(session.body)).toEqual({ required: false, active: false });
    await writeText(`runs/${RUN_ID}.md`, '# Dinner\n');
    const document = await call('GET', `/api/runs/${RUN_ID}/document`, { host: 'localhost:3000' });
    expect(document.status).toBe(200);
    expect(document.body).toBe('# Dinner\n');
    expect(document.headers['Content-Type']).toContain('text/markdown');
  });

  it('locks the run document with the other household routes', async () => {
    await writeText(`runs/${RUN_ID}.md`, '# Dinner\n');
    const locked = await call('GET', `/api/runs/${RUN_ID}/document`, { host: 'localhost:3000' });
    expect(locked.status).toBe(401);
  });
});
