import { create } from 'zustand';
import { getAllAgents, MAX_PLAYERS } from '../../data/agents';
import { AgentState, CharacterState } from '../../types';
import { useTeamStore, getActiveAgentSet } from './teamStore';
import {
  defaultConnection,
  emptyConnectionFile,
  llmConfigFromConnection,
  loadConnectionFile,
  removeConnection,
  saveConnectionFile,
  selectDefault,
  upsertConnection,
  type ConnectionFile,
  type KeyValueStore,
} from '../../core/llm/connections';

function browserStore(): KeyValueStore | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

function initialConnections(): ConnectionFile {
  const store = browserStore();
  return store ? loadConnectionFile(store) : emptyConnectionFile();
}

const initialConnectionFile = initialConnections();

export const useUiStore = create<CharacterState>()(
  (set) => ({
    isThinking: false,
    instanceCount: MAX_PLAYERS + getAllAgents(getActiveAgentSet()).length,

    selectedNpcIndex: null,
    selectedPosition: null,
    hoveredNpcIndex: null,
    hoveredPoiId: null,
    hoveredPoiLabel: null,
    hoverPosition: null,
    npcScreenPositions: {},
    isChatting: false,
    isTyping: false,
    chatMessages: [],
    inspectorTab: 'info',
    agentStatuses: {},
    setAgentStatus: (index: number, status: AgentState) => set((s) => ({
      agentStatuses: { ...s.agentStatuses, [index]: status }
    })),

    isBYOKOpen: false,
    byokError: null,
    setBYOKOpen: (open: boolean, error: string | null = null) =>
      set({ isBYOKOpen: open, byokError: error }),

    isNegotiationOpen: false,
    setNegotiationOpen: (open: boolean) => set({ isNegotiationOpen: open }),

    activeAuditTaskId: null,
    setActiveAuditTaskId: (taskId: string | null) => set({ activeAuditTaskId: taskId }),

    connections: initialConnectionFile,
    llmConfig: llmConfigFromConnection(defaultConnection(initialConnectionFile)),
    saveModelConnection: (input) => {
      const result = upsertConnection(useUiStore.getState().connections, input);
      if ('error' in result) return { error: result.error };
      const store = browserStore();
      if (store) saveConnectionFile(store, result.file);
      set({
        connections: result.file,
        llmConfig: llmConfigFromConnection(defaultConnection(result.file)),
      });
      return { id: result.id };
    },
    removeModelConnection: (id) => {
      const file = removeConnection(useUiStore.getState().connections, id);
      const store = browserStore();
      if (store) saveConnectionFile(store, file);
      set({ connections: file, llmConfig: llmConfigFromConnection(defaultConnection(file)) });
    },
    chooseDefaultConnection: (id) => {
      const file = selectDefault(useUiStore.getState().connections, id);
      const store = browserStore();
      if (store) saveConnectionFile(store, file);
      set({ connections: file, llmConfig: llmConfigFromConnection(defaultConnection(file)) });
    },

    setThinking: (isThinking: boolean) => set({ isThinking }),
    setIsTyping: (isTyping: boolean) => set({ isTyping }),
    setInspectorTab: (tab: 'info' | 'chat') => set({ inspectorTab: tab }),
    setInstanceCount: (count: number) => set({ instanceCount: count }),

    setSelectedNpc: (index: number | null) => set({
      selectedNpcIndex: index,
      selectedPosition: null,
    }),
    setSelectedPosition: (pos: { x: number; y: number } | null) => set({ selectedPosition: pos }),
    setHoveredNpc: (index: number | null, pos: { x: number; y: number } | null) => set({
      hoveredNpcIndex: index,
      hoverPosition: pos,
      hoveredPoiId: null,
      hoveredPoiLabel: null,
    }),
    setHoveredPoi: (id: string | null, label: string | null, pos: { x: number; y: number } | null) => set({
      hoveredPoiId: id,
      hoveredPoiLabel: label,
      hoverPosition: pos,
      hoveredNpcIndex: null,
    }),
    setLlmConfig: (config) => set((s) => {
      const llmConfig = { ...s.llmConfig, ...config };
      const current = defaultConnection(s.connections);
      if (!current) return { llmConfig };
      const file: ConnectionFile = {
        ...s.connections,
        connections: s.connections.connections.map((item) => item.id === current.id ? {
          ...item,
          apiKey: llmConfig.apiKey ?? item.apiKey,
          baseUrl: llmConfig.baseUrl || item.baseUrl,
          model: llmConfig.model || item.model,
        } : item),
      };
      const store = browserStore();
      if (store) saveConnectionFile(store, file);
      return { llmConfig, connections: file };
    }),
    setChatting: (isChatting: boolean) => set((s) => ({ 
      isChatting, 
      isTyping: isChatting ? s.isTyping : false,
      isThinking: isChatting ? s.isThinking : false,
      chatMessages: isChatting ? s.chatMessages : []
    })),
  })
);

// Keep instanceCount in sync whenever the active agent set changes
useTeamStore.subscribe((state, prevState) => {
  if (state.selectedAgentSetId !== prevState.selectedAgentSetId) {
    const system = getActiveAgentSet();
    useUiStore.getState().setInstanceCount(MAX_PLAYERS + getAllAgents(system).length);
  }
});
