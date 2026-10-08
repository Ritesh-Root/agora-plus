import {
  PollyClient,
  SynthesizeSpeechCommand,
  type Engine,
  type VoiceId,
} from '@aws-sdk/client-polly';
import type { ServerResponse } from 'http';
import { ACK_PHRASES } from './ack';

/**
 * POST /api/tts speaks one line with Amazon Polly and caches the mp3.
 * A missing credential or a Polly error becomes 503 so the browser can speak instead.
 */

const CACHE_MAX = 100;
const TEXT_MAX = 1500;

export interface PollySpeaker {
  send(command: SynthesizeSpeechCommand): Promise<{ AudioStream?: { transformToByteArray(): Promise<Uint8Array> } }>;
}

const cache = new Map<string, Uint8Array>();
let injected: PollySpeaker | null = null;
let owned: PollyClient | null = null;
let warming = false;

export function setPollyClient(client: PollySpeaker | null): void {
  injected = client;
  cache.clear();
}

export function resetTts(): void {
  injected = null;
  cache.clear();
}

function engine(): Engine {
  const raw = process.env.POLLY_ENGINE?.trim() || 'neural';
  if (raw === 'standard' || raw === 'neural' || raw === 'long-form' || raw === 'generative') return raw;
  return 'neural';
}

function voice(): VoiceId {
  return (process.env.POLLY_VOICE?.trim() || 'Joanna') as VoiceId;
}

export function ttsSettings(): { voice: string; engine: string } {
  return { voice: process.env.POLLY_VOICE?.trim() || 'Joanna', engine: process.env.POLLY_ENGINE?.trim() || 'neural' };
}

function cacheKey(text: string): string {
  const settings = ttsSettings();
  return `${settings.engine}|${settings.voice}|${text}`;
}

function remember(key: string, bytes: Uint8Array): void {
  cache.delete(key);
  cache.set(key, bytes);
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

function speaker(): PollySpeaker {
  if (injected) return injected;
  if (!owned) owned = new PollyClient({ region: process.env.AWS_REGION || 'us-east-1' });
  return owned;
}

async function synthesize(text: string): Promise<Uint8Array> {
  const key = cacheKey(text);
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const output = await speaker().send(new SynthesizeSpeechCommand({
    Engine: engine(),
    VoiceId: voice(),
    OutputFormat: 'mp3',
    Text: text,
  }));
  if (!output.AudioStream) throw new Error('empty audio');
  const bytes = await output.AudioStream.transformToByteArray();
  if (bytes.length === 0) throw new Error('empty audio');
  remember(key, bytes);
  return bytes;
}

/** Fills the cache with the acknowledgement phrases. Failures are ignored. */
export function warmAcknowledgements(): void {
  if (warming) return;
  warming = true;
  void (async () => {
    for (const phrase of ACK_PHRASES) {
      try {
        await synthesize(phrase);
      } catch {
        return;
      }
    }
  })();
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  if (res.headersSent || res.writableEnded) return;
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

/** POST /api/tts. `text` is the already-read JSON field. */
export async function handleTts(res: ServerResponse, text: unknown): Promise<void> {
  if (typeof text !== 'string' || text.trim().length === 0) {
    sendJson(res, 400, { error: 'Text is required.' });
    return;
  }
  if (text.length > TEXT_MAX) {
    sendJson(res, 400, { error: 'Text is too long.' });
    return;
  }
  try {
    const bytes = await synthesize(text.trim());
    if (res.headersSent || res.writableEnded) return;
    res.writeHead(200, {
      'Content-Type': 'audio/mpeg',
      'Content-Length': String(bytes.byteLength),
      'Cache-Control': 'private, max-age=3600',
    });
    res.end(Buffer.from(bytes));
  } catch {
    sendJson(res, 503, { error: 'tts_unavailable' });
  }
}
