import { describe, expect, it } from 'vitest';
import { runNegotiation, type NegotiationLLM } from './Negotiation';

function scoring(scores: { agent: string; score: number; reason: string }[]): NegotiationLLM {
  return {
    async generateCompletion(_messages, _tools, systemInstruction) {
      if (systemInstruction?.includes('Score each debater')) return { content: JSON.stringify(scores) };
      return { content: 'A short argument.' };
    },
  };
}

describe('negotiation score margin', () => {
  it('adopts the leader when the score margin is decisive', async () => {
    const result = await runNegotiation('retention', [
      { agent: 'Ada', stance: '7 days' },
      { agent: 'Bea', stance: '30 days' },
    ], scoring([
      { agent: 'Ada', score: 90, reason: 'clear' },
      { agent: 'Bea', score: 40, reason: 'thin' },
    ]), { maxRounds: 2 });
    expect(result.outcome).toBe('consensus');
    expect(result.winner).toBe('Ada');
    expect(result.rounds).toBe(1);
  });

  it('escalates to the host when the scores stay close for every round', async () => {
    const result = await runNegotiation('retention', [
      { agent: 'Ada', stance: '7 days' },
      { agent: 'Bea', stance: '30 days' },
    ], scoring([
      { agent: 'Ada', score: 62, reason: 'fair' },
      { agent: 'Bea', score: 60, reason: 'fair' },
    ]), { maxRounds: 2 });
    expect(result.outcome).toBe('escalate');
    expect(result.winner).toBeUndefined();
    expect(result.rounds).toBe(2);
  });
});
