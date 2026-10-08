/**
 * Negotiation / Referee — AGORA's conflict-resolution layer.
 *
 * When agents hold competing positions, a Referee runs a structured debate:
 * debaters argue, the Referee scores each position against a rubric, debaters
 * revise, and the round repeats until there is a clear winner (consensus) or the
 * rounds run out (escalate to a human). Provider-agnostic so it can be unit-tested
 * with a mock and run live with any LLM provider.
 */

import { judgeEscalation } from './decider/gates';

/** Minimal structural type any LLM provider satisfies (Qwen / NVIDIA both do). */
export interface NegotiationLLM {
  generateCompletion(
    messages: { role: string; content: string }[],
    tools?: unknown[],
    systemInstruction?: string,
    modelName?: string,
  ): Promise<{ content: string | null }>;
}

/** A debater's opening position. */
export interface Position {
  agent: string;
  stance: string;
  /** Team member name used to pick that member's model connection. The visible name stays `agent`. */
  route?: string;
}

export interface DebateTurn {
  round: number;
  agent: string;
  argument: string;
}

export interface RefereeScore {
  agent: string;
  score: number; // 0–100
  reason: string;
}

export type NegotiationOutcome = 'consensus' | 'escalate';

export interface NegotiationResult {
  topic: string;
  rounds: number;
  transcript: DebateTurn[];
  /** Scores from the final round, sorted high → low. */
  scores: RefereeScore[];
  outcome: NegotiationOutcome;
  /** Winning agent (consensus only). */
  winner?: string;
  /** Referee's consensus synthesis, or the escalation brief for the human. */
  synthesis: string;
}

export interface NegotiationOptions {
  /** Max debate rounds before escalating (default 2). */
  maxRounds?: number;
  /** Min top score to allow consensus (default 70). */
  consensusThreshold?: number;
  /** Min lead over the runner-up to declare a clear winner (default 10). */
  winMargin?: number;
  refereeModel?: string;
  debaterModel?: string;
  onEvent?: (event: { type: string; [key: string]: any }) => void;
}

function markDebate(provider: NegotiationLLM, agent: string, attempt: number): void {
  const tagged = provider as NegotiationLLM & { prepareRequest?: (info: { stage: string; agent: string; attempt: number }) => void };
  tagged.prepareRequest?.({ stage: 'debate', agent, attempt });
}

const DEFAULT_REFEREE_MODEL = 'qwen3.8-max';
const DEFAULT_DEBATER_MODEL = 'qwen3.7-plus';
const RUBRIC = 'relevance to the topic, strength of evidence, feasibility, and clarity';

function clampScore(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, Math.round(v)));
}

/** Parse the Referee's score JSON, tolerating code fences / surrounding prose. */
export function parseScores(content: string | null, agents: string[]): RefereeScore[] {
  let parsed: unknown = null;
  if (content && content.trim()) {
    const cleaned = content.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').replace(/,\s*([}\]])/g, '$1').trim();
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const m = cleaned.match(/\[[\s\S]*\]/);
      if (m) {
        try { parsed = JSON.parse(m[0]); } catch { parsed = null; }
      }
    }
  }

  const rows: Record<string, RefereeScore> = {};
  if (Array.isArray(parsed)) {
    for (const raw of parsed) {
      const obj = (raw && typeof raw === 'object') ? (raw as Record<string, unknown>) : {};
      const agent = typeof obj.agent === 'string' ? obj.agent : '';
      if (!agent) continue;
      rows[agent] = {
        agent,
        score: clampScore(obj.score),
        reason: typeof obj.reason === 'string' ? obj.reason : '',
      };
    }
  }

  // Ensure every agent has a score (default 0) and keep input order stable before sorting.
  return agents.map((a) => rows[a] ?? { agent: a, score: 0, reason: 'No score returned.' });
}

async function debaterArgument(
  provider: NegotiationLLM,
  model: string,
  topic: string,
  pos: Position,
  round: number,
  critique: string,
  opponents: DebateTurn[],
): Promise<string> {
  const system = `You are ${pos.agent}, debating to win. Argue for YOUR position only. Be concrete; max 80 words. No preamble.`;
  const opponentText = opponents.length
    ? `\nOpponents argued:\n${opponents.map((o) => `- ${o.agent}: ${o.argument}`).join('\n')}`
    : '';
  const critiqueText = round > 1 && critique
    ? `\nThe Referee's critique of your last argument: ${critique}\nStrengthen your case and address it.`
    : '';
  const user = `Topic: ${topic}\nYour stance: ${pos.stance}${opponentText}${critiqueText}`;
  markDebate(provider, pos.route || pos.agent, round);
  const res = await provider.generateCompletion([{ role: 'user', content: user }], undefined, system, model);
  return (res.content ?? '').trim() || `(no argument from ${pos.agent})`;
}

