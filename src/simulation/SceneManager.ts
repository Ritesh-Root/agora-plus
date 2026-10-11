import * as THREE from 'three/webgpu';
import { getAgentSet, getAllAgents, AgenticSystem, MAX_PLAYERS, toRenderIndex, toLogicalIndex } from '../data/agents';
import { CharacterController } from './CharacterController';
import { Engine } from './core/Engine';
import { Stage } from './core/Stage';
import { DriverManager } from './drivers/DriverManager';
import { CharacterManager } from './entities/CharacterManager';
import { InputManager } from './input/InputManager';
import { NavMeshManager } from './pathfinding/NavMeshManager';
import { PoiManager } from './world/PoiManager';
import { WorldManager } from './world/WorldManager';

import { AgentSimulation } from './core/AgentSimulation';
import { FlatOffice } from './FlatOffice';
import { useCoreStore } from '../integration/store/coreStore';
import { useSocietyStore } from '../integration/store/societyStore';
import { getActiveAgentSet, useTeamStore } from '../integration/store/teamStore';
import { useUiStore } from '../integration/store/uiStore';
import { AgentBehavior, ChatMessage } from '../types';
import { BUBBLE_Y_OFFSET } from './constants';
import { networkClient } from '../network/NetworkClient';
import { useRosterStore } from '../network/RosterStore';
import { RemotePlayerDriver } from '../network/RemotePlayerDriver';
import { RemoteNpcDriver } from '../network/RemoteNpcDriver';
import { PlayerInfo, ServerMessage } from '../../shared/protocol';

/**
 * SceneManager — Visual Integration Layer.
 * 
 * DESIGN PRINCIPLE: Visual Reflex of Logic.
 * 1. Subscribes to the Store to Decouple logic from 3D.
 * 2. Visual actions are fire-and-forget.
 * 3. Smart POI assignment ensures NPCs find desks even with diverse GLB names.
 */
export class SceneManager {
  private engine: Engine;
  private stage: Stage;
  private characterManager: CharacterManager;
  private controller: CharacterController | null = null;
  private navMesh: NavMeshManager;
  private poiManager: PoiManager;
  private worldManager: WorldManager;
  private driverManager: DriverManager | null = null;
  private simulation: AgentSimulation | null = null;
  private flatOffice: FlatOffice | null = null;

  private lastAgentSetId: string | null = null;
  private selectedIndex: number | null = null;
  private coreHandler: ((npcIndex: number, text: string) => Promise<string | null>) | null = null;

  // ── Multiplayer state ─────────────────────────────────────────
  private localSlotIndex = 0;
  private isHost = true;
  private knownPlayers = new Map<string, PlayerInfo>();
  private activeHumanSlots = new Set<number>();
  private lastNetworkSendMs = 0;
  private deskBound = new Set<number>();
  private headingHome = new Set<number>();

  private unsubs: (() => void)[] = [];
  private isDisposed = false;
  private container: HTMLElement;
  private resizeObserver: ResizeObserver;

  constructor(container: HTMLElement) {
    this.container = container;
    this.engine = new Engine(container);
    this.stage = new Stage(this.engine.renderer.domElement);
    this.characterManager = new CharacterManager(this.stage.scene);
    this.navMesh = new NavMeshManager();
    this.poiManager = new PoiManager();
    this.characterManager.setPoiManager(this.poiManager);
    this.worldManager = new WorldManager(this.stage.scene, this.navMesh, this.poiManager);

    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.resizeObserver.observe(container);

    const activeSet = getActiveAgentSet();
    this.simulation = new AgentSimulation(activeSet);
    this.setCoreHandler((idx, text) => this.simulation!.handleUserMessage(idx, text));
    
    this.init();
    this.startWatchingCoreStore();
    this.unsubs.push(networkClient.onMessage((msg) => this._onNetworkMessage(msg)));
  }

  private mountFlatOffice() {
    if (this.flatOffice) return;
    this.flatOffice = new FlatOffice(this.container, this.engine);
    this.flatOffice.start();
  }

