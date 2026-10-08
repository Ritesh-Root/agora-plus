import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';

/**
 * One-household OAuth 2.1 authorization server.
 * Access tokens are HMAC-SHA256, `base64url(payload).base64url(sig)`.
 * The signed payload is `{ sub, scope, aud, exp }` plus `typ` and `jti` so a
 * refresh token cannot be used as a bearer token and can be rotated.
 * Nothing here logs a token, secret, or passcode.
 */

const SERVICE_SCOPE = 'mcp:service';
const USER_SCOPE = 'mcp:tools mcp:resources';
const SCOPES = ['mcp:service', 'mcp:tools', 'mcp:resources'];
const ACCESS_SECONDS = 3600;
const REFRESH_SECONDS = 30 * 24 * 60 * 60;
const CODE_MS = 5 * 60 * 1000;
const MAX_STORED = 100;

export interface BearerIdentity {
  clientId: string;
  scopes: string[];
  kind: 'token' | 'dev';
  expiresAt?: number;
  audience?: string;
}

interface SignedPayload {
  sub: string;
  scope: string;
  aud: string;
  exp: number;
  typ: 'access' | 'refresh';
  jti: string;
}

interface AuthCode {
  redirectUri: string;
  challenge: string;
  audience: string;
  state?: string;
  expiresAt: number;
}

interface RefreshRecord {
  sub: string;
  scope: string;
  aud: string;
  exp: number;
}

const codes = new Map<string, AuthCode>();
const refreshes = new Map<string, RefreshRecord>();
let clock = (): number => Date.now();

/** Tests move time without waiting for a token to expire. */
export function setOauthClock(next: (() => number) | null): void {
  clock = next ?? (() => Date.now());
}

/** Drops codes and refresh tokens. Does not change environment variables. */
export function resetOauthState(): void {
  codes.clear();
  refreshes.clear();
  clock = () => Date.now();
}

export function oauthReady(): boolean {
  return Boolean(
    process.env.AGORA_OAUTH_CLIENT_ID?.trim()
    && process.env.AGORA_OAUTH_CLIENT_SECRET
    && process.env.AGORA_TOKEN_SECRET,
  );
}

function clientId(): string {
  return process.env.AGORA_OAUTH_CLIENT_ID?.trim() ?? '';
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) {
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

function nowSeconds(): number {
  return Math.floor(clock() / 1000);
}

function publicBase(req: IncomingMessage): string {
  const configured = process.env.AGORA_PUBLIC_URL?.trim().replace(/\/+$/, '');
  if (configured) return configured;
  const hostHeader = req.headers.host;
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  const forwarded = req.headers['x-forwarded-proto'];
  const rawProto = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const proto = rawProto?.split(',')[0]?.trim();
  const scheme = proto === 'https' || proto === 'http' ? proto : 'http';
  return `${scheme}://${host || 'localhost'}`;
}

export function mcpResourceUrl(req: IncomingMessage): string {
  return `${publicBase(req)}/mcp`;
}

function canonicalResource(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.username || url.password || url.search || url.hash) return null;
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const path = url.pathname.replace(/\/+$/, '') || '/';
  return `${url.origin}${path}`;
}

export function resourcesMatch(left: string, right: string): boolean {
  const a = canonicalResource(left);
  const b = canonicalResource(right);
  return a !== null && a === b;
}

function signPayload(payload: SignedPayload): string {
  const secret = process.env.AGORA_TOKEN_SECRET ?? '';
  const body = Buffer.from(JSON.stringify({
    sub: payload.sub,
    scope: payload.scope,
    aud: payload.aud,
    exp: payload.exp,
    typ: payload.typ,
    jti: payload.jti,
  })).toString('base64url');
  const sig = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function isPayload(value: unknown): value is SignedPayload {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.sub === 'string' && item.sub.length > 0 && item.sub.length <= 200
    && typeof item.scope === 'string' && item.scope.length > 0 && item.scope.length <= 200
    && typeof item.aud === 'string' && item.aud.length > 0 && item.aud.length <= 500
    && typeof item.exp === 'number' && Number.isInteger(item.exp)
    && (item.typ === 'access' || item.typ === 'refresh')
    && typeof item.jti === 'string' && item.jti.length > 0 && item.jti.length <= 200;
}

function readPayload(token: string): SignedPayload | null {
  if (!oauthReady() || token.length > 4096) return null;
  const dot = token.indexOf('.');
  if (dot <= 0 || token.indexOf('.', dot + 1) !== -1) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!body || !sig) return null;
  const expected = createHmac('sha256', process.env.AGORA_TOKEN_SECRET ?? '').update(body).digest('base64url');
  if (!safeEqual(sig, expected)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!isPayload(parsed) || parsed.exp <= nowSeconds()) return null;
  return parsed;
}

