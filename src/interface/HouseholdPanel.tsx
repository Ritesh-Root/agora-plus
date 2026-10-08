import { X } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  emptySnapshot,
  formatDueAt,
  groupTasks,
  parseSnapshot,
  type Snapshot,
} from './householdView';

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

const fieldClass = 'w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-ink outline-none focus:border-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink';

function NameChip({ name }: { name: string }) {
  return (
    <span className="inline-flex max-w-full items-center rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-zinc-700">
      {name}
    </span>
  );
}

const HouseholdPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot);
  const [locked, setLocked] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [memoryText, setMemoryText] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const result = await send('/api/household', 'GET');
      if (result.status === 401) {
        setLocked(true);
        return;
      }
      const next = parseSnapshot(result.body);
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
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (pendingDelete) {
        setPendingDelete(null);
        return;
      }
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, pendingDelete]);

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
    setPendingDelete(null);
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

  const taskGroups = groupTasks(snapshot.tasks);

  return createPortal(
    <div className="pointer-events-auto fixed inset-0 z-[100] flex items-center justify-center overflow-hidden p-4 sm:p-6" data-testid="household-panel">
      <div onClick={onClose} className="absolute inset-0 bg-zinc-100/80 backdrop-blur-xl" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="household-heading"
        tabIndex={-1}
        className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-[40px] border border-zinc-200/70 bg-white shadow-[0_32px_64px_-12px_rgba(23,21,15,0.12)] focus:outline-none"
      >
        <div className="flex items-start justify-between gap-3 px-8 pb-2 pt-8 md:px-10">
          <div>
            <h2 id="household-heading" className="text-3xl font-black tracking-tight text-ink">Household</h2>
            <p className="mt-1 text-sm font-medium text-zinc-500">Memory, tasks, and approvals on this server.</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-zinc-700 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink" aria-label="Close household">
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
                <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Memory</h3>
                <ul className="space-y-2">
                  {snapshot.memory.map((entry) => (
                    <li key={entry.id} className="rounded-2xl border border-zinc-200 px-3 py-2">
                      {entry.who ? <div className="mb-2"><NameChip name={entry.who} /></div> : null}
                      <input
                        aria-label="Memory text"
                        value={drafts[entry.id] ?? entry.text}
                        onChange={(event) => setDrafts((current) => ({ ...current, [entry.id]: event.target.value }))}
                        className={fieldClass}
                      />
                      <div className="mt-2 flex min-h-6 items-center gap-3">
                        <button type="button" onClick={() => void saveMemory(entry.id)} className="min-h-6 text-[10px] font-black uppercase tracking-widest text-ink">Save</button>
                        {pendingDelete === entry.id ? (
                          <span className="inline-flex min-h-6 items-center gap-2 text-[11px] text-ink">
                            Delete?
                            <button type="button" onClick={() => void removeMemory(entry.id)} className="min-h-6 font-black uppercase tracking-widest text-[#7f1d1d]">Yes</button>
                            <button type="button" onClick={() => setPendingDelete(null)} className="min-h-6 font-black uppercase tracking-widest text-ink">No</button>
                          </span>
                        ) : (
                          <button type="button" onClick={() => setPendingDelete(entry.id)} className="min-h-6 text-[10px] font-black uppercase tracking-widest text-[#7f1d1d]">Delete</button>
                        )}
                      </div>
                    </li>
                  ))}
                  {snapshot.memory.length === 0 ? <li className="text-sm text-zinc-500">Nothing saved yet.</li> : null}
                </ul>
                <form onSubmit={(event) => void addMemory(event)} className="flex gap-2">
                  <input aria-label="New memory" value={memoryText} onChange={(event) => setMemoryText(event.target.value)} placeholder="Add a fact" className={fieldClass} />
                  <button type="submit" disabled={!memoryText.trim()} className="rounded-full bg-ink px-4 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-40">Add</button>
                </form>
              </section>

              <section className="space-y-3">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Tasks</h3>
                {snapshot.tasks.length === 0 ? <p className="text-sm text-zinc-500">No tasks yet.</p> : null}
                {taskGroups.map((group) => (
                  <div key={group.name} className="space-y-2">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-500">{group.name}</h4>
                    <ul className="space-y-2">
                      {group.tasks.map((task) => (
                        <li key={task.id} className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 px-3 py-2">
                          <span className={`text-sm ${task.status === 'done' ? 'text-zinc-500 line-through' : 'text-ink'}`}>
                            {task.who ? <NameChip name={task.who} /> : null}
                            {task.who ? ' ' : ''}
                            {task.title}
                            {task.due ? ` · ${task.due}` : ''}
                            {task.dueAt ? ` · ${formatDueAt(task.dueAt)}` : ''}
                          </span>
                          {task.status === 'open' ? (
                            <button type="button" onClick={() => void complete(task.id)} className="min-h-6 shrink-0 text-[10px] font-black uppercase tracking-widest text-ink">Complete</button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                <form onSubmit={(event) => void addTaskItem(event)} className="flex gap-2">
                  <input aria-label="New task" value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} placeholder="Add a task" className={fieldClass} />
                  <button type="submit" disabled={!taskTitle.trim()} className="rounded-full bg-ink px-4 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-40">Add</button>
                </form>
              </section>

              <section className="space-y-3">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Pending approvals</h3>
                {snapshot.pendingApprovals.length === 0 ? <p className="text-sm text-zinc-500">Nothing is waiting.</p> : null}
                {snapshot.pendingApprovals.map((approval) => (
                  <article key={approval.id} className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
                    <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">{approval.kind}</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm font-black text-ink">{approval.summary}</p>
                    <div className="mt-3 flex gap-2">
                      <button type="button" onClick={() => void decide(approval.id, 'approve')} className="flex-1 rounded-full bg-ink py-2 text-[10px] font-black uppercase tracking-widest text-white">Approve</button>
                      <button type="button" onClick={() => void decide(approval.id, 'reject')} className="flex-1 rounded-full border border-zinc-200 py-2 text-[10px] font-black uppercase tracking-widest text-ink">Decline</button>
                    </div>
                  </article>
                ))}
              </section>

              <section className="space-y-3">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Recent runs</h3>
                {snapshot.recentRuns.length === 0 ? <p className="text-sm text-zinc-500">No saved runs yet.</p> : null}
                <ul className="space-y-2">
                  {snapshot.recentRuns.map((run) => (
                    <li key={run.id} className="rounded-2xl border border-zinc-200 px-3 py-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">{run.status}</p>
                      <p className="text-sm text-ink">{run.brief || 'Household run'}</p>
                      {run.spokenSummary && run.spokenSummary !== run.brief ? (
                        <p className="mt-1 text-sm text-zinc-600">{run.spokenSummary}</p>
                      ) : null}
                      <a href={`/api/runs/${encodeURIComponent(run.id)}/document`} className="mt-1 inline-block text-[10px] font-black uppercase tracking-widest text-ink underline">Download .md</a>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="space-y-2">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Briefing</h3>
                {snapshot.suggestions.length === 0 ? <p className="text-sm text-zinc-500">Nothing to suggest.</p> : null}
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