  private startWatchingCoreStore() {
    this.unsubs.push(
      useCoreStore.subscribe((state, prevState) => {
        const agentIndices = Array.from(new Set(state.tasks.flatMap(t => [t.assignedAgentId].filter(id => id !== undefined && id !== 0))));

        agentIndices.forEach(id => {
          const myTasks = state.tasks.filter(t => t.assignedAgentId === id);
          const hasChange = myTasks.some(t => {
            const pt = prevState.tasks.find(old => old.id === t.id);
            return !pt || pt.status !== t.status;
          });
          
          if (!hasChange) return;

          const onHold = myTasks.find(t => t.status === 'on_hold');
          const inProgress = myTasks.find(t => t.status === 'in_progress');
          const justDone = myTasks.some(t => t.status === 'done' && !prevState.tasks.find(pt => pt.id === t.id && pt.status === 'done'));

          if (onHold) {
            this.moveNpcToBoardroom(id);
          } else if (inProgress) {
            this.setNpcWorking(id, true);
          } else if (justDone) {
            this.setNpcWorking(id, false);
            this.moveNpcToSpawn(id);
          }
        });
      })
    );
    this.unsubs.push(useSocietyStore.subscribe((state, prev) => {
      if (
        state.tasks !== prev.tasks
        || state.negotiation !== prev.negotiation
        || state.isRunning !== prev.isRunning
        || state.isBenchmarking !== prev.isBenchmarking
      ) {
        this.syncSocietyMotion();
      }
    }));
  }

  /** Walk and speak from the society store, so a live run and a replay use the same drivers. */
  private syncSocietyMotion(): void {
    if (!this.controller) return;
    const agents = getAllAgents(getActiveAgentSet());
    if (agents.length === 0) return;
    const { tasks, negotiation, isRunning, isBenchmarking } = useSocietyStore.getState();
    const busy = isRunning || isBenchmarking;
    if (busy && tasks.length === 0) {
      agents.forEach((agent) => this.setNpcWorking(agent.index, true));
    }
    tasks.forEach((task, index) => {
      const agentIndex = agents[index % agents.length].index;
      if (task.status === 'done' || task.status === 'escalated') {
        if (!isBenchmarking) this.moveNpcToSpawn(agentIndex);
      } else if (busy || task.status === 'running' || task.status === 'healing') {
        this.setNpcWorking(agentIndex, true);
      }
    });
    const lastTurn = negotiation?.transcript[negotiation.transcript.length - 1];
    if (lastTurn) this.setNpcTalking(agents[0].index, true);
  }

