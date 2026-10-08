import { describe, expect, it } from 'vitest';
import { formatDueAt, groupTasks, listName, parseSnapshot, personName } from './householdView';

describe('household view', () => {
  it('keeps who, list, and dueAt from the household payload', () => {
    const snapshot = parseSnapshot({
      memory: [{ id: 'm1', text: 'Mia is allergic to peanuts', tags: [], who: 'Mia' }],
      tasks: [
        { id: 't1', title: 'Buy milk', status: 'open', list: 'shopping', who: 'Jen', dueAt: '2026-10-08T15:30:00+05:30' },
        { id: 't2', title: 'Homework', status: 'open' },
      ],
      pendingApprovals: [],
      recentRuns: [{ id: 'r1', status: 'complete', startedAt: '2026-10-08T10:00:00.000Z', spokenSummary: 'Done.' }],
      suggestions: [],
    });
    expect(snapshot?.memory[0]?.who).toBe('Mia');
    expect(personName('  Mia  ')).toBe('Mia');
    expect(listName(undefined)).toBe('To-do');
    expect(listName('shopping')).toBe('Shopping');
    expect(groupTasks(snapshot?.tasks ?? []).map((group) => group.name)).toEqual(['To-do', 'Shopping']);
    expect(formatDueAt('2026-10-08T15:30:00+05:30', (date) => date.toISOString())).toBe('2026-10-08T10:00:00.000Z');
    expect(snapshot?.recentRuns[0]?.spokenSummary).toBe('Done.');
  });
});
