export class HouseholdLocked extends Error {
  constructor() {
    super('household_locked');
    this.name = 'HouseholdLocked';
  }
}

export interface SimEvent {
  event: string;
  data: Record<string, unknown>;
}

/** POST a turn and read the server-sent events from the response body. */
export async function streamTurn(
  utterance: string,
  conversationId: string | undefined,
  onEvent: (event: SimEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch('/api/alexa-sim/turn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ utterance, ...(conversationId ? { conversationId } : {}) }),
    signal,
  });
  if (response.status === 401) throw new HouseholdLocked();
  if (!response.ok || !response.body) throw new Error('The voice turn failed.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() ?? '';
    for (const chunk of chunks) {
      const parsed = parseFrame(chunk);
      if (parsed) onEvent(parsed);
    }
  }
  const tail = parseFrame(buffer);
  if (tail) onEvent(tail);
}

function parseFrame(chunk: string): SimEvent | null {
  if (!chunk.trim()) return null;
  let event = 'message';
  const data: string[] = [];
  for (const line of chunk.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data.push(line.slice(5).trim());
  }
  if (data.length === 0) return null;
  try {
    const parsed = JSON.parse(data.join('\n')) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { event, data: {} };
    return { event, data: parsed as Record<string, unknown> };
  } catch {
    return { event, data: {} };
  }
}
