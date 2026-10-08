import { createHash, randomBytes } from 'crypto';
import { createServer, type Server } from 'http';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetPasscodeLimiter } from '../household/session';
import { setDataDir } from '../household/store';
import { noteBindHost } from '../hub';
import { handleMcpRoutes } from './http';
import { flushOauthWrites, reloadOauthFromDisk, resetOauthState, setOauthClock } from './oauth';

const DEV_TOKEN = 'dev-token-0123456789abcdef012345';
const TOKEN_SECRET = 'token-secret-0123456789abcdef012';

const ENV_KEYS = [
  'AGORA_MCP_TOKEN',
  'AGORA_OAUTH_CLIENT_ID',
  'AGORA_OAUTH_CLIENT_SECRET',
  'AGORA_TOKEN_SECRET',
  'AGORA_HOUSEHOLD_PASSCODE',
  'AGORA_PUBLIC_URL',
  'AGORA_ALLOW_DEV_TOKEN',
  'AGORA_OAUTH_REDIRECT_URIS',
  'AGORA_TRUST_PROXY',
  'NODE_ENV',
] as const;

const savedEnv = new Map<string, string | undefined>();
let dir = '';
let server: Server | null = null;
let base = '';

function basic(id = 'agora-client', secret = 'agora-secret'): string {
  return `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`;
}

