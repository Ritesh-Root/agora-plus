import { createHmac, timingSafeEqual } from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';

/**
 * Household session cookie. Set only when AGORA_HOUSEHOLD_PASSCODE is set.
 * The value is HMAC-SHA256, `base64url(payload).base64url(sig)`.
 * Nothing here logs a passcode or the signing secret.
 */

const COOKIE = 'agora_household';
const MAX_AGE_SECONDS = 12 * 60 * 60;
const FAIL_DELAY_MS = 250;

interface SessionPayload {
  exp: number;
  purpose: 'household';
}

function secret(): string {
  return process.env.AGORA_TOKEN_SECRET ?? '';
}

export function householdLockEnabled(): boolean {
  return Boolean(process.env.AGORA_HOUSEHOLD_PASSCODE?.trim());
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

function sign(payload: SessionPayload): string {
  const body = Buffer.from(JSON.stringify({ exp: payload.exp, purpose: payload.purpose })).toString('base64url');
  const sig = createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

/** True when the cookie is signed by this process and has not expired. */
export function verifySessionToken(token: string, now = Date.now()): boolean {
  if (!secret() || token.length > 4096) return false;
  const dot = token.indexOf('.');
  if (dot <= 0 || token.indexOf('.', dot + 1) !== -1) return false;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac('sha256', secret()).update(body).digest('base64url');
  if (!safeEqual(sig, expected)) return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return false;
  }
  if (!parsed || typeof parsed !== 'object') return false;
  const item = parsed as { exp?: unknown; purpose?: unknown };
  return item.purpose === 'household' && typeof item.exp === 'number' && item.exp > now;
}

function readCookie(header: string | undefined): string {
  if (!header) return '';
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === COOKIE) return part.slice(eq + 1).trim();
  }
  return '';
}

export function householdSessionActive(req: IncomingMessage, now = Date.now()): boolean {
  if (!householdLockEnabled()) return true;
  const header = req.headers.cookie;
  const raw = Array.isArray(header) ? header[0] : header;
  return verifySessionToken(readCookie(raw), now);
}

function requestIsHttps(req: IncomingMessage): boolean {
  const forwarded = req.headers['x-forwarded-proto'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (raw?.split(',')[0]?.trim() === 'https') return true;
  return (req.socket as { encrypted?: boolean } | undefined)?.encrypted === true;
}

function cookieHeader(value: string, req: IncomingMessage, maxAge: number): string {
  const parts = [
    `${COOKIE}=${value}`,
    'HttpOnly',
    'SameSite=Strict',
    'Path=/',
    `Max-Age=${maxAge}`,
  ];
  if (requestIsHttps(req)) parts.push('Secure');
  return parts.join('; ');
}

function sendJson(res: ServerResponse, status: number, body: unknown, cookie?: string): void {
  if (res.headersSent || res.writableEnded) return;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cookie) headers['Set-Cookie'] = cookie;
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** GET, POST, and DELETE /api/session. */
export async function handleSession(req: IncomingMessage, res: ServerResponse, passcode: string | null): Promise<void> {
  const method = req.method ?? 'GET';
  const required = householdLockEnabled();
  if (method === 'GET') {
    sendJson(res, 200, { required, active: required ? householdSessionActive(req) : false });
    return;
  }
  if (method === 'DELETE') {
    sendJson(res, 200, { required, active: false }, cookieHeader('', req, 0));
    return;
  }
  if (method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }
  if (!required) {
    sendJson(res, 200, { required: false, active: false });
    return;
  }
  if (!secret()) {
    sendJson(res, 503, { error: 'session_unconfigured' });
    return;
  }
  const expected = process.env.AGORA_HOUSEHOLD_PASSCODE ?? '';
  const given = passcode ?? '';
  if (!safeEqual(given, expected)) {
    await delay(FAIL_DELAY_MS);
    sendJson(res, 401, { error: 'invalid_passcode' });
    return;
  }
  const token = sign({ exp: Date.now() + MAX_AGE_SECONDS * 1000, purpose: 'household' });
  sendJson(res, 200, { required: true, active: true }, cookieHeader(token, req, MAX_AGE_SECONDS));
}