  private async init() {
    try {
      await this.engine.init();
      if (this.isDisposed) return;
      if (!this.engine.initialized) {
        this.mountFlatOffice();
        return;
      }
    } catch (e) {
      console.error("Engine initialization failed:", e);
      this.mountFlatOffice();
      return;
    }

    try {
      await this.worldManager.load();
      await this.characterManager.load();
    } catch (error) {
      console.error("ThreeJS asset loading failed:", error);
      const el = document.createElement('div');
      el.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;gap:8px;align-items:center;justify-content:center;padding:24px;text-align:center;font:500 14px system-ui,sans-serif;color:#ef4444;background:#0c0c0d;z-index:50;';
      el.innerHTML =
        '<div style="font-weight:800;font-size:18px;color:#fff;">ThreeJS Asset Loading Failed</div>' +
        `<div style="color:#f87171;font-family:monospace;font-size:12px;margin:8px 0;">${error instanceof Error ? error.message : String(error)}</div>` +
        '<div style="font-size:12px;color:#94a3b8;margin-top:8px;">Check your browser console and make sure the model files exist under public/models/.</div>';
      this.container.appendChild(el);
      return;
    }
    if (this.isDisposed) return;

    const state = useUiStore.getState();
    this.characterManager.setInstanceCount(state.instanceCount);
    this.controller = new CharacterController(this.characterManager, this.navMesh, this.poiManager);
    this.driverManager = new DriverManager(this.controller);
    
    const activeSet = getActiveAgentSet();
    this._wireDrivers(activeSet);

    new InputManager(
      this.engine.renderer.domElement, this.stage.camera,
      () => this.controller!.getCPUPositions(), () => this.controller!.getCount(),
      (idx) => this._isSlotActive(idx),
      (idx) => {
        if (useUiStore.getState().isChatting) useUiStore.getState().setChatting(false);
        this.selectedIndex = this._toAgentLogicalIndex(idx);
        useUiStore.getState().setSelectedNpc(this.selectedIndex);
      },
      (x, z) => this.driverManager?.getPlayerDriver().onFloorClick(x, z),
      (idx, pos) => useUiStore.getState().setHoveredNpc(this._toAgentLogicalIndex(idx), pos),
      () => this.poiManager.getAllPois(),
      (id, label, pos) => useUiStore.getState().setHoveredPoi(id, label, pos),
      (id) => this.driverManager?.getPlayerDriver().onPoiClick(id),
      this.worldManager.getOffice() ?? undefined, (p) => this.navMesh.isPointOnNavMesh(p)
    );

    this.engine.renderer.setAnimationLoop(this.animate.bind(this));
    this.syncSocietyMotion();

    const roster = useRosterStore.getState();
    if (roster.self) this._onJoined(roster.self, roster.roster);

    this.unsubs.push(useUiStore.subscribe((s, prev) => {
      if (s.instanceCount !== prev.instanceCount) this.controller?.setInstanceCount(s.instanceCount);
      const team = useTeamStore.getState();
      if (team.selectedAgentSetId !== this.lastAgentSetId) {
        this.lastAgentSetId = team.selectedAgentSetId;
        const set = getAgentSet(team.selectedAgentSetId, team.customSystems);
        this.reinitializeSimulation(set);
        this.worldManager.updateThemeColor(set.color);
        if (this.controller) {
          this.controller.setColors();
          const playerIndices = this.activeHumanSlots.size > 0 ? Array.from(this.activeHumanSlots) : [this.localSlotIndex];
          this.controller.warpAllToSpawn(playerIndices, getAllAgents(set).map(a => toRenderIndex(a.index)));
          this._reapplyActiveSlots();
        }
      }
      if ((s.isChatting !== prev.isChatting || s.isThinking !== prev.isThinking || s.isTyping !== prev.isTyping) && this.controller) {
        if (s.isChatting && !prev.isChatting && s.selectedNpcIndex !== null) {
           this._startChatVisuals(s.selectedNpcIndex);
        }

        if (s.isChatting && s.selectedNpcIndex !== null) {
          const npc = toRenderIndex(s.selectedNpcIndex), user = this.localSlotIndex;
          if (this.controller.getState(npc) !== 'walk') this.controller.play(npc, s.isThinking ? 'talk' : 'listen');
          this.controller.setSpeaking(npc, s.isThinking);
          if (this.controller.getState(user) !== 'walk') this.controller.play(user, s.isTyping ? 'talk' : 'listen');
          this.controller.setSpeaking(user, s.isTyping);
        } else if (!s.isChatting && prev.isChatting) {
          // Cleanup Chat Visuals
          const npc = prev.selectedNpcIndex !== null ? toRenderIndex(prev.selectedNpcIndex) : null;
          const user = this.localSlotIndex;
          if (npc !== null) {
            this.driverManager?.getNpcDriver(npc)?.setChatting(false);
            this.controller.setSpeaking(npc, false);
            this.controller.play(npc, 'idle');
            this.controller.poiManager.releaseAll(npc);
          }
          this.controller.setSpeaking(user, false);
          this.controller.play(user, 'idle');
          this.selectedIndex = null;
        }
      }

      // Monitor individual agent status changes for autonomous animations
      if (s.agentStatuses !== prev.agentStatuses && this.controller) {
        Object.keys(s.agentStatuses).forEach(key => {
          const idx = parseInt(key);
          const status = s.agentStatuses[idx];
          const prevStatus = prev.agentStatuses[idx];
          if (status !== prevStatus) {
             if (status === 'talking') this.setNpcTalking(idx, true);
             else if (prevStatus === 'talking') this.setNpcTalking(idx, false);
          }
        });
      }
    }));
  }

