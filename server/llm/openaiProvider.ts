/**
 * Any OpenAI-compatible chat endpoint (Featherless, vLLM, OpenRouter) as the server model.
 * It speaks the same Messages shape as the Bedrock provider, so the voice loop and the
 * household tools use it unchanged: tool_use and tool_result blocks become OpenAI
 * tool_calls and tool messages, and back. Pick a model with native tool calling
 * (on Featherless, the Qwen 3 family or Kimi K2). The key is never logged.
 */

import type { Message, MessageParam, Tool } from '@anthropic-ai/sdk/resources/messages';
import type { RunUsage } from '../society/provider';
import type { BedrockCallOptions, BedrockCreateParams, BedrockProvider } from './bedrockProvider';
import { toAnthropicMessages } from './bedrockProvider';

const COMPLETION_TOKENS = 4000;
/** Hosted open models answer slower than Bedrock; a plan preview gets 45 s, a swarm worker 2 min. */
const PREVIEW_TIMEOUT_MS = 45_000;
const SWARM_TIMEOUT_MS = 120_000;
/** Retries for a busy or flaky endpoint (5xx, 429, or an error object inside a 200). */
const MAX_TRIES = 3;
const RETRY_DELAY_MS = 1_500;

/**
 * Hosted plans cap concurrent requests (Featherless answers extra ones with `no_response`).
 * Every provider in the process shares one queue. AGORA_LLM_CONCURRENCY sets the size; default 2.
 */
const slots = { busy: 0, waiting: [] as (() => void)[] };

function slotLimit(): number {
  const parsed = Number.parseInt(process.env.AGORA_LLM_CONCURRENCY ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 2;
}

async function takeSlot(signal?: AbortSignal): Promise<() => void> {
  if (slots.busy >= slotLimit()) {
    await new Promise<void>((resolve, reject) => {
      const ready = () => {
        signal?.removeEventListener('abort', aborted);
        resolve();
      };
      const aborted = () => {
        slots.waiting = slots.waiting.filter((item) => item !== ready);
        reject(signal?.reason ?? new Error('aborted'));
      };
      slots.waiting.push(ready);
      signal?.addEventListener('abort', aborted, { once: true });
    });
  }
  slots.busy += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    slots.busy -= 1;
    slots.waiting.shift()?.();
  };
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const SWARM_STAGES = new Set(['worker', 'assembling', 'repair', 'repairing', 'debate', 'working']);

type Fetch = (input: string, init: RequestInit) => Promise<Response>;

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

interface ChatResponse {
  id?: string;
  error?: { message?: string; type?: string; code?: string };
  choices?: {
    finish_reason?: string | null;
    message?: { content?: string | null; tool_calls?: { id?: string; function?: { name?: string; arguments?: string } }[] };
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export interface OpenAiCompatibleOptions {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  fastModel?: string;
  fetch?: Fetch;
  /** Base wait between retries. Tests pass 0. */
  retryDelayMs?: number;
}

/** Qwen 3 can open with a reasoning block. The household only wants the answer. */
export function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^[\s\S]*?<\/think>/i, '').trim();
}

/** Names from the office swarm (DeepSeek, Claude ids) map to the configured model. Hub-style ids pass through. */
function pickModel(requested: string | undefined, fallback: string): string {
  const name = requested?.trim() ?? '';
  return name.includes('/') ? name : fallback;
}

/**
 * Qwen 3 reasons before it answers unless the prompt says `/no_think`. Without it a short
 * max_tokens can be spent on reasoning and the answer comes back empty.
 */
export function withNoThink(messages: ChatMessage[], model: string): ChatMessage[] {
  if (!/qwen3/i.test(model)) return messages;
  const [first, ...rest] = messages;
  if (first?.role === 'system') return [{ ...first, content: `${first.content ?? ''}\n/no_think`.trim() }, ...rest];
  return [{ role: 'system', content: '/no_think' }, ...messages];
}

function blockText(block: unknown): string {
  if (!block || typeof block !== 'object') return '';
  const record = block as { type?: string; text?: string };
  return record.type === 'text' && typeof record.text === 'string' ? record.text : '';
}

function toolResultText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(blockText).join('');
  return '';
}

