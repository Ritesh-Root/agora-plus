import { randomUUID } from 'crypto';
import type { LoopMessage, ToolDefinition } from '../llm/toolLoop';

/** Frozen for the life of one conversation. Tool results carry the facts. */
export const VOICE_SYSTEM = [
  'You are a voice assistant for this household.',
  'Speak the speech field of tool results.',
  'Use at most two short sentences.',
  'Never perform a side effect without the approval step.',
  'When a tool returns needs_approval, read the summary and ask "Should I go ahead?".',
  'When the user then says yes or no, call approve_action with that approvalId.',
  'Never claim something happened unless a tool result says so.',
].join(' ');

const TTL_MS = 30 * 60 * 1000;
const MAX_MESSAGES = 40;
const MAX_CONVERSATIONS = 100;

export interface StoredTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

export interface Conversation {
  id: string;
  messages: LoopMessage[];
  system: string;
  tools: ToolDefinition[] | null;
  mcpTools: StoredTool[] | null;
  updatedAt: number;
}

const conversations = new Map<string, Conversation>();
let clock = (): number => Date.now();

export function setConversationClock(next: (() => number) | null): void {
  clock = next ?? (() => Date.now());
}

export function resetConversations(): void {
  conversations.clear();
  clock = () => Date.now();
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    const item = block as { type?: unknown; text?: unknown };
    if (item.type === 'text' && typeof item.text === 'string') parts.push(item.text);
  }
  return parts.join(' ');
}

function summarize(messages: LoopMessage[]): string {
  const lines: string[] = [];
  for (const message of messages) {
    const text = textOf(message.content).replace(/\s+/g, ' ').trim();
    if (!text) continue;
    lines.push(`${message.role}: ${text.slice(0, 120)}`);
  }
  const tail = lines.slice(-8).join(' | ');
  return `Earlier conversation, short summary: ${tail}`.slice(0, 700);
}

function create(): Conversation {
  return {
    id: randomUUID(),
    messages: [],
    system: VOICE_SYSTEM,
    tools: null,
    mcpTools: null,
    updatedAt: clock(),
  };
}

function dropOldest(): void {
  while (conversations.size > MAX_CONVERSATIONS) {
    const oldest = conversations.keys().next().value;
    if (oldest === undefined) break;
    conversations.delete(oldest);
  }
}

/**
 * Returns the live conversation, or a new one when the id is missing, older
 * than 30 minutes, or already holds 40 messages. A full conversation is
 * replaced by a new one whose first message is a short summary.
 */
export function openConversation(id?: string): Conversation {
  const now = clock();
  const existing = id ? conversations.get(id) : undefined;
  if (!existing || now - existing.updatedAt > TTL_MS) {
    const fresh = create();
    conversations.set(fresh.id, fresh);
    dropOldest();
    return fresh;
  }
  if (existing.messages.length >= MAX_MESSAGES) {
    const rolled = create();
    rolled.messages = [{ role: 'user', content: summarize(existing.messages) }];
    conversations.delete(existing.id);
    conversations.set(rolled.id, rolled);
    dropOldest();
    return rolled;
  }
  return existing;
}

export function saveConversation(conversation: Conversation, messages: LoopMessage[]): void {
  conversation.messages = messages;
  conversation.updatedAt = clock();
  conversations.set(conversation.id, conversation);
  dropOldest();
}
