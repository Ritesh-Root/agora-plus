import { judgeConflict } from './decider/gates';
import { NegotiationResult, runNegotiation } from './Negotiation';
import { LLMLike, TaskResult } from './Orchestrator';

export interface LeadNotes {
  notes?: string;
  conflict: 'skip' | 'ask_boss' | 'debate' | 'legacy' | 'none';
  negotiation?: NegotiationResult;
}

/** Decide whether two worker outputs need a debate before the Lead writes. */
export async function leadNotesFromConflict(
  brief: string,
  tasks: TaskResult[],
  provider: LLMLike,
  onEvent?: (event: { type: string; [key: string]: any }) => void,
  debateModel?: string,
): Promise<LeadNotes> {
  const usable = tasks.filter((task) => task.output.trim());
  if (usable.length < 2) return { conflict: 'none' };

  const pair = usable.slice(0, 2);
  const conflict = await judgeConflict({
    brief,
    outputs: pair.map((task) => ({ title: task.title, output: task.output })),
  });
  if (conflict === 'skip') return { conflict: 'skip' };
  if (conflict === 'ask_boss') {
    return {
      conflict: 'ask_boss',
      notes: 'These outputs might conflict. The boss should review them before they are treated as agreed.',
    };
  }

  const debateTopic = `Do these two outputs conflict for the brief: "${brief}"?`;
  onEvent?.({ type: 'society-debating' });
  const debateResult = await runNegotiation(debateTopic, [
    { agent: pair[0].title, stance: pair[0].output.slice(0, 500), route: pair[0].role },
    { agent: pair[1].title, stance: pair[1].output.slice(0, 500), route: pair[1].role },
  ], provider, {
    maxRounds: 2,
    refereeModel: debateModel,
    debaterModel: debateModel,
    onEvent: (event) => onEvent?.({ ...event, topic: debateTopic }),
  });
  return {
    conflict: conflict === 'legacy' ? 'legacy' : 'debate',
    negotiation: debateResult,
    notes: debateResult.outcome === 'consensus' ? debateResult.synthesis : undefined,
  };
}
