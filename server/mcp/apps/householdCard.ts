import {
  App,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  type McpUiHostContext,
} from '@modelcontextprotocol/ext-apps';
import { describeTask, failedCardState } from './householdCardState';

interface El {
  textContent: string;
  className: string;
  append(...children: El[]): void;
  replaceChildren(...children: El[]): void;
  addEventListener(type: 'click', listener: () => void): void;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
}

interface Doc {
  getElementById(id: string): El | null;
  createElement(tag: string): El;
  documentElement: {
    style: { setProperty(name: string, value: string): void };
  };
}

interface TaskItem {
  id: string;
  title: string;
  due?: string;
  dueAt?: string;
  who?: string;
  list?: string;
}

interface ApprovalItem {
  id: string;
  summary: string;
}

const doc = (globalThis as unknown as { document: Doc }).document;

const state: {
  speech: string;
  items: string[] | null;
  tasks: TaskItem[] | null;
  approvals: ApprovalItem[] | null;
  note: string;
} = {
  speech: 'Loading the household…',
  items: null,
  tasks: null,
  approvals: null,
  note: '',
};

let busy = false;

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function strings(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const lines: string[] = [];
  for (const item of value) {
    if (typeof item === 'string') lines.push(item);
  }
  return lines;
}

function tasksOf(value: unknown): TaskItem[] | null {
  if (!Array.isArray(value)) return null;
  const tasks: TaskItem[] = [];
  for (const item of value) {
    const row = record(item);
    if (!row || typeof row.id !== 'string' || typeof row.title !== 'string') continue;
    if (row.status !== 'open') continue;
    const task: TaskItem = { id: row.id, title: row.title };
    if (typeof row.due === 'string' && row.due) task.due = row.due;
    if (typeof row.dueAt === 'string' && row.dueAt) task.dueAt = row.dueAt;
    if (typeof row.who === 'string' && row.who) task.who = row.who;
    if (typeof row.list === 'string' && row.list) task.list = row.list;
    tasks.push(task);
  }
  return tasks;
}

function approvalsOf(value: unknown): ApprovalItem[] | null {
  if (!Array.isArray(value)) return null;
  const approvals: ApprovalItem[] = [];
  for (const item of value) {
    const row = record(item);
    if (!row || typeof row.id !== 'string' || typeof row.summary !== 'string') continue;
    approvals.push({ id: row.id, summary: row.summary });
  }
  return approvals;
}

function absorb(value: unknown): void {
  const content = record(value);
  if (!content) return;
  if (typeof content.speech === 'string') state.speech = content.speech;
  const items = strings(content.items);
  if (items) state.items = items;
  const tasks = tasksOf(content.tasks);
  if (tasks) state.tasks = tasks;
  const approvals = approvalsOf(content.approvals);
  if (approvals) state.approvals = approvals;
}

function speechFrom(result: { structuredContent?: unknown; content?: unknown }): string {
  const structured = record(result.structuredContent);
  if (structured && typeof structured.speech === 'string') return structured.speech;
  if (!Array.isArray(result.content)) return '';
  for (const block of result.content) {
    const item = record(block);
    if (item?.type === 'text' && typeof item.text === 'string') return item.text;
  }
  return '';
}

function paint(ctx: McpUiHostContext | undefined): void {
  if (!ctx) return;
  if (ctx.theme === 'light' || ctx.theme === 'dark') applyDocumentTheme(ctx.theme);
  if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
  const fonts = ctx.styles?.css?.fonts;
  if (fonts) applyHostFonts(fonts);
  const insets = ctx.safeAreaInsets;
  if (!insets) return;
  const root = doc.documentElement.style;
  root.setProperty('--safe-top', `${insets.top}px`);
  root.setProperty('--safe-right', `${insets.right}px`);
  root.setProperty('--safe-bottom', `${insets.bottom}px`);
  root.setProperty('--safe-left', `${insets.left}px`);
}

function list(id: string): El | null {
  return doc.getElementById(id);
}

function fill(id: string, rows: El[], empty: string): void {
  const target = list(id);
  if (!target) return;
  if (rows.length === 0) {
    const item = doc.createElement('li');
    const copy = doc.createElement('p');
    copy.textContent = empty;
    item.append(copy);
    target.replaceChildren(item);
    return;
  }
  target.replaceChildren(...rows);
}

function button(label: string, kind: 'primary' | 'quiet', onClick: () => void): El {
  const control = doc.createElement('button');
  control.className = kind;
  control.textContent = label;
  control.setAttribute('type', 'button');
  if (busy) control.setAttribute('disabled', '');
  else control.removeAttribute('disabled');
  control.addEventListener('click', () => {
    if (busy) return;
    onClick();
  });
  return control;
}

