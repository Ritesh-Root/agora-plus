import { afterEach, describe, expect, it, vi } from 'vitest';
import { dueAtFromClock, dueAtFromRelative, localDay, resolveDueText } from './clock';

const savedZone = process.env.AGORA_TIMEZONE;

afterEach(() => {
  vi.useRealTimers();
  if (savedZone === undefined) delete process.env.AGORA_TIMEZONE;
  else process.env.AGORA_TIMEZONE = savedZone;
});

describe('household clock', () => {
  it('schedules 6pm and a 10 minute reminder in AGORA_TIMEZONE', () => {
    process.env.AGORA_TIMEZONE = 'America/Los_Angeles';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-08T20:00:00.000Z'));
    const now = new Date();
    expect(dueAtFromClock('6pm', now)).toBe('2026-10-08T18:00:00-07:00');
    expect(dueAtFromRelative('10 minutes', now)).toBe('2026-10-08T13:10:00-07:00');
    expect(localDay(now)).toBe('2026-10-08');
    expect(resolveDueText('due today', now)).toBe('2026-10-08');
  });

  it('rolls a clock time that has already passed to the next day', () => {
    process.env.AGORA_TIMEZONE = 'America/Los_Angeles';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-09T02:00:00.000Z'));
    expect(dueAtFromClock('6pm', new Date())).toBe('2026-10-09T18:00:00-07:00');
    expect(localDay(new Date())).toBe('2026-10-08');
  });
});
