/**
 * Claude on Amazon Bedrock, through the Mantle Messages endpoint.
 * Model ids keep the `anthropic.` prefix. Names from the office swarm
 * (DeepSeek, Qwen) map to the default Bedrock model.
 * Credentials come from the standard AWS chain. Nothing here is logged.
 */

import { AnthropicBedrockMantle } from '@anthropic-ai/bedrock-sdk';
import type { Message, MessageCreateParamsNonStreaming, MessageParam, Tool } from '@anthropic-ai/sdk/resources/messages';
import type { ServerProvider, RunUsage } from '../society/provider';

const DEFAULT_MODEL = 'anthropic.claude-sonnet-5';
const DEFAULT_FAST_MODEL = 'anthropic.claude-haiku-4-5';
const COMPLETION_TOKENS = 8000;
const DECLINED = 'The model declined this request.';

export interface BedrockCreateParams {
  model: string;
  max_tokens: number;
  system?: string;
  tools?: Tool[];
  messages: MessageParam[];
}

/** Enough of messages.create for tests to inject. The real client is AnthropicBedrockMantle. */
export interface BedrockClient {
  messages: {
    create: (params: MessageCreateParamsNonStreaming) => Promise<Message>;
  };
}

export interface BedrockProvider extends ServerProvider {
  readonly model: string;
  readonly fastModel: string;
  createMessage(params: BedrockCreateParams): Promise<Message>;
}

function envModel(name: string | undefined, fallback: string): string {
  const trimmed = name?.trim();
  return trimmed || fallback;
}

function pickModel(modelName: string | undefined, fallback: string): string {
  const name = modelName?.trim() ?? '';
  return name.startsWith('anthropic.') ? name : fallback;
}

function joinText(content: Message['content']): string | null {
  const parts: string[] = [];
  for (const block of content) {
    if (block.type === 'text') parts.push(block.text);
  }
  return parts.length > 0 ? parts.join('') : null;
}

function noteUsage(
  tally: RunUsage,
  usage: Message['usage'] | undefined,
): { promptTokens: number; completionTokens: number; totalTokens: number } | undefined {
  if (!usage) {
    tally.missingUsage += 1;
    return undefined;
  }
  const counted = {
    promptTokens: usage.input_tokens || 0,
    completionTokens: usage.output_tokens || 0,
    totalTokens: (usage.input_tokens || 0) + (usage.output_tokens || 0),
  };
  tally.promptTokens += counted.promptTokens;
  tally.completionTokens += counted.completionTokens;
  return counted;
}

/** System-role turns join the system prompt. Consecutive same-role turns merge. The first turn is user. */
export function toAnthropicMessages(
  messages: { role: string; content: string }[],
  systemInstruction?: string,
): { system?: string; messages: MessageParam[] } {
  const systemParts: string[] = [];
  if (systemInstruction?.trim()) systemParts.push(systemInstruction.trim());
  const turns: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const message of messages) {
    const text = message.content ?? '';
    if (message.role === 'system') {
      if (text.trim()) systemParts.push(text.trim());
      continue;
    }
    const role: 'user' | 'assistant' = message.role === 'assistant' ? 'assistant' : 'user';
    const previous = turns[turns.length - 1];
    if (previous && previous.role === role) previous.content = `${previous.content}\n\n${text}`;
    else turns.push({ role, content: text });
  }
  if (turns.length === 0 || turns[0].role !== 'user') {
    turns.unshift({ role: 'user', content: 'Continue.' });
  }
  const system = systemParts.join('\n\n');
  return { system: system || undefined, messages: turns };
}

export function createBedrockProvider(options?: {
  client?: BedrockClient;
  model?: string;
  fastModel?: string;
  region?: string;
}): BedrockProvider {
  const model = envModel(options?.model, envModel(process.env.BEDROCK_MODEL, DEFAULT_MODEL));
  const fastModel = envModel(options?.fastModel, envModel(process.env.BEDROCK_FAST_MODEL, DEFAULT_FAST_MODEL));
  const region = options?.region || process.env.AWS_REGION || 'us-east-1';
  const client = options?.client ?? new AnthropicBedrockMantle({ awsRegion: region });
  const usage: RunUsage = { calls: 0, promptTokens: 0, completionTokens: 0, missingUsage: 0 };
  const request = { runId: '-', stage: 'call', agent: '-', attempt: 1 };

  async function create(params: MessageCreateParamsNonStreaming): Promise<Message> {
    usage.calls += 1;
    try {
      const message = await client.messages.create(params);
      noteUsage(usage, message.usage);
      return message;
    } catch (error) {
      usage.missingUsage += 1;
      throw error;
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
    /** Raw Messages result, including a refusal. The tool loop decides what to do with stop_reason. */
    async createMessage(params) {
      const body: MessageCreateParamsNonStreaming = {
        model: pickModel(params.model, model),
        max_tokens: params.max_tokens,
        messages: params.messages,
      };
      if (params.system) body.system = params.system;
      if (params.tools && params.tools.length > 0) body.tools = params.tools;
      return create(body);
    },
    async generateCompletion(messages, _tools, systemInstruction, modelName) {
      const prepared = toAnthropicMessages(messages, systemInstruction);
      const body: MessageCreateParamsNonStreaming = {
        model: pickModel(modelName, model),
        max_tokens: COMPLETION_TOKENS,
        messages: prepared.messages,
      };
      if (prepared.system) body.system = prepared.system;
      const message = await create(body);
      if (message.stop_reason === 'refusal') throw new Error(DECLINED);
      const counted = message.usage
        ? {
            promptTokens: message.usage.input_tokens || 0,
            completionTokens: message.usage.output_tokens || 0,
            totalTokens: (message.usage.input_tokens || 0) + (message.usage.output_tokens || 0),
          }
        : undefined;
      return { content: joinText(message.content), usage: counted };
    },
  };
}