function issue(sub: string, scope: string, aud: string, typ: 'access' | 'refresh', seconds: number): { token: string; payload: SignedPayload } {
  const payload: SignedPayload = {
    sub,
    scope,
    aud,
    exp: nowSeconds() + seconds,
    typ,
    jti: randomBytes(16).toString('base64url'),
  };
  return { token: signPayload(payload), payload };
}

function rememberLimited<T>(map: Map<string, T>, key: string, value: T): void {
  map.set(key, value);
  while (map.size > MAX_STORED) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

function tokenResponse(res: ServerResponse, body: Record<string, unknown>): void {
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    Pragma: 'no-cache',
  });
  res.end(JSON.stringify(body));
}

function oauthError(res: ServerResponse, status: number, error: string, description: string): void {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    Pragma: 'no-cache',
  });
  res.end(JSON.stringify({ error, error_description: description }));
}

function notConfigured(res: ServerResponse): void {
  oauthError(
    res,
    503,
    'server_error',
    'OAuth is not configured. Set AGORA_OAUTH_CLIENT_ID, AGORA_OAUTH_CLIENT_SECRET, and AGORA_TOKEN_SECRET.',
  );
}

function decodeFormComponent(value: string): string | null {
  try {
    return decodeURIComponent(value.replace(/\+/g, '%20'));
  } catch {
    return null;
  }
}

function readBasic(header: string | string[] | undefined): { id: string; secret: string } | null {
  if (typeof header !== 'string') return null;
  const match = /^Basic\s+([A-Za-z0-9+/=_-]+)$/i.exec(header.trim());
  if (!match) return null;
  let decoded: string;
  try {
    decoded = Buffer.from(match[1], 'base64').toString('utf8');
  } catch {
    return null;
  }
  const colon = decoded.indexOf(':');
  if (colon < 0) return null;
  const id = decodeFormComponent(decoded.slice(0, colon));
  const secret = decodeFormComponent(decoded.slice(colon + 1));
  if (id === null || secret === null) return null;
  return { id, secret };
}

function clientAuthenticated(header: string | string[] | undefined): boolean {
  const basic = readBasic(header);
  if (!basic) return false;
  const secret = process.env.AGORA_OAUTH_CLIENT_SECRET ?? '';
  return safeEqual(basic.id, clientId()) && safeEqual(basic.secret, secret);
}

function headerValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function isForm(req: IncomingMessage): boolean {
  const type = headerValue(req.headers['content-type']).split(';')[0]?.trim().toLowerCase();
  return type === 'application/x-www-form-urlencoded';
}

function readText(req: IncomingMessage, max: number): Promise<string> {
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
      if (size > max) {
        fail(Object.assign(new Error('too large'), { statusCode: 413 }));
        setImmediate(() => req.destroy());
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', () => fail(Object.assign(new Error('unreadable'), { statusCode: 400 })));
  });
}

function drain(req: IncomingMessage): void {
  if (typeof req.resume === 'function') req.resume();
}

function pathnameOf(req: IncomingMessage): string {
  try {
    return new URL(req.url ?? '/', 'http://localhost').pathname;
  } catch {
    return '';
  }
}

function allowedRedirect(raw: string): boolean {
  if (!raw || raw.length > 2000) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.username || url.password || url.hash) return false;
  if (url.protocol === 'https:') return true;
  return url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

interface AuthorizeInput {
  redirectUri: string;
  challenge: string;
  audience: string;
  state?: string;
}

