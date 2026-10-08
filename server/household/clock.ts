/**
 * Household clock. AGORA_TIMEZONE wins; otherwise the server's own zone.
 * Dates are spoken and stored in that zone so "due today" does not follow UTC.
 */

export function householdTimeZone(): string {
  const set = process.env.AGORA_TIMEZONE?.trim();
  const candidate = set || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  try {
    Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(0);
    return candidate;
  } catch {
    return 'UTC';
  }
}

interface WallDay {
  year: number;
  month: number;
  day: number;
}

function wallParts(instant: Date, timeZone: string): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const pick = (type: string): number => {
    const value = parts.find((part) => part.type === type)?.value ?? '';
    const hour = type === 'hour' && value === '24' ? '0' : value;
    return Number(hour);
  };
  return {
    year: pick('year'),
    month: pick('month'),
    day: pick('day'),
    hour: pick('hour'),
    minute: pick('minute'),
    second: pick('second'),
  };
}

/** YYYY-MM-DD in the household zone. */
export function localDay(date: Date, timeZone = householdTimeZone()): string {
  const wall = wallParts(date, timeZone);
  const month = String(wall.month).padStart(2, '0');
  const day = String(wall.day).padStart(2, '0');
  return `${wall.year}-${month}-${day}`;
}

function zoneOffsetMs(instant: Date, timeZone: string): number {
  const wall = wallParts(instant, timeZone);
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  return asUtc - instant.getTime();
}

function dateInZone(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const first = new Date(utcGuess - zoneOffsetMs(new Date(utcGuess), timeZone));
  return new Date(utcGuess - zoneOffsetMs(first, timeZone));
}

function addDays(day: WallDay, count: number): WallDay {
  const next = new Date(Date.UTC(day.year, day.month - 1, day.day + count));
  return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() };
}

/** ISO 8601 with the household zone's numeric offset. */
export function formatOffset(instant: Date, timeZone = householdTimeZone()): string {
  const wall = wallParts(instant, timeZone);
  const named = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' }).formatToParts(instant);
  let offset = named.find((part) => part.type === 'timeZoneName')?.value ?? 'GMT';
  offset = offset.replace(/^GMT|^UTC/, '');
  if (offset === '' || offset === 'Z') offset = '+00:00';
  else if (/^[+-]\d{2}$/.test(offset)) offset = `${offset}:00`;
  else if (/^[+-]\d:\d{2}$/.test(offset)) offset = `${offset[0]}0${offset.slice(1)}`;
  const month = String(wall.month).padStart(2, '0');
  const day = String(wall.day).padStart(2, '0');
  const hour = String(wall.hour).padStart(2, '0');
  const minute = String(wall.minute).padStart(2, '0');
  const second = String(wall.second).padStart(2, '0');
  return `${wall.year}-${month}-${day}T${hour}:${minute}:${second}${offset}`;
}

const CLOCK = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i;
const RELATIVE = /^(\d+)\s*(minute|minutes|min|mins|hour|hours|hr|hrs)$/i;

/** Next wall-clock time for "6pm" or "18:00". Today if it is still ahead, otherwise tomorrow. */
export function dueAtFromClock(phrase: string, now: Date, timeZone = householdTimeZone()): string | undefined {
  const match = phrase.trim().match(CLOCK);
  if (!match) return undefined;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? '0');
  const meridiem = match[3]?.toLowerCase();
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute > 59) return undefined;
  if (meridiem) {
    if (hour < 1 || hour > 12) return undefined;
    if (meridiem === 'pm' && hour < 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
  } else if (hour > 23) {
    return undefined;
  }
  const today = wallParts(now, timeZone);
  let when = dateInZone(today.year, today.month, today.day, hour, minute, timeZone);
  if (when.getTime() <= now.getTime()) {
    const tomorrow = addDays(today, 1);
    when = dateInZone(tomorrow.year, tomorrow.month, tomorrow.day, hour, minute, timeZone);
  }
  return formatOffset(when, timeZone);
}

/** "10 minutes" or "2 hours" from now. */
export function dueAtFromRelative(phrase: string, now: Date, timeZone = householdTimeZone()): string | undefined {
  const match = phrase.trim().match(RELATIVE);
  if (!match) return undefined;
  const count = Number(match[1]);
  if (!Number.isInteger(count) || count <= 0 || count > 24 * 14) return undefined;
  const hours = match[2].toLowerCase().startsWith('h');
  const when = new Date(now.getTime() + count * (hours ? 60 : 1) * 60 * 1000);
  return formatOffset(when, timeZone);
}

/** A free-text due of "today" becomes today's calendar day in the household zone. */
export function resolveDueText(due: string | undefined, now: Date, timeZone = householdTimeZone()): string | undefined {
  const trimmed = due?.trim();
  if (!trimmed) return undefined;
  if (/^(due\s+)?today$/i.test(trimmed)) return localDay(now, timeZone);
  return trimmed;
}
