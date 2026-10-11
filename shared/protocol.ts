/**
 * Wire protocol shared between the client (src/network) and the relay server (server/).
 * Kept dependency-free (no DOM, no Node) so it can be imported by both tsconfigs unmodified.
 */

export const MAX_PLAYERS = 5;

export interface PlayerInfo {
  id: string;
  name: string;
  color: string;
  slotIndex: number;
  cabinPoiId: string | null;
  isHost: boolean;
}

export interface RemoteNpcState {
  aiIndex: number; // logical AI agent index (1..N), translated to render-index on the receiving client
  pos: [number, number, number];
  facing: [number, number]; // xz facing direction, same convention as player-state's `vel`
  animState: string;
  speaking: boolean;
}

export interface RoomChatMessage {
  id: string;
  playerId: string;
  name: string;
  text: string;
  timestamp: number;
  /** Missing means the whole room, including older messages. */
  audience?: 'room' | 'direct';
  /** Human who can see a direct thread, along with the agent replies in it. */
  forPlayerId?: string;
}

export interface SocietyResultWire {
  brief: string;
  tasks: Array<{
    id: string;
    title: string;
    role: string;
    status: 'done' | 'escalated';
    output: string;
    attempts: number;
    healed: boolean;
  }>;
  /** Lead-merged document. Distinct from negotiation.synthesis. */
  synthesis?: string;
  wordCount?: number;
  /** Present when the draft is kept but is not a successful completion. */
  revisionLabel?: string;
  /** Spoken line for a finished household run. The office shows this when it is set. */
  spokenSummary?: string;
  /** Set when the finished run could not be saved. */
  error?: string;
  negotiation?: {
    topic: string;
    rounds: number;
    outcome: 'consensus' | 'escalate';
    winner?: string;
    synthesis: string;
    scores: Array<{ agent: string; score: number; reason: string }>;
    transcript: Array<{ round: number; agent: string; argument: string }>;
  };
  metrics: {
    taskCount: number;
    maxConcurrency: number;
    escalated: number;
    healed: number;
    wallMs: number;
    /** Planning, worker, and merge calls, including a worker retry. */
    calls?: number;
    promptTokens?: number;
    completionTokens?: number;
    /** Every model call in the run, including debate. */
    totalCalls?: number;
    totalPromptTokens?: number;
    totalCompletionTokens?: number;
    /** Calls that returned no token counts, including calls that failed. */
    missingUsage?: number;
    /** Shortening passes after the first draft. Included in totalCalls and wallMs. */
    repairCalls?: number;
    phases?: { managerMs: number; workersMs: number; beforeSynthesisMs: number; leadMs: number };
  };
}

export type ClientMessage =
  | { type: 'join'; name: string; color: string; resumeId?: string; resumeToken?: string; hostCode?: string }
  | { type: 'player-state'; pos: [number, number, number]; vel: [number, number]; animState: string; speaking: boolean }
  | { type: 'npc-state'; npcs: RemoteNpcState[] }
  | { type: 'leave' }
  | { type: 'end-session' }
  | { type: 'register-cabins'; cabinPoiIds: string[] }
  | { type: 'run-society'; brief: string; baseUrl?: string; apiKey?: string; model?: string; agents?: { name: string; description: string; model?: string; baseUrl?: string; apiKey?: string }[] }
  | { type: 'run-benchmark'; brief: string; baseUrl?: string; apiKey?: string; model?: string }
  | { type: 'room-chat'; text: string; baseUrl?: string; apiKey?: string; model?: string; agents?: { name: string; description: string; model?: string; baseUrl?: string; apiKey?: string }[] }
  | { type: 'cancel-run' };

export type ServerMessage =
  | { type: 'joined'; me: PlayerInfo; roster: PlayerInfo[]; hostToken?: string }
  | { type: 'room-full' }
  | { type: 'cabins-not-ready' }
  | { type: 'roster-update'; roster: PlayerInfo[] }
  | { type: 'player-state'; playerId: string; pos: [number, number, number]; vel: [number, number]; animState: string; speaking: boolean }
  | { type: 'npc-state'; npcs: RemoteNpcState[] }
  | { type: 'player-left'; playerId: string }
  | { type: 'session-ended' }
  | { type: 'society-started'; brief: string; taskCount: number }
  | { type: 'society-task-update'; taskId: string; title: string; role: string; status: 'running' | 'done' | 'healing' | 'escalated'; output?: string; attempt?: number }
  | { type: 'society-negotiation'; topic: string; round: number; agent: string; argument: string; scores?: Array<{ agent: string; score: number; reason: string }> }
  | { type: 'society-stage'; stage: 'debating' | 'assembling' | 'repairing' }
  | { type: 'society-run-status'; runId: string; status: 'cancel_requested' | 'stopped' }
  | { type: 'society-snapshot'; run: { runId: string; brief: string; status: 'running' | 'cancel_requested' | 'stopped' | 'complete' | 'needs_revision'; stage: 'planning' | 'working' | 'debating' | 'assembling' | 'repairing' | null; tasks: Array<{ id: string; title: string; role: string; status: 'pending' | 'running' | 'done' | 'healing' | 'escalated'; output?: string; attempt?: number }>; synthesis: string; wordCount?: number; revisionLabel?: string; spokenSummary?: string } }
  | { type: 'society-complete'; result: SocietyResultWire }
  | { type: 'society-error'; error: string }
  | { type: 'room-chat'; message: RoomChatMessage }
  | { type: 'room-chat-history'; messages: RoomChatMessage[] }
  | { type: 'benchmark-result'; society: SocietyResultWire; single: { output: string; wallMs: number; model: string }; qualityScores: { society: number; single: number } | null };
