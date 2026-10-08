import { EventEmitter } from 'events';
import type { IncomingMessage, ServerResponse } from 'http';
import { afterEach, describe, expect, it } from 'vitest';
import { handleModelTest } from './modelTest';
import { handleCorsProxy, relayUpgradeAllowed } from './relay';

const saved = process.env.AGORA_HOUSEHOLD_PASSCODE;

afterEach(() => {
  if (saved === undefined) delete process.env.AGORA_HOUSEHOLD_PASSCODE;
  else process.env.AGORA_HOUSEHOLD_PASSCODE = saved;
});

function response(): ServerResponse & { statusCode: number; body: string } {
  const res = new EventEmitter() as ServerResponse & { statusCode: number; body: string };
  res.statusCode = 0;
  res.body = '';
  res.writeHead = ((status: number) => {
    res.statusCode = status;
    return res;
  }) as ServerResponse['writeHead'];
  res.end = ((body?: string) => {
    res.body = body ?? '';
    return res;
  }) as ServerResponse['end'];
  return res;
}

describe('household session on the proxy and the room socket', () => {
  it('requires the household cookie when a passcode is set', () => {
    process.env.AGORA_HOUSEHOLD_PASSCODE = 'home-pass';
    const req = new EventEmitter() as IncomingMessage;
    req.method = 'POST';
    req.url = '/api/cors-proxy';
    req.headers = {};
    req.resume = () => req;
    const res = response();
    expect(handleCorsProxy(req, res)).toBe(true);
    expect(res.statusCode).toBe(401);
    expect(res.body).toContain('household_locked');
    expect(relayUpgradeAllowed(req)).toBe(false);

    delete process.env.AGORA_HOUSEHOLD_PASSCODE;
    expect(relayUpgradeAllowed(req)).toBe(true);
  });

  it('requires the household cookie for the model test when a passcode is set', () => {
    process.env.AGORA_HOUSEHOLD_PASSCODE = 'home-pass';
    const req = new EventEmitter() as IncomingMessage;
    req.method = 'POST';
    req.url = '/api/model-test';
    req.headers = {};
    req.resume = () => req;
    const res = response();
    expect(handleModelTest(req, res)).toBe(true);
    expect(res.statusCode).toBe(401);
  });
});
