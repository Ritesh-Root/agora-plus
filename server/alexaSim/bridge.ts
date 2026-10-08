import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { IncomingMessage, ServerResponse } from 'http';
import type { BedrockCreateParams } from '../llm/bedrockProvider';
import { getBedrock } from '../llm/serverProvider';
import { runToolLoop, type ToolCreate, type ToolCreateParams, type ToolCreateResult, type ToolDefinition } from '../llm/toolLoop';
import { acknowledge } from './ack';
import { openConversation, saveConversation, type StoredTool } from './conversation';
import { alexaModelName, bearerFetch, selfBase, tokensForTurn } from './oauthClient';
import { formatSseEvent } from './sse';

/**
 * One spoken turn. The acknowledgement is written before any model or MCP call.
 * Tools are reached through the real /mcp endpoint, never through household actions.
 */

const LINK_MESSAGE = 'Press Link AGORA+ to connect this household.';

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

async function bedrockCreate(params: ToolCreateParams): Promise<ToolCreateResult> {
  const message = await getBedrock().createMessage({
    model: params.model,
    max_tokens: params.max_tokens,
    system: params.system,
    tools: params.tools as BedrockCreateParams['tools'],
    messages: params.messages as BedrockCreateParams['messages'],
  });
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
  const preview = typeof structured.preview === 'string' ? structured.preview : undefined;
  const forModel: Record<string, unknown> = { speech, status };
  if (approvalId) forModel.approvalId = approvalId;
  if (preview) forModel.preview = preview;
  if (receipt) forModel.receipt = receipt;
  return {
    speech,
    status,
    ...(receipt ? { receipt } : {}),
    ...(approvalId ? { approvalId } : {}),
    ...(preview ? { summary: preview } : {}),
    forModel,
  };
}

function asArgs(input: unknown): Record<string, unknown> {
  const record = asRecord(input);
  return record ?? {};
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
  const onClose = () => {
    if (!finished) detached = true;
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

    const listed = await client.listTools();
    if (!conversation.tools) {
      conversation.mcpTools = storeTools(listed.tools);
      conversation.tools = toAnthropicTools(conversation.mcpTools);
    }
    const tools = conversation.tools;
    if (!tools) throw new Error('The household tools could not be listed.');
    const connected = client;

    let firstToolMs: number | undefined;
    const history = conversation.messages.map((message) => ({ role: message.role, content: message.content }));
    history.push({ role: 'user', content: utterance });

    const loop = await runToolLoop({
      create: (params) => {
        if (detached) return Promise.reject(new Error('disconnected'));
        return (modelOverride ?? bedrockCreate)(params);
      },
      model: alexaModelName(),
      system: conversation.system,
      tools,
      messages: history,
      maxTokens: 400,
      execute: async (name, toolInput) => {
        if (detached) throw new Error('disconnected');
        const startedTool = Date.now();
        try {
          const result = await connected.callTool({ name, arguments: asArgs(toolInput) });
          const parsed = parseTool(result);
          const ms = Date.now() - startedTool;
          write('tool_result', {
            name,
            status: parsed.status,
            speech: parsed.speech,
            ...(parsed.receipt ? { receipt: parsed.receipt } : {}),
            ...(parsed.approvalId ? { approvalId: parsed.approvalId } : {}),
            ms,
          });
          if (parsed.status === 'needs_approval' && parsed.approvalId) {
            write('approval_required', {
              approvalId: parsed.approvalId,
              summary: parsed.summary || parsed.speech,
            });
          }
          return parsed.forModel;
        } catch (error) {
          if (detached) throw error;
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
        text: loop.text.trim() || 'Done.',
        conversationId: conversation.id,
        timings: {
          ackMs,
          ...(firstToolMs !== undefined ? { firstToolMs } : {}),
          totalMs: Date.now() - started,
        },
      });
    }
  } catch (error) {
    if (!detached) write('error', { message: publicError(error) });
  } finally {
    finished = true;
    res.removeListener('close', onClose);
    await client?.close().catch(() => undefined);
    await transport?.close().catch(() => undefined);
    if (!res.writableEnded) res.end();
  }
}
