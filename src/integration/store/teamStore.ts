
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { AgenticSystem, DEFAULT_AGENTIC_SET_ID, getAgentSet } from '../../data/agents';
import { DEFAULT_MODELS } from '../../core/llm/constants';

export type AgentSet = AgenticSystem;

function normalizeSystem(system: AgenticSystem): AgenticSystem {
  return {
    ...system,
    outputType: 'text',
    outputModel: DEFAULT_MODELS.text,
  };
}

interface TeamState {
  selectedAgentSetId: string;
  customSystems: AgenticSystem[];

  saveCustomSystem: (system: AgenticSystem) => void;
  deleteCustomSystem: (id: string) => void;
  updateActiveSystem: (changes: Partial<AgenticSystem>) => void;
  updateSystem: (id: string, changes: Partial<AgenticSystem>) => void;
  setActiveTeam: (id: string) => void;
}

export const useTeamStore = create<TeamState>()(
  persist(
    (set) => ({
      selectedAgentSetId: DEFAULT_AGENTIC_SET_ID,
      customSystems: [],

      saveCustomSystem: (system) =>
        set((s) => ({
          customSystems: s.customSystems.some((cs) => cs.id === system.id)
            ? s.customSystems.map((cs) => (cs.id === system.id ? normalizeSystem(system) : cs))
            : [...s.customSystems, normalizeSystem(system)],
        })),

      deleteCustomSystem: (id) =>
        set((s) => ({
          customSystems: s.customSystems.filter((cs) => cs.id !== id),
          selectedAgentSetId: s.selectedAgentSetId === id ? DEFAULT_AGENTIC_SET_ID : s.selectedAgentSetId,
        })),

      updateActiveSystem: (changes) => set((s) => {
        const currentSystem = normalizeSystem(getAgentSet(s.selectedAgentSetId, s.customSystems));
        const updatedSystem = normalizeSystem({ ...currentSystem, ...changes });
        return {
          customSystems: s.customSystems.some((cs) => cs.id === updatedSystem.id)
            ? s.customSystems.map((cs) => (cs.id === updatedSystem.id ? updatedSystem : cs))
            : [...s.customSystems, updatedSystem],
        };
      }),

      updateSystem: (id, changes) => set((s) => {
        const system = normalizeSystem(getAgentSet(id, s.customSystems));
        const updatedSystem = normalizeSystem({ ...system, ...changes });
        return {
          customSystems: s.customSystems.some((cs) => cs.id === id)
            ? s.customSystems.map((cs) => (cs.id === id ? updatedSystem : cs))
            : [...s.customSystems, updatedSystem],
        };
      }),

      setActiveTeam: (id) => set({
        selectedAgentSetId: id,
      }),
    }),
    {
      name: 'team-storage',
      storage: createJSONStorage(() => localStorage),
      version: 3,
      migrate: (state: any, version: number) => {
        const customSystems = Array.isArray(state?.customSystems)
          ? state.customSystems.map(normalizeSystem)
          : [];
        let selectedAgentSetId = typeof state?.selectedAgentSetId === 'string'
          ? state.selectedAgentSetId
          : DEFAULT_AGENTIC_SET_ID;
        // 'single-agent' was never a set id, so the office fell through to Creative Studio.
        if (version < 3 && selectedAgentSetId === 'single-agent') {
          selectedAgentSetId = DEFAULT_AGENTIC_SET_ID;
        }
        return { ...state, customSystems, selectedAgentSetId };
      },
    }
  )
);

/** Returns the currently active AgentSet. Safe to call from service/non-React contexts. */
export function getActiveAgentSet(): AgentSet {
  const { selectedAgentSetId, customSystems } = useTeamStore.getState();
  return normalizeSystem(getAgentSet(selectedAgentSetId, customSystems));
}

/** React hook for accessing the currently active team. */
export function useActiveTeam(): AgentSet {
  const { selectedAgentSetId, customSystems } = useTeamStore();
  return normalizeSystem(getAgentSet(selectedAgentSetId, customSystems));
}
