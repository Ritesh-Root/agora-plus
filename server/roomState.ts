import { randomUUID, timingSafeEqual } from 'crypto';
import { canSeeChat } from '../shared/mentions';
import { MAX_PLAYERS, PlayerInfo, RoomChatMessage } from '../shared/protocol';

const MAX_CHAT = 100;

export interface RoomRunTask {
  id: string;
  title: string;
  role: string;
  status: 'pending' | 'running' | 'done' | 'healing' | 'escalated';
  output?: string;
  attempt?: number;
}

export interface RoomRun {
  id: string;
  brief: string;
  status: 'running' | 'cancel_requested' | 'stopped' | 'complete' | 'needs_revision';
  stage: 'planning' | 'working' | 'debating' | 'assembling' | 'repairing' | null;
  tasks: RoomRunTask[];
  synthesis: string;
  wordCount?: number;
  revisionLabel?: string;
}

let networkOpen = false;

/** True while the process is bound beyond loopback and no demo host secret is set. */
export function setRoomNetworkOpen(open: boolean): void {
  networkOpen = open;
}

function hostCodeMatches(secret: string, code: string | undefined): boolean {
  if (!code) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(code);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Returns trimmed chat text, or null when it should be dropped. */
export function normalizeChatText(text: unknown): string | null {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 2000) return null;
  return trimmed;
}

/**
 * Pure roster/slot/cabin bookkeeping for the relay. No socket knowledge —
 * server/relay.ts owns the actual WebSocket connections and calls into this.
 *
 * With no demo host secret, the first connection to join becomes host.
 * When this process is bound to every interface and that secret is unset,
 * the host seat waits for a household session instead of the first caller.
 * When a secret is set, host authority is only the matching code or the
 * server-issued resume token. A display name never grants it.
 * Cabins are optional at join time:
 * a 3D office may still be loading, or the host browser may have no WebGPU.
 * The first client that has a loaded office may publish cabin ids; later
 * joiners are not turned away while that list is empty.
 */
export class RoomState {
  private players = new Map<string, PlayerInfo>();
  private cabinPoiIds: string[] | null = null;
  private hostId: string | null = null;
  /** Survives the host disconnecting so a refresh can reclaim the seat. A display name never matches this. */
  private hostPlayerId: string | null = null;
  private hostToken: string | null = null;
  private chat: RoomChatMessage[] = [];
  private run: RoomRun | null = null;
  /** Run ids wiped by End session. Late finishes must not recreate them. */
  private halted = new Set<string>();
  private sessionEpoch = 1;
  private hostSecret: string | null;

  constructor(options?: { hostSecret?: string }) {
    const secret = options?.hostSecret?.trim();
    this.hostSecret = secret || null;
  }

  public epoch(): number {
    return this.sessionEpoch;
  }

  public cabinsReady(): boolean {
    return this.cabinPoiIds !== null;
  }

  public isHost(id: string): boolean {
    return this.hostId === id;
  }

  private nextFreeSlot(): number | null {
    const used = new Set(Array.from(this.players.values()).map((p) => p.slotIndex));
    for (let i = 0; i < MAX_PLAYERS; i++) {
      if (!used.has(i)) return i;
    }
    return null;
  }

  private nextFreeCabin(): string | null {
    if (!this.cabinPoiIds) return null;
    const used = new Set(Array.from(this.players.values()).map((p) => p.cabinPoiId));
    for (const id of this.cabinPoiIds) {
      if (!used.has(id)) return id;
    }
    return null;
  }

  /** True when this browser may take the id back. The host id also needs the host token. */
  public canResume(id: string, token?: string): boolean {
    if (this.players.has(id)) return false;
    if (id === this.hostPlayerId) return !!this.hostToken && token === this.hostToken;
    return true;
  }

  public join(
    id: string,
    name: string,
    color: string,
    token?: string,
    hostCode?: string,
    sessionHost = false,
  ): { ok: true; info: PlayerInfo; hostToken?: string } | { ok: false; reason: 'room-full' } {
    const slotIndex = this.nextFreeSlot();
    if (slotIndex === null) {
      return { ok: false, reason: 'room-full' };
    }

    const resumeHost = !!this.hostToken && token === this.hostToken && id === this.hostPlayerId;
    const codeOk = this.hostSecret ? hostCodeMatches(this.hostSecret, hostCode) : false;
    const isHost = this.hostSecret
      ? resumeHost || (codeOk && this.hostId === null)
      : networkOpen
        ? resumeHost || (sessionHost && this.hostId === null)
        : this.players.size === 0 || resumeHost;
    if (isHost && !resumeHost) {
      this.hostToken = randomUUID();
      this.hostPlayerId = id;
    }

    const info: PlayerInfo = {
      id,
      name,
      color,
      slotIndex,
      cabinPoiId: this.nextFreeCabin(),
      isHost,
    };
    this.players.set(id, info);
    if (isHost) this.hostId = id;
    return { ok: true, info, hostToken: isHost ? this.hostToken ?? undefined : undefined };
  }

