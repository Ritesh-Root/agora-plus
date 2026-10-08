import { X } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface MemoryItem {
  id: string;
  text: string;
  tags: string[];
}

interface TaskItem {
  id: string;
  title: string;
  due?: string;
  status: string;
}

interface ApprovalItem {
  id: string;
  summary: string;
  kind: string;
}

interface RunItem {
  id: string;
  brief: string;
  status: string;
}

interface Snapshot {
  memory: MemoryItem[];
  tasks: TaskItem[];
  pendingApprovals: ApprovalItem[];
  recentRuns: RunItem[];
  suggestions: string[];
}

const empty: Snapshot = { memory: [], tasks: [], pendingApprovals: [], recentRuns: [], suggestions: [] };

function asSnapshot(value: unknown): Snapshot | null {
  if (!value || typeof value !== 'object') return null;
  const body = value as Partial<Snapshot>;
  return {
    memory: Array.isArray(body.memory) ? body.memory : [],
    tasks: Array.isArray(body.tasks) ? body.tasks : [],
    pendingApprovals: Array.isArray(body.pendingApprovals) ? body.pendingApprovals : [],
    recentRuns: Array.isArray(body.recentRuns) ? body.recentRuns : [],
    suggestions: Array.isArray(body.suggestions) ? body.suggestions.filter((item) => typeof item === 'string') : [],
  };
}

async function send(path: string, method: string, body?: unknown): Promise<{ status: number; body: unknown }> {
  const response = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }
  return { status: response.status, body: parsed };
}

const fieldClass = 'w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-ink outline-none focus:border-butter-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-butter-600';

const HouseholdPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [snapshot, setSnapshot] = useState<Snapshot>(empty);
  const [locked, setLocked] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [memoryText, setMemoryText] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const result = await send('/api/household', 'GET');
      if (result.status === 401) {
        setLocked(true);
        return;
      }
      const next = asSnapshot(result.body);
      if (next) {
        setLocked(false);
        setSnapshot(next);
      }
    } catch {
      setNote('The household could not be reached.');
    }
  }, []);

  useEffect(() => {
    if (locked) return;
    void load();
    const timer = window.setInterval(() => void load(), 2000);
    return () => window.clearInterval(timer);
  }, [load, locked]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const unlock = async (event: React.FormEvent) => {
    event.preventDefault();
    const result = await send('/api/session', 'POST', { passcode });
    if (result.status !== 200) {
      setNote('That passcode is not right.');
      return;
    }
    setPasscode('');
    setNote(null);
    setLocked(false);
    await load();
  };

  const addMemory = async (event: React.FormEvent) => {
    event.preventDefault();
    const result = await send('/api/memory', 'POST', { text: memoryText, tags: [] });
    if (result.status !== 200) {
      setNote('That memory was not saved.');
      return;
    }
    setMemoryText('');
    await load();
  };

  const saveMemory = async (id: string) => {
    const text = drafts[id];
    if (text === undefined) return;
    const result = await send(`/api/memory/${encodeURIComponent(id)}`, 'PATCH', { text });
    if (result.status !== 200) {
      setNote('That memory was not saved.');
      return;
    }
    setDrafts((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    await load();
  };

  const removeMemory = async (id: string) => {
    const result = await send(`/api/memory/${encodeURIComponent(id)}`, 'DELETE');
    if (result.status !== 200) setNote('That memory is already gone.');
    await load();
  };

  const addTaskItem = async (event: React.FormEvent) => {
    event.preventDefault();
    const result = await send('/api/tasks', 'POST', { title: taskTitle });
    if (result.status !== 200) {
      setNote('That task was not added.');
      return;
    }
    setTaskTitle('');
    await load();
  };

  const complete = async (id: string) => {
    await send(`/api/tasks/${encodeURIComponent(id)}/complete`, 'POST');
    await load();
  };

  const decide = async (id: string, decision: 'approve' | 'reject') => {
    const result = await send(`/api/approvals/${encodeURIComponent(id)}`, 'POST', { decision });
    if (result.status !== 200) setNote('That approval is no longer waiting.');
    await load();
  };

  return createPortal(
    <div className="pointer-events-auto fixed inset-0 z-[100] flex items-center justify-center overflow-hidden p-4 sm:p-6" data-testid="household-panel">
      <div onClick={onClose} className="absolute inset-0 bg-zinc-100/80 backdrop-blur-xl" />
      <div className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-[40px] border border-zinc-200/70 bg-white shadow-[0_32px_64px_-12px_rgba(23,21,15,0.12)]">
        <div className="flex items-start justify-between gap-3 px-8 pb-2 pt-8 md:px-10">
          <div>
            <h2 className="text-3xl font-black tracking-tight text-ink">Household</h2>
            <p className="mt-1 text-sm font-medium text-zinc-400">Memory, tasks, and approvals on this server.</p>
          </div>
          <button type="button" onClick={onClose} className="text-zinc-300 hover:text-zinc-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-butter-600" aria-label="Close household">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 space-y-8 overflow-y-auto px-8 py-6 md:px-10">
          {locked ? (
            <form onSubmit={(event) => void unlock(event)} className="space-y-3">
              <label htmlFor="household-passcode" className="text-sm font-bold text-ink">Household passcode</label>
              <input id="household-passcode" type="password" autoComplete="off" value={passcode} onChange={(event) => setPasscode(event.target.value)} className={fieldClass} />
              <button type="submit" className="rounded-full bg-ink px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white">Unlock</button>
            </form>
          ) : (
            <>
              <section className="space-y-3">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Memory</h3>
                <ul className="space-y-2">
                  {snapshot.memory.map((entry) => (
                    <li key={entry.id} className="rounded-2xl border border-zinc-200 px-3 py-2">
                      <input
                        aria-label="Memory text"
                        value={drafts[entry.id] ?? entry.text}
                        onChange={(event) => setDrafts((current) => ({ ...current, [entry.id]: event.target.value }))}
                        className={fieldClass}
                      />
                      <div className="mt-2 flex gap-3">
                        <button type="button" onClick={() => void saveMemory(entry.id)} className="text-[10px] font-black uppercase tracking-widest text-ink">Save</button>
                        <button type="button" onClick={() => void removeMemory(entry.id)} className="text-[10px] font-black uppercase tracking-widest text-red-400">Delete</button>
                      </div>
                    </li>
                  ))}
                  {snapshot.memory.length === 0 ? <li className="text-sm text-zinc-400">Nothing saved yet.</li> : null}
                </ul>
                <form onSubmit={(event) => void addMemory(event)} className="flex gap-2">
                  <input aria-label="New memory" value={memoryText} onChange={(event) => setMemoryText(event.target.value)} placeholder="Add a fact" className={fieldClass} />
                  <button type="submit" disabled={!memoryText.trim()} className="rounded-full bg-ink px-4 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-40">Add</button>
                </form>
              </section>

              <section className="space-y-3">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Tasks</h3>
                <ul className="space-y-2">
                  {snapshot.tasks.map((task) => (
                    <li key={task.id} className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 px-3 py-2">
                      <span className={`text-sm ${task.status === 'done' ? 'text-zinc-400 line-through' : 'text-ink'}`}>
                        {task.title}{task.due ? ` · ${task.due}` : ''}
                      </span>
                      {task.status === 'open' ? (
                        <button type="button" onClick={() => void complete(task.id)} className="text-[10px] font-black uppercase tracking-widest text-ink">Complete</button>
                      ) : null}
                    </li>
                  ))}
                  {snapshot.tasks.length === 0 ? <li className="text-sm text-zinc-400">No tasks yet.</li> : null}
                </ul>
                <form onSubmit={(event) => void addTaskItem(event)} className="flex gap-2">
                  <input aria-label="New task" value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} placeholder="Add a task" className={fieldClass} />
                  <button type="submit" disabled={!taskTitle.trim()} className="rounded-full bg-ink px-4 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-40">Add</button>
                </form>
              </section>

              <section className="space-y-3">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Pending approvals</h3>
                {snapshot.pendingApprovals.length === 0 ? <p className="text-sm text-zinc-400">Nothing is waiting.</p> : null}
                {snapshot.pendingApprovals.map((approval) => (
                  <article key={approval.id} className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
                    <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">{approval.kind}</p>
                    <p className="mt-1 text-sm font-black text-ink">{approval.summary}</p>
                    <div className="mt-3 flex gap-2">
                      <button type="button" onClick={() => void decide(approval.id, 'approve')} className="flex-1 rounded-full bg-ink py-2 text-[10px] font-black uppercase tracking-widest text-white">Approve</button>
                      <button type="button" onClick={() => void decide(approval.id, 'reject')} className="flex-1 rounded-full border border-zinc-200 py-2 text-[10px] font-black uppercase tracking-widest text-ink">Decline</button>
                    </div>
                  </article>
                ))}
              </section>

              <section className="space-y-3">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Recent runs</h3>
                {snapshot.recentRuns.length === 0 ? <p className="text-sm text-zinc-400">No saved runs yet.</p> : null}
                <ul className="space-y-2">
                  {snapshot.recentRuns.map((run) => (
                    <li key={run.id} className="rounded-2xl border border-zinc-200 px-3 py-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">{run.status}</p>
                      <p className="text-sm text-ink">{run.brief}</p>
                      <a href={`/api/runs/${encodeURIComponent(run.id)}/document`} className="mt-1 inline-block text-[10px] font-black uppercase tracking-widest text-ink underline">Download .md</a>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="space-y-2">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Briefing</h3>
                {snapshot.suggestions.length === 0 ? <p className="text-sm text-zinc-400">Nothing to suggest.</p> : null}
                <ul className="space-y-1">
                  {snapshot.suggestions.map((suggestion) => (
                    <li key={suggestion} className="text-sm text-ink">{suggestion}</li>
                  ))}
                </ul>
              </section>
            </>
          )}
          {note ? <p className="text-sm text-zinc-500">{note}</p> : null}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default HouseholdPanel;
