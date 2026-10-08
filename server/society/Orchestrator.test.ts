import { describe, it, expect } from 'vitest';
import { runSociety, planSociety, parsePlan, type LLMLike, type SocietyTask } from './Orchestrator';

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Mock provider exercising the full lifecycle:
 *  - Manager returns a 4-task plan.
 *  - Two tasks succeed first try.
 *  - One task (WRITE_TASK) fails once then succeeds on retry → self-heal.
 *  - One task (ALWAYS_FAIL) never succeeds → escalation.
 * A small delay makes worker overlap real so maxConcurrency is meaningful.
 */
function makeMockProvider(): LLMLike {
  return {
    async generateCompletion(messages, _tools, systemInstruction) {
      await delay(5);

      if (systemInstruction?.includes('Manager')) {
        return {
          content: JSON.stringify([
            { id: 't1', title: 'Research', role: 'researcher', prompt: 'gather sources' },
            { id: 't2', title: 'Design', role: 'designer', prompt: 'sketch the layout' },
            { id: 't3', title: 'Write', role: 'writer', prompt: 'WRITE_TASK draft the copy' },
            { id: 't4', title: 'Review', role: 'reviewer', prompt: 'ALWAYS_FAIL audit everything' },
          ]),
        };
      }

      const user = messages[messages.length - 1]?.content ?? '';
      const isRetry = user.includes('previous attempt was rejected');

      if (user.includes('ALWAYS_FAIL')) {
        return { content: 'ERROR: unrecoverable' };
      }
      if (user.includes('WRITE_TASK')) {
        return { content: isRetry ? 'Corrected draft copy.' : 'ERROR: malformed output' };
      }
      return { content: `Completed deliverable for: ${user.slice(0, 24)}` };
    },
  };
}

describe('Society Orchestrator', () => {
  it('decomposes a brief into >=3 tasks and runs workers in parallel', async () => {
    const result = await runSociety('Build a landing page', makeMockProvider());

    expect(result.metrics.taskCount).toBeGreaterThanOrEqual(3);
    // 4 workers overlap behind a 5ms provider delay → peak concurrency proves parallelism.
    expect(result.metrics.maxConcurrency).toBeGreaterThanOrEqual(3);
  });

  it('self-heals an invalid worker output with exactly one retry', async () => {
    const result = await runSociety('Build a landing page', makeMockProvider());
    const writeTask = result.tasks.find((t) => t.id === 't3');

    expect(writeTask).toBeDefined();
    expect(writeTask?.status).toBe('done');
    expect(writeTask?.healed).toBe(true);
    expect(writeTask?.attempts).toBe(2);
    expect(result.metrics.healed).toBe(1);
  });

  it('escalates a worker that stays invalid after its retry', async () => {
    const result = await runSociety('Build a landing page', makeMockProvider());
    const reviewTask = result.tasks.find((t) => t.id === 't4');

    expect(reviewTask?.status).toBe('escalated');
    expect(reviewTask?.attempts).toBe(2);
    expect(reviewTask?.healed).toBe(false);
    expect(result.metrics.escalated).toBe(1);
  });
});

  it('runs the selected team on each agent model', async () => {
    const calls: { model?: string; system?: string }[] = [];
    const noted: { stage: string; agent: string }[] = [];
    const provider: LLMLike & { prepareRequest: (info: { stage: string; agent: string }) => void } = {
      prepareRequest(info) {
        noted.push(info);
      },
      async generateCompletion(_messages, _tools, systemInstruction, modelName) {
        calls.push({ model: modelName, system: systemInstruction });
        if (systemInstruction?.includes('You lead this team')) {
          return {
            content: JSON.stringify([
              { id: 'a', title: 'Frame', role: 'Film Director', prompt: 'frame the spot' },
              { id: 'b', title: 'Shoot', role: 'Cinematographer', prompt: 'choose the lens' },
            ]),
          };
        }
        return { content: 'A finished piece of the brief.' };
      },
    };

    await runSociety('Agree the film before shooting', provider, {
      team: [
        { name: 'Film Director', description: 'Directs the spot', model: 'model-lead' },
        { name: 'Cinematographer', description: 'Chooses the lens', model: 'model-camera' },
      ],
    });

    expect(calls[0]?.model).toBe('model-lead');
    expect(calls[0]?.system).toContain('Film Director');
    expect(calls.some((call) => call.system?.includes('You are the Manager'))).toBe(false);
    expect(calls.some((call) => call.system?.includes('You are the Lead'))).toBe(false);
    expect(calls.some((call) => call.model === 'model-camera' && call.system?.includes('Cinematographer'))).toBe(true);
    expect(noted.some((note) => note.stage === 'planning' && note.agent === 'Film Director')).toBe(true);
    expect(noted.some((note) => note.stage === 'worker' && note.agent === 'Cinematographer')).toBe(true);
    expect(noted.some((note) => note.stage === 'assembling' && note.agent === 'Film Director')).toBe(true);
  });

  it('labels a film draft that is still over the word limit after two repairs', async () => {
    const longDraft = Array.from({ length: 400 }, () => 'word').join(' ');
    const provider: LLMLike = {
      async generateCompletion(_messages, _tools, systemInstruction) {
        if (systemInstruction?.includes('You are the Manager')) {
          return { content: JSON.stringify([{ id: 'a', title: 'Write', role: 'Worker', prompt: 'write' }]) };
        }
        return { content: longDraft };
      },
    };
    const result = await runSociety(
      'Required sections: problem, audience, priorities, and assigned next steps. Under 400 words.',
      provider,
    );
    expect(result.documentStatus).toBe('needs_revision');
    expect(result.revisionLabel).toBe('Needs revision: exceeds word limit');
    expect(result.metrics.repairCalls).toBe(2);
    expect(result.wordCount).toBe(400);
    expect(result.synthesis).toBe(longDraft);
  });

  it('accepts a film draft once a repair brings it within 399 words', async () => {
    let leadCalls = 0;
    const provider: LLMLike = {
      async generateCompletion(_messages, _tools, systemInstruction) {
        if (systemInstruction?.includes('You are the Manager')) {
          return { content: JSON.stringify([{ id: 'a', title: 'Write', role: 'Worker', prompt: 'write' }]) };
        }
        if (systemInstruction?.includes('You are a Worker')) {
          return { content: 'A finished piece of the brief.' };
        }
        leadCalls += 1;
        if (leadCalls === 1) return { content: Array.from({ length: 400 }, () => 'word').join(' ') };
        return { content: 'Problem\nThe team disagrees.\n\nAudience\nA small film crew.\n\nPriorities\nAgree the shot.\n\nAssigned next steps\nThe director writes the list.' };
      },
    };
    const result = await runSociety(
      'Required sections: problem, audience, priorities, and assigned next steps. Under 400 words.',
      provider,
    );
    expect(result.documentStatus).toBe('accepted');
    expect(result.revisionLabel).toBeUndefined();
    expect(result.wordCount).toBeLessThanOrEqual(399);
    expect(result.metrics.repairCalls).toBe(1);
  });

