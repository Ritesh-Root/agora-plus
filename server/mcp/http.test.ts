import { createServer, type Server } from 'http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { noteBindHost } from '../hub';
import { handleMcpRoutes } from './http';
import { resetOauthState } from './oauth';

const TOKEN_SECRET = 'token-secret-0123456789abcdef012';

let server: Server | null = null;
let base = '';
const saved = new Map<string, string | undefined>();

function remember(name: string): void {
  saved.set(name, process.env[name]);
}

async function listen(): Promise<void> {
  server = createServer((req, res) => {
    if (!handleMcpRoutes(req, res)) res.writeHead(404).end('Not found');
  });
  await new Promise<void>((resolve) => {
    server?.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No port');
  base = `http://127.0.0.1:${address.port}`;
}

beforeEach(async () => {
  for (const name of ['AGORA_OAUTH_CLIENT_ID', 'AGORA_OAUTH_CLIENT_SECRET', 'AGORA_TOKEN_SECRET', 'AGORA_PUBLIC_URL', 'AGORA_TRUST_PROXY', 'AGORA_HOUSEHOLD_PASSCODE']) {
    remember(name);
  }
  process.env.AGORA_OAUTH_CLIENT_ID = 'agora-client';
  process.env.AGORA_OAUTH_CLIENT_SECRET = 'agora-secret';
  process.env.AGORA_TOKEN_SECRET = TOKEN_SECRET;
  process.env.AGORA_HOUSEHOLD_PASSCODE = 'home-pass';
  delete process.env.AGORA_PUBLIC_URL;
  delete process.env.AGORA_TRUST_PROXY;
  noteBindHost('');
  resetOauthState();
  await listen();
});

afterEach(async () => {
  if (server) {
    const closing = server;
    server = null;
    await new Promise<void>((resolve) => closing.close(() => resolve()));
  }
  noteBindHost('');
  resetOauthState();
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe('MCP HTTP guard', () => {
  it('refuses OAuth and MCP when the process is not on loopback and AGORA_PUBLIC_URL is unset', async () => {
    noteBindHost('0.0.0.0');
    const token = await fetch(`${base}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials' }),
    });
    expect(token.status).toBe(503);
    const body = await token.json() as { error_description: string };
    expect(body.error_description).toContain('AGORA_PUBLIC_URL');

    const mcp = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: '{}',
    });
    expect(mcp.status).toBe(503);

    process.env.AGORA_PUBLIC_URL = 'https://household.example';
    const open = await fetch(`${base}/.well-known/oauth-authorization-server`);
    expect(open.status).toBe(200);
    const metadata = await open.json() as { issuer: string };
    expect(metadata.issuer).toBe('https://household.example');
  });

  it('ignores X-Forwarded-Proto unless AGORA_TRUST_PROXY=1', async () => {
    const plain = await fetch(`${base}/.well-known/oauth-authorization-server`, {
      headers: { 'x-forwarded-proto': 'https' },
    });
    const plainBody = await plain.json() as { issuer: string };
    expect(plainBody.issuer.startsWith('http://')).toBe(true);

    process.env.AGORA_TRUST_PROXY = '1';
    const trusted = await fetch(`${base}/.well-known/oauth-authorization-server`, {
      headers: { 'x-forwarded-proto': 'https' },
    });
    const trustedBody = await trusted.json() as { issuer: string };
    expect(trustedBody.issuer.startsWith('https://')).toBe(true);
  });
});
