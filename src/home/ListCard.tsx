import { useEffect, useState, type FormEvent } from 'react';
import { Check, X } from 'lucide-react';
import type { TaskItem } from '../interface/householdView';
import { formatDay } from './homeView';
import { cardClass, fieldClass, focusRing, pressable, quietButton, SectionTitle } from './ui';

type View = 'open' | 'done' | 'removed';

export function ListCard({
  name,
  tasks,
  doneLabel,
  clearLabel,
  list,
  onAdd,
  onComplete,
  onReopen,
  onRemove,
}: {
  name: string;
  tasks: TaskItem[];
  doneLabel: string;
  clearLabel: string;
  list?: string;
  onAdd: (title: string, list?: string) => Promise<boolean>;
  onComplete: (id: string) => Promise<boolean>;
  onReopen: (id: string) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState('');
  const [view, setView] = useState<Record<string, View>>({});

  useEffect(() => {
    setView((current) => {
      const next = { ...current };
      let changed = false;
      for (const [id, status] of Object.entries(current)) {
        if (status === 'removed') {
          if (!tasks.some((task) => task.id === id)) {
            delete next[id];
            changed = true;
          }
          continue;
        }
        const task = tasks.find((item) => item.id === id);
        if (task && task.status === status) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [tasks]);

  const shown = tasks.filter((task) => view[task.id] !== 'removed');
  const stateOf = (task: TaskItem): 'open' | 'done' => {
    const override = view[task.id];
    if (override === 'open' || override === 'done') return override;
    return task.status === 'done' ? 'done' : 'open';
  };
  const open = shown.filter((task) => stateOf(task) === 'open');
  const done = shown.filter((task) => stateOf(task) === 'done');

  const setStatus = (id: string, status: View) => setView((current) => ({ ...current, [id]: status }));
  const clearStatus = (id: string) => setView((current) => {
    const next = { ...current };
    delete next[id];
    return next;
  });

  const toggle = async (task: TaskItem) => {
    const doneNow = stateOf(task) === 'done';
    setStatus(task.id, doneNow ? 'open' : 'done');
    const ok = doneNow ? await onReopen(task.id) : await onComplete(task.id);
    if (!ok) clearStatus(task.id);
  };

  const remove = async (task: TaskItem) => {
    setStatus(task.id, 'removed');
    const ok = await onRemove(task.id);
    if (!ok) clearStatus(task.id);
  };

  const clearDone = async () => {
    for (const task of done) setStatus(task.id, 'removed');
    for (const task of done) {
      const ok = await onRemove(task.id);
      if (!ok) clearStatus(task.id);
    }
  };

  const add = async (event: FormEvent) => {
    event.preventDefault();
    const title = draft.trim();
    if (!title) return;
    const ok = await onAdd(title, list);
    if (ok) setDraft('');
  };

  return (
    <section className={`${cardClass} space-y-3`}>
      <SectionTitle>{name}</SectionTitle>
      <ul className="space-y-1">
        {open.map((task) => (
          <Row key={task.id} task={task} done={false} onToggle={() => void toggle(task)} onRemove={() => void remove(task)} />
        ))}
      </ul>
      {open.length === 0 && done.length === 0 ? <p className="text-sm text-zinc-500">Nothing here yet.</p> : null}
      {done.length > 0 ? (
        <details className="group/basket">
          <summary className={`cursor-pointer text-[13px] text-zinc-500 ${focusRing}`}>{doneLabel} ({done.length})</summary>
          <ul className="mt-2 space-y-1">
            {done.map((task) => (
              <Row key={task.id} task={task} done onToggle={() => void toggle(task)} onRemove={() => void remove(task)} />
            ))}
          </ul>
          <button type="button" onClick={() => void clearDone()} className={`mt-2 ${quietButton}`}>{clearLabel}</button>
        </details>
      ) : null}
      <form onSubmit={(event) => void add(event)} className="flex gap-2">
        <input
          aria-label={name === 'Shopping' ? 'Add an item' : `Add to ${name}`}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Add an item"
          className={fieldClass}
        />
        <button type="submit" disabled={!draft.trim()} className={quietButton}>Add</button>
      </form>
    </section>
  );
}

function Row({
  task,
  done,
  onToggle,
  onRemove,
}: {
  task: TaskItem;
  done: boolean;
  onToggle: () => void;
  onRemove: () => void;
}) {
  return (
    <li className="group flex items-center gap-1">
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={done ? `Mark ${task.title} not done` : `Mark ${task.title} done`}
        onClick={onToggle}
        className={`grid h-10 w-10 shrink-0 place-items-center ${focusRing} ${pressable}`}
      >
        <span className={`grid h-5 w-5 place-items-center rounded-full border ${done ? 'border-sage bg-sage text-paper' : 'border-zinc-300 bg-paper text-transparent'}`}>
          <Check size={12} strokeWidth={1.75} aria-hidden="true" />
        </span>
      </button>
      <div className="min-w-0 flex-1">
        <p className={`text-sm text-pretty ${done ? 'text-zinc-500 line-through' : 'text-ink'}`}>{task.title}</p>
        {task.who || task.dueAt || task.due ? (
          <p className="text-[12px] tabular-nums text-zinc-500">
            {[task.dueAt ? formatDay(task.dueAt) : task.due ?? '', task.who ?? ''].filter(Boolean).join(' · ')}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        aria-label={`Remove ${task.title}`}
        onClick={onRemove}
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-zinc-500 transition-opacity duration-150 motion-reduce:transition-none [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100 ${focusRing} ${pressable}`}
      >
        <X size={18} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </li>
  );
}
