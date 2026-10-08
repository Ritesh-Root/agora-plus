import { createMcpHandler, type AuthInfo } from '@modelcontextprotocol/server';
import { toNodeHandler, type NodeIncomingMessageLike } from '@modelcontextprotocol/node';
import type { IncomingMessage, ServerResponse } from 'http';
import { buildAgoraMcpServer } from './server';
import {
  ensureRefreshes,
  handleOAuthRequest,
  mcpResourceUrl,
  rejectWithoutPublicUrl,
  resourcesMatch,
  verifyBearer,
  type BearerIdentity,
} from './oauth';

const MAX_BODY = 1024 * 1024;

const ANY_TOKEN = new Set([
  'initialize',
  'ping',
  'tools/list',
  'resources/list',
  'resources/templates/list',
  'prompts/list',
  'prompts/get',
  'completion/complete',
  'logging/setLevel',
  'server/discover',
]);

/**
 * One stateless handler for every request. `legacy: 'stateless'` answers
 * 2025-11-25 clients, which is what Alexa+ speaks. The handler checks no
 * Origin and no token, so those checks stay in front of it.
 */
const mcpHandler = createMcpHandler(
  (ctx) => buildAgoraMcpServer({ clientId: ctx.authInfo?.clientId }),
  { legacy: 'stateless' },
);

const nodeHandler = toNodeHandler(mcpHandler, {
  onerror(error) {
    console.error('[mcp]', error.message);
  },
});

function pathnameOf(req: IncomingMessage): string {
  try {
    return new URL(req.url ?? '/', 'http://localhost').pathname;
  } catch {
    return '';
  }
}

function isOAuthPath(pathname: string): boolean {
  return pathname === '/.well-known/oauth-authorization-server'
    || pathname === '/.well-known/oauth-protected-resource'
    || pathname === '/.well-known/oauth-protected-resource/mcp'
    || pathname.startsWith('/oauth/');
}

function headerValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

/** Alexa+ wants a 401 with an empty body and no WWW-Authenticate header. */
function unauthorized(req: IncomingMessage, res: ServerResponse): void {
  if (res.headersSent || res.writableEnded) return;
  res.writeHead(401);
  res.end();
  if (typeof req.resume === 'function') req.resume();
}

function originAllowed(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (origin === undefined) return true;
  if (Array.isArray(origin) || origin.trim() === '' || origin === 'null') return false;
  let hostname: string;
  try {
    hostname = new URL(origin).hostname;
  } catch {
    return false;
  }
  if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
  const configured = process.env.AGORA_PUBLIC_URL?.trim();
  if (!configured) return false;
  try {
    return new URL(configured).hostname === hostname;
  } catch {
    return false;
  }
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    req.on('data', (chunk: Buffer) => {
      if (settled) return;
      size += chunk.length;
      if (size > MAX_BODY) {
        fail(Object.assign(new Error('too large'), { statusCode: 413 }));
        setImmediate(() => req.destroy());
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks));
    });
    req.on('error', () => fail(Object.assign(new Error('unreadable'), { statusCode: 400 })));
  });
}

type ScopeNeed = 'any' | 'tools' | 'resources';

function scopeFor(body: unknown): ScopeNeed {
  if (Array.isArray(body)) return 'tools';
  if (!body || typeof body !== 'object') return 'tools';
  const method = (body as { method?: unknown }).method;
  if (typeof method !== 'string') return 'tools';
  if (method === 'tools/call') return 'tools';
  if (method === 'resources/read' || method === 'resources/subscribe' || method === 'resources/unsubscribe') {
    return 'resources';
  }
  if (ANY_TOKEN.has(method) || method.startsWith('notifications/')) return 'any';
  return 'tools';
}

function scopeAllowed(identity: BearerIdentity, need: ScopeNeed): boolean {
  if (need === 'any') return true;
  if (need === 'tools') return identity.scopes.includes('mcp:tools');
  return identity.scopes.includes('mcp:resources');
}

function scopeDenied(res: ServerResponse, body: unknown, need: ScopeNeed): void {
  let id: unknown = null;
  if (body && typeof body === 'object' && !Array.isArray(body) && 'id' in body) {
    const raw = (body as { id?: unknown }).id;
    if (typeof raw === 'string' || typeof raw === 'number' || raw === null) id = raw;
  }
  const needed = need === 'resources' ? 'mcp:resources' : 'mcp:tools';
  res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({
    jsonrpc: '2.0',
    id,
    error: {
      code: -32000,
      message: `This token cannot do that. It needs the ${needed} scope.`,
    },
  }));
}

