import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { IncomingMessage, ServerResponse } from 'http';
import type { BedrockCreateParams } from '../llm/bedrockProvider';
import { getBedrock } from '../llm/serverProvider';
import { runToolLoop, type ToolCreate, type ToolCreateParams, type ToolCreateResult, type ToolDefinition } from '../llm/toolLoop';
import { acknowledge } from './ack';
import { PLAIN_APPROVAL, qualifiedApproval } from './approvalWords';
import { openConversation, saveConversation, type Conversation, type StoredTool } from './conversation';
import { fastPathEnabled, routeFast, type FastRoute } from './fastPath';
import { alexaModelName, bearerFetch, selfBase, tokensForTurn } from './oauthClient';
import { formatSseEvent } from './sse';

/**
 * One spoken turn. The acknowledgement is written before any model or MCP call.
 * Tools are reached through the real /mcp endpoint, never through household actions.
 */

const LINK_MESSAGE = 'Press Link AGORA+ to connect this household.';
const MODEL_OFFLINE = "My thinking model isn't connected on this server yet. Simple requests like remembering, tasks and your briefing still work.";

let modelOverride: ToolCreate | null = null;

export function setAlexaModel(create: ToolCreate | null): void {
  modelOverride = create;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  if (res.headersSent || res.writableEnded) return;
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function publicError(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (!message || /secret|token|bearer|akia/i.test(message)) return 'The voice turn failed.';
  return message.slice(0, 240);
}

function missingCredentials(error: unknown): boolean {
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /credential|NoCredentials|not configured|UnrecognizedClient|ExpiredToken/i.test(`${name} ${message}`);
}

/** Shown in the trace. Spoken text stays separate when the model has no credentials. */
function technicalDetail(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (!message.trim() || /akia|secret|bearer\s+[a-z0-9._~+/-]/i.test(message)) return 'The voice turn failed.';
  return message.slice(0, 500);
}

function modelFailure(error: unknown): { message: string; detail: string } {
  return {
    message: missingCredentials(error) ? MODEL_OFFLINE : publicError(error),
    detail: technicalDetail(error),
  };
}

async function bedrockCreate(params: ToolCreateParams): Promise<ToolCreateResult> {
  const message = await getBedrock().createMessage({
    model: params.model,
    max_tokens: params.max_tokens,
    system: params.system,
    tools: params.tools as BedrockCreateParams['tools'],
    messages: params.messages as BedrockCreateParams['messages'],
  }, { timeout: 20_000, maxRetries: 0, signal: params.signal });
  return { stop_reason: message.stop_reason, content: message.content };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toAnthropicTools(tools: StoredTool[]): ToolDefinition[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: { ...tool.inputSchema, type: 'object' as const },
  }));
}

function storeTools(tools: ReadonlyArray<{ name: string; description?: string; inputSchema: unknown; outputSchema?: unknown }>): StoredTool[] {
  return tools.map((tool) => {
    const raw = tool.inputSchema;
    const input = raw && typeof raw === 'object' && !Array.isArray(raw)
      ? { ...(raw as Record<string, unknown>) }
      : {};
    const stored: StoredTool = { name: tool.name, inputSchema: input };
    if (tool.description) stored.description = tool.description;
    if (tool.outputSchema && typeof tool.outputSchema === 'object' && !Array.isArray(tool.outputSchema)) {
      stored.outputSchema = { ...(tool.outputSchema as Record<string, unknown>) };
    }
    return stored;
  });
}

interface ParsedTool {
  speech: string;
  status: 'ok' | 'needs_approval' | 'error';
  receipt?: { action?: string; id?: string; verified?: boolean; at?: string };
  approvalId?: string;
  summary?: string;
  runId?: string;
  forModel: Record<string, unknown>;
}

