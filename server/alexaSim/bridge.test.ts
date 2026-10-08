import { createServer, type Server } from 'http';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearPendingApprovals } from '../household/approvals';
import { setDataDir } from '../household/store';
import type { ToolCreate } from '../llm/toolLoop';
import { handleMcpRoutes } from '../mcp/http';
import { resetOauthState } from '../mcp/oauth';
import { handleApiRoutes } from '../routes';
import { setAlexaModel } from './bridge';
import { resetConversations } from './conversation';
import { resetAlexaAuth } from './oauthClient';

const ENV = ['AGORA_MCP_TOKEN', 'AGORA_SELF_URL', 'AGORA_HOUSEHOLD_PASSCODE', 'AGORA_OAUTH_CLIENT_ID', 'AGORA_OAUTH_CLIENT_SECRET', 'AGORA_TOKEN_SECRET', 'AGORA_SERVER_LLM', 'ALEXA_SIM_FAST_PATH'] as const;
const saved = new Map<string, string | undefined>();

let dir = '';
let server: Server | null = null;
let base = '';

function parseSse(text: string): { event: string; data: Record<string, unknown> }[] {
  const events: { event: string; data: Record<string, unknown> }[] = [];
  for (const chunk of text.split('\n\n')) {
    if (!chunk.trim()) continue;
    let event = 'message';
    const data: string[] = [];
    for (const line of chunk.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).trim());
    }
    if (data.length === 0) continue;
    events.push({ event, data: JSON.parse(data.join('\n')) as Record<string, unknown> });
  }
  return events;
}

beforeEach(async () => {
  for (const key of ENV) saved.set(key, process.env[key]);
  process.env.AGORA_MCP_TOKEN = 'dev-token-0123456789abcdef012345';
  delete process.env.ALEXA_SIM_FAST_PATH;
  delete process.env.AGORA_SELF_URL;
  delete process.env.AGORA_HOUSEHOLD_PASSCODE;
  delete process.env.AGORA_OAUTH_CLIENT_ID;
  delete process.env.AGORA_OAUTH_CLIENT_SECRET;
  delete process.env.AGORA_TOKEN_SECRET;
  delete process.env.AGORA_SERVER_LLM;
  resetOauthState();
  resetAlexaAuth();
  resetConversations();
  clearPendingApprovals();
  dir = await mkdtemp(path.join(tmpdir(), 'agora-voice-'));
  setDataDir(dir);
  server = createServer((req, res) => {
    if (handleApiRoutes(req, res) || handleMcpRoutes(req, res)) return;
    res.writeHead(404).end('Not found');
  });
  await new Promise<void>((resolve) => {
    server?.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No port');
  base = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  setAlexaModel(null);
  resetAlexaAuth();
  resetConversations();
  clearPendingApprovals();
  if (server) {
    const closing = server;
    server = null;
    await new Promise<void>((resolve) => closing.close(() => resolve()));
  }
  await rm(dir, { recursive: true, force: true });
  resetOauthState();
  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('alexa turn bridge', () => {
  it('acks first, then remembers through the model and finishes', async () => {
    process.env.ALEXA_SIM_FAST_PATH = '0';
    let step = 0;
    const create: ToolCreate = async () => {
      step += 1;
      if (step === 1) {
        return {
          stop_reason: 'tool_use',
          content: [{ type: 'tool_use', id: 'toolu_test', name: 'remember', input: { fact: 'X' } }],
        };
      }
      return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Saved.' }] };
    };
    setAlexaModel(create);
    const response = await fetch(`${base}/api/alexa-sim/turn`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ utterance: 'remember X' }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const events = parseSse(await response.text());
    expect(events[0]?.event).toBe('ack');
    expect(events[0]?.data.text).toBe('Got it, saving that.');
    const names = events.map((event) => event.event);
    const callAt = names.indexOf('tool_call');
    const resultAt = names.indexOf('tool_result');
    const finalAt = names.indexOf('final');
    expect(callAt).toBeGreaterThan(0);
    expect(resultAt).toBeGreaterThan(callAt);
    expect(finalAt).toBe(names.length - 1);
    expect(events[callAt]?.data.name).toBe('remember');
    const result = events[resultAt]?.data;
    expect(result?.status).toBe('ok');
    expect((result?.receipt as { verified?: boolean } | undefined)?.verified).toBe(true);
    expect(events[finalAt]?.data.text).toBe('Saved.');
    expect(events[finalAt]?.data.timings).toMatchObject({ route: 'model' });
  });

  it('remembers on the fast path when the model has no credentials', async () => {
    const create: ToolCreate = async () => {
      throw new Error('Failed to resolve AWS credentials from the credential provider chain.');
    };
    setAlexaModel(create);
    const response = await fetch(`${base}/api/alexa-sim/turn`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ utterance: 'remember X' }),
    });
    expect(response.status).toBe(200);
    const events = parseSse(await response.text());
    expect(events.some((event) => event.event === 'error')).toBe(false);
    const result = events.find((event) => event.event === 'tool_result');
    expect(result?.data.status).toBe('ok');
    expect((result?.data.receipt as { verified?: boolean } | undefined)?.verified).toBe(true);
    const finalEvent = events[events.length - 1];
    expect(finalEvent?.event).toBe('final');
    expect(finalEvent?.data.text).toBe("I'll remember that X");
    expect(finalEvent?.data.timings).toMatchObject({ route: 'fast' });
  });

  it('says the model is unavailable for an open question when credentials are missing', async () => {
    const create: ToolCreate = async () => {
      throw new Error('Failed to resolve AWS credentials from the credential provider chain.');
    };
    setAlexaModel(create);
    const response = await fetch(`${base}/api/alexa-sim/turn`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ utterance: 'tell me a joke' }),
    });
    const events = parseSse(await response.text());
    const error = events.find((event) => event.event === 'error');
    expect(error?.data.message).toBe("My thinking model isn't connected on this server yet. Simple requests like remembering, tasks and your briefing still work.");
    expect(String(error?.data.detail)).toMatch(/credentials/i);
    expect(events.some((event) => event.event === 'final')).toBe(false);
  });
});