  private _startChatVisuals(npcIndex: number): void {
    if (!this.controller) return;
    const pos = this.controller.getCPUPositions(); if (!pos) return;
    const renderIndex = toRenderIndex(npcIndex);
    const npc = new THREE.Vector3(pos[renderIndex * 4], 0, pos[renderIndex * 4 + 2]);
    const player = new THREE.Vector3(pos[this.localSlotIndex * 4], 0, pos[this.localSlotIndex * 4 + 2]);
    let dir = new THREE.Vector3().subVectors(player, npc).normalize();
    if (dir.length() < 0.01) dir.set(1, 0, 0);
    const target = npc.clone().addScaledVector(dir, 1.2);

    this.selectedIndex = npcIndex;
    this.driverManager?.getNpcDriver(renderIndex)?.setChatting(true);
    this.controller.cancelMovement(renderIndex);
    this.controller.play(renderIndex, 'listen');
    this.controller.getAgentStateBuffer()?.setWaypoint(renderIndex, dir.x, dir.z);
    this.driverManager?.getPlayerDriver()?.walkTo(target, 'listen', () => {
      const p = this.controller!.getCPUPositions()!;
      const fx = p[renderIndex * 4] - p[this.localSlotIndex * 4], fz = p[renderIndex * 4 + 2] - p[this.localSlotIndex * 4 + 2];
      this.controller!.getAgentStateBuffer()?.setWaypoint(this.localSlotIndex, fx, fz);
      this.controller!.getAgentStateBuffer()?.setWaypoint(renderIndex, -fx, -fz);
      this._triggerNpcGreeting(npcIndex);
    });
  }

  public startChat(npcIndex: number): void {
    useUiStore.getState().setChatting(true);
  }


  public async sendMessage(text: string): Promise<void> {
    const { selectedNpcIndex, isThinking } = useUiStore.getState();
    if (selectedNpcIndex === null || isThinking) return;
    useCoreStore.setState((s) => ({
      agentHistories: { ...s.agentHistories, [selectedNpcIndex!]: [...(s.agentHistories[selectedNpcIndex!] || []), { role: 'user', content: text }] }
    }));
    useUiStore.setState({ isThinking: true, isTyping: false });
    try {
      if (this.coreHandler) await this.coreHandler(selectedNpcIndex!, text);
      useUiStore.setState({ isThinking: false });
    } catch (err) {
      console.error('[SceneManager] sendMessage error:', err);
      useUiStore.setState({ isThinking: false });
    }
  }

  private reinitializeSimulation(activeSet: AgenticSystem) {
    if (this.simulation) this.simulation.dispose();
    this.simulation = new AgentSimulation(activeSet);
    this.setCoreHandler((idx, text) => this.simulation!.handleUserMessage(idx, text));
    if (this.driverManager) {
      this.driverManager.dispose();
      this._wireDrivers(activeSet);
    }
  }
  public setCoreHandler(handler: ((npcIndex: number, text: string) => Promise<string | null>) | null): void {
    this.coreHandler = handler;
  }

  public getLeadBrain() {
    if (!this.simulation) return null;
    const set = getActiveAgentSet();
    const lead = this.simulation.getAgent(set.leadAgent.index);
    return lead?.brain || null;
  }

  /** 
   * SMART DESK ASSIGNMENT
   * Attempts to find a work POI. If work-${index} is missing, it picks 
   * a desk from the 'sit_work' group based on the agent's unique index.
   */
  public setNpcWorking(index: number, working: boolean): void {
    if (!this.controller) return;
    if (working) {
      const renderIndex = toRenderIndex(index);
      const state = this.controller.getState(renderIndex);
      if (this.deskBound.has(index) && (state === 'walk' || state === 'sit_work' || state === 'sit_down')) return;
      this.headingHome.delete(index);
      const id = `sit_work-${index}`;
      let poi = this.poiManager.getPoi(id);
      if (poi && this.poiManager.isReservedByOther(poi.id, renderIndex)) poi = undefined;
      if (!poi) {
         // Smart fallback: assign a desk based on order (agent index is 1-based), skipping reserved cabins
         const desks = this.poiManager.getPoisByPrefix('sit_work').filter(d => !this.poiManager.isReservedByOther(d.id, renderIndex));
         if (desks.length > 0) poi = desks[(index - 1) % desks.length];
      }
      if (poi) {
        this.deskBound.add(index);
        this.controller.walkToPoi(renderIndex, poi.id);
      }
    }
  }

  public setNpcTalking(index: number, talking: boolean): void {
    if (!this.controller) return;
    const renderIndex = toRenderIndex(index);
    if (talking) {
      if (this.controller.getState(renderIndex) !== 'walk') this.controller.play(renderIndex, 'talk');
      this.controller.setSpeaking(renderIndex, true);
    } else {
      this.controller.setSpeaking(renderIndex, false);
      const task = useCoreStore.getState().tasks.find(t => t.status === 'on_hold' && t.assignedAgentId === index);
      this.controller.play(renderIndex, task ? 'listen' : 'idle');
    }
  }