function parseTool(result: { isError?: boolean; content?: ReadonlyArray<{ type?: string; text?: string }>; structuredContent?: unknown }): ParsedTool {
  const structured = asRecord(result.structuredContent) ?? {};
  const text = result.content?.find((block) => block.type === 'text' && typeof block.text === 'string')?.text ?? '';
  const speech = typeof structured.speech === 'string' ? structured.speech : (text || 'Done.');
  const status = structured.status === 'needs_approval' || structured.status === 'error' || structured.status === 'ok'
    ? structured.status
    : result.isError ? 'error' : 'ok';
  const receiptRecord = asRecord(structured.receipt);
  const receipt = receiptRecord
    ? {
      ...(typeof receiptRecord.action === 'string' ? { action: receiptRecord.action } : {}),
      ...(typeof receiptRecord.id === 'string' ? { id: receiptRecord.id } : {}),
      ...(typeof receiptRecord.verified === 'boolean' ? { verified: receiptRecord.verified } : {}),
      ...(typeof receiptRecord.at === 'string' ? { at: receiptRecord.at } : {}),
    }
    : undefined;
  const approvalId = typeof structured.approvalId === 'string' ? structured.approvalId : undefined;
  const summaryText = typeof structured.summary === 'string' && structured.summary.trim()
    ? structured.summary
    : typeof structured.preview === 'string' && structured.preview.trim()
      ? structured.preview
      : undefined;
  const runId = typeof structured.runId === 'string' && structured.runId.trim() ? structured.runId : undefined;
  const forModel: Record<string, unknown> = status === 'needs_approval'
    ? { status, speech: 'Waiting for a person to say yes or no.' }
    : { speech, status };
  if (status !== 'needs_approval' && receipt) forModel.receipt = receipt;
  return {
    speech,
    status,
    ...(receipt ? { receipt } : {}),
    ...(approvalId ? { approvalId } : {}),
    ...(summaryText ? { summary: summaryText } : {}),
    ...(runId ? { runId } : {}),
    forModel,
  };
}

function asArgs(input: unknown): Record<string, unknown> {
  const record = asRecord(input);
  return record ?? {};
}

function noteTool(conversation: Conversation, name: string, parsed: ParsedTool): void {
  if (name === 'approve_action') {
    if (parsed.status === 'ok') conversation.pendingApprovalId = undefined;
    return;
  }
  if (parsed.status === 'needs_approval' && parsed.approvalId) {
    conversation.pendingApprovalId = parsed.approvalId;
  }
}

function asksAlready(text: string): boolean {
  const lower = text.toLowerCase();
  return lower.includes('should i go ahead') || lower.includes('say yes or no');
}

function finalSpeech(parsed: ParsedTool): string {
  if (parsed.status === 'needs_approval') {
    const summary = (parsed.summary || parsed.speech).trim();
    if (!summary) return 'Should I go ahead?';
    if (asksAlready(summary)) return summary;
    return `${summary} Should I go ahead?`;
  }
  return parsed.speech.trim() || 'Done.';
}

function scrubVoiceTool(tool: ToolDefinition): ToolDefinition {
  if (!tool.description || !/approve_action/i.test(tool.description)) return tool;
  return {
    ...tool,
    description: tool.description.replace(/Call approve_action[^.]*\./gi, 'A person has to say yes or no.'),
  };
}

function voiceTools(tools: StoredTool[]): ToolDefinition[] {
  return toAnthropicTools(tools)
    .filter((tool) => tool.name !== 'approve_action')
    .map(scrubVoiceTool);
}

function appendPlain(conversation: Conversation, user: string, assistant: string): void {
  saveConversation(conversation, [
    ...conversation.messages,
    { role: 'user', content: user },
    { role: 'assistant', content: assistant },
  ]);
}

function toolPayload(name: string, parsed: ParsedTool, ms: number): Record<string, unknown> {
  return {
    name,
    status: parsed.status,
    speech: parsed.speech,
    ...(parsed.receipt ? { receipt: parsed.receipt } : {}),
    ...(parsed.approvalId ? { approvalId: parsed.approvalId } : {}),
    ms,
  };
}

