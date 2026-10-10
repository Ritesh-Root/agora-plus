import { EventEmitter } from 'events';
import type { IncomingMessage, ServerResponse } from 'http';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearPendingApprovals } from './household/approvals';
import { setDataDir } from './household/store';
import { handleApiRoutes } from './routes';

let dir = '';
const savedPasscode = process.env.AGORA_HOUSEHOLD_PASSCODE;
const savedSecret = process.env.AGORA_TOKEN_SECRET;

beforeEach(async () => {
  delete process.env.AGORA_HOUSEHOLD_PASSCODE;
  process.env.AGORA_TOKEN_SECRET = 'route-secret-0123456789abcdef';
  clearPendingApprovals();
  dir = await mkdtemp(path.join(tmpdir(), 'agora-routes-'));
  setDataDir(dir);
});

afterEach(async () => {
  if (savedPasscode === undefined) delete process.env.AGORA_HOUSEHOLD_PASSCODE;
  else process.env.AGORA_HOUSEHOLD_PASSCODE = savedPasscode;
  if (savedSecret === undefined) delete process.env.AGORA_TOKEN_SECRET;
  else process.env.AGORA_TOKEN_SECRET = savedSecret;
  clearPendingApprovals();
  await rm(dir, { recursive: true, force: true });
});

