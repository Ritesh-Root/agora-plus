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
const TTS_DEADLINE_MS = 4_000;
/**
 * After Polly fails (no AWS credentials, throttling, an outage), answer 503 at once for this long.
 * Without it every spoken line waits seconds on the credential chain before the browser speaks.
 */
const DOWN_MS = 5 * 60_000;
let downUntil = 0;

function ttsOff(): boolean {
  return process.env.AGORA_TTS === '0';
}

function deadline<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('tts timeout')), ms);
    work.then((value) => {
      clearTimeout(timer);
      resolve(value);
    }, (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

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
  downUntil = 0;
}

export function resetTts(): void {
  injected = null;
  cache.clear();
  downUntil = 0;
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
  if (warming || ttsOff() || Date.now() < downUntil) return;
  warming = true;
  void (async () => {
    for (const phrase of ACK_PHRASES) {
      try {
        await synthesize(phrase);
      } catch {
        downUntil = Date.now() + DOWN_MS;
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
  if (ttsOff() || Date.now() < downUntil) {
    sendJson(res, 503, { error: 'tts_unavailable' });
    return;
  }
  try {
    const bytes = await deadline(synthesize(text.trim()), TTS_DEADLINE_MS);
    if (res.headersSent || res.writableEnded) return;
    res.writeHead(200, {
      'Content-Type': 'audio/mpeg',
      'Content-Length': String(bytes.byteLength),
      'Cache-Control': 'private, max-age=3600',
    });
    res.end(Buffer.from(bytes));
  } catch {
    downUntil = Date.now() + DOWN_MS;
    sendJson(res, 503, { error: 'tts_unavailable' });
  }
}