/** One MCP call chosen by rule, then the tool's own speech. */
async function speakFast(options: {
  route: FastRoute;
  client: Client;
  conversation: Conversation;
  utterance: string;
  ackMs: number;
  started: number;
  signal: AbortSignal;
  detached: () => boolean;
  write: (event: string, data: unknown) => void;
}): Promise<void> {
  const { route, client, conversation, utterance, ackMs, started, write } = options;
  const toolStarted = Date.now();
  const firstToolMs = toolStarted - started;
  write('tool_call', { name: route.tool, input: route.args });
  const finish = (text: string, runId?: string) => {
    if (options.detached()) return;
    appendPlain(conversation, utterance, text);
    write('final', {
      text,
      conversationId: conversation.id,
      ...(runId ? { runId } : {}),
      timings: { ackMs, firstToolMs, totalMs: Date.now() - started, route: 'fast' },
    });
  };
  try {
    if (options.signal.aborted) return;
    const result = await client.callTool(
      { name: route.tool, arguments: route.args },
      { signal: options.signal },
    );
    if (options.detached()) return;
    const parsed = parseTool(result);
    noteTool(conversation, route.tool, parsed);
    write('tool_result', toolPayload(route.tool, parsed, Date.now() - toolStarted));
    if (parsed.status === 'needs_approval' && parsed.approvalId) {
      write('approval_required', {
        approvalId: parsed.approvalId,
        summary: parsed.summary || parsed.speech,
      });
    }
    finish(finalSpeech(parsed), parsed.runId);
  } catch {
    if (options.detached()) return;
    const speech = 'That did not work.';
    write('tool_result', { name: route.tool, status: 'error', speech, ms: Date.now() - toolStarted });
    finish(speech);
  }
}

/**
 * Streams one turn as server-sent events.
 * Writes `ack` before connecting to MCP or calling the model.
 */
