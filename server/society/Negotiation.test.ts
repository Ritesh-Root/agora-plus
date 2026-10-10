import { afterEach, describe, expect, it, vi } from 'vitest';
import { runNegotiation, type NegotiationLLM } from './Negotiation';

const provider: NegotiationLLM = {
  async generateCompletion(_messages, _tools, systemInstruction) {
    if (systemInstruction?.includes('Score each debater')) {
      return { content: JSON.stringify([
        { agent: 'Ada', score: 90, reason: 'clear' },
        { agent: 'Bea', score: 40, reason: 'thin' },
      ]) };
    }
    return { content: 'A short argument.' };
  },
};

describe('negotiation escalation gate', () => {
  // A real key in the shell (TYPESAFE_API_KEY) must not decide whether the Jev path runs.
  const savedKeys = { TYPESAFE_API_KEY: process.env.TYPESAFE_API_KEY, JEV_API_KEY: process.env.JEV_API_KEY };
  const useTestKey = () => {
    delete process.env.TYPESAFE_API_KEY;
    process.env.JEV_API_KEY = 'test-jev-key';
  };

  afterEach(() => {
    delete process.env.AGORA_DECIDER;
    for (const [name, value] of Object.entries(savedKeys)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    vi.unstubAllGlobals();
  });

  it('keeps the score margin when Jev is not selected', async () => {
    const result = await runNegotiation('retention', [
      { agent: 'Ada', stance: '7 days' },
      { agent: 'Bea', stance: '30 days' },
    ], provider, { maxRounds: 2 });
    expect(result.outcome).toBe('consensus');
    expect(result.winner).toBe('Ada');
  });

  it('escalates when Jev says the boss must decide, even if the scores look decisive', async () => {
    process.env.AGORA_DECIDER = 'jev';
    useTestKey();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      model: 'jev-1.13.0',
      answers: {
        boss_decision: {
          type: 'choice',
          choice: 'escalate',
          probabilities: { escalate: 0.91, consensus: 0.09 },
          confidence: 0.88,
        },
      },
      usage: { input_tokens: 12, output_tokens: 4 },
    }), { status: 200 })));

    const result = await runNegotiation('retention', [
      { agent: 'Ada', stance: '7 days' },
      { agent: 'Bea', stance: '30 days' },
    ], provider, { maxRounds: 2 });
    expect(result.outcome).toBe('escalate');
    expect(result.rounds).toBe(1);
  });

  it('falls back to the score margin when Jev returns an error', async () => {
    process.env.AGORA_DECIDER = 'jev';
    useTestKey();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('no', { status: 401 })));
    const result = await runNegotiation('retention', [
      { agent: 'Ada', stance: '7 days' },
      { agent: 'Bea', stance: '30 days' },
    ], provider, { maxRounds: 2 });
    expect(result.outcome).toBe('consensus');
    expect(result.winner).toBe('Ada');
  });
});
