import { describe, expect, it } from 'vitest';
import { describeTask, failedCardState } from './householdCardState';

describe('household card state', () => {
  it('replaces a stuck loading view when a tool call fails', () => {
    const failed = failedCardState('The household could not be loaded.');
    expect(failed.items).toEqual([]);
    expect(failed.tasks).toEqual([]);
    expect(failed.approvals).toEqual([]);
    expect(failed.speech).toBe('The household could not be loaded.');
    expect(failed.note).toBe(failed.speech);
  });

  it('includes the person, the list, and the local due time', () => {
    const line = describeTask({
      title: 'Buy milk',
      who: 'Mia',
      list: 'shopping',
      dueAt: '2026-10-08T15:30:00+05:30',
    }, () => 'Oct 8, 3:30 PM');
    expect(line).toBe('Mia: Shopping: Buy milk (due Oct 8, 3:30 PM)');
  });
});