export async function streamAlexaTurn(
  req: IncomingMessage,
  res: ServerResponse,
  input: { utterance: string; conversationId?: string },
): Promise<void> {
  const utterance = input.utterance.trim();
  if (!utterance) {
    sendJson(res, 400, { error: 'Say something first.' });
    return;
  }
  if (utterance.length > 4000) {
    sendJson(res, 400, { error: 'That was too long.' });
    return;
  }

  const started = Date.now();
  let detached = false;
  let finished = false;
  const abort = new AbortController();
  const onClose = () => {
    if (!finished) {
      detached = true;
      abort.abort();
    }
  };
  res.on('close', onClose);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const write = (event: string, data: unknown): boolean => {
    if (detached || res.writableEnded) return false;
    try {
      return res.write(formatSseEvent(event, data));
    } catch {
      detached = true;
      return false;
    }
  };

  const conversation = openConversation(input.conversationId);
  const ackText = acknowledge(utterance);
  write('ack', { text: ackText, at: new Date().toISOString(), conversationId: conversation.id });
  const ackMs = Date.now() - started;

  let client: Client | null = null;
  let transport: StreamableHTTPClientTransport | null = null;
  try {
    if (conversation.pendingApprovalId && qualifiedApproval(utterance)) {
      const text = PLAIN_APPROVAL;
      appendPlain(conversation, utterance, text);
      write('final', {
        text,
        conversationId: conversation.id,
        timings: { ackMs, totalMs: Date.now() - started, route: 'fast' },
      });
      return;
    }

    const base = selfBase(req);
    const tokens = await tokensForTurn(base);
    if (!tokens) {
      write('error', { message: LINK_MESSAGE });
      return;
    }
    if (detached) return;

    transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
      fetch: bearerFetch(tokens.list, tokens.call),
    });
    client = new Client({ name: 'agora-plus-voice', version: '0.1.0' });
    await client.connect(transport);
    if (detached) return;
    const connected = client;

    if (fastPathEnabled()) {
      const routed = routeFast(utterance, conversation);
      if (routed) {
        await speakFast({
          route: routed,
          client: connected,
          conversation,
          utterance,
          ackMs,
          started,
          signal: abort.signal,
          detached: () => detached,
          write,
        });
        return;
      }
    }

    const listed = await client.listTools();
    if (!conversation.tools) {
      const listedTools = listed.tools.filter((tool) => tool.name !== 'approve_action');
      conversation.mcpTools = storeTools(listedTools);
      conversation.tools = voiceTools(conversation.mcpTools);
    }
    const tools = voiceTools(conversation.mcpTools ?? []);
    if (tools.length === 0) throw new Error('The household tools could not be listed.');

    let firstToolMs: number | undefined;
    let spoken: string | undefined;
    let startedRunId: string | undefined;
    const history = conversation.messages.map((message) => ({ role: message.role, content: message.content }));
    history.push({ role: 'user', content: utterance });

    try {
      const loop = await runToolLoop({
        create: (params) => {
          if (detached || abort.signal.aborted) return Promise.reject(new Error('disconnected'));
          return (modelOverride ?? bedrockCreate)({ ...params, signal: abort.signal });
        },
        model: alexaModelName(),
        system: conversation.system,
        tools,
        messages: history,
        maxTokens: 400,
        signal: abort.signal,
        haltWhen: (value) => {
          if (!value || typeof value !== 'object') return false;
          const record = value as { status?: unknown; halt?: unknown };
          return record.status === 'needs_approval' || record.halt === true;
        },
        execute: async (name, toolInput) => {
          if (detached || abort.signal.aborted) throw new Error('disconnected');
          const startedTool = Date.now();
          if (name === 'approve_action') {
            const speech = 'A person has to say yes or no.';
            spoken = speech;
            write('tool_result', { name, status: 'error', speech, ms: Date.now() - startedTool });
            return { speech, status: 'error', halt: true };
          }
          try {
            const result = await connected.callTool(
              { name, arguments: asArgs(toolInput) },
              { signal: abort.signal },
            );
            const parsed = parseTool(result);
            const ms = Date.now() - startedTool;
            noteTool(conversation, name, parsed);
            write('tool_result', toolPayload(name, parsed, ms));
            if (parsed.status === 'needs_approval' && parsed.approvalId) {
              spoken = finalSpeech(parsed);
              write('approval_required', {
                approvalId: parsed.approvalId,
                summary: parsed.summary || parsed.speech,
              });
            }
            if (parsed.runId) startedRunId = parsed.runId;
            return parsed.forModel;
          } catch (error) {
            if (detached || abort.signal.aborted) throw error;
            const ms = Date.now() - startedTool;
            const speech = 'That did not work.';
            write('tool_result', { name, status: 'error', speech, ms });
            return { speech, status: 'error' };
          }
        },
        onEvent: (event) => {
          if (event.type !== 'tool_call') return;
          if (firstToolMs === undefined) firstToolMs = Date.now() - started;
          write('tool_call', { name: event.name, input: event.input });
        },
      });

      if (!detached) {
        saveConversation(conversation, loop.messages);
        write('final', {
          text: spoken || loop.text.trim() || 'Done.',
          conversationId: conversation.id,
          ...(startedRunId ? { runId: startedRunId } : {}),
          timings: {
            ackMs,
            ...(firstToolMs !== undefined ? { firstToolMs } : {}),
            totalMs: Date.now() - started,
            route: 'model',
          },
        });
      }
    } catch (error) {
      if (!detached) {
        const failure = modelFailure(error);
        write('error', { message: failure.message, detail: failure.detail, route: 'model' });
      }
    }
  } catch (error) {
    if (!detached) write('error', { message: publicError(error), detail: technicalDetail(error) });
  } finally {
    finished = true;
    res.removeListener('close', onClose);
    await client?.close().catch(() => undefined);
    await transport?.close().catch(() => undefined);
    if (!res.writableEnded) res.end();
  }
}
