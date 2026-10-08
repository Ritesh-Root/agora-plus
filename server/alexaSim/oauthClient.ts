import { createHash, randomBytes } from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';
import { oauthReady } from '../mcp/oauth';
import { ttsSettings } from './tts';

/**
 * The voice simulator asks our own OAuth server for tokens, the same way Alexa+ does.
 * A service token lists tools. An account-linked token calls them.
 * When OAuth is unset, AGORA_MCP_TOKEN is used for both.
 */

const LINK_MS = 10 * 60 * 1000;
const MAX_PENDING = 50;

export type SimMode = 'oauth' | 'dev-token' | 'unconfigured';

interface PendingLink {
  verifier: string;
  redirectUri: string;
  expiresAt: number;
}

interface Account {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

const pending = new Map<string, PendingLink>();
const serviceTokens = new Map<string, CachedToken>();
let account: Account | null = null;

export function resetAlexaAuth(): void {
  pending.clear();
  serviceTokens.clear();
  account = null;
}

export function simMode(): SimMode {
  if (oauthReady()) return 'oauth';
  if (process.env.AGORA_MCP_TOKEN?.trim()) return 'dev-token';
  return 'unconfigured';
}

export function alexaModelName(): string {
  return process.env.ALEXA_SIM_MODEL?.trim()
    || process.env.BEDROCK_FAST_MODEL?.trim()
    || 'anthropic.claude-haiku-4-5';
}

export function selfBase(req: IncomingMessage): string {
  const configured = process.env.AGORA_SELF_URL?.trim().replace(/\/+$/, '');
  if (configured) return configured;
  const hostHeader = req.headers.host;
  const host = (Array.isArray(hostHeader) ? hostHeader[0] : hostHeader) ?? '';
  const match = /:(\d+)$/.exec(host);
  const port = match?.[1] || String(req.socket?.localPort || 3000);
  return `http://127.0.0.1:${port}`;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  if (res.headersSent || res.writableEnded) return;
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function basicAuth(): string {
  const id = encodeURIComponent(process.env.AGORA_OAUTH_CLIENT_ID?.trim() ?? '');
  const secret = encodeURIComponent(process.env.AGORA_OAUTH_CLIENT_SECRET ?? '');
  return `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`;
}

function clientId(): string {
  return process.env.AGORA_OAUTH_CLIENT_ID?.trim() ?? '';
}

async function postToken(base: string, form: URLSearchParams): Promise<Record<string, unknown> | null> {
  const response = await fetch(`${base}/oauth/token`, {
    method: 'POST',
    headers: {
      authorization: basicAuth(),
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: form,
  });
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return null;
  }
  if (!response.ok || !body || typeof body !== 'object') return null;
  return body as Record<string, unknown>;
}

function readAccount(body: Record<string, unknown>): Account | null {
  if (typeof body.access_token !== 'string' || typeof body.refresh_token !== 'string') return null;
  const expiresIn = typeof body.expires_in === 'number' ? body.expires_in : 3600;
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: Date.now() + Math.max(30, expiresIn - 60) * 1000,
  };
}

async function serviceToken(base: string): Promise<string | null> {
  const cached = serviceTokens.get(base);
  if (cached && cached.expiresAt > Date.now()) return cached.token;
  const body = await postToken(base, new URLSearchParams({
    grant_type: 'client_credentials',
    scope: 'mcp:service',
    resource: `${base}/mcp`,
  }));
  if (!body || typeof body.access_token !== 'string') return null;
  const expiresIn = typeof body.expires_in === 'number' ? body.expires_in : 3600;
  const token = body.access_token;
  serviceTokens.set(base, { token, expiresAt: Date.now() + Math.max(30, expiresIn - 60) * 1000 });
  return token;
}

async function freshUserToken(base: string): Promise<string | null> {
  if (!account) return null;
  if (account.expiresAt > Date.now()) return account.accessToken;
  const body = await postToken(base, new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: account.refreshToken,
  }));
  const next = body ? readAccount(body) : null;
  account = next;
  return next?.accessToken ?? null;
}

/**
 * Tokens for one voice turn. The account-linked token calls tools.
 * A service token is enough to list them. A dev token does both.
 * Null means the person still has to press Link AGORA+.
 */
export async function tokensForTurn(base: string): Promise<{ list: string; call: string } | null> {
  if (oauthReady()) {
    const user = await freshUserToken(base);
    if (user) {
      const list = await serviceToken(base);
      if (list) return { list, call: user };
      return { list: user, call: user };
    }
  }
  const dev = process.env.AGORA_MCP_TOKEN?.trim();
  if (dev) return { list: dev, call: dev };
  return null;
}

function sweepPending(now: number): void {
  for (const [key, item] of pending) {
    if (item.expiresAt <= now) pending.delete(key);
  }
  while (pending.size > MAX_PENDING) {
    const oldest = pending.keys().next().value;
    if (oldest === undefined) break;
    pending.delete(oldest);
  }
}

export function simStatus(): { linked: boolean; mode: SimMode; model: string; tts: { voice: string; engine: string } } {
  const mode = simMode();
  const linked = mode === 'dev-token' || account !== null;
  return { linked, mode, model: alexaModelName(), tts: ttsSettings() };
}

export function handleAlexaStatus(res: ServerResponse): void {
  sendJson(res, 200, simStatus());
}

/** Starts account linking. The browser opens the returned URL. */
export function handleAlexaLink(req: IncomingMessage, res: ServerResponse): void {
  if (!oauthReady()) {
    sendJson(res, 503, { error: 'oauth_unconfigured' });
    return;
  }
  const base = selfBase(req);
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const state = randomBytes(16).toString('base64url');
  const redirectUri = `${base}/alexa?linked=1`;
  const now = Date.now();
  pending.set(state, { verifier, redirectUri, expiresAt: now + LINK_MS });
  sweepPending(now);
  const url = new URL(`${base}/oauth/authorize`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId());
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', state);
  url.searchParams.set('resource', `${base}/mcp`);
  url.searchParams.set('scope', 'mcp:tools mcp:resources');
  sendJson(res, 200, { url: url.toString() });
}

export async function completeAlexaLink(req: IncomingMessage, code: unknown, state: unknown): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (typeof code !== 'string' || typeof state !== 'string' || !code || !state) {
    return { ok: false, status: 400, error: 'code and state are required.' };
  }
  const saved = pending.get(state);
  pending.delete(state);
  if (!saved || saved.expiresAt <= Date.now()) {
    return { ok: false, status: 400, error: 'That link expired. Press Link AGORA+ again.' };
  }
  const base = selfBase(req);
  const body = await postToken(base, new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: saved.redirectUri,
    code_verifier: saved.verifier,
  }));
  const next = body ? readAccount(body) : null;
  if (!next) return { ok: false, status: 400, error: 'AGORA+ could not be linked.' };
  account = next;
  return { ok: true };
}

export function bearerFetch(listToken: string, callToken: string): typeof fetch {
  return async (input, init) => {
    const headers = new Headers(init?.headers);
    let text = '';
    const raw = init?.body;
    if (typeof raw === 'string') text = raw;
    else if (raw instanceof Uint8Array) text = new TextDecoder().decode(raw);
    else if (typeof Buffer !== 'undefined' && Buffer.isBuffer(raw)) text = raw.toString('utf8');
    const token = text.includes('"tools/call"') ? callToken : listToken;
    headers.set('authorization', `Bearer ${token}`);
    return fetch(input, { ...init, headers });
  };
}
