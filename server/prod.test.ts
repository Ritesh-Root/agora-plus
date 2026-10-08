import { afterEach, describe, expect, it } from 'vitest';
import { productionBindHost } from './prod';

const saved = process.env.AGORA_HOUSEHOLD_PASSCODE;

afterEach(() => {
  if (saved === undefined) delete process.env.AGORA_HOUSEHOLD_PASSCODE;
  else process.env.AGORA_HOUSEHOLD_PASSCODE = saved;
});

describe('production bind', () => {
  it('binds every interface only when a household passcode is set', () => {
    delete process.env.AGORA_HOUSEHOLD_PASSCODE;
    expect(productionBindHost()).toBe('127.0.0.1');
    process.env.AGORA_HOUSEHOLD_PASSCODE = 'home-pass';
    expect(productionBindHost()).toBe('0.0.0.0');
  });
});
