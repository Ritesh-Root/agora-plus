import type { IncomingMessage, ServerResponse } from 'http';
import {
  completeTask,
  deleteMemory,
  editMemory,
  householdSnapshot,
  remember,
  addTask,
  setServerProviderFactory,
} from './household/actions';
import { resolveApproval } from './household/approvals';
import { defaultServerProvider } from './llm/serverProvider';

setServerProviderFactory(defaultServerProvider);

const MAX_BODY = 64 * 1024;

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type Match =
  | { kind: 'household' }
  | { kind: 'memory' }
  | { kind: 'memory-id'; id: string }
  | { kind: 'tasks' }
  | { kind: 'task-complete'; id: string }
  | { kind: 'approval'; id: string };

function pathnameOf(req: IncomingMessage): string {
  try {
    return new URL(req.url ?? '/', 'http://localhost').pathname;
  } catch {
    return '';
  }
}

function safeId(raw: string): string | null {
  let id: string;
  try {
    id = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (!id || id.length > 200 || id.includes('..') || id.includes('/') || id.includes('\\')) return null;
  return id;
}

function matchPath(pathname: string): Match | 'bad-id' | null {
  if (pathname === '/api/household') return { kind: 'household' };
  if (pathname === '/api/memory') return { kind: 'memory' };
  if (pathname === '/api/tasks') return { kind: 'tasks' };
  const memory = pathname.match(/^\/api\/memory\/([^/]+)$/);
  if (memory) {
    const id = safeId(memory[1]);
    return id ? { kind: 'memory-id', id } : 'bad-id';
  }
  const task = pathname.match(/^\/api\/tasks\/([^/]+)\/complete$/);
  if (task) {
    const id = safeId(task[1]);
    return id ? { kind: 'task-complete', id } : 'bad-id';
  }
  const approval = pathname.match(/^\/api\/approvals\/([^/]+)$/);
  if (approval) {
    const id = safeId(approval[1]);
    return id ? { kind: 'approval', id } : 'bad-id';
  }
  return null;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  if (res.headersSent || res.writableEnded) return;
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

/** Writes are refused when Origin's host is not the request Host. No Origin is allowed (curl, same tab). */
function writeAllowed(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (origin === undefined) return true;
  if (Array.isArray(origin)) return false;
  const hostHeader = req.headers.host;
  if (!hostHeader || Array.isArray(hostHeader)) return false;
  try {
    return new URL(origin).host.toLowerCase() === hostHeader.toLowerCase();
  } catch {
    return false;
  }
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const type = req.headers['content-type'];
  if (typeof type === 'string' && !type.toLowerCase().includes('application/json')) {
    return Promise.reject(new HttpError(400, 'Send a JSON body.'));
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    const fail = (error: HttpError) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    req.on('data', (chunk: Buffer) => {
      if (settled) return;
      size += chunk.length;
      if (size > MAX_BODY) {
        fail(new HttpError(413, 'Request body is too large.'));
        setImmediate(() => req.destroy());
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (settled) return;
      settled = true;
      const text = Buffer.concat(chunks).toString('utf8').trim();
      if (!text) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(new HttpError(400, 'The body is not valid JSON.'));
      }
    });
    req.on('error', () => fail(new HttpError(400, 'The body is not valid JSON.')));
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function tagsFrom(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) return null;
  return value;
}

async function dispatch(req: IncomingMessage, res: ServerResponse, match: Match): Promise<void> {
  const method = req.method ?? 'GET';
  const write = method !== 'GET' && method !== 'HEAD';
  if (write && !writeAllowed(req)) {
    sendJson(res, 403, { error: 'This action is only allowed from the same site.' });
    if (typeof req.resume === 'function') req.resume();
    return;
  }

  if (match.kind === 'household') {
    if (method !== 'GET') {
      sendJson(res, 405, { error: 'Method not allowed' });
      return;
    }
    sendJson(res, 200, await householdSnapshot());
    return;
  }

  if (match.kind === 'memory') {
    if (method !== 'POST') {
      sendJson(res, 405, { error: 'Method not allowed' });
      return;
    }
    const body = asRecord(await readJsonBody(req));
    if (!body || typeof body.text !== 'string') {
      sendJson(res, 400, { error: 'Memory text is required.' });
      return;
    }
    const tags = tagsFrom(body.tags);
    if (!tags) {
      sendJson(res, 400, { error: 'Tags must be a list of strings.' });
      return;
    }
    const result = await remember(body.text, tags, 'ui');
    sendJson(res, result.ok ? 200 : 400, result);
    return;
  }

  if (match.kind === 'memory-id') {
    if (method === 'PATCH') {
      const body = asRecord(await readJsonBody(req));
      if (!body) {
        sendJson(res, 400, { error: 'Send a JSON object.' });
        return;
      }
      const patch: { text?: string; tags?: string[] } = {};
      if (body.text !== undefined) {
        if (typeof body.text !== 'string') {
          sendJson(res, 400, { error: 'Memory text is required.' });
          return;
        }
        patch.text = body.text;
      }
      if (body.tags !== undefined) {
        const tags = tagsFrom(body.tags);
        if (!tags) {
          sendJson(res, 400, { error: 'Tags must be a list of strings.' });
          return;
        }
        patch.tags = tags;
      }
      if (patch.text === undefined && patch.tags === undefined) {
        sendJson(res, 400, { error: 'Send text or tags to change.' });
        return;
      }
      const result = await editMemory(match.id, patch);
      const missing = !result.ok && (result as { ok: false; error: string }).error === 'Memory not found.';
      sendJson(res, result.ok ? 200 : missing ? 404 : 400, result);
      return;
    }
    if (method === 'DELETE') {
      if (typeof req.resume === 'function') req.resume();
      const result = await deleteMemory(match.id);
      sendJson(res, result.ok ? 200 : 404, result);
      return;
    }
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  if (match.kind === 'tasks') {
    if (method !== 'POST') {
      sendJson(res, 405, { error: 'Method not allowed' });
      return;
    }
    const body = asRecord(await readJsonBody(req));
    if (!body || typeof body.title !== 'string') {
      sendJson(res, 400, { error: 'A task title is required.' });
      return;
    }
    if (body.due !== undefined && typeof body.due !== 'string') {
      sendJson(res, 400, { error: 'Due must be a string.' });
      return;
    }
    const result = await addTask(body.title, typeof body.due === 'string' ? body.due : undefined, 'ui');
    sendJson(res, result.ok ? 200 : 400, result);
    return;
  }

  if (match.kind === 'task-complete') {
    if (method !== 'POST') {
      sendJson(res, 405, { error: 'Method not allowed' });
      return;
    }
    if (typeof req.resume === 'function') req.resume();
    const result = await completeTask(match.id);
    sendJson(res, result.ok ? 200 : 404, result);
    return;
  }

  if (method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }
  const body = asRecord(await readJsonBody(req));
  const decision = body?.decision;
  if (decision !== 'approve' && decision !== 'reject') {
    sendJson(res, 400, { error: 'Decision must be approve or reject.' });
    return;
  }
  const result = await resolveApproval(match.id, decision);
  if (!result.ok) {
    const { error } = result as { ok: false; error: string };
    if (error === 'missing') {
      sendJson(res, 404, { error: 'That approval is not waiting.' });
      return;
    }
    if (error === 'expired' || error === 'resolved') {
      sendJson(res, 409, { error: error === 'expired' ? 'That approval has expired.' : 'That approval was already resolved.' });
      return;
    }
    sendJson(res, 500, { error: 'The action failed.' });
    return;
  }
  sendJson(res, 200, result);
}

/**
 * Household HTTP API. Returns true when the path is ours; the body is handled asynchronously.
 * Mount beside the CORS proxy in both the Vite plugin and the production server.
 */
export function handleApiRoutes(req: IncomingMessage, res: ServerResponse): boolean {
  const match = matchPath(pathnameOf(req));
  if (match === null) return false;
  if (match === 'bad-id') {
    sendJson(res, 400, { error: 'Invalid id.' });
    return true;
  }
  void dispatch(req, res, match).catch((error) => {
    if (error instanceof HttpError) {
      sendJson(res, error.status, { error: error.message });
      return;
    }
    console.error('[api]', error instanceof Error ? error.message : 'request failed');
    sendJson(res, 500, { error: 'The request failed.' });
  });
  return true;
}
