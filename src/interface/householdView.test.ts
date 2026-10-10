import { describe, expect, it } from 'vitest';
import {
  briefTitle,
  greetingForHour,
  groupMemory,
  householdRuns,
  planSteps,
  relativeDue,
  safetyKind,
  safetySpans,
  wholeSentences,
} from '../home/homeView';
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

  it('names allergy, diet, and medical facts and leaves ordinary text alone', () => {
    expect(safetyKind('Mia is allergic to peanuts', [])).toBe('allergy');
    expect(safetyKind('Sam is vegetarian', ['diet'])).toBe('diet');
    expect(safetyKind('Jen takes medicine at night', [])).toBe('medical');
    expect(safetyKind('The wifi password is on the fridge', [])).toBeNull();
  });

  it('groups facts by person, puts unnamed facts under Home, and leads with safety', () => {
    const groups = groupMemory([
      { id: 'tea', text: 'Jen likes tea', tags: [], who: 'Jen' },
      { id: 'wifi', text: 'The wifi password is on the fridge', tags: [] },
      { id: 'pasta', text: 'Mia likes pasta', tags: [], who: 'Mia' },
      { id: 'nuts', text: 'Mia is allergic to peanuts', tags: ['allergy'], who: 'Mia' },
    ]);
    expect(groups.map((group) => group.who)).toEqual(['Jen', 'Mia', 'Home']);
    expect(groups.find((group) => group.who === 'Mia')?.facts.map((fact) => fact.id)).toEqual(['nuts', 'pasta']);
    expect(groups.find((group) => group.who === 'Home')?.facts.map((fact) => fact.id)).toEqual(['wifi']);
  });

  it('keeps run tasks, finishedAt, and source, and hides room runs when source is set', () => {
    const snapshot = parseSnapshot({
      memory: [],
      tasks: [],
      pendingApprovals: [],
      recentRuns: [
        {
          id: 'home-run',
          brief: 'Dinners',
          status: 'running',
          finishedAt: '2026-10-10T12:00:00.000Z',
          error: 'save failed',
          source: 'household',
          tasks: [{ id: 'step', title: 'Shop', role: 'Planner', status: 'running' }],
        },
        { id: 'office-run', brief: 'Office', status: 'complete', source: 'room' },
      ],
      suggestions: [],
    });
    expect(snapshot?.recentRuns[0]).toMatchObject({
      finishedAt: '2026-10-10T12:00:00.000Z',
      error: 'save failed',
      source: 'household',
      tasks: [{ id: 'step', title: 'Shop', role: 'Planner', status: 'running' }],
    });
    expect(householdRuns(snapshot?.recentRuns ?? []).map((run) => run.id)).toEqual(['home-run']);
    const untagged = parseSnapshot({
      memory: [],
      tasks: [],
      pendingApprovals: [],
      recentRuns: [{ id: 'legacy', brief: '', status: 'complete' }],
      suggestions: [],
    });
    expect(householdRuns(untagged?.recentRuns ?? []).map((run) => run.id)).toEqual(['legacy']);
  });

  it('says in 8 min and overdue from an injected now', () => {
    const due = '2026-10-10T19:00:00';
    const at = Date.parse(due);
    expect(relativeDue(due, at - 8 * 60 * 1000)).toBe('in 8 min');
    expect(relativeDue(due, at + 1000)).toBe('overdue');
  });

  it('greets by hour', () => {
    expect(greetingForHour(8)).toBe('Good morning.');
    expect(greetingForHour(12)).toBe('Good afternoon.');
    expect(greetingForHour(17)).toBe('Good evening.');
  });

  it('splits a plan summary into steps', () => {
    expect(planSteps('Plan: 4 steps — a; b; c; d')).toEqual(['a', 'b', 'c', 'd']);
    expect(planSteps('Forget that Mia likes tea?')).toBeNull();
  });

  it('titles a household plan with the request, not the memory sent along with it', () => {
    expect(briefTitle('Plan dinners for this week\n\nHousehold memory:\n- Mia is allergic to peanuts')).toBe('Plan dinners for this week');
    expect(briefTitle('Plan a picnic')).toBe('Plan a picnic');
  });

  it('marks a cut-off summary without dropping its last words', () => {
    expect(wholeSentences('Lentil soup on Monday. Mia has swimming on Saturday at 1 PM')).toBe('Lentil soup on Monday. Mia has swimming on Saturday at 1 PM…');
    expect(wholeSentences('Lentil soup on Monday.')).toBe('Lentil soup on Monday.');
    expect(wholeSentences('All dishes are chosen to ensure')).toBe('All dishes are chosen to ensure…');
  });

  it('marks allergies in a plan summary but leaves diets plain', () => {
    const marked = safetySpans("Mia's peanut allergy and Sam's vegetarian diet").filter((part) => part.safety).map((part) => part.text);
    expect(marked).toEqual(['allergy']);
  });

  it('keeps the briefing lines from the snapshot', () => {
    const snapshot = parseSnapshot({ briefing: ['Remember: Mia is allergic to peanuts.', 3], suggestions: [] });
    expect(snapshot?.briefing).toEqual(['Remember: Mia is allergic to peanuts.']);
  });
});
