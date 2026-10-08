import { afterEach, describe, expect, it } from 'vitest';
import { buildBriefing } from './briefing';
import type { MemoryEntry } from './memoryStore';
import type { HouseholdTask } from './taskStore';

const savedZone = process.env.AGORA_TIMEZONE;

afterEach(() => {
  if (savedZone === undefined) delete process.env.AGORA_TIMEZONE;
  else process.env.AGORA_TIMEZONE = savedZone;
});

function memory(text: string, extra: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id: extra.id ?? text,
    text,
    tags: extra.tags ?? [],
    createdAt: extra.createdAt ?? '2026-10-08T00:00:00.000Z',
    updatedAt: extra.updatedAt ?? '2026-10-08T00:00:00.000Z',
    source: 'ui',
    ...extra,
  };
}

function task(title: string, extra: Partial<HouseholdTask> = {}): HouseholdTask {
  return {
    id: extra.id ?? title,
    title,
    status: extra.status ?? 'open',
    createdAt: '2026-10-08T00:00:00.000Z',
    source: 'ui',
    ...extra,
  };
}

function briefing(partial: Partial<Parameters<typeof buildBriefing>[0]> = {}) {
  return buildBriefing({
    tasks: [],
    memory: [],
    pendingApprovals: [],
    recentRuns: [],
    now: new Date('2026-10-08T16:00:00.000Z'),
    ...partial,
  });
}

describe('buildBriefing', () => {
  it('speaks a saved safety fact before a newer preference', () => {
    const result = briefing({
      memory: [
        memory('Jen likes pasta', { who: 'Jen', updatedAt: '2026-10-08T02:00:00.000Z' }),
        memory('Mia is allergic to peanuts', { who: 'Mia', tags: ['allergy'], updatedAt: '2026-10-08T01:00:00.000Z' }),
      ],
    });
    expect(result.speech).toContain('Remember: Mia is allergic to peanuts.');
    expect(result.speech).not.toContain('pasta');
    expect(result.speech).not.toContain('Nothing urgent');
    expect(result.speech.split(/(?<=[.!?])\s+/).length).toBeLessThanOrEqual(2);
  });

  it('mentions a reminder whose dueAt is already past, in at most two sentences', () => {
    const result = briefing({
      now: new Date('2026-10-08T18:30:00.000Z'),
      memory: [memory('Mia is allergic to peanuts', { tags: ['allergy'] })],
      tasks: [task('call Grandma', { dueAt: '2026-10-08T18:00:00Z', due: 'at 6pm' })],
    });
    expect(result.speech).toContain('Remember: Mia is allergic to peanuts.');
    expect(result.speech).toContain('Reminder: call Grandma.');
    expect(result.speech.split(/(?<=[.!?])\s+/).length).toBeLessThanOrEqual(2);
  });

  it('treats due today in AGORA_TIMEZONE, not the UTC date', () => {
    const now = new Date('2026-10-09T02:00:00.000Z');
    const tasks = [task('Take the bins out', { due: '2026-10-08' })];
    process.env.AGORA_TIMEZONE = 'America/Los_Angeles';
    const pacific = briefing({ now, tasks });
    expect(pacific.speech).toContain('Take the bins out is due today.');
    expect(pacific.speech).not.toContain('overdue');

    process.env.AGORA_TIMEZONE = 'UTC';
    const utc = briefing({ now, tasks });
    expect(utc.speech).toContain('Take the bins out is overdue.');
  });
});