  public moveNpcToBoardroom(index: number): void {
    if (!this.controller) return;
    const poi = this.poiManager.getPoi('area-boardroom') || this.poiManager.getPoi('boardroom');
    if (poi) {
      this.controller.walkToPoi(toRenderIndex(index), poi.id, () => {
        const core = useCoreStore.getState();
        const t = core.tasks.find(t => t.status === 'on_hold' && t.assignedAgentId === index);
      });
    }
  }

  public moveNpcToSpawn(index: number, onArrival?: () => void): void {
    if (!this.controller) return;
    if (!onArrival && this.headingHome.has(index)) return;
    this.deskBound.delete(index);
    if (!onArrival) this.headingHome.add(index);
    const poi = this.poiManager.getPoi(`spawn-${index}`);
    if (poi) this.controller.moveTo(toRenderIndex(index), poi.position, 'idle', onArrival, undefined, poi.quaternion);
    else if (onArrival) onArrival();
  }

  private async _triggerNpcGreeting(idx: number): Promise<void> {
    const set = getActiveAgentSet();
    const agent = getAllAgents(set).find(a => a.index === idx);
    if (!agent) return;
    useUiStore.setState({ isThinking: true });
    const msg: ChatMessage = { role: 'assistant', text: `Hello. I am ${agent.name}. How can I assist you?`, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
    useUiStore.setState({ chatMessages: [msg], isThinking: false });
  }

  // ── Multiplayer: driver wiring & roster sync ──────────────────

  /** Maps a render-slot index to its logical AI-agent index, or null for any human slot (local or remote). */
  private _toAgentLogicalIndex(renderIndex: number): number | null {
    return renderIndex >= MAX_PLAYERS ? toLogicalIndex(renderIndex) : null;
  }

  /** (Re)assigns every render slot's driver: local player, AI agents (real or remote-mirrored), and known remote players. */
  private _wireDrivers(activeSet: AgenticSystem): void {
    if (!this.driverManager || !this.controller) return;
    this.driverManager.registerPlayer(this.localSlotIndex);

    getAllAgents(activeSet).forEach((agent) => {
      const renderIndex = toRenderIndex(agent.index);
      if (this.isHost) {
        this.driverManager!.registerNpc(renderIndex, agent);
      } else {
        this.driverManager!.setDriver(renderIndex, new RemoteNpcDriver(renderIndex, this.controller!));
      }
    });

    for (const p of this.knownPlayers.values()) {
      if (p.slotIndex === this.localSlotIndex) continue;
      this.driverManager.setDriver(p.slotIndex, new RemotePlayerDriver(p.slotIndex, this.controller));
    }
  }

  /** Re-applies activateHumanSlot for every known connected player. Needed after any full rebuild (team switch, resetScene). */
  private _reapplyActiveSlots(): void {
    if (!this.controller) return;
    for (const p of this.knownPlayers.values()) {
      this.controller.activateHumanSlot(p.slotIndex, p.color, p.cabinPoiId);
    }
  }

  private _onNetworkMessage(msg: ServerMessage): void {
    switch (msg.type) {
      case 'joined':
        this._onJoined(msg.me, msg.roster);
        break;
      case 'roster-update':
        this._reconcileRoster(msg.roster);
        break;
      case 'player-state': {
        const p = this.knownPlayers.get(msg.playerId);
        if (!p) return;
        const driver = this.driverManager?.getDriver(p.slotIndex);
        if (driver instanceof RemotePlayerDriver) driver.applyState(msg.pos, msg.vel, msg.animState, msg.speaking);
        break;
      }
      case 'npc-state': {
        for (const npc of msg.npcs) {
          const renderIndex = toRenderIndex(npc.aiIndex);
          const driver = this.driverManager?.getDriver(renderIndex);
          if (driver instanceof RemoteNpcDriver) {
            driver.applyState(npc.pos, npc.facing, npc.animState, npc.speaking);
          } else if (this.controller) {
            this.controller.setSpeaking(renderIndex, npc.speaking);
            if (npc.speaking && this.controller.getState(renderIndex) !== 'walk') this.controller.play(renderIndex, 'talk');
          }
        }
        break;
      }
      default:
        break;
    }
  }

  /** Fires once per connection lifetime (or again on a reconnect). Decides host/guest role and my render slot. */
  private _onJoined(me: PlayerInfo, roster: PlayerInfo[]): void {
    if (!this.driverManager || !this.controller) return;
    if (this.localSlotIndex !== me.slotIndex) {
      this.driverManager.unregister(this.localSlotIndex);
    }
    this.localSlotIndex = me.slotIndex;
    this.isHost = me.isHost;
    this._wireDrivers(getActiveAgentSet());
    this._reconcileRoster(roster);
    this._registerCabinsAsHost();
  }

  /** Diffs the incoming roster against knownPlayers — surgical add/update/remove, never a full rebuild. */
  private _reconcileRoster(roster: PlayerInfo[]): void {
    if (!this.controller || !this.driverManager) return;
    const seen = new Set<string>();

    for (const p of roster) {
      seen.add(p.id);
      const prev = this.knownPlayers.get(p.id);
      const isMe = p.slotIndex === this.localSlotIndex;

      if (!prev) {
        if (!isMe) {
          this.driverManager.setDriver(p.slotIndex, new RemotePlayerDriver(p.slotIndex, this.controller));
        }
        this.controller.activateHumanSlot(p.slotIndex, p.color, p.cabinPoiId);
        this.activeHumanSlots.add(p.slotIndex);
      } else {
        if (prev.color !== p.color) this.controller.characterManager.setSlotColor(p.slotIndex, p.color);
        if (prev.cabinPoiId !== p.cabinPoiId) {
          this.controller.activateHumanSlot(p.slotIndex, p.color, p.cabinPoiId);
        }
      }
      this.knownPlayers.set(p.id, p);
    }

    for (const [id, p] of this.knownPlayers) {
      if (seen.has(id)) continue;
      this.controller.deactivateHumanSlot(p.slotIndex, p.cabinPoiId);
      this.activeHumanSlots.delete(p.slotIndex);
      if (p.slotIndex !== this.localSlotIndex) this.driverManager.unregister(p.slotIndex);
      this.knownPlayers.delete(id);
    }
  }

  /** Host-only: tells the relay which POIs are available as human cabins (everything 'sit_work' that isn't a specific AI agent's desk). */
  private _registerCabinsAsHost(): void {
    const activeSet = getActiveAgentSet();
    const aiDeskIds = new Set(getAllAgents(activeSet).map(a => `sit_work-${a.index}`));
    const cabinPoiIds = this.poiManager
      .getPoisByPrefix('sit_work')
      .map(p => p.id)
      .filter(id => !aiDeskIds.has(id))
      .slice(0, MAX_PLAYERS);
    networkClient.send({ type: 'register-cabins', cabinPoiIds });
  }

  /** Host broadcasts its own + every AI agent's state; guests only ever broadcast their own. Throttled to ~10Hz. */
  private _maybeSendNetworkUpdate(pos: Float32Array): void {
    const roster = useRosterStore.getState();
    if (roster.status !== 'connected' || !roster.self || !this.controller) return;

    const now = performance.now();
    if (now - this.lastNetworkSendMs < 100) return;
    this.lastNetworkSendMs = now;

    const my = this.localSlotIndex;
    const buffer = this.controller.getAgentStateBuffer();
    const wp = buffer?.getWaypoint(my) ?? { x: 0, z: 0 };
    networkClient.send({
      type: 'player-state',
      pos: [pos[my * 4], pos[my * 4 + 1], pos[my * 4 + 2]],
      vel: [wp.x, wp.z],
      animState: this.controller.getState(my),
      speaking: useUiStore.getState().isTyping,
    });

    if (roster.self.isHost) {
      const activeSet = getActiveAgentSet();
      const npcs = getAllAgents(activeSet).map((agent) => {
        const ri = toRenderIndex(agent.index);
        const wpN = buffer?.getWaypoint(ri) ?? { x: 0, z: 0 };
        return {
          aiIndex: agent.index,
          pos: [pos[ri * 4], pos[ri * 4 + 1], pos[ri * 4 + 2]] as [number, number, number],
          facing: [wpN.x, wpN.z] as [number, number],
          animState: this.controller!.getState(ri),
          speaking: useUiStore.getState().agentStatuses[agent.index] === 'talking',
        };
      });
      networkClient.send({ type: 'npc-state', npcs });
    }
  }

  private onResize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.stage.onResize(w, h);
    if (!useCoreStore.getState().isResizing) this.engine.onResize(w, h);
  }

