import { createServer, type Server } from 'http';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { Client } from '@modelcontextprotocol/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearPendingApprovals } from '../household/approvals';
import { listMemory } from '../household/memoryStore';
import { setDataDir, writeJson } from '../household/store';
import { handleMcpRoutes } from './http';
import { resetOauthState } from './oauth';

const TOOLS = [
  'add_task',
  'approve_action',
  'ask_agora',
  'complete_task',
  'daily_briefing',
  'forget',
  'get_run_status',
  'list_tasks',
  'plan_and_run',
  'recall',
  'remember',
  'web_research',
];

const ENV_KEYS = [
  'AGORA_MCP_TOKEN',
  'AGORA_OAUTH_CLIENT_ID',
  'AGORA_OAUTH_CLIENT_SECRET',
  'AGORA_TOKEN_SECRET',
  'AGORA_HOUSEHOLD_PASSCODE',
  'AGORA_PUBLIC_URL',
] as const;

const savedEnv = new Map<string, string | undefined>();
let dir = '';
let server: Server | null = null;
let base = '';
let client: Client | null = null;
let transport: StreamableHTTPClientTransport | null = null;

function jsonHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
  };
  if (token) headers.authorization = `Bearer ${token}`;
  return headers;
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

async function connect(token: string): Promise<Client> {
  transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  client = new Client({ name: 'agora-test', version: '0.0.0' });
  await client.connect(transport);
  return client;
}

