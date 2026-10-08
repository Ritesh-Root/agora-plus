import type { IncomingMessage, ServerResponse } from 'http';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setDataDir } from '../household/store';
import { resetOauthState } from '../mcp/oauth';
import { completeAlexaLink, handleAlexaLink, reloadAlexaAccount, resetAlexaAuth, simMode, simStatus, tokensForTurn } from './oauthClient';

const DEV_TOKEN = 'dev-token-0123456789abcdef012345';
const TOKEN_SECRET = 'token-secret-0123456789abcdef012';
const saved = new Map<string, string | undefined>();
let dir = '';

function remember(name: string): void {
  saved.set(name, process.env[name]);
}

function fakeReq(): IncomingMessage {
  return {
    headers: { host: '127.0.0.1:9' },
    socket: { localPort: 9 },
  } as IncomingMessage;
}

function fakeRes(): ServerResponse & { statusCode: number; body: string } {
  const res = {
    statusCode: 0,
    body: '',
    headersSent: false,
    writableEnded: false,
    writeHead(status: number) {
      res.statusCode = status;
      return res;
    },
    end(body?: string) {
      res.body = body ?? '';
      res.writableEnded = true;
      return res;
    },
  };
  return res as unknown as ServerResponse & { statusCode: number; body: string };
}

beforeEach(async () => {
  for (const name of ['AGORA_MCP_TOKEN', 'AGORA_OAUTH_CLIENT_ID', 'AGORA_OAUTH_CLIENT_SECRET', 'AGORA_TOKEN_SECRET', 'AGORA_PUBLIC_URL', 'AGORA_ALLOW_DEV_TOKEN', 'NODE_ENV']) {
    remember(name);
  }
  delete process.env.AGORA_PUBLIC_URL;
  delete process.env.AGORA_ALLOW_DEV_TOKEN;
  resetOauthState();
  resetAlexaAuth();
  dir = await mkdtemp(path.join(tmpdir(), 'agora-sim-'));
  setDataDir(dir);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  resetAlexaAuth();
  resetOauthState();
  await rm(dir, { recursive: true, force: true });
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe('simulator tokens', () => {
  it('does not fall back to the dev token once OAuth is configured', async () => {
    process.env.AGORA_OAUTH_CLIENT_ID = 'agora-client';
    process.env.AGORA_OAUTH_CLIENT_SECRET = 'agora-secret';
    process.env.AGORA_TOKEN_SECRET = TOKEN_SECRET;
    process.env.AGORA_MCP_TOKEN = DEV_TOKEN;
    expect(simMode()).toBe('oauth');
    expect(await tokensForTurn('http://127.0.0.1:9')).toBeNull();
  });

  it('ignores a short dev token and a dev token on an https public URL', async () => {
    delete process.env.AGORA_OAUTH_CLIENT_ID;
    delete process.env.AGORA_OAUTH_CLIENT_SECRET;
    delete process.env.AGORA_TOKEN_SECRET;
    process.env.AGORA_MCP_TOKEN = 'too-short';
    expect(simMode()).toBe('unconfigured');
    expect(await tokensForTurn('http://127.0.0.1:9')).toBeNull();

    process.env.AGORA_MCP_TOKEN = DEV_TOKEN;
    process.env.AGORA_PUBLIC_URL = 'https://household.example';
    expect(simMode()).toBe('unconfigured');
    process.env.AGORA_ALLOW_DEV_TOKEN = '1';
    expect(simMode()).toBe('dev-token');
    expect(await tokensForTurn('http://127.0.0.1:9')).toEqual({ list: DEV_TOKEN, call: DEV_TOKEN });
  });

  it('reloads the linked account after the process memory is cleared', async () => {
    process.env.AGORA_OAUTH_CLIENT_ID = 'agora-client';
    process.env.AGORA_OAUTH_CLIENT_SECRET = 'agora-secret';
    process.env.AGORA_TOKEN_SECRET = TOKEN_SECRET;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_in: 3600,
    }), { status: 200, headers: { 'content-type': 'application/json' } })));
    const res = fakeRes();
    handleAlexaLink(fakeReq(), res);
    const url = new URL(JSON.parse(res.body).url as string);
    const linked = await completeAlexaLink(fakeReq(), 'code-1', url.searchParams.get('state'));
    expect(linked.ok).toBe(true);
    resetAlexaAuth();
    expect(simStatus().linked).toBe(false);
    await reloadAlexaAccount();
    expect(simStatus().linked).toBe(true);
    expect(simStatus().mode).toBe('oauth');
  });
});