describe('planSociety', () => {
  it('returns parsed tasks from a fake model', async () => {
    const provider: LLMLike = {
      async generateCompletion() {
        return { content: JSON.stringify([{ id: 'a', title: 'Frame', role: 'worker', prompt: 'frame it' }]) };
      },
    };
    const planned = await planSociety('Agree the shot', provider);
    expect(planned.tasks).toHaveLength(1);
    expect(planned.tasks[0].id).toBe('a');
    expect(planned.usage.calls).toBe(1);
  });

  it('does not call the planner when preset tasks are provided', async () => {
    let planning = 0;
    const provider: LLMLike = {
      async generateCompletion(_messages, _tools, systemInstruction) {
        if (systemInstruction?.includes('You are the Manager') || systemInstruction?.includes('You lead this team')) {
          planning += 1;
        }
        return { content: 'A finished piece of the brief.' };
      },
    };
    const preset: SocietyTask[] = [{ id: 't1', title: 'Note', role: 'worker', prompt: 'Write the note' }];
    const result = await runSociety('Plan dinner', provider, { presetTasks: preset });
    expect(planning).toBe(0);
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].id).toBe('t1');
    expect(result.synthesis).toBe('A finished piece of the brief.');
  });
});

describe('parsePlan', () => {
  it('parses a fenced JSON code block', () => {
    const tasks = parsePlan('```json\n[{"id":"a","title":"A","role":"worker","prompt":"do a"}]\n```');
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe('a');
  });

  it('extracts a JSON array embedded in prose', () => {
    const tasks = parsePlan('Sure! Here is the plan: [{"title":"X","role":"r","prompt":"p"}] Done.');
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe('t1'); // id backfilled when missing
    expect(tasks[0].title).toBe('X');
  });

  it('throws on an empty plan', () => {
    expect(() => parsePlan('')).toThrow();
  });
});

describe('dependency waves', () => {
  it('gives a later task the output of the task it depends on', async () => {
    const provider: LLMLike = {
      async generateCompletion(messages, _tools, systemInstruction) {
        if (systemInstruction?.includes('Manager')) {
          return {
            content: JSON.stringify([
              { id: 'a', title: 'A', role: 'researcher', prompt: 'FIRST_TASK' },
              { id: 'b', title: 'B', role: 'writer', prompt: 'SECOND_TASK', deps: ['a'] },
            ]),
          };
        }
        const user = messages[messages.length - 1]?.content ?? '';
        if (user.includes('SECOND_TASK')) {
          return { content: user.includes('output-of-a') ? 'b-done' : 'ERROR: missing dep' };
        }
        return { content: 'output-of-a' };
      },
    };

    const result = await runSociety('A short brief', provider);
    expect(result.tasks.find((task) => task.id === 'b')?.status).toBe('done');
    expect(result.tasks.find((task) => task.id === 'b')?.output).toBe('b-done');
  });
});

describe('Jev worker judgment', () => {
  it('accepts on the first try when the judge accepts an output the legacy check would reject', async () => {
    const provider = makeMockProvider();
    const result = await runSociety('Build a landing page', provider, {
      judgeOutput: async (_task, output) => output.startsWith('ERROR') ? 'accept' : 'accept',
    });
    const writeTask = result.tasks.find((task) => task.id === 't3');
    expect(writeTask?.status).toBe('done');
    expect(writeTask?.attempts).toBe(1);
    expect(writeTask?.output.startsWith('ERROR')).toBe(true);
  });

  it('escalates immediately when the judge asks the boss', async () => {
    const result = await runSociety('Build a landing page', makeMockProvider(), {
      judgeOutput: async () => 'escalate',
    });
    expect(result.tasks.every((task) => task.status === 'escalated' && task.attempts === 1)).toBe(true);
    expect(result.metrics.phases.workersMs).toBeGreaterThanOrEqual(0);
  });
});