  private animate() {
    this.engine.timer.update(); const delta = this.engine.timer.getDelta();
    this.stage.update(); this.controller?.update(delta, this.engine.renderer);
    this.controller?.syncFromGPU(this.engine.renderer).then((pos) => {
      if (!pos || !this.controller) return;
      this.controller.updatePaths(pos); this.driverManager?.update(pos, delta);
      this.updateTransparency(pos, delta);
      this._maybeSendNetworkUpdate(pos);
    });
    const followIndex = this.selectedIndex !== null ? toRenderIndex(this.selectedIndex) : this.localSlotIndex;
    this.stage.setFollowTarget(this.controller?.getCPUPosition(followIndex) ?? null);
    const { selectedNpcIndex, setSelectedPosition, selectedPosition } = useUiStore.getState();
    const npcScreenPositions: Record<number, { x: number; y: number }> = {};
    const rect = this.container.getBoundingClientRect();
    if (this.controller) {
      for (let i = MAX_PLAYERS; i < this.controller.getCount(); i++) {
        const p = this.controller.getCPUPosition(i);
        if (p) {
          const s = p.clone(); s.y += BUBBLE_Y_OFFSET; s.project(this.stage.camera);
          npcScreenPositions[toLogicalIndex(i)] = { x: (s.x * 0.5 + 0.5) * rect.width, y: (s.y * -0.5 + 0.5) * rect.height };
        }
      }
      useUiStore.setState({ npcScreenPositions });
    }
    if (selectedNpcIndex !== null && npcScreenPositions[selectedNpcIndex]) {
      const p = npcScreenPositions[selectedNpcIndex];
      if (Math.abs(p.x - (selectedPosition?.x ?? 0)) > 0.5 || Math.abs(p.y - (selectedPosition?.y ?? 0)) > 0.5) setSelectedPosition(p);
    } else if (selectedPosition !== null) setSelectedPosition(null);
    this.stage.setChatMode(useUiStore.getState().isChatting, this.controller?.getAgentState(this.localSlotIndex) === AgentBehavior.GOTO);
    this.engine.render(this.stage.scene, this.stage.camera);
  }