async function listen(): Promise<void> {
  server = createServer((req, res) => {
    if (!handleMcpRoutes(req, res)) {
      res.writeHead(404).end('Not found');
    }
  });
  await new Promise<void>((resolve) => {
    server?.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No port');
  base = `http://127.0.0.1:${address.port}`;
}

async function tokenRequest(headers: Record<string, string>, body: URLSearchParams): Promise<Response> {
  return fetch(`${base}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
    body,
  });
}

beforeEach(async () => {
  for (const key of ENV_KEYS) savedEnv.set(key, process.env[key]);
  process.env.AGORA_MCP_TOKEN = DEV_TOKEN;
  process.env.AGORA_OAUTH_CLIENT_ID = 'agora-client';
  process.env.AGORA_OAUTH_CLIENT_SECRET = 'agora-secret';
  process.env.AGORA_TOKEN_SECRET = TOKEN_SECRET;
  process.env.AGORA_HOUSEHOLD_PASSCODE = 'home-pass';
  delete process.env.AGORA_PUBLIC_URL;
  delete process.env.AGORA_ALLOW_DEV_TOKEN;
  delete process.env.AGORA_OAUTH_REDIRECT_URIS;
  delete process.env.AGORA_TRUST_PROXY;
  noteBindHost('');
  resetPasscodeLimiter();
  resetOauthState();
  dir = await mkdtemp(path.join(tmpdir(), 'agora-oauth-'));
  setDataDir(dir);
  await listen();
});

afterEach(async () => {
  if (server) {
    const closing = server;
    server = null;
    await new Promise<void>((resolve) => closing.close(() => resolve()));
  }
  await rm(dir, { recursive: true, force: true });
  resetOauthState();
  for (const [key, value] of savedEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('OAuth', () => {
  it('publishes the authorization server and protected resource metadata', async () => {
    const auth = await fetch(`${base}/.well-known/oauth-authorization-server`);
    expect(auth.status).toBe(200);
    const metadata = await auth.json() as Record<string, unknown>;
    expect(metadata.issuer).toBe(base);
    expect(metadata.authorization_endpoint).toBe(`${base}/oauth/authorize`);
    expect(metadata.token_endpoint).toBe(`${base}/oauth/token`);
    expect(metadata.grant_types_supported).toEqual(['client_credentials', 'authorization_code', 'refresh_token']);
    expect(metadata.response_types_supported).toEqual(['code']);
    expect(metadata.code_challenge_methods_supported).toEqual(['S256']);
    expect(metadata.token_endpoint_auth_methods_supported).toEqual(['client_secret_basic', 'client_secret_post']);
    expect(metadata.scopes_supported).toEqual(['mcp:service', 'mcp:tools', 'mcp:resources']);

    const resource = await fetch(`${base}/.well-known/oauth-protected-resource/mcp`);
    expect(resource.status).toBe(200);
    const doc = await resource.json() as { resource: string; authorization_servers: string[]; scopes_supported: string[] };
    expect(doc.resource).toBe(`${base}/mcp`);
    expect(doc.authorization_servers).toEqual([base]);
    expect(doc.scopes_supported).toContain('mcp:tools');
  });

  it('accepts the client secret in HTTP Basic or the form body, and rejects both', async () => {
    const missing = await tokenRequest({}, new URLSearchParams({ grant_type: 'client_credentials' }));
    expect(missing.status).toBe(401);
    expect((await missing.json() as { error: string }).error).toBe('invalid_client');

    const wrong = await tokenRequest(
      { authorization: basic('agora-client', 'nope') },
      new URLSearchParams({ grant_type: 'client_credentials' }),
    );
    expect(wrong.status).toBe(401);
    expect((await wrong.json() as { error: string }).error).toBe('invalid_client');

    const posted = await tokenRequest({}, new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: 'agora-client',
      client_secret: 'agora-secret',
    }));
    expect(posted.status).toBe(200);

    const both = await tokenRequest(
      { authorization: basic() },
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: 'agora-client',
        client_secret: 'agora-secret',
      }),
    );
    expect(both.status).toBe(401);
    expect((await both.json() as { error: string }).error).toBe('invalid_client');
  });

  it('issues a service token and rejects a mismatched resource', async () => {
    const ok = await tokenRequest(
      { authorization: basic() },
      new URLSearchParams({ grant_type: 'client_credentials', resource: `${base}/mcp` }),
    );
    expect(ok.status).toBe(200);
    const body = await ok.json() as { access_token: string; expires_in: number; scope: string; token_type: string };
    expect(body.token_type).toBe('Bearer');
    expect(body.scope).toBe('mcp:service');
    expect(body.expires_in).toBeLessThanOrEqual(3600);
    expect(body.access_token).not.toContain('agora-secret');

    const bad = await tokenRequest(
      { authorization: basic() },
      new URLSearchParams({ grant_type: 'client_credentials', resource: 'https://evil.example/mcp' }),
    );
    expect(bad.status).toBe(400);
    expect((await bad.json() as { error: string }).error).toBe('invalid_target');
  });

  it('completes the PKCE flow and rotates the refresh token', async () => {
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const redirectUri = 'http://127.0.0.1/callback';
    const query = new URLSearchParams({
      response_type: 'code',
      client_id: 'agora-client',
      redirect_uri: redirectUri,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state: 'xyz',
    });
    const blocked = await fetch(`${base}/oauth/authorize?${new URLSearchParams({
      response_type: 'code',
      client_id: 'agora-client',
      redirect_uri: 'http://evil.example/steal',
      code_challenge: challenge,
      code_challenge_method: 'S256',
    })}`);
    expect(blocked.status).toBe(400);
    expect(blocked.headers.get('location')).toBeNull();

    const page = await fetch(`${base}/oauth/authorize?${query}`);
    expect(page.status).toBe(200);
    expect(page.headers.get('content-security-policy')).toBe("frame-ancestors 'none'");
    expect(page.headers.get('x-frame-options')).toBe('DENY');
    expect(await page.text()).toContain('Household passcode');

    const denied = await fetch(`${base}/oauth/authorize`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        response_type: 'code',
        client_id: 'agora-client',
        redirect_uri: redirectUri,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state: 'xyz',
        passcode: 'wrong',
      }),
      redirect: 'manual',
    });
    expect(denied.status).toBe(401);
    expect(denied.headers.get('location')).toBeNull();

    const allowed = await fetch(`${base}/oauth/authorize`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        response_type: 'code',
        client_id: 'agora-client',
        redirect_uri: redirectUri,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state: 'xyz',
        passcode: 'home-pass',
      }),
      redirect: 'manual',
    });
    expect(allowed.status).toBe(302);
    const location = new URL(allowed.headers.get('location') ?? '');
    expect(location.origin + location.pathname).toBe(redirectUri);
    expect(location.searchParams.get('state')).toBe('xyz');
    const code = location.searchParams.get('code');
    expect(code).toBeTruthy();

    const exchanged = await tokenRequest(
      { authorization: basic() },
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: code ?? '',
        redirect_uri: redirectUri,
        code_verifier: verifier,
      }),
    );
    expect(exchanged.status).toBe(200);
    const tokens = await exchanged.json() as { access_token: string; refresh_token: string; scope: string; expires_in: number };
    expect(tokens.scope).toBe('mcp:tools mcp:resources');
    expect(tokens.expires_in).toBeLessThanOrEqual(3600);
    expect(tokens.refresh_token).toBeTruthy();

    const reused = await tokenRequest(
      { authorization: basic() },
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: code ?? '',
        redirect_uri: redirectUri,
        code_verifier: verifier,
      }),
    );
    expect(reused.status).toBe(400);
    expect((await reused.json() as { error: string }).error).toBe('invalid_grant');

    const refreshed = await tokenRequest(
      { authorization: basic() },
      new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token }),
    );
    expect(refreshed.status).toBe(200);
    const next = await refreshed.json() as { access_token: string; refresh_token: string };
    expect(next.access_token).not.toBe(tokens.access_token);
    expect(next.refresh_token).not.toBe(tokens.refresh_token);

    const replay = await tokenRequest(
      { authorization: basic() },
      new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token }),
    );
    expect(replay.status).toBe(400);
    expect((await replay.json() as { error: string }).error).toBe('invalid_grant');

    const replacement = await tokenRequest(
      { authorization: basic() },
      new URLSearchParams({ grant_type: 'refresh_token', refresh_token: next.refresh_token }),
    );
    expect(replacement.status).toBe(400);
    const dead = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${next.access_token}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
    });
    expect(dead.status).toBe(401);
  });

  it('rejects an expired token and a tampered token', async () => {
    setOauthClock(() => 1_700_000_000_000);
    const issued = await tokenRequest(
      { authorization: basic() },
      new URLSearchParams({ grant_type: 'client_credentials' }),
    );
    const token = (await issued.json() as { access_token: string }).access_token;
    const headers = {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    };
    const fresh = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
    });
    expect(fresh.status).not.toBe(401);

    setOauthClock(() => 1_700_000_000_000 + 3600 * 1000);
    const expired = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
    });
    expect(expired.status).toBe(401);
    expect(await expired.text()).toBe('');
    expect(expired.headers.get('www-authenticate')).toBeNull();

    setOauthClock(() => 1_700_000_000_000);
    const last = token.slice(-1);
    const tampered = `${token.slice(0, -1)}${last === 'a' ? 'b' : 'a'}`;
    const forged = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: { ...headers, authorization: `Bearer ${tampered}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
    });
    expect(forged.status).toBe(401);
  });

  it('returns 503 for OAuth when secrets are unset and still accepts the dev token', async () => {
    delete process.env.AGORA_OAUTH_CLIENT_ID;
    delete process.env.AGORA_TOKEN_SECRET;
    const metadata = await fetch(`${base}/.well-known/oauth-authorization-server`);
    expect(metadata.status).toBe(503);
    const body = await metadata.json() as { error: string; error_description: string };
    expect(body.error).toBe('server_error');
    expect(body.error_description).toContain('AGORA_TOKEN_SECRET');

    const denied = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: '{}',
    });
    expect(denied.status).toBe(401);

    const allowed = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${DEV_TOKEN}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    expect(allowed.status).not.toBe(401);
    expect(allowed.status).not.toBe(503);
  });

  it('refuses OAuth when the token secret is shorter than 32 characters', async () => {
    process.env.AGORA_TOKEN_SECRET = 'short-secret';
    const errors: string[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((message?: unknown) => {
      errors.push(String(message));
    });
    const metadata = await fetch(`${base}/.well-known/oauth-authorization-server`);
    spy.mockRestore();
    expect(metadata.status).toBe(503);
    const body = await metadata.json() as { error_description: string };
    expect(body.error_description).toContain('32');
    expect(errors.join('\n')).toContain('shorter than 32');
    expect(errors.join('\n')).not.toContain('short-secret');
  });

  it('ignores a dev token in production and on an https public URL unless allowed', async () => {
    process.env.NODE_ENV = 'production';
    const production = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${DEV_TOKEN}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
    });
    expect(production.status).toBe(401);
    process.env.AGORA_ALLOW_DEV_TOKEN = '1';
    const allowed = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${DEV_TOKEN}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
    });
    expect(allowed.status).not.toBe(401);
  });

  it('requires state and an exact registered redirect', async () => {
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const missingState = await fetch(`${base}/oauth/authorize?${new URLSearchParams({
      response_type: 'code',
      client_id: 'agora-client',
      redirect_uri: 'http://127.0.0.1/callback',
      code_challenge: challenge,
      code_challenge_method: 'S256',
    })}`);
    expect(missingState.status).toBe(400);
    expect(await missingState.text()).toContain('state is required');

    const https = await fetch(`${base}/oauth/authorize?${new URLSearchParams({
      response_type: 'code',
      client_id: 'agora-client',
      redirect_uri: 'https://alexa.amazon.com/api/skill/link/cb',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state: 'region',
    })}`);
    expect(https.status).toBe(400);

    process.env.AGORA_OAUTH_REDIRECT_URIS = 'https://alexa.amazon.com/api/skill/link/cb, https://layla.amazon.com/api/skill/link/cb';
    const registered = await fetch(`${base}/oauth/authorize?${new URLSearchParams({
      response_type: 'code',
      client_id: 'agora-client',
      redirect_uri: 'https://alexa.amazon.com/api/skill/link/cb',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state: 'region',
    })}`);
    expect(registered.status).toBe(200);
  });

  it('keeps a refresh token after the in-memory records are dropped', async () => {
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const redirectUri = 'http://127.0.0.1/callback';
    const allowed = await fetch(`${base}/oauth/authorize`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        response_type: 'code',
        client_id: 'agora-client',
        redirect_uri: redirectUri,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state: 'keep',
        passcode: 'home-pass',
      }),
      redirect: 'manual',
    });
    const code = new URL(allowed.headers.get('location') ?? '').searchParams.get('code') ?? '';
    const exchanged = await tokenRequest({}, new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: 'agora-client',
      client_secret: 'agora-secret',
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }));
    expect(exchanged.status).toBe(200);
    const tokens = await exchanged.json() as { refresh_token: string };
    await flushOauthWrites();
    await reloadOauthFromDisk();
    const refreshed = await tokenRequest(
      { authorization: basic() },
      new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token }),
    );
    expect(refreshed.status).toBe(200);
  });

  it('locks the authorize passcode after five misses', async () => {
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const body = new URLSearchParams({
      response_type: 'code',
      client_id: 'agora-client',
      redirect_uri: 'http://127.0.0.1/callback',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state: 'lock',
      passcode: 'wrong',
    });
    for (let i = 0; i < 4; i += 1) {
      const attempt = await fetch(`${base}/oauth/authorize`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
      });
      expect(attempt.status).toBe(401);
    }
    const blocked = await fetch(`${base}/oauth/authorize`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    expect(blocked.status).toBe(429);
    expect(await blocked.text()).toContain('Too many attempts');
  });
});
