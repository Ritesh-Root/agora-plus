import {
  McpServer,
  ResourceNotFoundError,
  ResourceTemplate,
  type CallToolResult,
} from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import {
  addTask,
  askAgora,
  completeTask,
  dailyBriefing,
  forget,
  getRunStatus,
  listTasks,
  planAndRun,
  recall,
  remember,
  webResearch,
  type Receipt,
} from '../household/actions';
import { resolveApproval } from '../household/approvals';
import { memoryMarkdown } from '../household/memoryStore';
import { toSpeech } from '../household/speech';
import { getRunRecord, listRecentRuns } from '../runEngine';

const INSTRUCTIONS = [
  'AGORA+ is a self-hosted household brain. It remembers facts, keeps tasks, and plans work with a small team.',
  'Forgetting a memory or starting a plan does not happen immediately. The tool returns needs_approval and an approvalId. Call approve_action with that id and decision approve or reject.',
  'Spoken replies are short. Receipts and lists are in the structured result.',
].join(' ');

const receiptSchema = z.object({
  action: z.string(),
  id: z.string(),
  verified: z.boolean(),
  at: z.string(),
});

const statusSchema = z.enum(['ok', 'needs_approval', 'error']);

function toolOutput<T extends z.ZodRawShape>(shape: T) {
  return z.object({
    speech: z.string().describe('Short reply safe to speak aloud, at most two sentences.'),
    status: statusSchema.describe('ok when it finished, needs_approval when a yes is required, error when it did not happen.'),
    receipt: receiptSchema.optional().describe('Read-back proof that the write is on disk.'),
    approvalId: z.string().optional().describe('Pass this to approve_action.'),
    ...shape,
  });
}

type ToolStatus = 'ok' | 'needs_approval' | 'error';

function spoken(text: string): string {
  return toSpeech(text) || 'Something went wrong.';
}

function result(
  fields: Record<string, unknown> & { speech: string; status: ToolStatus },
  options?: { isError?: boolean; extra?: CallToolResult['content'] },
): CallToolResult {
  const speech = spoken(fields.speech);
  const structured: Record<string, unknown> = {};
  for (const [key, value] of Object.entries({ ...fields, speech })) {
    if (value !== undefined) structured[key] = value;
  }
  return {
    content: [{ type: 'text', text: speech }, ...(options?.extra ?? [])],
    structuredContent: structured,
    ...(options?.isError ? { isError: true as const } : {}),
  };
}

function fail(speech: string, extra?: Record<string, unknown>): CallToolResult {
  return result({ speech, status: 'error', ...extra }, { isError: true });
}

function errorOf(value: { ok: boolean; error?: string }): string | null {
  return value.ok ? null : (value.error ?? 'That did not work.');
}

function asReceipt(value: unknown): Receipt | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const receipt = (value as { receipt?: unknown }).receipt;
  if (!receipt || typeof receipt !== 'object') return undefined;
  const item = receipt as Record<string, unknown>;
  if (typeof item.action !== 'string' || typeof item.id !== 'string' || typeof item.verified !== 'boolean' || typeof item.at !== 'string') {
    return undefined;
  }
  return { action: item.action, id: item.id, verified: item.verified, at: item.at };
}

function memoryView(entries: { id: string; text: string; tags: string[] }[]) {
  return entries.map((entry) => ({ id: entry.id, text: entry.text, tags: entry.tags }));
}

function taskView(tasks: { id: string; title: string; status: 'open' | 'done'; due?: string }[]) {
  return tasks.map((task) => {
    const view: { id: string; title: string; status: 'open' | 'done'; due?: string } = {
      id: task.id,
      title: task.title,
      status: task.status,
    };
    if (task.due) view.due = task.due;
    return view;
  });
}

const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const writeSafe = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };

/**
 * Tools, resources, and prompts for one request. Writes go through household actions.
 * ask_agora, plan_and_run, and web_research call the server model. The others do not.
 */
