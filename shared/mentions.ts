import type { RoomChatMessage } from './protocol';

export interface MentionAgent {
  name: string;
  description: string;
  model?: string;
}

export interface AgentAccess {
  name: string;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  /** True when this agent brought its own URL or key. An empty key still counts. */
  own: boolean;
}

/** @all, plus any @Full Name that matches the current team. */
export function parseRoomMentions(text: string, agents: { name: string }[]): { all: boolean; names: string[] } {
  const all = /(^|[^@\w])@all\b/i.test(text);
  const lower = text.toLowerCase();
  const names = agents
    .filter((agent) => lower.includes(`@${agent.name.toLowerCase()}`))
    .map((agent) => agent.name);
  return { all, names };
}

export function canSeeChat(message: RoomChatMessage, playerId: string): boolean {
  if (message.audience !== 'direct') return true;
  return message.playerId === playerId || message.forPlayerId === playerId;
}

export interface TeamRunAgent {
  name: string;
  description: string;
  model?: string;
}

/** Team passed into a swarm run. Drops the human placeholder and anything that is not a short model id. */
export function sanitizeTeamAgents(raw: unknown): TeamRunAgent[] {
  if (!Array.isArray(raw)) return [];
  const agents: TeamRunAgent[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const record = item as { name?: unknown; description?: unknown; model?: unknown; baseUrl?: unknown; apiKey?: unknown };
    const name = typeof record.name === 'string' ? record.name.trim() : '';
    const description = typeof record.description === 'string' ? record.description.trim() : '';
    const model = typeof record.model === 'string' ? record.model.trim() : '';
    if (!name || name.length > 40 || name.toLowerCase() === 'all') continue;
    const agent: TeamRunAgent = { name, description: description.slice(0, 240) };
    if (model && model.length <= 80 && model.toLowerCase() !== 'human') agent.model = model;
    agents.push(agent);
    if (agents.length >= 8) break;
  }
  return agents;
}

export function sanitizeChatAgents(raw: unknown): MentionAgent[] {
  if (!Array.isArray(raw)) return [];
  const agents: MentionAgent[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const record = item as { name?: unknown; description?: unknown; model?: unknown };
    const name = typeof record.name === 'string' ? record.name.trim() : '';
    const description = typeof record.description === 'string' ? record.description.trim() : '';
    const model = typeof record.model === 'string' ? record.model.trim() : '';
    if (!name || name.length > 40 || name.toLowerCase() === 'all') continue;
    const agent: MentionAgent = { name, description: description.slice(0, 240) };
    if (model && model.length <= 80 && model.toLowerCase() !== 'human') agent.model = model;
    agents.push(agent);
    if (agents.length >= 8) break;
  }
  return agents;
}

/** Credentials for a run. Kept off the team prompt objects. */
export function readAgentAccess(raw: unknown): AgentAccess[] {
  if (!Array.isArray(raw)) return [];
  const agents: AgentAccess[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const record = item as { name?: unknown; model?: unknown; baseUrl?: unknown; apiKey?: unknown };
    const name = typeof record.name === 'string' ? record.name.trim() : '';
    if (!name || name.length > 40 || name.toLowerCase() === 'all') continue;
    const model = typeof record.model === 'string' ? record.model.trim() : '';
    const agent: AgentAccess = { name, own: typeof record.baseUrl === 'string' || typeof record.apiKey === 'string' };
    if (model && model.length <= 80 && model.toLowerCase() !== 'human') agent.model = model;
    if (typeof record.baseUrl === 'string') agent.baseUrl = record.baseUrl.trim();
    if (typeof record.apiKey === 'string') agent.apiKey = record.apiKey.trim();
    agents.push(agent);
    if (agents.length >= 8) break;
  }
  return agents;
}