function readAuthorizeInput(params: URLSearchParams, req: IncomingMessage): { ok: true; input: AuthorizeInput } | { ok: false; error: string } {
  const stateValue = params.get('state');
  if (stateValue !== null && stateValue.length > 2000) return { ok: false, error: 'state is too long.' };
  if (params.get('response_type') !== 'code') return { ok: false, error: 'response_type must be code.' };
  if (!safeEqual(params.get('client_id') ?? '', clientId())) return { ok: false, error: 'This app is not registered for this household.' };
  const redirectUri = params.get('redirect_uri') ?? '';
  if (!allowedRedirect(redirectUri)) return { ok: false, error: 'That redirect URL is not allowed. Use https, or http on localhost.' };
  const method = params.get('code_challenge_method') ?? '';
  if (method !== 'S256') return { ok: false, error: 'code_challenge_method must be S256.' };
  const challenge = params.get('code_challenge') ?? '';
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(challenge)) return { ok: false, error: 'code_challenge must be an S256 PKCE challenge.' };
  const resource = params.get('resource');
  const audience = mcpResourceUrl(req);
  if (resource !== null && !resourcesMatch(resource, audience)) return { ok: false, error: 'The resource must be this household MCP server.' };
  const input: AuthorizeInput = { redirectUri, challenge, audience };
  if (stateValue !== null) input.state = stateValue;
  return { ok: true, input };
}

const PAGE_STYLE = `
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #101418; color: #e7ece8;
    font: 16px/1.45 system-ui, sans-serif; }
  main { width: min(28rem, calc(100% - 2rem)); background: #1b2228; border: 1px solid #2d3842; border-radius: 16px; padding: 1.5rem; }
  h1 { font-size: 1.35rem; margin: 0 0 0.5rem; }
  p { margin: 0 0 1rem; color: #c5d0c8; }
  label { display: block; font-size: 0.92rem; margin-bottom: 0.35rem; }
  input[type="password"] { width: 100%; box-sizing: border-box; padding: 0.65rem 0.75rem; border-radius: 10px;
    border: 1px solid #3c4a55; background: #0e1317; color: inherit; font: inherit; }
  button { margin-top: 1rem; width: 100%; padding: 0.7rem 1rem; border: 0; border-radius: 999px; background: #d7a15f;
    color: #1a140c; font: inherit; font-weight: 650; }
  .error { color: #ffb4a8; }
`;

function htmlPage(title: string, body: string, status: number, res: ServerResponse): void {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${PAGE_STYLE}</style>
</head>
<body>
<main>
${body}
</main>
</body>
</html>`;
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(html);
}

function hiddenFields(input: AuthorizeInput): string {
  const fields: [string, string][] = [
    ['response_type', 'code'],
    ['client_id', clientId()],
    ['redirect_uri', input.redirectUri],
    ['code_challenge', input.challenge],
    ['code_challenge_method', 'S256'],
    ['resource', input.audience],
  ];
  if (input.state !== undefined) fields.push(['state', input.state]);
  return fields.map(([name, value]) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`).join('');
}

function consentPage(res: ServerResponse, input: AuthorizeInput, message?: string): void {
  const note = message ? `<p class="error">${escapeHtml(message)}</p>` : '';
  htmlPage('Allow AGORA+', `
    <h1>Allow AGORA+</h1>
    <p>This app wants to use your household memory, tasks, and plans. Enter the household passcode to allow it. Nothing runs until you approve it later.</p>
    ${note}
    <form method="post" action="/oauth/authorize">
      ${hiddenFields(input)}
      <label for="passcode">Household passcode</label>
      <input id="passcode" name="passcode" type="password" autocomplete="off" required autofocus>
      <button type="submit">Allow</button>
    </form>
  `, message ? 401 : 200, res);
}

function errorPage(res: ServerResponse, message: string, status = 400): void {
  htmlPage('AGORA+', `<h1>Cannot link AGORA+</h1><p>${escapeHtml(message)}</p>`, status, res);
}

function metadata(req: IncomingMessage): Record<string, unknown> {
  const base = publicBase(req);
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    grant_types_supported: ['client_credentials', 'authorization_code', 'refresh_token'],
    response_types_supported: ['code'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['client_secret_basic'],
    scopes_supported: SCOPES,
  };
}

function protectedResource(req: IncomingMessage): Record<string, unknown> {
  return {
    resource: mcpResourceUrl(req),
    authorization_servers: [publicBase(req)],
    scopes_supported: SCOPES,
  };
}

function sendMetadata(res: ServerResponse, body: unknown): void {
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=300',
  });
  res.end(JSON.stringify(body));
}

function accessBody(token: string, scope: string, refresh?: string): Record<string, unknown> {
  const body: Record<string, unknown> = {
    access_token: token,
    token_type: 'Bearer',
    expires_in: ACCESS_SECONDS,
    scope,
  };
  if (refresh) body.refresh_token = refresh;
  return body;
}

