import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  dueReminders,
  finishedRunNotices,
  householdNotices,
  REMINDER_POLL_MS,
  reminderLine,
  startHouseholdWatch,
} from './announcements';

describe('dueReminders', () => {
  const openedAt = Date.parse('2026-10-08T12:00:00.000Z');
  const now = openedAt + 1000;

  it('speaks a task that came due within the last hour, once', () => {
    const tasks = [{
      id: 'milk',
      title: 'Buy milk',
      status: 'open',
      dueAt: '2026-10-08T11:30:00.000Z',
    }];
    const first = dueReminders(tasks, now, openedAt, new Set());
    expect(first.map((task) => task.id)).toEqual(['milk']);
    expect(reminderLine('Buy milk')).toBe('Reminder: Buy milk.');
    const seen = new Set(first.map((task) => task.id));
    expect(dueReminders(tasks, now, openedAt, seen)).toEqual([]);
  });

  it('skips tasks that were already due more than an hour before the page opened', () => {
    const tasks = [{
      id: 'old',
      title: 'Old chore',
      status: 'open',
      dueAt: '2026-10-08T10:59:00.000Z',
    }];
    expect(dueReminders(tasks, now, openedAt, new Set())).toEqual([]);
  });

  it('skips future, done, and undated tasks', () => {
    const tasks = [
      { id: 'later', title: 'Later', status: 'open', dueAt: '2026-10-08T13:00:00.000Z' },
      { id: 'done', title: 'Done', status: 'done', dueAt: '2026-10-08T11:00:00.000Z' },
      { id: 'none', title: 'No time', status: 'open' },
    ];
    expect(dueReminders(tasks, now, openedAt, new Set())).toEqual([]);
  });
});

describe('finishedRunNotices', () => {
  const approvedAt = Date.parse('2026-10-08T12:00:00.000Z');

  it('speaks a summary once when a later run leaves running', () => {
    const runs = [{
      id: 'run-1',
      status: 'complete',
      startedAt: '2026-10-08T12:00:02.000Z',
      spokenSummary: 'Dinner is planned.',
    }];
    const first = finishedRunNotices(runs, approvedAt, new Set());
    expect(first.map((run) => run.spokenSummary)).toEqual(['Dinner is planned.']);
    expect(finishedRunNotices(runs, approvedAt, new Set(['run-1']))).toEqual([]);
  });

  it('waits while the run is still running and ignores earlier runs', () => {
    const runs = [
      { id: 'live', status: 'running', startedAt: '2026-10-08T12:00:01.000Z', spokenSummary: 'Not yet.' },
      { id: 'old', status: 'complete', startedAt: '2026-10-08T11:00:00.000Z', spokenSummary: 'Earlier.' },
    ];
    expect(finishedRunNotices(runs, approvedAt, new Set())).toEqual([]);
  });
});

describe('householdNotices', () => {
  it('collects a reminder and a finished run from one snapshot', () => {
    const openedAt = Date.parse('2026-10-08T12:00:00.000Z');
    const notices = householdNotices({
      tasks: [{ id: 't1', title: 'Call the school', status: 'open', dueAt: '2026-10-08T12:00:00.000Z' }],
      recentRuns: [{
        id: 'r1',
        status: 'complete',
        startedAt: '2026-10-08T12:05:00.000Z',
        spokenSummary: 'The list is ready.',
      }],
    }, openedAt + 60_000, openedAt, openedAt, new Set(), new Set());
    expect(notices.lines).toEqual(['Reminder: Call the school.', 'The list is ready.']);
    expect(notices.taskIds).toEqual(['t1']);
    expect(notices.runIds).toEqual(['r1']);
  });
});

describe('startHouseholdWatch', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('polls immediately and then about every 30 seconds', () => {
    vi.useFakeTimers();
    const calls: number[] = [];
    const stop = startHouseholdWatch(() => {
      calls.push(1);
    });
    expect(calls).toEqual([1]);
    vi.advanceTimersByTime(REMINDER_POLL_MS);
    expect(calls).toEqual([1, 1]);
    stop();
    vi.advanceTimersByTime(REMINDER_POLL_MS);
    expect(calls).toEqual([1, 1]);
  });
});
