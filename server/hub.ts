import type { ServerMessage } from '../shared/protocol';
import { RoomState } from './roomState';
import { WebSocket } from 'ws';

export type BossReply = { action: 'approve' | 'edit' | 'reject'; text?: string } | null;

export interface Hub {
  room: RoomState;
  sockets: Map<string, WebSocket>;
  broadcastAll: (msg: ServerMessage) => void;
  /** The host player's open socket, if someone is in the room as host. */
  hostSocket: () => WebSocket | undefined;
  pendingBoss: Map<string, (reply: BossReply) => void>;
}

let hub: Hub | null = null;

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

/** One room, socket map, and boss-reply map for this process. */
export function getHub(): Hub {
  if (hub) return hub;
  const room = new RoomState({ hostSecret: process.env.DEMO_HOST_SECRET });
  const sockets = new Map<string, WebSocket>();
  const pendingBoss = new Map<string, (reply: BossReply) => void>();
  hub = {
    room,
    sockets,
    pendingBoss,
    broadcastAll(msg) {
      for (const ws of sockets.values()) send(ws, msg);
    },
    hostSocket() {
      const host = room.getRoster().find((player) => player.isHost);
      return host ? sockets.get(host.id) : undefined;
    },
  };
  return hub;
}