function pkceMatches(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false;
  const digest = createHash('sha256').update(verifier).digest('base64url');
  return safeEqual(digest, challenge);
}

async function handleToken(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if ((req.method ?? 'GET') !== 'POST') {
    drain(req);
    res.writeHead(405, { Allow: 'POST' });
    res.end();
    return;
  }
  if (!oauthReady()) {
    drain(req);
    notConfigured(res);
    return;
  }
  if (!isForm(req)) {
    drain(req);
    oauthError(res, 400, 'invalid_request', 'Send the token request as application/x-www-form-urlencoded.');
    return;
  }
  if (!clientAuthenticated(req.headers.authorization)) {
    drain(req);
    oauthError(res, 401, 'invalid_client', 'Client authentication failed. Use HTTP Basic with the household client id and secret.');
    return;
  }
  let form: URLSearchParams;
  try {
    form = new URLSearchParams(await readText(req, 64 * 1024));
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode === 413 ? 413 : 400;
    oauthError(res, status, 'invalid_request', status === 413 ? 'The request body is too large.' : 'The request body could not be read.');
    return;
  }
  const grant = form.get('grant_type');
  const resource = form.get('resource');
  const audience = mcpResourceUrl(req);
  if (resource !== null && !resourcesMatch(resource, audience)) {
    oauthError(res, 400, 'invalid_target', 'The resource must be this household MCP server.');
    return;
  }

  if (grant === 'client_credentials') {
    const { token } = issue(clientId(), SERVICE_SCOPE, audience, 'access', ACCESS_SECONDS);
    tokenResponse(res, accessBody(token, SERVICE_SCOPE));
    return;
  }

  if (grant === 'authorization_code') {
    const code = form.get('code') ?? '';
    const redirectUri = form.get('redirect_uri') ?? '';
    const verifier = form.get('code_verifier') ?? '';
    const saved = codes.get(code);
    codes.delete(code);
    if (!saved || saved.expiresAt <= clock()) {
      oauthError(res, 400, 'invalid_grant', 'That authorization code is missing, expired, or already used.');
      return;
    }
    if (saved.redirectUri !== redirectUri || !pkceMatches(verifier, saved.challenge)) {
      oauthError(res, 400, 'invalid_grant', 'The redirect URL or PKCE verifier does not match the authorization request.');
      return;
    }
    if (resource !== null && !resourcesMatch(resource, saved.audience)) {
      oauthError(res, 400, 'invalid_target', 'The resource must match the authorization request.');
      return;
    }
    const access = issue(clientId(), USER_SCOPE, saved.audience, 'access', ACCESS_SECONDS);
    const refresh = issue(clientId(), USER_SCOPE, saved.audience, 'refresh', REFRESH_SECONDS);
    rememberLimited(refreshes, refresh.payload.jti, {
      sub: clientId(),
      scope: USER_SCOPE,
      aud: saved.audience,
      exp: refresh.payload.exp,
    });
    tokenResponse(res, accessBody(access.token, USER_SCOPE, refresh.token));
    return;
  }

  if (grant === 'refresh_token') {
    const presented = form.get('refresh_token') ?? '';
    const payload = readPayload(presented);
    if (!payload || payload.typ !== 'refresh') {
      oauthError(res, 400, 'invalid_grant', 'That refresh token is not valid.');
      return;
    }
    const saved = refreshes.get(payload.jti);
    refreshes.delete(payload.jti);
    if (!saved || saved.exp <= nowSeconds() || saved.sub !== payload.sub || saved.aud !== payload.aud) {
      oauthError(res, 400, 'invalid_grant', 'That refresh token has already been used or has expired.');
      return;
    }
    if (resource !== null && !resourcesMatch(resource, saved.aud)) {
      oauthError(res, 400, 'invalid_target', 'The resource must match the refresh token.');
      return;
    }
    const access = issue(saved.sub, saved.scope, saved.aud, 'access', ACCESS_SECONDS);
    const refresh = issue(saved.sub, saved.scope, saved.aud, 'refresh', REFRESH_SECONDS);
    rememberLimited(refreshes, refresh.payload.jti, {
      sub: saved.sub,
      scope: saved.scope,
      aud: saved.aud,
      exp: refresh.payload.exp,
    });
    tokenResponse(res, accessBody(access.token, saved.scope, refresh.token));
    return;
  }

  oauthError(res, 400, grant ? 'unsupported_grant_type' : 'invalid_request', 'grant_type must be client_credentials, authorization_code, or refresh_token.');
}

