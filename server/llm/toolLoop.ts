/**
 * Append-only tool loop for the Claude Messages API.
 * The system prompt and tool list stay fixed. Changing data belongs in the user message.
 * Assistant content is sent back as the same array the model returned.
 */

export interface ToolDefinition {
  name: string;
  description?: string;
  input_schema: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
    [key: string]: unknown;
  };
}

export interface LoopMessage {
  role: 'user' | 'assistant';
  content: unknown;
}

export interface ToolCreateParams {
  model: string;
  max_tokens: number;
  system?: string;
  tools?: ToolDefinition[];
  messages: LoopMessage[];
  signal?: AbortSignal;
}

export interface ToolCreateResult {
  stop_reason: string | null;
  content: unknown;
}

export type ToolCreate = (params: ToolCreateParams) => Promise<ToolCreateResult>;

export interface ToolCallRecord {
  name: string;
  input: unknown;
  ok: boolean;
  ms: number;
}

export type ToolLoopEvent =
  | { type: 'tool_call'; name: string; input: unknown }
  | { type: 'tool_result'; name: string; input: unknown; ok: boolean; ms: number };

export interface ToolLoopResult {
  text: string;
  messages: LoopMessage[];
  stopReason: string;
  steps: number;
  toolCalls: ToolCallRecord[];
}

interface ToolUseCall {
  id: string;
  name: string;
  input: unknown;
}

interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error: boolean;
}

function textFrom(content: unknown): string {
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    const item = block as { type?: unknown; text?: unknown };
    if (item.type === 'text' && typeof item.text === 'string') parts.push(item.text);
  }
  return parts.join('');
}

function toolUses(content: unknown): ToolUseCall[] {
  if (!Array.isArray(content)) return [];
  const calls: ToolUseCall[] = [];
  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    const item = block as { type?: unknown; id?: unknown; name?: unknown; input?: unknown };
    if (item.type !== 'tool_use' || typeof item.id !== 'string' || typeof item.name !== 'string') continue;
    calls.push({ id: item.id, name: item.name, input: item.input ?? {} });
  }
  return calls;
}

function isErrorValue(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const record = value as { ok?: unknown; status?: unknown; is_error?: unknown };
  return record.is_error === true || record.ok === false || record.status === 'error';
}

function serialize(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    const json = JSON.stringify(value);
    return json ?? '';
  } catch {
    return 'The tool result could not be read.';
  }
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function disconnected(error: unknown): boolean {
  return error instanceof Error && (error.message === 'disconnected' || error.name === 'AbortError');
}

/** Rejects when the signal aborts, without dropping a later failure from `work`. */
function raceSignal<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return work;
  if (signal.aborted) {
    void work.catch(() => undefined);
    return Promise.reject(new Error('disconnected'));
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort);
      reject(new Error('disconnected'));
    };
    signal.addEventListener('abort', onAbort);
    work.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

/**
 * Calls the model, runs every tool_use block in parallel, and appends one user
 * message with the tool_result blocks in that same order. Stops on end_turn,
 * max_tokens, refusal, or after maxSteps tool rounds.
 */
export async function runToolLoop(options: {
  create: ToolCreate;
  model: string;
  system: string;
  tools: ToolDefinition[];
  messages: LoopMessage[];
  execute: (name: string, input: unknown) => Promise<unknown>;
  maxSteps?: number;
  maxTokens?: number;
  onEvent?: (event: ToolLoopEvent) => void;
  /** When a tool result matches, the loop stops before another model call. */
  haltWhen?: (value: unknown) => boolean;
  signal?: AbortSignal;
}): Promise<ToolLoopResult> {
  const maxSteps = options.maxSteps ?? 4;
  const maxTokens = options.maxTokens ?? 1024;
  const history: LoopMessage[] = options.messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
  const toolCalls: ToolCallRecord[] = [];
  let steps = 0;
  let stopReason = 'end_turn';
  let text = '';

  while (steps < maxSteps) {
    if (options.signal?.aborted) throw new Error('disconnected');
    const response = await raceSignal(options.create({
      model: options.model,
      max_tokens: maxTokens,
      system: options.system,
      tools: options.tools,
      messages: history,
      signal: options.signal,
    }), options.signal);
    history.push({ role: 'assistant', content: response.content });
    stopReason = response.stop_reason ?? 'end_turn';
    text = textFrom(response.content);
    if (stopReason !== 'tool_use') break;

    const uses = toolUses(response.content);
    if (uses.length === 0) break;

    const outcomes = await Promise.all(uses.map(async (call) => {
      if (options.signal?.aborted) throw new Error('disconnected');
      options.onEvent?.({ type: 'tool_call', name: call.name, input: call.input });
      const started = Date.now();
      try {
        const value = await options.execute(call.name, call.input);
        const ms = Date.now() - started;
        const ok = !isErrorValue(value);
        options.onEvent?.({ type: 'tool_result', name: call.name, input: call.input, ok, ms });
        const block: ToolResultBlock = {
          type: 'tool_result',
          tool_use_id: call.id,
          content: clip(serialize(value), 8000),
          is_error: !ok,
        };
        return { meta: { name: call.name, input: call.input, ok, ms }, block, value };
      } catch (error) {
        if (disconnected(error) || options.signal?.aborted) throw error;
        const ms = Date.now() - started;
        const message = error instanceof Error && error.message ? error.message : 'The tool failed.';
        options.onEvent?.({ type: 'tool_result', name: call.name, input: call.input, ok: false, ms });
        const block: ToolResultBlock = {
          type: 'tool_result',
          tool_use_id: call.id,
          content: message,
          is_error: true,
        };
        return { meta: { name: call.name, input: call.input, ok: false, ms }, block, value: undefined };
      }
    }));

    for (const outcome of outcomes) toolCalls.push(outcome.meta);
    history.push({ role: 'user', content: outcomes.map((outcome) => outcome.block) });
    steps += 1;
    if (outcomes.some((outcome) => options.haltWhen?.(outcome.value))) {
      stopReason = 'halt';
      break;
    }
  }

  return { text, messages: history, stopReason, steps, toolCalls };
}