async function serviceToken(): Promise<string> {
  const basic = Buffer.from('agora-client:agora-secret').toString('base64');
  const response = await fetch(`${base}/oauth/token`, {
    method: 'POST',
    headers: {
      authorization: `Basic ${basic}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'client_credentials' }),
  });
  expect(response.status).toBe(200);
  const body = await response.json() as { access_token: string; scope: string };
  expect(body.scope).toBe('mcp:service');
  return body.access_token;
}

function structured(result: { structuredContent?: Record<string, unknown> }): Record<string, unknown> {
  return result.structuredContent ?? {};
}

beforeEach(async () => {
  for (const key of ENV_KEYS) savedEnv.set(key, process.env[key]);
  process.env.AGORA_MCP_TOKEN = 'dev-token';
  process.env.AGORA_OAUTH_CLIENT_ID = 'agora-client';
  process.env.AGORA_OAUTH_CLIENT_SECRET = 'agora-secret';
  process.env.AGORA_TOKEN_SECRET = 'token-secret';
  process.env.AGORA_HOUSEHOLD_PASSCODE = 'home-pass';
  delete process.env.AGORA_PUBLIC_URL;
  resetOauthState();
  clearPendingApprovals();
  dir = await mkdtemp(path.join(tmpdir(), 'agora-mcp-'));
  setDataDir(dir);
  await listen();
});

afterEach(async () => {
  await client?.close().catch(() => undefined);
  client = null;
  await transport?.close().catch(() => undefined);
  transport = null;
  if (server) {
    const closing = server;
    server = null;
    await new Promise<void>((resolve) => closing.close(() => resolve()));
  }
  await rm(dir, { recursive: true, force: true });
  resetOauthState();
  clearPendingApprovals();
  for (const [key, value] of savedEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('MCP endpoint', () => {
  it('answers 401 with an empty body and no WWW-Authenticate header', async () => {
    const response = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: '{}',
    });
    expect(response.status).toBe(401);
    expect(await response.text()).toBe('');
    expect(response.headers.get('www-authenticate')).toBeNull();
  });

  it('refuses a browser origin that is not this household', async () => {
    const response = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: { ...jsonHeaders('dev-token'), origin: 'https://evil.example' },
      body: '{}',
    });
    expect(response.status).toBe(403);
  });

  it('negotiates 2025-11-25 or newer and lists every tool with an output schema', async () => {
    const connected = await connect('dev-token');
    const version = connected.getNegotiatedProtocolVersion() ?? '';
    expect(version >= '2025-11-25').toBe(true);
    const listed = await connected.listTools();
    expect(listed.tools.map((tool) => tool.name).sort()).toEqual(TOOLS);
    for (const tool of listed.tools) {
      expect(tool.outputSchema).toBeTruthy();
      expect(tool.outputSchema?.properties).toHaveProperty('speech');
      expect(tool.outputSchema?.properties).toHaveProperty('status');
    }
  });

  it('remembers, recalls, and forgets only after approval', async () => {
    const connected = await connect('dev-token');
    const saved = await connected.callTool({
      name: 'remember',
      arguments: { fact: 'Mia is allergic to peanuts', tags: ['allergy'] },
    });
    const receipt = structured(saved).receipt as { verified?: boolean; action?: string };
    expect(saved.isError).toBeUndefined();
    expect(structured(saved).status).toBe('ok');
    expect(receipt.verified).toBe(true);
    expect(receipt.action).toBe('remember');
    expect(String((saved.content[0] as { text?: string }).text ?? '')).toContain('peanuts');

    const found = await connected.callTool({ name: 'recall', arguments: { query: 'peanuts' } });
    const memories = structured(found).memories as { text: string }[];
    expect(memories[0]?.text).toContain('peanuts');
    expect(String((found.content[0] as { text?: string }).text ?? '')).toContain('peanuts');

    const pending = await connected.callTool({ name: 'forget', arguments: { query: 'peanuts' } });
    expect(structured(pending).status).toBe('needs_approval');
    const approvalId = structured(pending).approvalId;
    expect(typeof approvalId).toBe('string');
    expect((await listMemory()).some((entry) => entry.text.includes('peanuts'))).toBe(true);

    const approved = await connected.callTool({
      name: 'approve_action',
      arguments: { approvalId, decision: 'approve' },
    });
    expect(structured(approved).status).toBe('ok');
    expect((structured(approved).receipt as { verified?: boolean }).verified).toBe(true);
    expect(await listMemory()).toEqual([]);

    const gone = await connected.callTool({ name: 'recall', arguments: { query: 'peanuts' } });
    expect(structured(gone).memories).toEqual([]);
  });

  it('lets a service token list tools and refuses a tool call', async () => {
    const token = await serviceToken();
    const connected = await connect(token);
    const listed = await connected.listTools();
    expect(listed.tools).toHaveLength(12);
    await expect(connected.callTool({ name: 'recall', arguments: { query: 'milk' } })).rejects.toThrow(/mcp:tools/);
  });

  it('holds a plan for approval and does not research the web yet', async () => {
    const connected = await connect('dev-token');
    const plan = await connected.callTool({ name: 'plan_and_run', arguments: { goal: 'Plan dinners this week' } });
    expect(plan.isError).toBeUndefined();
    expect(structured(plan).status).toBe('needs_approval');
    expect(typeof structured(plan).approvalId).toBe('string');
    expect(String(structured(plan).preview)).toContain('Plan dinners this week');

    const research = await connected.callTool({ name: 'web_research', arguments: { question: 'pasta prices' } });
    expect(research.isError).toBe(true);
    expect(structured(research).status).toBe('error');
    expect(String((research.content[0] as { text?: string }).text ?? '')).toContain('not configured');

    const briefing = await connected.callTool({ name: 'daily_briefing', arguments: {} });
    expect(briefing.isError).toBeUndefined();
    expect(typeof structured(briefing).speech).toBe('string');
    expect(String((briefing.content[0] as { text?: string }).text ?? '').length).toBeGreaterThan(0);

    const status = await connected.callTool({ name: 'get_run_status', arguments: {} });
    expect(status.isError).toBe(true);
    expect(structured(status).status).toBe('error');

    const runId = '11111111-1111-4111-8111-111111111111';
    await writeJson(`runs/${runId}.json`, {
      id: runId,
      brief: 'Plan dinners',
      source: 'household',
      status: 'complete',
      startedAt: '2026-10-08T00:00:00.000Z',
      finishedAt: '2026-10-08T00:01:00.000Z',
      tasks: [],
      synthesis: '# Dinners\n\nPasta.',
      wordCount: 1,
    });
    const finished = await connected.callTool({ name: 'get_run_status', arguments: { runId } });
    expect(structured(finished).finished).toBe(true);
    expect(finished.content.some((block) => block.type === 'resource_link' && block.uri === `agora://runs/${runId}/document`)).toBe(true);
    const document = await connected.readResource({ uri: `agora://runs/${runId}/document` });
    expect(document.contents[0]?.text).toContain('Pasta');

    const asked = await connected.callTool({
      name: 'remember',
      arguments: { fact: 'Mia is allergic to peanuts' },
    });
    expect(structured(asked).status).toBe('ok');
    const answer = await connected.callTool({ name: 'ask_agora', arguments: { question: 'What is Mia allergic to?' } });
    expect(answer.isError).toBeUndefined();
    expect(String((answer.content[0] as { text?: string }).text ?? '')).toContain('peanuts');
  });
});
