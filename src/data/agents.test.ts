import { describe, expect, it } from 'vitest';
import { HOUSEHOLD_TEAM } from '../../server/household/team';
import {
  AGENTIC_SETS,
  DEFAULT_AGENTIC_SET_ID,
  agentIndexForRole,
  getAgentSet,
  getAllAgents,
} from './agents';

describe('household agent set', () => {
  it('resolves the default set, and the old missing id, to Household', () => {
    expect(DEFAULT_AGENTIC_SET_ID).toBe('household');
    const household = getAgentSet(DEFAULT_AGENTIC_SET_ID);
    const fallback = getAgentSet('single-agent');
    expect(household.teamName).toBe('Household');
    expect(fallback.id).toBe('household');
    expect(getAllAgents(household).map((agent) => agent.name)).toEqual(HOUSEHOLD_TEAM.map((member) => member.name));
    expect(getAllAgents(household).map((agent) => agent.description)).toEqual(HOUSEHOLD_TEAM.map((member) => member.description));
    expect(household.leadAgent.name).toBe('Agora');
  });

  it('keeps the other sets selectable', () => {
    expect(getAgentSet('creative-studio').teamName).toBe('Creative Studio');
    expect(AGENTIC_SETS.map((set) => set.id)).toContain('creative-studio');
    expect(AGENTIC_SETS.map((set) => set.id)).toContain('household');
  });

  it('maps household roles onto those characters, and does not pile unknown roles onto the lead', () => {
    const agents = getAllAgents(getAgentSet('household'));
    const indexOf = (name: string) => agents.find((agent) => agent.name === name)!.index;
    expect(agentIndexForRole('Agora', agents)).toBe(indexOf('Agora'));
    expect(agentIndexForRole('scout', agents)).toBe(indexOf('Scout'));
    expect(agentIndexForRole('Planner', agents)).toBe(indexOf('Planner'));
    expect(agentIndexForRole('Keeper on allergies', agents)).toBe(indexOf('Keeper'));
    const lead = indexOf('Agora');
    const unknowns = ['writer', 'researcher', 'reviewer', 'worker'].map((role) => agentIndexForRole(role, agents));
    expect(unknowns.every((index) => index === lead)).toBe(false);
    expect(new Set(unknowns).size).toBeGreaterThan(1);
  });
});
