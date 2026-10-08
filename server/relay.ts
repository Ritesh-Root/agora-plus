import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import type { IncomingMessage, Server, ServerResponse } from 'http';
import type { WebSocket as WsSocket } from 'ws';
import type { Plugin, ViteDevServer } from 'vite';
import { WebSocket, WebSocketServer } from 'ws';
import type { ClientMessage, ServerMessage } from '../shared/protocol';
import { parseRoomMentions, readAgentAccess, sanitizeChatAgents, sanitizeTeamAgents } from '../shared/mentions';
import { publicModelError } from './modelError';
import { normalizeChatText, RoomState } from './roomState';
import { runRoomDiscussion } from './roomReply';
import { runSociety } from './society/Orchestrator';
import { leadNotesFromConflict } from './society/leadNotes';
import { runBenchmark } from './bench/runner';
import { createRoutingProvider } from './routingProvider';
import { isFailed, resolveRoutedAccess } from './modelAccess';
import { handleModelTest } from './modelTest';
import { assertChatProxyTarget, MAX_PROXY_BODY } from './proxyGuard';
import { beginRunStats, currentRunStats, endRunStats } from './society/decider/runStats';
import { setBossAsker, setDecisionSink, toDecisionWire } from './society/decider/live';
import { researchSearchCount, researchSources } from './research/research';

/**
 * Room chat needs only the speakers' endpoints, so one bad connection fails only that speaker.
 * A run or benchmark also calls the default connection for planning and review,
 * so it is rejected before it starts if the default or any agent connection failed.
 */
async function providerFromClient(
  msg: { apiKey?: string; baseUrl?: string; agents?: unknown },
  options: { requireAll?: boolean } = {},
) {
  const access = await resolveRoutedAccess({
    apiKey: msg.apiKey,
    baseUrl: msg.baseUrl,
    agents: readAgentAccess(msg.agents),
  });
  if (options.requireAll) {
    const failed = [access.fallback, ...access.agents].find(isFailed);
    if (failed) throw failed.error;
  } else if (isFailed(access.fallback) && access.agents.length === 0) {
    throw access.fallback.error;
  }
  return createRoutingProvider(access);
}

/** Forwards one caller-keyed chat completion. Never adds the server key. */
export function handleCorsProxy(req: IncomingMessage, res: ServerResponse): boolean {
  const pathname = (req.url ?? '').split('?')[0];
  if (pathname !== '/api/cors-proxy') return false;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Target-URL',
    });
    res.end();
    return true;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return true;
  }

  const targetUrl = req.headers['x-target-url'];
  if (typeof targetUrl !== 'string' || !targetUrl) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing X-Target-URL header' }));
    return true;
  }
  const authorization = req.headers.authorization;
  if (!authorization) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'A caller API key is required for this endpoint.' }));
    return true;
  }

  let settled = false;
  const fail = (status: number, error: string) => {
    if (settled) return;
    settled = true;
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error }));
  };

  const chunks: Buffer[] = [];
  let size = 0;
  req.on('data', (chunk: Buffer) => {
    size += chunk.length;
    if (size > MAX_PROXY_BODY) {
      fail(413, 'Request body too large');
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });
  req.on('end', async () => {
    if (settled) return;
    try {
      const url = await assertChatProxyTarget(targetUrl);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: authorization,
      };
      if (req.headers.accept) headers.Accept = req.headers.accept as string;
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: Buffer.concat(chunks),
        redirect: 'error',
      });
      const text = await response.text();
      if (settled) return;
      settled = true;
      res.writeHead(response.status, {
        'Content-Type': response.headers.get('content-type') || 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(text);
    } catch (err) {
      console.error('[CORS Proxy Error]:', err instanceof Error ? err.message : 'request failed');
      const message = err instanceof Error ? err.message : String(err);
      const blocked = message === 'Invalid target URL' || message.includes('not allowed') || message.includes('https') || message.includes('redirect');
      fail(blocked ? 400 : 500, message.includes('redirect') ? 'Target host is not allowed' : message);
    }
  });
  return true;
}