/** Messages-API turns to chat-completions turns. One tool message per tool_result block. */
export function toChatMessages(system: string | undefined, messages: MessageParam[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  if (system?.trim()) out.push({ role: 'system', content: system.trim() });
  for (const message of messages) {
    if (typeof message.content === 'string') {
      out.push({ role: message.role, content: message.content });
      continue;
    }
    if (message.role === 'assistant') {
      let text = '';
      const calls: NonNullable<ChatMessage['tool_calls']> = [];
      for (const block of message.content) {
        if (block.type === 'text') text += block.text;
        if (block.type === 'tool_use') {
          calls.push({ id: block.id, type: 'function', function: { name: block.name, arguments: JSON.stringify(block.input ?? {}) } });
        }
      }
      out.push({ role: 'assistant', content: text || null, ...(calls.length > 0 ? { tool_calls: calls } : {}) });
      continue;
    }
    let text = '';
    for (const block of message.content) {
      if (block.type === 'tool_result') {
        out.push({ role: 'tool', tool_call_id: block.tool_use_id, content: toolResultText(block.content) });
      } else {
        text += blockText(block);
      }
    }
    if (text) out.push({ role: 'user', content: text });
  }
  return out;
}

export function toChatTools(tools: Tool[] | undefined) {
  return (tools ?? []).map((tool) => ({
    type: 'function' as const,
    function: { name: tool.name, description: tool.description ?? '', parameters: tool.input_schema },
  }));
}

function parseArguments(raw: string | undefined): Record<string, unknown> {
  if (!raw?.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

/** Chat-completions result to a Messages result: text first, then tool_use blocks. */
export function toMessage(response: ChatResponse, model: string): Message {
  const choice = response.choices?.[0];
  const text = stripThinking(choice?.message?.content ?? '');
  const content: Message['content'] = [];
  if (text) content.push({ type: 'text', text, citations: null });
  for (const [index, call] of (choice?.message?.tool_calls ?? []).entries()) {
    const name = call.function?.name;
    if (!name) continue;
    content.push({ type: 'tool_use', id: call.id || `call_${index}`, name, input: parseArguments(call.function?.arguments), caller: { type: 'direct' } });
  }
  const usedTool = content.some((block) => block.type === 'tool_use');
  const stop: Message['stop_reason'] = usedTool ? 'tool_use' : choice?.finish_reason === 'length' ? 'max_tokens' : 'end_turn';
  return {
    id: response.id ?? 'chat',
    type: 'message',
    role: 'assistant',
    model,
    content,
    stop_reason: stop,
    stop_sequence: null,
    usage: {
      input_tokens: response.usage?.prompt_tokens ?? 0,
      output_tokens: response.usage?.completion_tokens ?? 0,
    },
  } as Message;
}

/** Ready when a base URL, a key and a model are all set. */
export function openAiCompatibleReady(): boolean {
  return Boolean(
    process.env.AGORA_LLM_BASE_URL?.trim() && process.env.AGORA_LLM_API_KEY?.trim() && process.env.AGORA_LLM_MODEL?.trim(),
  );
}

export function createOpenAiCompatibleProvider(options: OpenAiCompatibleOptions = {}): BedrockProvider {
  const baseUrl = (options.baseUrl ?? process.env.AGORA_LLM_BASE_URL ?? '').trim().replace(/\/+$/, '');
  const apiKey = (options.apiKey ?? process.env.AGORA_LLM_API_KEY ?? '').trim();
  const model = (options.model ?? process.env.AGORA_LLM_MODEL ?? '').trim();
  const fastModel = (options.fastModel ?? process.env.AGORA_LLM_FAST_MODEL ?? '').trim() || model;
  const doFetch: Fetch = options.fetch ?? ((input, init) => fetch(input, init));
  const retryDelay = options.retryDelayMs ?? RETRY_DELAY_MS;
  const url = baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`;
  const usage: RunUsage = { calls: 0, promptTokens: 0, completionTokens: 0, missingUsage: 0 };
  const request = { runId: '-', stage: 'call', agent: '-', attempt: 1 };

  async function chat(body: Record<string, unknown>, call?: BedrockCallOptions): Promise<ChatResponse> {
    if (!baseUrl || !apiKey || !model) {
      throw new Error('The server model is not configured. Set AGORA_LLM_BASE_URL, AGORA_LLM_API_KEY and AGORA_LLM_MODEL.');
    }
    usage.calls += 1;
    const release = await takeSlot(call?.signal);
    try {
      return await send(body, call);
    } finally {
      release();
    }
  }

  async function send(body: Record<string, unknown>, call?: BedrockCallOptions): Promise<ChatResponse> {
    // The clock starts once a slot is free, so time in the queue does not eat the answer's budget.
    const timeout = call?.timeout ?? (SWARM_STAGES.has(request.stage) ? SWARM_TIMEOUT_MS : PREVIEW_TIMEOUT_MS);
    const signals = [AbortSignal.timeout(timeout), ...(call?.signal ? [call.signal] : [])];
    const signal = AbortSignal.any(signals);
    for (let attempt = 1; ; attempt += 1) {
      if (attempt > 1 && retryDelay > 0) await pause(retryDelay * (attempt - 1));
      const response = await doFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
        redirect: 'error',
        signal,
      });
      const retryable = response.status >= 500 || response.status === 429;
      if (!response.ok) {
        const text = (await response.text()).slice(0, 300);
        if (retryable && attempt < MAX_TRIES && !signal.aborted) continue;
        usage.missingUsage += 1;
        throw new Error(`Inference API error (${response.status}): ${text}`);
      }
      const data = await response.json() as ChatResponse;
      if (data.error && !data.choices?.length) {
        if (attempt < MAX_TRIES && !signal.aborted) continue;
        usage.missingUsage += 1;
        throw new Error(`Inference API error (${data.error.code ?? 'error'}): ${(data.error.message ?? '').slice(0, 200)}`);
      }
      if (data.usage) {
        usage.promptTokens += data.usage.prompt_tokens ?? 0;
        usage.completionTokens += data.usage.completion_tokens ?? 0;
      } else {
        usage.missingUsage += 1;
      }
      return data;
    }
  }

  return {
    model,
    fastModel,
    prepareRequest(info) {
      if (info.runId) request.runId = info.runId;
      request.stage = info.stage;
      request.agent = info.agent;
      request.attempt = info.attempt ?? 1;
    },
    takeUsage() {
      return { ...usage };
    },
    async createMessage(params: BedrockCreateParams, call?: BedrockCallOptions) {
      const chosen = pickModel(params.model, params.model?.includes('haiku') ? fastModel : model);
      const tools = toChatTools(params.tools);
      const data = await chat({
        model: chosen,
        max_tokens: params.max_tokens,
        messages: withNoThink(toChatMessages(params.system, params.messages), chosen),
        ...(tools.length > 0 ? { tools } : {}),
      }, call);
      return toMessage(data, chosen);
    },
    async generateCompletion(messages, _tools, systemInstruction, modelName) {
      const prepared = toAnthropicMessages(messages, systemInstruction);
      const chosen = pickModel(modelName, model);
      const data = await chat({
        model: chosen,
        max_tokens: COMPLETION_TOKENS,
        messages: withNoThink(toChatMessages(prepared.system, prepared.messages), chosen),
      });
      const text = stripThinking(data.choices?.[0]?.message?.content ?? '');
      const counted = data.usage
        ? {
            promptTokens: data.usage.prompt_tokens ?? 0,
            completionTokens: data.usage.completion_tokens ?? 0,
            totalTokens: (data.usage.prompt_tokens ?? 0) + (data.usage.completion_tokens ?? 0),
          }
        : undefined;
      return { content: text || null, usage: counted };
    },
  };
}