async function handleAuthorize(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const method = req.method ?? 'GET';
  if (method !== 'GET' && method !== 'POST') {
    drain(req);
    res.writeHead(405, { Allow: 'GET, POST' });
    res.end();
    return;
  }
  if (!oauthReady()) {
    drain(req);
    notConfigured(res);
    return;
  }
  const passcode = process.env.AGORA_HOUSEHOLD_PASSCODE?.trim() ?? '';
  if (!passcode) {
    errorPage(res, 'The household passcode is not configured. Set AGORA_HOUSEHOLD_PASSCODE.', 503);
    return;
  }

  let params: URLSearchParams;
  let submitted = '';
  if (method === 'GET') {
    if (typeof req.resume === 'function') req.resume();
    try {
      params = new URL(req.url ?? '/', 'http://localhost').searchParams;
    } catch {
      errorPage(res, 'The authorization request could not be read.');
      return;
    }
  } else {
    if (!isForm(req)) {
      drain(req);
      errorPage(res, 'Send the passcode as a form.');
      return;
    }
    try {
      params = new URLSearchParams(await readText(req, 64 * 1024));
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode === 413 ? 413 : 400;
      errorPage(res, status === 413 ? 'The request body is too large.' : 'The request body could not be read.', status);
      return;
    }
    submitted = params.get('passcode')?.trim() ?? '';
  }

  const parsed = readAuthorizeInput(params, req);
  if (!parsed.ok) {
    errorPage(res, (parsed as { ok: false; error: string }).error);
    return;
  }
  if (method === 'GET') {
    consentPage(res, parsed.input);
    return;
  }
  if (!safeEqual(submitted, passcode)) {
    consentPage(res, parsed.input, 'That passcode is not right.');
    return;
  }
  const code = randomBytes(32).toString('base64url');
  rememberLimited(codes, code, {
    redirectUri: parsed.input.redirectUri,
    challenge: parsed.input.challenge,
    audience: parsed.input.audience,
    state: parsed.input.state,
    expiresAt: clock() + CODE_MS,
  });
  const target = new URL(parsed.input.redirectUri);
  target.searchParams.set('code', code);
  if (parsed.input.state !== undefined) target.searchParams.set('state', parsed.input.state);
  res.writeHead(302, {
    Location: target.toString(),
    'Cache-Control': 'no-store',
  });
  res.end();
}

export function verifyBearer(header: string | string[] | undefined): BearerIdentity | null {
  if (typeof header !== 'string') return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!match) return null;
  const token = match[1];
  const dev = process.env.AGORA_MCP_TOKEN;
  if (dev && safeEqual(token, dev)) {
    return {
      clientId: 'dev',
      scopes: [...SCOPES],
      kind: 'dev',
    };
  }
  const payload = readPayload(token);
  if (!payload || payload.typ !== 'access') return null;
  return {
    clientId: payload.sub,
    scopes: payload.scope.split(/\s+/).filter((scope) => scope.length > 0),
    kind: 'token',
    expiresAt: payload.exp,
    audience: payload.aud,
  };
}

export async function handleOAuthRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const pathname = pathnameOf(req);
  const method = req.method ?? 'GET';
  const discovery = pathname === '/.well-known/oauth-authorization-server'
    || pathname === '/.well-known/oauth-protected-resource'
    || pathname === '/.well-known/oauth-protected-resource/mcp';
  if (discovery) {
    if (typeof req.resume === 'function') req.resume();
    if (method !== 'GET' && method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET' });
      res.end();
      return;
    }
    if (!oauthReady()) {
      notConfigured(res);
      return;
    }
    const body = pathname === '/.well-known/oauth-authorization-server' ? metadata(req) : protectedResource(req);
    if (method === 'HEAD') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end();
      return;
    }
    sendMetadata(res, body);
    return;
  }
  if (pathname === '/oauth/token') {
    await handleToken(req, res);
    return;
  }
  if (pathname === '/oauth/authorize') {
    await handleAuthorize(req, res);
    return;
  }
  if (typeof req.resume === 'function') req.resume();
  oauthError(res, 404, 'invalid_request', 'That OAuth path does not exist.');
}