const RELAY_PATH = '/__relay';

function send(ws: WsSocket, msg: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function forwardSocietyEvent(
  ws: WsSocket,
  event: { type: string; [key: string]: any },
  tracked?: { runId: string; room: RoomState; deliver: (msg: ServerMessage) => void },
): void {
  if (tracked && !tracked.room.ownsRun(tracked.runId)) return;
  const deliver = tracked?.deliver ?? ((msg: ServerMessage) => send(ws, msg));
  const runId = tracked?.runId;
  const room = tracked?.room;
  if (event.type === 'task-research') {
    if (runId && room) room.noteTask(runId, { id: event.taskId, title: event.title, role: event.role, status: 'running' });
    deliver({
      type: 'society-task-update',
      taskId: event.taskId,
      title: event.title,
      role: event.role,
      status: 'running',
      researching: true,
    });
  } else if (event.type === 'task-start') {
    if (runId && room) room.noteTask(runId, { id: event.taskId, title: event.title, role: event.role, status: 'running' });
    deliver({
      type: 'society-task-update',
      taskId: event.taskId,
      title: event.title,
      role: event.role,
      status: 'running',
    });
  } else if (event.type === 'task-healing') {
    if (runId && room) room.noteTask(runId, { id: event.taskId, title: event.title, role: event.role, status: 'healing', attempt: event.attempt });
    deliver({
      type: 'society-task-update',
      taskId: event.taskId,
      title: event.title,
      role: event.role,
      status: 'healing',
      attempt: event.attempt,
    });
  } else if (event.type === 'task-done') {
    if (runId && room) {
      room.noteTask(runId, {
        id: event.taskId,
        title: event.title,
        role: event.role,
        status: event.status === 'done' ? 'done' : 'escalated',
        output: event.output,
        attempt: event.attempts,
      });
    }
    deliver({
      type: 'society-task-update',
      taskId: event.taskId,
      title: event.title,
      role: event.role,
      status: event.status === 'done' ? 'done' : 'escalated',
      output: event.output,
      attempt: event.attempts,
    });
  } else if (event.type === 'society-synthesizing') {
    if (runId && room) room.noteStage(runId, 'assembling');
    deliver({ type: 'society-stage', stage: 'assembling' });
  } else if (event.type === 'society-repairing') {
    if (runId && room) room.noteStage(runId, 'repairing');
    deliver({ type: 'society-stage', stage: 'repairing' });
  }
}

/**
 * Vite plugin attaching a plain WebSocket relay to the dev-server process.
 *
 * Uses `noServer: true` and routes the HTTP `upgrade` event by pathname so it
 * ONLY claims `/__relay` and leaves every other upgrade (notably Vite's own HMR
 * socket) untouched. Attaching with `{ server, path }` instead would make `ws`
 * destroy non-matching upgrade sockets and break HMR (endless "connection lost"
 * reloads).
 */
export function relayPlugin(): Plugin {
  return {
    name: 'agora-relay',
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        if (handleCorsProxy(req, res) || handleModelTest(req, res)) return;
        next();
      });
      if (!server.httpServer) {
        console.warn('[relay] No httpServer (middleware mode?) — relay disabled.');
        return;
      }
      attachRelay(server.httpServer as Server);
    },
  };
}