function bearerToken(header: string | string[] | undefined): string {
  if (typeof header !== 'string') return '';
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1] ?? '';
}

function authInfo(req: IncomingMessage, identity: BearerIdentity): AuthInfo {
  const resource = mcpResourceUrl(req);
  let resourceUrl: URL | undefined;
  try {
    resourceUrl = new URL(resource);
  } catch {
    resourceUrl = undefined;
  }
  return {
    token: bearerToken(req.headers.authorization),
    clientId: identity.clientId,
    scopes: identity.scopes,
    ...(identity.expiresAt !== undefined ? { expiresAt: identity.expiresAt } : {}),
    ...(resourceUrl ? { resource: resourceUrl } : {}),
    extra: { kind: identity.kind },
  };
}

async function serveMcp(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (rejectWithoutPublicUrl(req, res)) return;
  if (!originAllowed(req)) {
    if (!res.headersSent) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Origin is not allowed.');
    }
    if (typeof req.resume === 'function') req.resume();
    return;
  }
  try {
    await ensureRefreshes();
  } catch {
    if (!res.headersSent && !res.writableEnded) {
      res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: 'server_error', error_description: 'Refresh records could not be read.' }));
    }
    return;
  }
  const identity = verifyBearer(req.headers.authorization);
  if (!identity) {
    unauthorized(req, res);
    return;
  }
  if (identity.kind === 'token' && (!identity.audience || !resourcesMatch(identity.audience, mcpResourceUrl(req)))) {
    unauthorized(req, res);
    return;
  }

  const method = (req.method ?? 'GET').toUpperCase();
  const authed = req as IncomingMessage & { auth?: AuthInfo };
  authed.auth = authInfo(req, identity);

  if (method === 'GET' || method === 'DELETE' || method === 'HEAD') {
    await nodeHandler(authed as NodeIncomingMessageLike, res);
    return;
  }
  if (method !== 'POST') {
    if (typeof req.resume === 'function') req.resume();
    res.writeHead(405, { Allow: 'GET, POST, DELETE' });
    res.end();
    return;
  }

  const type = headerValue(req.headers['content-type']).split(';')[0]?.trim().toLowerCase();
  if (type !== 'application/json') {
    if (typeof req.resume === 'function') req.resume();
    res.writeHead(415, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: 'Content-Type must be application/json.' },
    }));
    return;
  }

  let raw: Buffer;
  try {
    raw = await readBody(req);
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode === 413 ? 413 : 400;
    if (!res.headersSent) {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: { code: status === 413 ? -32000 : -32700, message: status === 413 ? 'Request body is too large.' : 'The body could not be read.' },
      }));
    }
    return;
  }

  const text = raw.toString('utf8').trim();
  let parsed: unknown = {};
  if (text) {
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      if (!scopeAllowed(identity, 'tools')) {
        scopeDenied(res, null, 'tools');
        return;
      }
      parsed = text;
    }
  }

  const need = scopeFor(parsed);
  if (!scopeAllowed(identity, need)) {
    scopeDenied(res, parsed, need);
    return;
  }

  // The body stream is already consumed. Pass the parsed value so the SDK does not read it again.
  // Invalid JSON is handed through as text only when we could not classify it; a valid object or batch is passed as parsed JSON.
  const body = typeof parsed === 'string' ? undefined : parsed;
  await nodeHandler(authed as NodeIncomingMessageLike, res, body);
}

/**
 * MCP and OAuth routes. Returns true when the path is ours.
 * Mount beside the household API in the Vite plugin and the production server.
 */
export function handleMcpRoutes(req: IncomingMessage, res: ServerResponse): boolean {
  const pathname = pathnameOf(req);
  if (pathname === '/mcp') {
    void serveMcp(req, res).catch((error) => {
      console.error('[mcp]', error instanceof Error ? error.message : 'request failed');
      if (!res.headersSent && !res.writableEnded) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'The request failed.' }));
      }
    });
    return true;
  }
  if (!isOAuthPath(pathname)) return false;
  void handleOAuthRequest(req, res).catch((error) => {
    console.error('[oauth]', error instanceof Error ? error.message : 'request failed');
    if (!res.headersSent && !res.writableEnded) {
      res.writeHead(500, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(JSON.stringify({ error: 'server_error', error_description: 'The request failed.' }));
    }
  });
  return true;
}