async function refereeScore(
  provider: NegotiationLLM,
  model: string,
  topic: string,
  turns: DebateTurn[],
): Promise<RefereeScore[]> {
  const agents = turns.map((t) => t.agent);
  const system = `You are an impartial Referee. Score each debater 0–100 on this rubric: ${RUBRIC}. Respond with ONLY a JSON array: [{"agent","score","reason"}]. Be discriminating — do not tie.`;
  const user = `Topic: ${topic}\n\nArguments:\n${turns.map((t) => `### ${t.agent}\n${t.argument}`).join('\n\n')}`;
  markDebate(provider, 'Referee', turns[0]?.round ?? 1);
  const res = await provider.generateCompletion([{ role: 'user', content: user }], undefined, system, model);
  return parseScores(res.content, agents).sort((a, b) => b.score - a.score);
}

/** Run a structured debate to resolve competing positions. */
export async function runNegotiation(
  topic: string,
  positions: Position[],
  provider: NegotiationLLM,
  options: NegotiationOptions = {},
): Promise<NegotiationResult> {
  const maxRounds = options.maxRounds ?? 2;
  const threshold = options.consensusThreshold ?? 70;
  const margin = options.winMargin ?? 10;
  const refModel = options.refereeModel ?? DEFAULT_REFEREE_MODEL;
  const debModel = options.debaterModel ?? DEFAULT_DEBATER_MODEL;
  const onEvent = options.onEvent;

  const transcript: DebateTurn[] = [];
  let scores: RefereeScore[] = [];
  const critiques: Record<string, string> = {};
  let round = 0;

  while (round < maxRounds) {
    round += 1;
    const priorThisAgent = (agent: string) => transcript.filter((t) => t.agent !== agent && t.round === round - 1);

    // 1. Debaters argue this round (each sees last round's opposing arguments + own critique).
    const turns: DebateTurn[] = [];
    for (const pos of positions) {
      const argument = await debaterArgument(provider, debModel, topic, pos, round, critiques[pos.agent] || '', priorThisAgent(pos.agent));
      const turn: DebateTurn = { round, agent: pos.agent, argument };
      turns.push(turn);
      transcript.push(turn);
      onEvent?.({ type: 'negotiation-turn', round, agent: pos.agent, argument });
    }

    // 2. Referee scores.
    scores = await refereeScore(provider, refModel, topic, turns);
    scores.forEach((s) => { critiques[s.agent] = s.reason; });
    onEvent?.({ type: 'negotiation-scores', round, scores });

    const top = scores[0];
    const second = scores[1];
    const legacyDecisive = !!(top && top.score >= threshold && (!second || top.score - second.score >= margin));
    const judged = await judgeEscalation({
      topic,
      scores,
      arguments: turns.map((turn) => ({ agent: turn.agent, argument: turn.argument })),
    });
    if ((judged === 'consensus' || (judged === 'legacy' && legacyDecisive)) && top) {
      const synthesis = await refereeSynthesis(provider, refModel, topic, top, transcript);
      return { topic, rounds: round, transcript, scores, outcome: 'consensus', winner: top.agent, synthesis };
    }
    if (judged === 'escalate') {
      const synthesis = await refereeEscalation(provider, refModel, topic, scores, transcript);
      return { topic, rounds: round, transcript, scores, outcome: 'escalate', synthesis };
    }
  }

  // Rounds exhausted without a decisive winner → escalate to a human.
  const synthesis = await refereeEscalation(provider, refModel, topic, scores, transcript);
  return { topic, rounds: round, transcript, scores, outcome: 'escalate', synthesis };
}

async function refereeSynthesis(
  provider: NegotiationLLM,
  model: string,
  topic: string,
  winner: RefereeScore,
  transcript: DebateTurn[],
): Promise<string> {
  const system = 'You are the Referee. State the resolution in <=100 words, merging the best supporting points. No preamble.';
  const user = `Topic: ${topic}\nWinning position: ${winner.agent} (${winner.score}/100).\nDebate:\n${transcript.map((t) => `- [r${t.round}] ${t.agent}: ${t.argument}`).join('\n')}`;
  markDebate(provider, 'Referee', transcript.at(-1)?.round ?? 1);
  const res = await provider.generateCompletion([{ role: 'user', content: user }], undefined, system, model);
  return (res.content ?? '').trim() || `Consensus: adopt ${winner.agent}'s position.`;
}

async function refereeEscalation(
  provider: NegotiationLLM,
  model: string,
  topic: string,
  scores: RefereeScore[],
  transcript: DebateTurn[],
): Promise<string> {
  const system = 'You are the Referee. No consensus was reached. In <=80 words, summarize the deadlock and the single decision the human must make. No preamble.';
  const user = `Topic: ${topic}\nFinal scores: ${scores.map((s) => `${s.agent} ${s.score}`).join(', ')}\nDebate:\n${transcript.map((t) => `- [r${t.round}] ${t.agent}: ${t.argument}`).join('\n')}`;
  markDebate(provider, 'Referee', transcript.at(-1)?.round ?? 1);
  const res = await provider.generateCompletion([{ role: 'user', content: user }], undefined, system, model);
  return (res.content ?? '').trim() || 'No consensus — human decision required.';
}