/** Room relay for the Vite dev server and the production process. */
export function attachRelay(httpServer: Server): void {
  let wss: WebSocketServer | null = null;
  const room = new RoomState({ hostSecret: process.env.DEMO_HOST_SECRET });
      const sockets = new Map<string, WsSocket>();
      let replyChain = Promise.resolve();

      const broadcastAll = (msg: ServerMessage): void => {
        for (const ws of sockets.values()) send(ws, msg);
      };

      const broadcastExcept = (excludeId: string, msg: ServerMessage): void => {
        for (const [id, ws] of sockets) {
          if (id !== excludeId) send(ws, msg);
        }
      };

      wss = new WebSocketServer({ noServer: true });

      // Route upgrades by path: claim /__relay, ignore the rest so Vite's HMR works.
      httpServer.on('upgrade', (req, socket, head) => {
        let pathname: string;
        try {
          pathname = new URL(req.url ?? '', 'http://localhost').pathname;
        } catch {
          pathname = req.url ?? '';
        }
        if (pathname !== RELAY_PATH) return; // not ours — leave it for Vite/others
        wss!.handleUpgrade(req, socket, head, (ws) => wss!.emit('connection', ws, req));
      });

      wss.on('connection', (ws: WsSocket) => {
        let playerId: string | null = null;
        const pendingBoss = new Map<string, (reply: { action: 'approve' | 'edit' | 'reject'; text?: string } | null) => void>();
        const clearBoss = () => {
          setDecisionSink(null);
          setBossAsker(null);
          for (const wait of pendingBoss.values()) wait(null);
          pendingBoss.clear();
        };

        ws.on('message', async (raw) => {
          let msg: ClientMessage;
          try {
            msg = JSON.parse(raw.toString());
          } catch {
            return;
          }

          switch (msg.type) {
            case 'decision-reply': {
              const wait = pendingBoss.get(msg.id);
              if (!wait) break;
              pendingBoss.delete(msg.id);
              wait({ action: msg.action, text: msg.text });
              break;
            }
            case 'join': {
              if (playerId) return;
              const requested = typeof msg.resumeId === 'string' ? msg.resumeId.trim() : '';
              const resumeId = /^[0-9a-f-]{36}$/i.test(requested) ? requested : '';
              const resumeToken = typeof msg.resumeToken === 'string' ? msg.resumeToken : undefined;
              const hostCode = typeof msg.hostCode === 'string' ? msg.hostCode : undefined;
              const id = resumeId && room.canResume(resumeId, resumeToken) ? resumeId : randomUUID();
              const result = room.join(id, msg.name, msg.color, resumeToken, hostCode);
              if (!result.ok) {
                const { reason } = result as { ok: false; reason: 'room-full' };
                send(ws, { type: reason });
                ws.close();
                return;
              }
              playerId = id;
              sockets.set(id, ws);
              send(ws, {
                type: 'joined',
                me: result.info,
                roster: room.getRoster(),
                ...(result.hostToken ? { hostToken: result.hostToken } : {}),
              });
              send(ws, { type: 'room-chat-history', messages: room.chatFor(id) });
              const restored = room.currentRun();
              if (restored) {
                send(ws, {
                  type: 'society-snapshot',
                  run: {
                    runId: restored.id,
                    brief: restored.brief,
                    status: restored.status,
                    stage: restored.stage,
                    tasks: restored.tasks,
                    synthesis: restored.synthesis,
                    wordCount: restored.wordCount,
                    revisionLabel: restored.revisionLabel,
                  },
                });
              }
              broadcastExcept(id, { type: 'roster-update', roster: room.getRoster() });
              break;
            }
            case 'room-chat': {
              if (!playerId) return;
              const text = normalizeChatText(msg.text);
              const player = room.getRoster().find((p) => p.id === playerId);
              if (!text || !player) return;
              const agents = sanitizeChatAgents(msg.agents);
              const mentions = parseRoomMentions(text, agents);
              const direct = !mentions.all && mentions.names.length > 0;
              const message = {
                id: randomUUID(),
                playerId,
                name: player.name,
                text,
                timestamp: Date.now(),
                audience: direct ? 'direct' as const : 'room' as const,
                forPlayerId: direct ? playerId : undefined,
              };
              room.addChat(message);
              if (direct) send(ws, { type: 'room-chat', message });
              else broadcastAll({ type: 'room-chat', message });

              const speakers = mentions.all
                ? agents
                : agents.filter((agent) => mentions.names.includes(agent.name));
              if (speakers.length === 0) break;

              const senderId = playerId;
              const model = msg.model?.trim();
              const epoch = room.epoch();
              replyChain = replyChain.then(async () => {
                if (room.epoch() !== epoch) return;
                const post = (name: string, replyText: string) => {
                  if (room.epoch() !== epoch) return;
                  const reply = {
                    id: randomUUID(),
                    playerId: `agent:${name}`,
                    name,
                    text: replyText,
                    timestamp: Date.now(),
                    audience: message.audience,
                    forPlayerId: message.forPlayerId,
                  };
                  room.addChat(reply);
                  if (reply.audience === 'direct') {
                    const socket = sockets.get(senderId);
                    if (socket) send(socket, { type: 'room-chat', message: reply });
                  } else {
                    broadcastAll({ type: 'room-chat', message: reply });
                  }
                };
                try {
                  const provider = await providerFromClient(msg);
                  await runRoomDiscussion({
                    speakers,
                    teammates: agents,
                    provider,
                    model,
                    transcript: () => room.chatFor(senderId).map((entry) => `${entry.name}: ${entry.text}`).join('\n'),
                    post,
                  });
                } catch (error) {
                  post(speakers[0].name, publicModelError(error));
                }
              }).catch((error) => {
                console.error('[relay] room reply failed:', error instanceof Error ? error.message : error);
              });
              break;
            }
            case 'register-cabins': {
              if (!playerId) return;
              const roster = room.registerCabins(playerId, msg.cabinPoiIds);
              if (roster) broadcastAll({ type: 'roster-update', roster });
              break;
            }
            case 'player-state': {
              if (!playerId) return;
              broadcastExcept(playerId, {
                type: 'player-state',
                playerId,
                pos: msg.pos,
                vel: msg.vel,
                animState: msg.animState,
                speaking: msg.speaking,
              });
              break;
            }
            case 'npc-state': {
              if (!playerId || !room.isHost(playerId)) return;
              broadcastExcept(playerId, { type: 'npc-state', npcs: msg.npcs });
              break;
            }
            case 'leave': {
              ws.close();
              break;
            }
            case 'end-session': {
              if (!playerId) return;
              const ended = room.tryEndSession(playerId);
              if (!ended.ok) {
                const { error } = ended as { ok: false; error: string };
                send(ws, { type: 'society-error', error });
                break;
              }
              const notice: ServerMessage = { type: 'session-ended' };
              for (const sock of sockets.values()) {
                send(sock, notice);
                sock.close();
              }
              sockets.clear();
              break;
            }
            case 'cancel-run': {
              if (!playerId || !room.isHost(playerId)) {
                send(ws, { type: 'society-error', error: 'Only the room host can run the swarm.' });
                break;
              }
              const active = room.currentRun();
              if (!active || !room.requestCancel(active.id)) {
                send(ws, { type: 'society-error', error: 'There is no run to cancel.' });
                break;
              }
              send(ws, { type: 'society-run-status', runId: active.id, status: 'cancel_requested' });
              break;
            }
            case 'run-society': {
              if (!playerId || !room.isHost(playerId)) {
                send(ws, { type: 'society-error', error: 'Only the room host can run the swarm.' });
                break;
              }
              const begun = room.beginRun(msg.brief);
              if (!begun.ok) {
                send(ws, { type: 'society-error', error: 'A run is already in progress.' });
                break;
              }
              const runId = begun.run.id;
              const deliver = (message: ServerMessage) => {
                if (!room.ownsRun(runId)) return;
                const host = room.getRoster().find((player) => player.isHost);
                const sock = host ? sockets.get(host.id) : undefined;
                if (sock) send(sock, message);
              };
              // Demo/dev replay: when SOCIETY_REPLAY points at a recorded run's
              // message schedule, stream those events instead of running live.
              const societyReplay = process.env.SOCIETY_REPLAY;
              if (societyReplay) {
                try {
                  const sched = JSON.parse(readFileSync(societyReplay, 'utf8'));
                  console.log('[relay] society replay from', societyReplay);
                  for (const entry of sched.schedule) {
                    setTimeout(() => send(ws, entry.msg), entry.at);
                  }
                  break;
                } catch (e) {
                  console.error('[relay] society replay failed, running live:', e);
                }
              }
              let provider;
              try {
                provider = await providerFromClient(msg, { requireAll: true });
              } catch (error) {
                room.markStopped(runId);
                send(ws, { type: 'society-run-status', runId, status: 'stopped' });
                send(ws, { type: 'society-error', error: publicModelError(error) });
                break;
              }

              send(ws, { type: 'society-started', brief: msg.brief, taskCount: 0 });
              beginRunStats();
              setDecisionSink((record) => {
                send(ws, { type: 'society-decision', decision: toDecisionWire(record) });
              });
              setBossAsker((record) => new Promise((resolve) => {
                const id = randomUUID();
                const timer = setTimeout(() => {
                  pendingBoss.delete(id);
                  resolve(null);
                }, 30_000);
                pendingBoss.set(id, (reply) => {
                  clearTimeout(timer);
                  resolve(reply);
                });
                send(ws, { type: 'decision-request', id, decision: toDecisionWire(record) });
              }));

              const model = msg.model?.trim();
              const team = sanitizeTeamAgents(msg.agents);
              provider.prepareRequest({ runId, stage: 'planning', agent: team[0]?.name ?? 'Manager', attempt: 1 });
              let negotiationRes: any;
              runSociety(msg.brief, provider, {
                models: model ? { manager: model, worker: model } : undefined,
                team,
                shouldStop: () => room.cancelRequested(runId),
                onEvent: (event) => forwardSocietyEvent(ws, event, { runId, room, deliver }),
                beforeSynthesis: async (tasks) => {
                  if (room.cancelRequested(runId)) return '';
                  try {
                    const prepared = await leadNotesFromConflict(msg.brief, tasks, provider, (event) => {
                      if (event.type === 'society-debating') {
                        if (room.ownsRun(runId)) room.noteStage(runId, 'debating');
                        deliver({ type: 'society-stage', stage: 'debating' });
                      } else if (event.type === 'negotiation-turn') {
                        deliver({
                          type: 'society-negotiation',
                          topic: event.topic ?? 'Worker outputs',
                          round: event.round,
                          agent: event.agent,
                          argument: event.argument
                        });
                      } else if (event.type === 'negotiation-scores') {
                        deliver({
                          type: 'society-negotiation',
                          topic: event.topic ?? 'Worker outputs',
                          round: event.round,
                          agent: 'Referee',
                          argument: `Scoring results for Round ${event.round}`,
                          scores: event.scores
                        });
                      }
                    }, model || 'deepseek-v4.1-flash');
                    if (prepared.negotiation) {
                      negotiationRes = {
                        topic: prepared.negotiation.topic,
                        rounds: prepared.negotiation.rounds,
                        outcome: prepared.negotiation.outcome,
                        winner: prepared.negotiation.winner,
                        synthesis: prepared.negotiation.synthesis,
                        scores: prepared.negotiation.scores,
                        transcript: prepared.negotiation.transcript
                      };
                    }
                    return prepared.notes;
                  } catch (e) {
                    console.error('[Relay] Negotiation failed:', e);
                  }
                }
              }).then(async (result) => {
                if (!room.ownsRun(runId)) return;
                if (result.documentStatus === 'stopped') {
                  room.markStopped(runId);
                  deliver({ type: 'society-run-status', runId, status: 'stopped' });
                  endRunStats();
                  clearBoss();
                  return;
                }
                const recorded = room.finishRun(runId, {
                  status: result.revisionLabel ? 'needs_revision' : 'complete',
                  synthesis: result.synthesis,
                  wordCount: result.wordCount,
                  revisionLabel: result.revisionLabel,
                });
                if (!recorded) {
                  endRunStats();
                  clearBoss();
                  return;
                }
                const counted = provider.takeUsage();
                deliver({
                  type: 'society-complete',
                  result: {
                    brief: result.brief,
                    tasks: result.tasks.map(t => ({
                      id: t.id,
                      title: t.title,
                      role: t.role,
                      status: t.status,
                      output: t.output,
                      attempts: t.attempts,
                      healed: t.healed
                    })),
                    synthesis: result.synthesis,
                    wordCount: result.wordCount,
                    revisionLabel: result.revisionLabel,
                    negotiation: negotiationRes,
                    metrics: {
                      ...result.metrics,
                      totalCalls: counted.calls,
                      totalPromptTokens: counted.promptTokens,
                      totalCompletionTokens: counted.completionTokens,
                      missingUsage: counted.missingUsage,
                    },
                    research: {
                      searches: currentRunStats()?.researchCalls ?? researchSearchCount(),
                      sources: researchSources(),
                    },
                    summary: {
                      decisions: currentRunStats()?.decisionCalls ?? 0,
                      inputTokens: currentRunStats()?.inputTokens ?? 0,
                      jevCostUsd: ((currentRunStats()?.inputTokens ?? 0) * 0.042) / 1_000_000,
                      searches: researchSearchCount(),
                      sources: researchSources(),
                      comparisonMeasured: false,
                      comparisonNote: 'The five-brief comparison was not run. Jev returned HTTP 401, so time saved versus the legacy path was not measured.',
                    },
                  }
                });
                endRunStats();
                clearBoss();
              }).catch((err) => {
                endRunStats();
                clearBoss();
                if (room.ownsRun(runId)) {
                  room.markStopped(runId);
                  deliver({ type: 'society-run-status', runId, status: 'stopped' });
                  deliver({ type: 'society-error', error: publicModelError(err) });
                }
              });
              break;
            }
            case 'run-benchmark': {
              // Demo/dev replay: when BENCH_REPLAY points at a saved benchmark-result
              // JSON (recorded from a real run), stream it back after a short delay
              // instead of re-running the pipelines. Inactive unless the env var is set.
              if (!playerId || !room.isHost(playerId)) {
                send(ws, { type: 'society-error', error: 'Only the room host can run the benchmark.' });
                break;
              }
              const replayPath = process.env.BENCH_REPLAY;
              if (replayPath) {
                try {
                  const saved = JSON.parse(readFileSync(replayPath, 'utf8'));
                  console.log('[relay] benchmark replay from', replayPath);
                  setTimeout(() => send(ws, saved), 12_000);
                  break;
                } catch (e) {
                  console.error('[relay] benchmark replay failed, running live:', e);
                }
              }
              let provider;
              try {
                provider = await providerFromClient(msg, { requireAll: true });
              } catch (error) {
                send(ws, { type: 'society-error', error: publicModelError(error) });
                break;
              }
              runBenchmark(msg.brief, provider, msg.model?.trim(), (event) => forwardSocietyEvent(ws, event)).then((benchResult) => {
                send(ws, {
                  type: 'benchmark-result',
                  society: {
                    brief: benchResult.society.brief,
                    tasks: benchResult.society.tasks.map(t => ({
                      id: t.id,
                      title: t.title,
                      role: t.role,
                      status: t.status,
                      output: t.output,
                      attempts: t.attempts,
                      healed: t.healed
                    })),
                    synthesis: benchResult.society.synthesis,
                    metrics: benchResult.society.metrics
                  },
                  single: benchResult.single,
                  qualityScores: benchResult.qualityScores
                });
              }).catch((err) => {
                send(ws, { type: 'society-error', error: publicModelError(err) });
              });
              break;
            }
          }
        });

        ws.on('close', () => {
          if (!playerId) return;
          room.leave(playerId);
          sockets.delete(playerId);
          broadcastAll({ type: 'player-left', playerId });
          broadcastAll({ type: 'roster-update', roster: room.getRoster() });
          playerId = null;
        });
      });

  httpServer.once('close', () => {
    wss?.close();
    wss = null;
  });
}
