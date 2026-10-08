import { createServer, type Server } from 'http';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listPendingApprovals, clearPendingApprovals } from '../household/approvals';
import { addMemory } from '../household/memoryStore';
import { setDataDir } from '../household/store';
import { defaultServerProvider } from '../llm/serverProvider';
import type { ToolCreate } from '../llm/toolLoop';
import { getRunRecord } from '../runEngine';
import type { ServerProvider } from '../society/provider';
import { setServerProviderFactory } from '../household/actions';
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
  process.env.AGORA_MCP_TOKEN = 'dev-token';
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

function planner(): ServerProvider {
  return {
    prepareRequest() {},
    takeUsage() {
      return { calls: 0, promptTokens: 0, completionTokens: 0, missingUsage: 0 };
    },
    async generateCompletion(_messages, _tools, systemInstruction) {
      const system = systemInstruction ?? '';
      if (system.includes('You lead this team')) {
        return {
          content: JSON.stringify([
            { id: 'a', title: 'Check the pantry', role: 'Scout', prompt: 'Look in the kitchen' },
            { id: 'b', title: 'Draft the menu', role: 'Planner', prompt: 'Draft seven dinners' },
          ]),
        };
      }
      if (system.includes('ONLY a JSON array')) return { content: '[]' };
      if (system.includes('spoken summary')) return { content: 'Dinners are planned.' };
      if (system.includes('You are Keeper')) return { content: 'No conflict.' };
      return { content: 'Pasta on Monday.' };
    },
  };
}

