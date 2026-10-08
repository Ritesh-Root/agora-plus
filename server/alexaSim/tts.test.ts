import { EventEmitter } from 'events';
import type { IncomingMessage, ServerResponse } from 'http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SynthesizeSpeechCommand } from '@aws-sdk/client-polly';
import { handleApiRoutes } from '../routes';
import { resetTts, setPollyClient, type PollySpeaker } from './tts';

afterEach(() => {
  resetTts();
  delete process.env.AGORA_HOUSEHOLD_PASSCODE;
  delete process.env.AGORA_TTS;
});

function call(json: unknown): Promise<{ status: number; body: string; type: string }> {
  delete process.env.AGORA_HOUSEHOLD_PASSCODE;
  const req = new EventEmitter() as IncomingMessage;
  req.method = 'POST';
  req.url = '/api/tts';
  req.headers = { host: 'localhost:3000', 'content-type': 'application/json' };
  req.resume = () => req;
  req.socket = { remoteAddress: '127.0.0.1' } as IncomingMessage['socket'];
  const res = new EventEmitter() as ServerResponse & { statusCode: number; body: string; type: string };
  res.statusCode = 0;
  res.body = '';
  res.type = '';
  res.writeHead = ((status: number, headers?: Record<string, string>) => {
    res.statusCode = status;
    res.type = headers?.['Content-Type'] ?? '';
    return res;
  }) as ServerResponse['writeHead'];
  res.end = ((body?: string | Buffer) => {
    res.body = typeof body === 'string' ? body : body ? Buffer.from(body).toString('utf8') : '';
    res.emit('done');
    return res;
  }) as ServerResponse['end'];
  handleApiRoutes(req, res);
  req.emit('data', Buffer.from(JSON.stringify(json)));
  req.emit('end');
  return new Promise((resolve) => {
    const finish = () => resolve({ status: res.statusCode, body: res.body, type: res.type });
    if (res.statusCode) {
      finish();
      return;
    }
    res.once('done', finish);
  });
}

describe('POST /api/tts', () => {
  it('returns 503 when the Polly client throws', async () => {
    const client: PollySpeaker = {
      async send(_command: SynthesizeSpeechCommand) {
        throw new Error('no credentials');
      },
    };
    setPollyClient(client);
    const result = await call({ text: 'On it.' });
    expect(result.status).toBe(503);
    expect(JSON.parse(result.body)).toEqual({ error: 'tts_unavailable' });
  });

  it('returns 503 without calling Polly when AGORA_TTS=0', async () => {
    process.env.AGORA_TTS = '0';
    let called = false;
    setPollyClient({
      async send() {
        called = true;
        return { AudioStream: { async transformToByteArray() { return new Uint8Array([1]); } } };
      },
    });
    const result = await call({ text: 'On it.' });
    expect(result.status).toBe(503);
    expect(called).toBe(false);
    delete process.env.AGORA_TTS;
  });

  it('stops waiting when Polly does not answer', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      setPollyClient({ send: () => new Promise(() => {}) });
      const pending = call({ text: 'On it.' });
      await vi.advanceTimersByTimeAsync(3_999);
      let settled = false;
      void pending.then(() => {
        settled = true;
      });
      await Promise.resolve();
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      const result = await pending;
      expect(result.status).toBe(503);
    } finally {
      vi.useRealTimers();
    }
  });
});