  /** First loaded office publishes cabins. The host may replace that list later. */
  public registerCabins(id: string, cabinPoiIds: string[]): PlayerInfo[] | null {
    if (!this.players.has(id)) return null;
    if (!cabinPoiIds.length) return null;
    if (this.cabinPoiIds && id !== this.hostId) return null;
    this.cabinPoiIds = cabinPoiIds;
    // Backfill the host's own cabin — it joined before any cabins existed.
    for (const player of this.players.values()) {
      if (player.cabinPoiId === null) {
        player.cabinPoiId = this.nextFreeCabin();
      }
    }
    return this.getRoster();
  }

  public leave(id: string): void {
    const wasHost = this.hostId === id;
    this.players.delete(id);
    if (wasHost) {
      this.hostId = null;
      this.cabinPoiIds = null;
    }
    if (this.players.size === 0) {
      this.hostId = null;
      this.hostPlayerId = null;
      this.hostToken = null;
      this.cabinPoiIds = null;
    }
  }

  /** A running or cancelling run blocks another Execute. A finished run stays so a reconnect can restore it. */
  public beginRun(brief: string): { ok: true; run: RoomRun } | { ok: false; reason: 'busy' } {
    if (this.run && (this.run.status === 'running' || this.run.status === 'cancel_requested')) {
      return { ok: false, reason: 'busy' };
    }
    this.run = {
      id: randomUUID(),
      brief,
      status: 'running',
      stage: 'planning',
      tasks: [],
      synthesis: '',
    };
    return { ok: true, run: this.run };
  }

  public currentRun(): RoomRun | null {
    if (!this.run) return null;
    return { ...this.run, tasks: this.run.tasks.map((task) => ({ ...task })) };
  }

  public ownsRun(id: string): boolean {
    return this.run?.id === id && !this.halted.has(id);
  }

  public cancelRequested(id: string): boolean {
    if (this.halted.has(id)) return true;
    return !!this.run && this.run.id === id && (this.run.status === 'cancel_requested' || this.run.status === 'stopped');
  }

  public requestCancel(id: string): boolean {
    if (!this.run || this.run.id !== id || this.run.status !== 'running') return false;
    this.run.status = 'cancel_requested';
    return true;
  }

  public markStopped(id: string): boolean {
    if (!this.run || this.run.id !== id) return false;
    if (this.run.status !== 'running' && this.run.status !== 'cancel_requested') return false;
    this.run.status = 'stopped';
    this.run.stage = null;
    return true;
  }

  public noteStage(id: string, stage: RoomRun['stage']): void {
    if (!this.run || this.run.id !== id) return;
    if (this.run.status !== 'running') return;
    this.run.stage = stage;
  }

  public noteTask(id: string, task: Partial<RoomRunTask> & { id: string }): void {
    if (!this.run || this.run.id !== id) return;
    if (this.run.status !== 'running' && this.run.status !== 'cancel_requested') return;
    const existing = this.run.tasks.find((item) => item.id === task.id);
    if (existing) {
      if (task.title) existing.title = task.title;
      if (task.role) existing.role = task.role;
      if (task.status) existing.status = task.status;
      if (task.output !== undefined) existing.output = task.output;
      if (task.attempt !== undefined) existing.attempt = task.attempt;
    } else {
      this.run.tasks.push({
        id: task.id,
        title: task.title || 'Untitled',
        role: task.role || 'worker',
        status: task.status || 'running',
        output: task.output,
        attempt: task.attempt,
      });
    }
    if (this.run.stage === 'planning' || this.run.stage === 'working' || this.run.stage === null) {
      this.run.stage = 'working';
    }
  }

  /** Host only. Stops the run, drops every person, and invalidates the session. */
  public tryEndSession(playerId: string): { ok: true } | { ok: false; error: string } {
    if (!this.isHost(playerId)) {
      return { ok: false, error: 'Only the room host can end the session.' };
    }
    this.endSession();
    return { ok: true };
  }

  public endSession(): void {
    if (this.run) this.halted.add(this.run.id);
    this.players.clear();
    this.chat = [];
    this.run = null;
    this.hostId = null;
    this.hostPlayerId = null;
    this.hostToken = null;
    this.cabinPoiIds = null;
    this.sessionEpoch += 1;
  }

  public finishRun(id: string, patch: { status: 'complete' | 'needs_revision'; synthesis: string; wordCount?: number; revisionLabel?: string }): boolean {
    if (this.halted.has(id)) return false;
    if (!this.run || this.run.id !== id) return false;
    if (this.run.status === 'stopped') return false;
    this.run.status = patch.status;
    this.run.synthesis = patch.synthesis;
    this.run.wordCount = patch.wordCount;
    this.run.revisionLabel = patch.revisionLabel;
    this.run.stage = null;
    return true;
  }

  public getRoster(): PlayerInfo[] {
    return Array.from(this.players.values());
  }

  public addChat(message: RoomChatMessage): RoomChatMessage[] {
    this.chat.push(message);
    if (this.chat.length > MAX_CHAT) this.chat.splice(0, this.chat.length - MAX_CHAT);
    return this.chat;
  }

  public getChat(): RoomChatMessage[] {
    return this.chat;
  }

  public chatFor(playerId: string): RoomChatMessage[] {
    return this.chat.filter((message) => canSeeChat(message, playerId));
  }
}
