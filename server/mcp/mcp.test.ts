import { createServer, type Server } from 'http';
import { mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { Client } from '@modelcontextprotocol/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setResearchLookup, setServerProviderFactory } from '../household/actions';
import { clearPendingApprovals } from '../household/approvals';
import { listMemory } from '../household/memoryStore';
import { setDataDir, writeJson } from '../household/store';
import { defaultServerProvider } from '../llm/serverProvider';
import { quickResearch } from '../research/research';
import type { ServerProvider } from '../society/provider';
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
];

const ENV_KEYS = [
  'AGORA_MCP_TOKEN',
  'AGORA_OAUTH_CLIENT_ID',
  'AGORA_OAUTH_CLIENT_SECRET',
  'AGORA_TOKEN_SECRET',
  'AGORA_HOUSEHOLD_PASSCODE',
  'AGORA_PUBLIC_URL',
  'AGORA_SERVER_LLM',
  'AGORA_DECIDER',
  'DASHSCOPE_API_KEY',
  'EXA_API_KEY',
  'FIRECRAWL_API_KEY',
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
  process.env.AGORA_MCP_TOKEN = 'dev-token-0123456789abcdef012345';
  process.env.AGORA_OAUTH_CLIENT_ID = 'agora-client';
  process.env.AGORA_OAUTH_CLIENT_SECRET = 'agora-secret';
  process.env.AGORA_TOKEN_SECRET = 'token-secret-0123456789abcdef012';
  process.env.AGORA_HOUSEHOLD_PASSCODE = 'home-pass';
  delete process.env.AGORA_PUBLIC_URL;
  delete process.env.AGORA_SERVER_LLM;
  delete process.env.AGORA_DECIDER;
  delete process.env.DASHSCOPE_API_KEY;
  delete process.env.EXA_API_KEY;
  delete process.env.FIRECRAWL_API_KEY;
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
  setResearchLookup(quickResearch);
  setServerProviderFactory(defaultServerProvider);
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
      headers: { ...jsonHeaders('dev-token-0123456789abcdef012345'), origin: 'https://evil.example' },
      body: '{}',
    });
    expect(response.status).toBe(403);
  });

  it('negotiates 2025-11-25 or newer and lists every tool with an output schema', async () => {
    const connected = await connect('dev-token-0123456789abcdef012345');
    const version = connected.getNegotiatedProtocolVersion() ?? '';
    expect(version >= '2025-11-25').toBe(true);
    const listed = await connected.listTools();
    expect(listed.tools.map((tool) => tool.name).sort()).toEqual(TOOLS);
    for (const tool of listed.tools) {
      expect(tool.outputSchema).toBeTruthy();
      expect(tool.outputSchema?.properties).toHaveProperty('speech');
      expect(tool.outputSchema?.properties).toHaveProperty('status');
    }
    expect(listed.tools.some((tool) => tool.name === 'web_research')).toBe(false);
    expect(JSON.stringify(listed.tools.find((tool) => tool.name === 'remember')?.inputSchema)).toContain('"who"');
    expect(JSON.stringify(listed.tools.find((tool) => tool.name === 'add_task')?.inputSchema)).toContain('"dueAt"');
    expect(JSON.stringify(listed.tools.find((tool) => tool.name === 'add_task')?.inputSchema)).toContain('"list"');
    expect(JSON.stringify(listed.tools.find((tool) => tool.name === 'list_tasks')?.inputSchema)).toContain('"list"');
    expect(JSON.stringify(listed.tools.find((tool) => tool.name === 'recall')?.outputSchema)).toContain('"who"');
    expect(JSON.stringify(listed.tools.find((tool) => tool.name === 'complete_task')?.outputSchema)).toContain('"dueAt"');
    const caps = connected.getServerCapabilities() as { extensions?: Record<string, { mimeTypes?: string[] }> } | undefined;
    expect(caps?.extensions?.['io.modelcontextprotocol/ui']?.mimeTypes).toContain('text/html;profile=mcp-app');
  });

  it('remembers, recalls, and forgets only after approval', async () => {
    const connected = await connect('dev-token-0123456789abcdef012345');
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
    expect(listed.tools).toHaveLength(11);
    await expect(connected.callTool({ name: 'recall', arguments: { query: 'milk' } })).rejects.toThrow(/mcp:tools/);
  });

  it('does not approve a plan when planning is unavailable, and does not research the web yet', async () => {
    const connected = await connect('dev-token-0123456789abcdef012345');
    const plan = await connected.callTool({ name: 'plan_and_run', arguments: { goal: 'Plan dinners this week' } });
    expect(plan.isError).toBe(true);
    expect(structured(plan).status).toBe('error');
    expect(structured(plan).approvalId).toBeUndefined();
    expect(String(structured(plan).speech)).toMatch(/unavailable/i);

    const names = (await connected.listTools()).tools.map((tool) => tool.name);
    expect(names).not.toContain('web_research');

    const briefing = await connected.callTool({ name: 'daily_briefing', arguments: {} });
    expect(briefing.isError).toBeUndefined();
    expect(typeof structured(briefing).speech).toBe('string');
    expect(Array.isArray(structured(briefing).approvals)).toBe(true);
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

    const day = await connected.callTool({ name: 'daily_briefing', arguments: {} });
    expect(String(structured(day).speech)).toContain('Remember: Mia is allergic to peanuts');
    const dayMeta = day._meta as { ui?: { resourceUri?: string; invoking?: string; invoked?: string } } | undefined;
    expect(dayMeta?.ui?.resourceUri).toBe('ui://daily_briefing/household-card.html');
    expect(dayMeta?.ui?.invoking).toBeTruthy();
    expect(dayMeta?.ui?.invoked).toBeTruthy();
  });

  it('keeps one copy of a fact, names who, and does not call a finished task the first open task', async () => {
    const connected = await connect('dev-token');
    const saved = await connected.callTool({
      name: 'remember',
      arguments: { fact: 'Mia is allergic to peanuts' },
    });
    expect((structured(saved).memory as { who?: string }).who).toBe('Mia');
    const again = await connected.callTool({
      name: 'remember',
      arguments: { fact: 'Mia is allergic to peanuts.' },
    });
    expect(String(structured(again).speech)).toContain('already remember');
    expect(await listMemory()).toHaveLength(1);

    await connected.callTool({ name: 'add_task', arguments: { title: 'Old milk', list: 'shopping' } });
    await connected.callTool({ name: 'complete_task', arguments: { taskIdOrTitle: 'Old milk' } });
    const done = await connected.callTool({ name: 'list_tasks', arguments: { list: 'shopping' } });
    expect(String(structured(done).speech)).toContain('no open tasks');
    expect(String(structured(done).speech)).not.toContain('First is');
    expect((structured(done).tasks as { list?: string; status?: string }[])[0]).toMatchObject({
      list: 'shopping',
      status: 'done',
    });
    const taskMeta = done._meta as { ui?: { resourceUri?: string } } | undefined;
    expect(taskMeta?.ui?.resourceUri).toBe('ui://daily_briefing/household-card.html');
  });

  it('returns source links from web research only when a key is configured', async () => {
    process.env.EXA_API_KEY = 'test-key';
    setResearchLookup(async () => ({
      sources: [{ title: 'Market price', url: 'https://example.com/pasta' }],
      context: 'Pasta costs two dollars.',
    }));
    const provider: ServerProvider = {
      prepareRequest() {},
      takeUsage() {
        return { calls: 0, promptTokens: 0, completionTokens: 0, missingUsage: 0 };
      },
      async generateCompletion() {
        return { content: 'Pasta costs two dollars.' };
      },
    };
    setServerProviderFactory(async () => provider);
    const connected = await connect('dev-token');
    const listed = await connected.listTools();
    expect(listed.tools.map((tool) => tool.name)).toContain('web_research');
    expect(JSON.stringify(listed.tools.find((tool) => tool.name === 'web_research')?.outputSchema)).toContain('"url"');
    const research = await connected.callTool({ name: 'web_research', arguments: { question: 'pasta prices' } });
    expect(research.isError).toBeUndefined();
    expect(structured(research).sources).toEqual([{ title: 'Market price', url: 'https://example.com/pasta' }]);
    expect(String(structured(research).speech)).not.toMatch(/https?:/);
    expect(String((research.content[0] as { text?: string }).text ?? '')).not.toMatch(/https?:/);
  });

  it('turns on account linking and keeps the store listing in household language', async () => {
    const addon = JSON.parse(await readFile(new URL('../../alexa-addon/addon.json', import.meta.url), 'utf8')) as {
      accountLinking: {
        enabled: boolean;
        type: string;
        pkce: string;
        scopes: string[];
        authorizationUrl: string;
        accessTokenUrl: string;
      };
      storeListing: { locales: { 'en-US': { shortDescription: string; fullDescription: string; examplePhrases: string[] } } };
    };
    expect(addon.accountLinking).toMatchObject({
      enabled: true,
      type: 'AUTHORIZATION_CODE',
      pkce: 'S256',
      scopes: ['mcp:tools', 'mcp:resources'],
      authorizationUrl: 'https://<host>/oauth/authorize',
      accessTokenUrl: 'https://<host>/oauth/token',
    });
    const locale = addon.storeListing.locales['en-US'];
    const prose = `${locale.shortDescription}\n${locale.fullDescription}\n${locale.examplePhrases.join('\n')}`;
    expect(prose).not.toMatch(/\b(MCP|server|API)\b/);
    expect(prose).not.toMatch(/\b(remember|recall|forget|add_task|list_tasks|complete_task|daily_briefing|plan_and_run|approve_action|ask_agora|get_run_status|web_research)\b/);
    expect(addon.accountLinking.authorizationUrl).toContain('<host>');
  });

  it('serves the household card and links it from the briefing', async () => {
    const connected = await connect('dev-token-0123456789abcdef012345');
    const uri = 'ui://daily_briefing/household-card.html';
    const listed = await connected.listResources();
    const card = listed.resources.find((resource) => resource.uri === uri);
    expect(card?.mimeType).toBe('text/html;profile=mcp-app');
    const read = await connected.readResource({ uri });
    const html = read.contents[0]?.text ?? '';
    expect(read.contents[0]?.mimeType).toBe('text/html;profile=mcp-app');
    expect(html).toContain('<script>');
    expect(html).toContain('complete_task');
    expect(html).toContain('approve_action');
    expect(html).not.toContain('fonts.googleapis');
    const tools = await connected.listTools();
    const briefing = tools.tools.find((tool) => tool.name === 'daily_briefing');
    const tasks = tools.tools.find((tool) => tool.name === 'list_tasks');
    const meta = briefing?._meta as { ui?: { resourceUri?: string } } | undefined;
    const taskMeta = tasks?._meta as { ui?: { resourceUri?: string } } | undefined;
    expect(meta?.ui?.resourceUri).toBe(uri);
    expect(taskMeta?.ui?.resourceUri).toBe(uri);
  }, 20000);
});