function taskLine(task: TaskItem): string {
  return describeTask(task);
}

function applyFailure(message: string): void {
  const failed = failedCardState(message);
  state.speech = failed.speech;
  state.items = failed.items;
  state.tasks = failed.tasks;
  state.approvals = failed.approvals;
  state.note = failed.note;
}

function render(): void {
  const speech = list('speech');
  if (speech) speech.textContent = state.speech;
  const note = list('note');
  if (note) note.textContent = state.note;
  const items = (state.items ?? []).map((line) => {
    const item = doc.createElement('li');
    const copy = doc.createElement('p');
    copy.textContent = line;
    item.append(copy);
    return item;
  });
  fill('items', items, state.items ? 'Nothing in the briefing.' : 'Loading the briefing…');
  const tasks = (state.tasks ?? []).map((task) => {
    const item = doc.createElement('li');
    const copy = doc.createElement('p');
    copy.textContent = taskLine(task);
    const actions = doc.createElement('div');
    actions.className = 'actions';
    actions.append(button('Done', 'primary', () => { void markDone(task.id); }));
    item.append(copy, actions);
    return item;
  });
  fill('tasks', tasks, state.tasks ? 'No open tasks.' : 'Loading tasks…');
  const approvals = (state.approvals ?? []).map((approval) => {
    const item = doc.createElement('li');
    const copy = doc.createElement('p');
    copy.textContent = approval.summary;
    const actions = doc.createElement('div');
    actions.className = 'actions';
    actions.append(
      button('Approve', 'primary', () => { void decide(approval.id, 'approve'); }),
      button('Decline', 'quiet', () => { void decide(approval.id, 'reject'); }),
    );
    item.append(copy, actions);
    return item;
  });
  fill('approvals', approvals, state.approvals ? 'No approvals waiting.' : 'Loading approvals…');
}

const app = new App({ name: 'AGORA+ Household', version: '0.1.0' });

app.ontoolresult = (params) => {
  absorb(params.structuredContent);
  render();
};

app.onhostcontextchanged = (ctx) => {
  paint(ctx);
};

async function callTool(name: string, args: Record<string, unknown>): Promise<{ ok: boolean; speech: string; content?: unknown }> {
  const result = await app.callServerTool({ name, arguments: args });
  return {
    ok: result.isError !== true,
    speech: speechFrom(result),
    content: result.structuredContent,
  };
}

async function refresh(): Promise<void> {
  let briefing: { ok: boolean; speech: string; content?: unknown };
  let tasks: { ok: boolean; speech: string; content?: unknown };
  try {
    [briefing, tasks] = await Promise.all([
      callTool('daily_briefing', {}),
      callTool('list_tasks', { status: 'open' }),
    ]);
  } catch {
    applyFailure('The household could not be loaded.');
    render();
    return;
  }
  if (!briefing.ok || !tasks.ok) {
    applyFailure(briefing.speech || tasks.speech || 'The household could not be loaded.');
    render();
    return;
  }
  absorb(briefing.content);
  absorb(tasks.content);
  state.note = '';
  render();
}

async function markDone(id: string): Promise<void> {
  busy = true;
  state.note = 'Saving…';
  render();
  try {
    const result = await callTool('complete_task', { taskIdOrTitle: id });
    if (!result.ok) {
      state.note = result.speech || 'That task could not be completed.';
      state.speech = state.note;
      return;
    }
    await refresh();
    if (!state.note) state.note = result.speech;
  } catch {
    state.note = 'The host could not reach the household.';
    state.speech = state.note;
  } finally {
    busy = false;
    render();
  }
}

async function decide(id: string, decision: 'approve' | 'reject'): Promise<void> {
  busy = true;
  state.note = decision === 'approve' ? 'Approving…' : 'Declining…';
  render();
  try {
    const result = await callTool('approve_action', { approvalId: id, decision });
    if (!result.ok) {
      state.note = result.speech || 'That approval could not be resolved.';
      state.speech = state.note;
      return;
    }
    await refresh();
    if (!state.note) state.note = result.speech;
  } catch {
    state.note = 'The host could not reach the household.';
    state.speech = state.note;
  } finally {
    busy = false;
    render();
  }
}

void app.connect().then(async () => {
  paint(app.getHostContext());
  try {
    await refresh();
  } catch {
    applyFailure('The household could not be loaded.');
    render();
  }
}).catch(() => {
  state.speech = 'This card opens inside an MCP Apps host.';
  state.items = [];
  state.tasks = [];
  state.approvals = [];
  render();
});
