import type { ServerMessage } from '../shared/protocol';
import { isLoopbackAddress } from './household/session';
import { RoomState, setRoomNetworkOpen } from './roomState';
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
type Bind = 'unset' | 'loopback' | 'open';
let bind: Bind = 'unset';

/**
 * Records the address this process listens on.
 * `0.0.0.0` and `::` are open. A LAN address is open too.
 */
export function noteBindHost(host: string): void {
  const value = host.trim();
  if (!value) bind = 'unset';
  else if (value === '127.0.0.1' || value === '::1' || value === 'localhost') bind = 'loopback';
  else bind = 'open';
  setRoomNetworkOpen(bind === 'open' && !process.env.DEMO_HOST_SECRET?.trim());
}

export function listenBind(): Bind {
  return bind;
}

/** True when OAuth may derive its issuer from the request host. */
export function processOnLoopback(localAddress: string | undefined): boolean {
  if (bind === 'open') return false;
  if (bind === 'loopback') return true;
  if (!localAddress) return true;
  return isLoopbackAddress(localAddress);
}

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