function call(
  method: string,
  url: string,
  headers: Record<string, string>,
  json?: unknown,
  remoteAddress = '127.0.0.1',
): Promise<{ status: number; body: string; handled: boolean; headers: Record<string, string> }> {
  const req = new EventEmitter() as IncomingMessage;
  req.method = method;
  req.url = url;
  req.headers = headers;
  req.resume = () => req;
  req.socket = { remoteAddress } as IncomingMessage['socket'];
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
  if (json !== undefined) {
    req.emit('data', Buffer.from(JSON.stringify(json)));
    req.emit('end');
  }
  return new Promise((resolve) => {
    const finish = () => resolve({ status: res.statusCode, body: res.body, handled, headers: res.headers });
    if (!handled) {
      resolve({ status: 0, body: '', handled: false, headers: {} });
      return;
    }
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

  it('refuses household routes from another machine when no passcode is set', async () => {
    const req = new EventEmitter() as IncomingMessage;
    req.method = 'GET';
    req.url = '/api/household';
    req.headers = { host: '192.168.1.20:3000' };
    req.resume = () => req;
    req.socket = { remoteAddress: '192.168.1.20' } as IncomingMessage['socket'];
    const res = new EventEmitter() as ServerResponse & { statusCode: number; body: string };
    res.statusCode = 0;
    res.body = '';
    res.writeHead = ((status: number) => {
      res.statusCode = status;
      return res;
    }) as ServerResponse['writeHead'];
    res.end = ((body?: string) => {
      res.body = body ?? '';
      return res;
    }) as ServerResponse['end'];
    expect(handleApiRoutes(req, res)).toBe(true);
    expect(res.statusCode).toBe(403);
    expect(res.body).toContain('AGORA_HOUSEHOLD_PASSCODE');
  });

  it('leaves other paths to the rest of the server', async () => {
    const result = await call('GET', '/', { host: 'localhost:3000' });
    expect(result.handled).toBe(false);
  });

  it('creates, edits, completes, and approves from loopback when no passcode is set', async () => {
    const created = await call('POST', '/api/memory', { host: 'localhost:3000', 'content-type': 'application/json' }, {
      text: 'Mia is allergic to peanuts',
      tags: ['allergy'],
      who: 'Mia',
    });
    expect(created.status).toBe(200);
    const memory = JSON.parse(created.body) as { memory: { id: string; who?: string; text: string }; receipt: { verified: boolean } };
    expect(memory.memory.who).toBe('Mia');
    expect(memory.receipt.verified).toBe(true);

    const edited = await call('PATCH', `/api/memory/${memory.memory.id}`, { host: 'localhost:3000', 'content-type': 'application/json' }, {
      text: 'Mia is allergic to peanuts and tree nuts',
    });
    expect(edited.status).toBe(200);
    expect(JSON.parse(edited.body).memory.text).toContain('tree nuts');

    const task = await call('POST', '/api/tasks', { host: 'localhost:3000', 'content-type': 'application/json' }, {
      title: 'milk',
      list: 'shopping',
      who: 'Jen',
      dueAt: '2026-10-08T18:00:00+05:30',
    });
    expect(task.status).toBe(200);
    const savedTask = JSON.parse(task.body) as { task: { id: string; list?: string; who?: string; dueAt?: string } };
    expect(savedTask.task).toMatchObject({ title: 'milk', list: 'shopping', who: 'Jen', dueAt: '2026-10-08T18:00:00+05:30' });

    const done = await call('POST', `/api/tasks/${savedTask.task.id}/complete`, { host: 'localhost:3000' });
    expect(done.status).toBe(200);
    expect(JSON.parse(done.body).task.status).toBe('done');

    const reopened = await call('POST', `/api/tasks/${savedTask.task.id}/reopen`, { host: 'localhost:3000' });
    expect(reopened.status).toBe(200);
    const opened = JSON.parse(reopened.body) as { task: { status: string; completedAt?: string }; receipt: { verified: boolean; action: string } };
    expect(opened.task.status).toBe('open');
    expect(opened.task.completedAt).toBeUndefined();
    expect(opened.receipt).toMatchObject({ verified: true, action: 'reopen_task' });
    const removedTask = await call('DELETE', `/api/tasks/${savedTask.task.id}`, { host: 'localhost:3000' });
    expect(removedTask.status).toBe(200);
    expect(JSON.parse(removedTask.body).receipt.verified).toBe(true);
    const missing = await call('DELETE', `/api/tasks/${savedTask.task.id}`, { host: 'localhost:3000' });
    expect(missing.status).toBe(404);
    const missingReopen = await call('POST', `/api/tasks/${savedTask.task.id}/reopen`, { host: 'localhost:3000' });
    expect(missingReopen.status).toBe(404);

    const forgotten = await call('POST', '/api/memory', { host: 'localhost:3000', 'content-type': 'application/json' }, {
      text: 'The spare key is in the drawer',
      tags: [],
    });
    expect(forgotten.status).toBe(200);
    const second = JSON.parse(forgotten.body) as { memory: { id: string } };
    const { forget } = await import('./household/actions');
    const pending = await forget(second.memory.id);
    expect(pending.ok).toBe(true);
    if (!pending.ok) return;
    const approved = await call('POST', `/api/approvals/${pending.approvalId}`, { host: 'localhost:3000', 'content-type': 'application/json' }, {
      decision: 'approve',
    });
    expect(approved.status).toBe(200);
    expect(JSON.parse(approved.body).result.receipt.verified).toBe(true);

    const removed = await call('DELETE', `/api/memory/${memory.memory.id}`, { host: 'localhost:3000' });
    expect(removed.status).toBe(200);
    expect(JSON.parse(removed.body).receipt.verified).toBe(true);
    const snapshot = await call('GET', '/api/household', { host: 'localhost:3000' });
    const body = JSON.parse(snapshot.body) as { memory: { id: string }[] };
    expect(body.memory.some((entry) => entry.id === memory.memory.id)).toBe(false);
  });

  it('refuses those writes from another machine when no passcode is set', async () => {
    const remote = '192.168.1.20';
    const headers = { host: 'localhost:3000', 'content-type': 'application/json' };
    const memory = await call('POST', '/api/memory', headers, { text: 'A fact', tags: [] }, remote);
    expect(memory.status).toBe(403);
    const task = await call('POST', '/api/tasks', headers, { title: 'milk' }, remote);
    expect(task.status).toBe(403);
    const patched = await call('PATCH', '/api/memory/abc', headers, { text: 'A fact' }, remote);
    expect(patched.status).toBe(403);
    const deleted = await call('DELETE', '/api/memory/abc', { host: 'localhost:3000' }, undefined, remote);
    expect(deleted.status).toBe(403);
    const complete = await call('POST', '/api/tasks/abc/complete', { host: 'localhost:3000' }, undefined, remote);
    expect(complete.status).toBe(403);
    const reopen = await call('POST', '/api/tasks/abc/reopen', { host: 'localhost:3000' }, undefined, remote);
    expect(reopen.status).toBe(403);
    const removed = await call('DELETE', '/api/tasks/abc', { host: 'localhost:3000' }, undefined, remote);
    expect(removed.status).toBe(403);
    const approval = await call('POST', '/api/approvals/abc', headers, { decision: 'approve' }, remote);
    expect(approval.status).toBe(403);
  });

  it('locks those writes until the household cookie is presented, including from another machine', async () => {
    process.env.AGORA_HOUSEHOLD_PASSCODE = 'home-pass';
    const headers = { host: 'localhost:3000', 'content-type': 'application/json' };
    const locked = await call('POST', '/api/memory', headers, { text: 'A fact', tags: [] });
    expect(locked.status).toBe(401);
    const remoteLocked = await call('POST', '/api/tasks', headers, { title: 'milk' }, '203.0.113.10');
    expect(remoteLocked.status).toBe(401);

    const session = await call('POST', '/api/session', headers, { passcode: 'home-pass' }, '203.0.113.10');
    expect(session.status).toBe(200);
    const cookie = cookieFrom(session.headers);
    const authed = { ...headers, cookie: `agora_household=${cookie}` };
    const created = await call('POST', '/api/memory', authed, { text: 'Jen likes tea', tags: [], who: 'Jen' }, '203.0.113.10');
    expect(created.status).toBe(200);
    expect(JSON.parse(created.body).memory.who).toBe('Jen');
    const id = JSON.parse(created.body).memory.id as string;
    const patched = await call('PATCH', `/api/memory/${id}`, authed, { text: 'Jen likes tea with honey' }, '203.0.113.10');
    expect(patched.status).toBe(200);
    const task = await call('POST', '/api/tasks', authed, { title: 'milk', list: 'shopping' }, '203.0.113.10');
    expect(task.status).toBe(200);
    const taskId = JSON.parse(task.body).task.id as string;
    const complete = await call('POST', `/api/tasks/${taskId}/complete`, authed, undefined, '203.0.113.10');
    expect(complete.status).toBe(200);
    const lockedReopen = await call('POST', `/api/tasks/${taskId}/reopen`, headers, undefined, '203.0.113.10');
    expect(lockedReopen.status).toBe(401);
    const reopened = await call('POST', `/api/tasks/${taskId}/reopen`, authed, undefined, '203.0.113.10');
    expect(reopened.status).toBe(200);
    const lockedRemove = await call('DELETE', `/api/tasks/${taskId}`, headers, undefined, '203.0.113.10');
    expect(lockedRemove.status).toBe(401);
    const removedTask = await call('DELETE', `/api/tasks/${taskId}`, authed, undefined, '203.0.113.10');
    expect(removedTask.status).toBe(200);
    const { forget } = await import('./household/actions');
    const pending = await forget(id);
    expect(pending.ok).toBe(true);
    if (!pending.ok) return;
    const withoutCookie = await call('POST', `/api/approvals/${pending.approvalId}`, headers, { decision: 'reject' }, '203.0.113.10');
    expect(withoutCookie.status).toBe(401);
    const rejected = await call('POST', `/api/approvals/${pending.approvalId}`, authed, { decision: 'reject' }, '203.0.113.10');
    expect(rejected.status).toBe(200);
    const deleted = await call('DELETE', `/api/memory/${id}`, authed, undefined, '203.0.113.10');
    expect(deleted.status).toBe(200);
  });
});
