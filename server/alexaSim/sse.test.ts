import { describe, expect, it } from 'vitest';
import { formatSseEvent } from './sse';

describe('formatSseEvent', () => {
  it('writes an event name, one JSON data line, and a blank line', () => {
    const frame = formatSseEvent('ack', { text: 'On it.', at: '2026-10-08T00:00:00.000Z' });
    expect(frame).toBe('event: ack\ndata: {"text":"On it.","at":"2026-10-08T00:00:00.000Z"}\n\n');
  });
});
