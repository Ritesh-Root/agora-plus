export interface LatencySample {
  /** Milliseconds until audio actually started. Null when nothing was heard. */
  ttfsMs: number | null;
  finalMs: number;
}

export interface TurnClock {
  ttfsMs: number | null;
  finalMs: number | null;
  pendingLines: number;
  /** True after a queued line has finished and nothing else is waiting. */
  closed: boolean;
  /** True once the server stream for this turn has ended. */
  streamDone: boolean;
  recorded: boolean;
}

export function createTurnClock(): TurnClock {
  return { ttfsMs: null, finalMs: null, pendingLines: 0, closed: false, streamDone: false, recorded: false };
}

/** The first playing event wins. A later line in the same turn does not move it. */
export function noteAudioStart(clock: TurnClock, elapsedMs: number): TurnClock {
  if (clock.ttfsMs !== null) return clock;
  return { ...clock, ttfsMs: elapsedMs };
}

export function noteFinal(clock: TurnClock, elapsedMs: number): TurnClock {
  if (clock.finalMs !== null) return clock;
  return { ...clock, finalMs: elapsedMs };
}

export function noteLineQueued(clock: TurnClock): TurnClock {
  return { ...clock, pendingLines: clock.pendingLines + 1, closed: false };
}

export function noteLineDone(clock: TurnClock): TurnClock {
  const pendingLines = Math.max(0, clock.pendingLines - 1);
  return { ...clock, pendingLines, closed: pendingLines === 0 };
}

export function noteStreamDone(clock: TurnClock): TurnClock {
  return { ...clock, streamDone: true };
}

/**
 * A sample exists once the answer has arrived and we know whether audio played.
 * Ack text and the final event are not a first-audio time.
 */
export function takeSample(clock: TurnClock): { clock: TurnClock; sample: LatencySample | null } {
  if (clock.recorded || clock.finalMs === null) return { clock, sample: null };
  if (clock.ttfsMs === null && !(clock.closed && clock.streamDone)) return { clock, sample: null };
  const sample: LatencySample = { ttfsMs: clock.ttfsMs, finalMs: clock.finalMs };
  return { clock: { ...clock, recorded: true }, sample };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/** Last ten turns. "Text only" means no audio started. */
export function meterCopy(samples: LatencySample[]): string {
  const recent = samples.slice(-10);
  const last = recent[recent.length - 1];
  if (!last) return 'No spoken turn yet.';
  const first = last.ttfsMs === null ? 'text only' : `${last.ttfsMs} ms to first audio`;
  const head = `Last turn ${first}, ${last.finalMs} ms to the answer.`;
  const heard = recent.map((sample) => sample.ttfsMs).filter((value): value is number => value !== null);
  const ttfs = median(heard);
  const finalMs = median(recent.map((sample) => sample.finalMs));
  if (finalMs === null) return head;
  const ttfsLabel = ttfs === null ? 'text only' : String(ttfs);
  return `${head} Median of ${recent.length}: ${ttfsLabel} / ${finalMs} ms.`;
}

export interface Caption {
  visible: string;
  answer: string;
  ackLeft: number;
}

export function emptyCaption(): Caption {
  return { visible: '', answer: '', ackLeft: 0 };
}

/** Keep the acknowledgement on screen until that line finishes. */
export function captionAck(caption: Caption, text: string): Caption {
  return { ...caption, visible: text, ackLeft: caption.ackLeft + 1 };
}

export function captionAnswer(caption: Caption, text: string): Caption {
  const next = { ...caption, answer: text };
  if (next.ackLeft > 0) return next;
  return { ...next, visible: text };
}

export function captionAckFinished(caption: Caption): Caption {
  const ackLeft = Math.max(0, caption.ackLeft - 1);
  const next = { ...caption, ackLeft };
  if (ackLeft === 0 && next.answer) return { ...next, visible: next.answer };
  return next;
}

function sameFact(longer: string, shorter: string): boolean {
  if (!shorter) return true;
  if (longer.includes(shorter)) return true;
  const stem = shorter.replace(/…+$/u, '').trim();
  return stem.length >= 8 && longer.startsWith(stem);
}

/** Prefer the longer of summary and speech so a clipped line does not hide the full one. */
export function approvalCopy(card: { summary?: string; speech?: string }): string {
  const summary = card.summary?.trim() ?? '';
  const speech = card.speech?.trim() ?? '';
  if (!summary) return speech;
  if (!speech || sameFact(summary, speech) || sameFact(speech, summary)) {
    return summary.length >= speech.length ? summary : speech;
  }
  return `${summary}\n${speech}`;
}

export interface ApprovalCard {
  name: string;
  status: string;
}

/** The waiting card stays up through later turns until approve_action finishes. */
export function visibleApproval<T extends ApprovalCard>(turns: { tools: T[] }[], phase: string): T | undefined {
  if (phase !== 'approval') return undefined;
  for (let turnIndex = turns.length - 1; turnIndex >= 0; turnIndex -= 1) {
    const tools = turns[turnIndex]?.tools ?? [];
    for (let index = tools.length - 1; index >= 0; index -= 1) {
      const card = tools[index];
      if (!card) continue;
      if (card.name === 'approve_action' && card.status === 'ok') return undefined;
      if (card.status === 'needs_approval') return card;
    }
  }
  return undefined;
}

const DECLINE = new Set(['no', 'nope', 'nah', 'decline', 'cancel']);

/** Whole phrase only. "no but not Tuesday" is not a decline. */
export function isDecline(utterance: string): boolean {
  const folded = utterance.trim().toLowerCase().replace(/[!.?,]/g, '').replace(/\s+/g, ' ');
  return DECLINE.has(folded);
}