  /** True if a render slot is currently visible/pickable — every AI agent slot, plus connected human slots. */
  private _isSlotActive(index: number): boolean {
    return index >= MAX_PLAYERS || this.activeHumanSlots.has(index);
  }

  private updateTransparency(pos: Float32Array, delta: number) {
    if (!this.controller) return;
    const count = this.controller.getCount(), buffer = this.controller.getAgentStateBuffer();
    if (!buffer) return;
    for (let i = 0; i < count; i++) {
      if (!this._isSlotActive(i)) continue;
      let overlap = false;
      for (let j = 0; j < count; j++) {
        if (i === j || !this._isSlotActive(j)) continue;
        if ((pos[i * 4] - pos[j * 4]) ** 2 + (pos[i * 4 + 2] - pos[j * 4 + 2]) ** 2 < 0.36) { overlap = true; break; }
      }
      const cur = buffer.getAlpha(i), tar = overlap ? 0.4 : 1.0;
      if (Math.abs(cur - tar) > 0.01) buffer.setAlpha(i, THREE.MathUtils.lerp(cur, tar, Math.min(delta * 2.0, 1.0)));
    }
  }

  public resetScene() {
    if (!this.controller) return;
    useUiStore.getState().setChatting(false);
    const set = getActiveAgentSet();
    getAllAgents(set).forEach((a) => this.controller?.setSpeaking(toRenderIndex(a.index), false));
    const playerIndices = this.activeHumanSlots.size > 0 ? Array.from(this.activeHumanSlots) : [this.localSlotIndex];
    this.controller.warpAllToSpawn(playerIndices, getAllAgents(set).map(a => toRenderIndex(a.index)));
    this._reapplyActiveSlots();
    this.stage.setFollowTarget(null);
    this.stage.setChatMode(false, false);
  }

  public dispose() { this.isDisposed = true; this.resizeObserver.disconnect(); this.unsubs.forEach(u => u()); this.flatOffice?.stop(); this.driverManager?.dispose(); this.engine.dispose(); }
}