async function turn(body: { utterance: string; conversationId?: string }) {
  const response = await fetch(`${base}/api/alexa-sim/turn`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return parseSse(await response.text());
}

afterEach(async () => {
  setAlexaModel(null);
  setServerProviderFactory(defaultServerProvider);
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

  it('plans, waits for a plain yes, and starts one run', async () => {
    setServerProviderFactory(async () => planner());
    process.env.ALEXA_SIM_FAST_PATH = '0';
    const seen: string[][] = [];
    let creates = 0;
    const create: ToolCreate = async (params) => {
      creates += 1;
      seen.push((params.tools ?? []).map((tool) => tool.name));
      const again = params.messages.some((message) => message.role === 'assistant');
      if (again) {
        return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'I should not be called again.' }] };
      }
      return {
        stop_reason: 'tool_use',
        content: [{
          type: 'tool_use',
          id: 'plan_1',
          name: 'plan_and_run',
          input: { goal: 'Plan dinners for this week and add the groceries' },
        }],
      };
    };
    setAlexaModel(create);

    const planned = await turn({ utterance: 'Plan dinners for this week and add the groceries' });
    const approval = planned.find((event) => event.event === 'approval_required');
    const plannedFinal = planned[planned.length - 1];
    expect(approval?.data.summary).toContain('Check the pantry');
    expect(plannedFinal?.event).toBe('final');
    expect(plannedFinal?.data.text).toContain('Check the pantry');
    expect(plannedFinal?.data.text).toContain('Should I go ahead?');
    expect(plannedFinal?.data.runId).toBeUndefined();
    expect(creates).toBe(1);
    expect(seen.every((names) => !names.includes('approve_action'))).toBe(true);
    expect(seen[0]?.length).toBeGreaterThan(0);
    const conversationId = String(plannedFinal?.data.conversationId ?? '');

    process.env.ALEXA_SIM_FAST_PATH = '1';
    const qualified = await turn({ utterance: 'yes but not Tuesday', conversationId });
    expect(qualified[0]?.data.text).toBe('I need a plain yes or no.');
    expect(qualified.some((event) => event.event === 'approval_required')).toBe(false);
    expect(qualified[qualified.length - 1]?.data.runId).toBeUndefined();
    expect(creates).toBe(1);
    expect(listPendingApprovals()).toHaveLength(1);

    const approved = await turn({ utterance: 'yes', conversationId });
    const approvedFinal = approved[approved.length - 1];
    expect(approvedFinal?.event).toBe('final');
    const runId = String(approvedFinal?.data.runId ?? '');
    expect(runId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(approved.filter((event) => event.event === 'final' && event.data.runId).length).toBe(1);

    const again = await turn({ utterance: 'yes', conversationId });
    expect(again.some((event) => event.data.runId)).toBe(false);
    expect(again[again.length - 1]?.data.text).not.toContain(runId);

    const startedAt = Date.now();
    let status = 'running';
    while (Date.now() - startedAt < 4000) {
      const record = await getRunRecord(runId);
      if (record && record.status !== 'running' && record.status !== 'cancel_requested') {
        status = record.status;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
    expect(status === 'running').toBe(false);
  });

  it('refuses approve_action when the model asks for it', async () => {
    process.env.ALEXA_SIM_FAST_PATH = '0';
    let creates = 0;
    const create: ToolCreate = async () => {
      creates += 1;
      if (creates > 1) return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'again' }] };
      return {
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', id: 'own', name: 'approve_action', input: { approvalId: 'nope', decision: 'approve' } }],
      };
    };
    setAlexaModel(create);
    const events = await turn({ utterance: 'yes please do it now' });
    const result = events.find((event) => event.event === 'tool_result');
    expect(result?.data.status).toBe('error');
    expect(result?.data.speech).toBe('A person has to say yes or no.');
    expect(creates).toBe(1);
    expect(events[events.length - 1]?.data.text).toBe('A person has to say yes or no.');
  });

  it('speaks the fact a forget is about to remove', async () => {
    await addMemory('Mia is allergic to peanuts', ['allergy'], 'ui');
    process.env.ALEXA_SIM_FAST_PATH = '0';
    let creates = 0;
    const create: ToolCreate = async (params) => {
      creates += 1;
      const last = params.messages[params.messages.length - 1];
      const blob = JSON.stringify(last?.content ?? '');
      if (blob.includes('tool_result')) {
        expect(blob).not.toContain('peanuts');
        expect(blob).not.toContain('approvalId');
        return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'again' }] };
      }
      return {
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', id: 'forget_1', name: 'forget', input: { query: 'peanuts' } }],
      };
    };
    setAlexaModel(create);
    const events = await turn({ utterance: 'forget the peanut allergy' });
    expect(creates).toBe(1);
    const approval = events.find((event) => event.event === 'approval_required');
    expect(approval?.data.summary).toBe('Forget that Mia is allergic to peanuts? Say yes or no.');
    expect(events[events.length - 1]?.data.text).toBe('Forget that Mia is allergic to peanuts? Say yes or no.');
  });

  it('tells the person an order cannot be placed', async () => {
    process.env.ALEXA_SIM_FAST_PATH = '0';
    const create: ToolCreate = async (params) => {
      const last = params.messages[params.messages.length - 1];
      const blob = JSON.stringify(last?.content ?? '');
      if (blob.includes('cannot place orders')) {
        return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'AGORA+ can plan and list, but it cannot place orders, buy, book, pay, or call.' }] };
      }
      return {
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', id: 'order_1', name: 'plan_and_run', input: { goal: 'order lunch' } }],
      };
    };
    setAlexaModel(create);
    const events = await turn({ utterance: 'order lunch' });
    expect(events.some((event) => event.event === 'approval_required')).toBe(false);
    expect(events[events.length - 1]?.data.text).toMatch(/cannot place orders/i);
    expect(listPendingApprovals()).toHaveLength(0);
  });

  it('aborts the model call when the client disconnects', async () => {
    process.env.ALEXA_SIM_FAST_PATH = '0';
    let ran = 0;
    let stopped = false;
    let started: () => void = () => {};
    const startedTurn = new Promise<void>((resolve) => {
      started = resolve;
    });
    const create: ToolCreate = (params) => new Promise((resolve, reject) => {
      started();
      const timer = setTimeout(() => {
        ran += 1;
        resolve({
          stop_reason: 'tool_use',
          content: [{ type: 'tool_use', id: 'late', name: 'remember', input: { fact: 'late fact' } }],
        });
      }, 5_000);
      const stop = () => {
        stopped = true;
        clearTimeout(timer);
        reject(new Error('disconnected'));
      };
      if (params.signal?.aborted) stop();
      else params.signal?.addEventListener('abort', stop, { once: true });
    });
    setAlexaModel(create);
    const controller = new AbortController();
    const response = await fetch(`${base}/api/alexa-sim/turn`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ utterance: 'tell me something long' }),
      signal: controller.signal,
    });
    const reader = response.body?.getReader();
    const reading = (async () => {
      if (!reader) return;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
      }
    })();
    const startedOrTimeout = Promise.race([
      startedTurn,
      new Promise<void>((_resolve, reject) => {
        setTimeout(() => reject(new Error('model did not start')), 2000);
      }),
    ]);
    await startedOrTimeout;
    controller.abort();
    await reading.catch(() => undefined);
    const deadline = Date.now() + 1000;
    while (!stopped && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(stopped).toBe(true);
    expect(ran).toBe(0);
  });
});