export function buildAgoraMcpServer(ctx: { clientId?: string } = {}): McpServer {
  const server = new McpServer(
    { name: 'agora-plus', version: '0.1.0' },
    { instructions: INSTRUCTIONS },
  );
  // clientId is also on each tool call as ctx.http.authInfo, set from the bearer token.
  void ctx.clientId;

  server.registerTool(
    'remember',
    {
      title: 'Remember a fact',
      description: 'Call when someone asks the household to remember a fact, such as an allergy or a preference. It saves the fact on this server and returns a short confirmation plus a receipt. verified is true when a follow-up read saw the same words.',
      inputSchema: z.object({
        fact: z.string().describe('The fact to keep, in the words the person used.'),
        tags: z.array(z.string()).optional().describe('Optional labels such as allergy or preference.'),
      }),
      outputSchema: toolOutput({}),
      annotations: writeSafe,
    },
    async ({ fact, tags }) => {
      const saved = await remember(fact, tags, 'mcp');
      const message = errorOf(saved);
      if (message) return fail(message);
      if (!saved.ok) return fail('That fact could not be saved.');
      return result({
        speech: `I'll remember that ${saved.memory.text}`,
        status: 'ok',
        receipt: saved.receipt,
      });
    },
  );

  server.registerTool(
    'recall',
    {
      title: 'Recall household memory',
      description: 'Call when someone asks what the household already knows. It returns the closest saved facts and the spoken reply names the best match. An empty query returns the newest facts. It does not change anything.',
      inputSchema: z.object({
        query: z.string().optional().describe('Words to look for. Leave empty for the newest facts.'),
      }),
      outputSchema: toolOutput({
        memories: z.array(z.object({
          id: z.string(),
          text: z.string(),
          tags: z.array(z.string()),
        })).optional(),
      }),
      annotations: readOnly,
    },
    async ({ query }) => {
      const found = await recall(query ?? '');
      const memories = memoryView(found.memories.slice(0, 5));
      const best = memories[0];
      return result({
        speech: best ? `The best match is ${best.text}` : 'I do not have anything saved about that.',
        status: 'ok',
        memories,
      });
    },
  );

  server.registerTool(
    'forget',
    {
      title: 'Forget a fact',
      description: 'Call when someone wants a saved fact removed. It does not delete anything. It returns needs_approval and an approvalId. Call approve_action before the fact is gone.',
      inputSchema: z.object({
        memoryId: z.string().optional().describe('Exact memory id, when you already have it.'),
        query: z.string().optional().describe('Words that identify the fact, when you do not have the id.'),
      }),
      outputSchema: toolOutput({
        summary: z.string().optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    async ({ memoryId, query }) => {
      const needle = memoryId?.trim() || query?.trim() || '';
      if (!needle) return fail('Say which memory to forget.');
      const pending = await forget(needle);
      const message = errorOf(pending);
      if (message) return fail(message);
      if (!pending.ok) return fail('That memory could not be queued.');
      return result({
        speech: 'I need a yes before I forget that.',
        status: 'needs_approval',
        approvalId: pending.approvalId,
        summary: pending.summary,
      });
    },
  );

  server.registerTool(
    'add_task',
    {
      title: 'Add a task',
      description: 'Call when someone wants a household to-do saved. It stores the task and returns a receipt. It does not start a plan.',
      inputSchema: z.object({
        title: z.string().describe('What needs doing, as a short title.'),
        due: z.string().optional().describe('Optional due time, ideally YYYY-MM-DD.'),
      }),
      outputSchema: toolOutput({}),
      annotations: writeSafe,
    },
    async ({ title, due }) => {
      const saved = await addTask(title, due, 'mcp');
      const message = errorOf(saved);
      if (message) return fail(message);
      if (!saved.ok) return fail('That task could not be saved.');
      return result({
        speech: `Added ${saved.task.title}.`,
        status: 'ok',
        receipt: saved.receipt,
      });
    },
  );

  server.registerTool(
    'list_tasks',
    {
      title: 'List tasks',
      description: 'Call when someone asks what is on the household list. It returns open tasks, finished tasks, or both, and the spoken reply gives the count. It does not change anything.',
      inputSchema: z.object({
        status: z.enum(['open', 'done']).optional().describe('Filter to open or done. Leave empty for both.'),
      }),
      outputSchema: toolOutput({
        tasks: z.array(z.object({
          id: z.string(),
          title: z.string(),
          status: z.enum(['open', 'done']),
          due: z.string().optional(),
        })).optional(),
      }),
      annotations: readOnly,
    },
    async ({ status }) => {
      const found = await listTasks(status);
      const tasks = taskView(found.tasks);
      const open = tasks.filter((task) => task.status === 'open').length;
      const first = tasks.find((task) => task.status === 'open') ?? tasks[0];
      const speech = tasks.length === 0
        ? 'There are no tasks.'
        : first
          ? `There are ${open} open tasks. First is ${first.title}.`
          : `There are ${tasks.length} tasks.`;
      return result({ speech, status: 'ok', tasks });
    },
  );

  server.registerTool(
    'complete_task',
    {
      title: 'Complete a task',
      description: 'Call when someone says a household task is done. Match the id or the title. Calling it again on a finished task leaves that task done and still returns a receipt.',
      inputSchema: z.object({
        taskIdOrTitle: z.string().describe('The task id, or the title in any capitalization.'),
      }),
      outputSchema: toolOutput({}),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ taskIdOrTitle }) => {
      const saved = await completeTask(taskIdOrTitle);
      const message = errorOf(saved);
      if (message) return fail(message);
      if (!saved.ok) return fail('I could not find that task.');
      return result({
        speech: `${saved.task.title} is done.`,
        status: 'ok',
        receipt: saved.receipt,
      });
    },
  );

  server.registerTool(
    'daily_briefing',
    {
      title: 'Daily briefing',
      description: 'Call for the morning household briefing. It is built from due tasks, waiting approvals, and recent runs. It does not call a model, so it stays fast enough to speak.',
      inputSchema: z.object({}),
      outputSchema: toolOutput({
        items: z.array(z.string()).optional(),
        suggestions: z.array(z.string()).optional(),
      }),
      annotations: readOnly,
    },
    async () => {
      const briefing = await dailyBriefing();
      return result({
        speech: briefing.speech || 'Nothing urgent at home.',
        status: 'ok',
        items: briefing.items,
        suggestions: briefing.suggestions,
      });
    },
  );

  server.registerTool(
    'plan_and_run',
    {
      title: 'Plan and wait',
      description: 'Call when someone wants the household team to plan a goal, such as a week of meals. It does not start the team. It returns needs_approval, an approvalId, and a preview that lists the planned steps. Call approve_action before anything runs.',
      inputSchema: z.object({
        goal: z.string().describe('What the household wants planned.'),
      }),
      outputSchema: toolOutput({
        preview: z.string().optional(),
      }),
      annotations: writeSafe,
    },
    async ({ goal }) => {
      const pending = await planAndRun(goal);
      const message = errorOf(pending);
      if (message) return fail(message);
      if (!pending.ok) return fail('That plan could not be prepared.');
      return result({
        speech: 'I can plan that, but I will wait for your yes before starting.',
        status: 'needs_approval',
        approvalId: pending.approvalId,
        preview: pending.preview,
      });
    },
  );

  server.registerTool(
    'get_run_status',
    {
      title: 'Run status',
      description: 'Call to check a household plan run. Leave runId empty for the latest run. When the run has finished, the spoken reply is a short summary and the result includes a link to the written document. It does not start or change a run.',
      inputSchema: z.object({
        runId: z.string().optional().describe('A run id. Leave empty for the latest run.'),
      }),
      outputSchema: toolOutput({
        runId: z.string().optional(),
        runStatus: z.string().optional(),
        brief: z.string().optional(),
        finished: z.boolean().optional(),
        documentUri: z.string().optional(),
      }),
      annotations: readOnly,
    },
    async ({ runId }) => {
      const loaded = await getRunStatus(runId);
      if (!loaded.ok) return fail(loaded.speech);
      const run = loaded.run;
      const finished = loaded.finished;
      const documentUri = `agora://runs/${run.id}/document`;
      const link: CallToolResult['content'] = finished
        ? [{
          type: 'resource_link',
          uri: documentUri,
          name: run.id,
          title: run.brief.slice(0, 80) || 'Run document',
          mimeType: 'text/markdown',
          description: run.brief.slice(0, 200) || 'Finished household run',
        }]
        : [];
      return result({
        speech: loaded.speech,
        status: 'ok',
        runId: run.id,
        runStatus: run.status,
        brief: run.brief,
        finished,
        ...(finished ? { documentUri } : {}),
      }, { extra: link });
    },
  );

  server.registerTool(
    'approve_action',
    {
      title: 'Approve or reject',
      description: 'Call after a tool returns needs_approval. decision approve performs the waiting action, such as deleting a memory or starting a plan. decision reject leaves things as they are. This is the only tool that deletes a memory.',
      inputSchema: z.object({
        approvalId: z.string().describe('The approvalId from the tool that asked for a yes.'),
        decision: z.enum(['approve', 'reject']).describe('approve to do it, reject to leave it.'),
      }),
      outputSchema: toolOutput({
        runId: z.string().optional().describe('Set when an approved plan started a run. Pass it to get_run_status.'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    async ({ approvalId, decision }) => {
      const resolved = await resolveApproval(approvalId, decision);
      if (!resolved.ok) {
        const reason = (resolved as { ok: false; error: string }).error;
        const speech = reason === 'missing'
          ? 'That approval is not waiting.'
          : reason === 'expired'
            ? 'That approval has expired. Ask again.'
            : reason === 'resolved'
              ? 'That approval was already resolved.'
              : 'That action failed.';
        return fail(speech);
      }
      if (decision === 'reject') {
        return result({ speech: 'Okay. I will not do that.', status: 'ok' });
      }
      const outcome = resolved.result && typeof resolved.result === 'object'
        ? resolved.result as { ok?: unknown; runId?: unknown; error?: unknown }
        : undefined;
      // A start_run handler reports a busy room as { ok: false } instead of throwing.
      if (outcome?.ok === false) {
        return fail(typeof outcome.error === 'string' ? outcome.error : 'That action failed.');
      }
      const receipt = asReceipt(resolved.result);
      const runId = typeof outcome?.runId === 'string' ? outcome.runId : undefined;
      const speech = runId
        ? 'The household team has started. Ask me for the status any time.'
        : receipt?.action === 'forget'
          ? 'Done. I forgot that.'
          : 'Done.';
      return result({
        speech,
        status: 'ok',
        ...(receipt ? { receipt } : {}),
        ...(runId ? { runId } : {}),
      });
    },
  );

  server.registerTool(
    'ask_agora',
    {
      title: 'Ask the household',
      description: 'Call for a household question, such as an allergy. Agora answers in a sentence or two from saved memory, and may check tasks, the briefing, or a run. It does not change anything.',
      inputSchema: z.object({
        question: z.string().describe('The question, in everyday words.'),
      }),
      outputSchema: toolOutput({
        memories: z.array(z.object({
          id: z.string(),
          text: z.string(),
          tags: z.array(z.string()),
        })).optional(),
      }),
      annotations: readOnly,
    },
    async ({ question }) => {
      const answer = await askAgora(question);
      const message = errorOf(answer);
      if (message) return fail(message);
      if (!answer.ok) return fail('I could not answer that.');
      return result({
        speech: answer.speech,
        status: 'ok',
        memories: memoryView(answer.memories),
      });
    },
  );

  server.registerTool(
    'web_research',
    {
      title: 'Web research',
      description: 'Call when a household question needs the public web, such as a current price. It returns a short answer and names the source. If web research is not set up, it says so and does not invent sources.',
      inputSchema: z.object({
        question: z.string().describe('What to look up on the web.'),
      }),
      outputSchema: toolOutput({}),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ question }) => {
      const looked = await webResearch(question);
      if (!looked.ok) return fail(looked.speech || looked.error);
      return result({ speech: looked.speech, status: 'ok' });
    },
  );

  server.registerResource(
    'memory',
    'agora://memory',
    {
      title: 'Household memory',
      description: 'Facts the household has asked AGORA+ to remember, grouped by tag.',
      mimeType: 'text/markdown',
    },
    async (uri) => ({
      contents: [{
        uri: uri.href,
        mimeType: 'text/markdown',
        text: await memoryMarkdown(),
      }],
    }),
  );

  server.registerResource(
    'tasks',
    'agora://tasks',
    {
      title: 'Household tasks',
      description: 'Open and finished household tasks.',
      mimeType: 'application/json',
    },
    async (uri) => {
      const found = await listTasks();
      return {
        contents: [{
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(taskView(found.tasks)),
        }],
      };
    },
  );

  server.registerResource(
    'run-document',
    new ResourceTemplate('agora://runs/{runId}/document', {
      list: async () => {
        const runs = await listRecentRuns(20);
        return {
          resources: runs.map((run) => ({
            uri: `agora://runs/${run.id}/document`,
            name: run.id,
            title: run.brief.slice(0, 80) || 'Household run',
            mimeType: 'text/markdown',
            description: run.brief.slice(0, 200) || 'Finished household run',
          })),
        };
      },
    }),
    {
      title: 'Run document',
      description: 'The written result of one household run.',
      mimeType: 'text/markdown',
    },
    async (uri, variables) => {
      const raw = variables.runId;
      const runId = (Array.isArray(raw) ? raw[0] : raw) || '';
      const record = /^[0-9a-f-]{36}$/i.test(runId) ? await getRunRecord(runId) : null;
      if (!record) throw new ResourceNotFoundError(uri.href, 'That run document does not exist.');
      const text = record.synthesis.trim()
        ? record.synthesis
        : '# Run\n\nThis run has no document yet.\n';
      return {
        contents: [{ uri: uri.href, mimeType: 'text/markdown', text }],
      };
    },
  );

  server.registerPrompt(
    'morning-briefing',
    {
      title: 'Morning briefing',
      description: 'Ask for today at home. No arguments. The reply should stay short enough to say aloud.',
    },
    () => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: 'Give the household morning briefing. Call daily_briefing and speak only its short speech. Mention a waiting approval if there is one.',
        },
      }],
    }),
  );

  server.registerPrompt(
    'plan-a-week-of-meals',
    {
      title: 'Plan a week of meals',
      description: 'Ask AGORA+ to plan meals for the people in the house. It must wait for approval before starting.',
      argsSchema: z.object({
        people: z.string().describe('Who is eating, for example the family or a count.'),
        constraints: z.string().optional().describe('Allergies, budget, or foods to skip.'),
      }),
    },
    ({ people, constraints }) => {
      const who = people.trim().slice(0, 200) || 'the household';
      const limits = constraints?.trim() ? ` Constraints: ${constraints.trim().slice(0, 300)}.` : '';
      return {
        messages: [{
          role: 'user',
          content: {
            type: 'text',
            text: `Plan a week of meals for ${who}.${limits} Call plan_and_run, then wait. Do not start until approve_action says yes.`,
          },
        }],
      };
    },
  );

  return server;
}
