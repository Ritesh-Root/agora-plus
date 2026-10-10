import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import type { TaskItem } from '../interface/householdView';
import { formatClock, relativeDue, todayTasks } from './homeView';
import { cardClass, focusRing, pressable, SectionTitle } from './ui';

export function TodayCard({
  tasks,
  now,
  onComplete,
}: {
  tasks: TaskItem[];
  now: Date;
  onComplete: (id: string) => Promise<boolean>;
}) {
  const [doneLocal, setDoneLocal] = useState<Record<string, true>>({});
  const rows = todayTasks(tasks, now).filter((task) => !doneLocal[task.id]);

  useEffect(() => {
    setDoneLocal((current) => {
      const next = { ...current };
      let changed = false;
      for (const id of Object.keys(current)) {
        const task = tasks.find((item) => item.id === id);
        if (!task || task.status === 'done') {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [tasks]);

  const complete = async (task: TaskItem) => {
    setDoneLocal((current) => ({ ...current, [task.id]: true }));
    const ok = await onComplete(task.id);
    if (!ok) {
      setDoneLocal((current) => {
        const next = { ...current };
        delete next[task.id];
        return next;
      });
    }
  };

  return (
    <section className={`${cardClass} space-y-3`}>
      <SectionTitle>Today</SectionTitle>
      {rows.length === 0 ? <p className="text-sm text-zinc-500">No reminders today.</p> : null}
      <ul className="space-y-1">
        {rows.map((task) => {
          const overdue = task.dueAt ? relativeDue(task.dueAt, now.getTime()) === 'overdue' : false;
          const label = task.dueAt ? relativeDue(task.dueAt, now.getTime()) : '';
          return (
            <li key={task.id} className="flex items-center gap-1">
              <button
                type="button"
                role="checkbox"
                aria-checked={false}
                aria-label={`Mark ${task.title} done`}
                onClick={() => void complete(task)}
                className={`grid h-10 w-10 shrink-0 place-items-center ${focusRing} ${pressable}`}
              >
                <span className="grid h-5 w-5 place-items-center rounded-full border border-zinc-300 bg-paper">
                  <Check size={12} strokeWidth={1.75} className="text-transparent" aria-hidden="true" />
                </span>
              </button>
              <div className="min-w-0 flex-1 py-1">
                <p className="text-sm text-ink text-pretty">{task.title}</p>
                <p className="text-[12px] tabular-nums text-zinc-500">
                  {[task.dueAt ? formatClock(task.dueAt) : '', task.who ?? ''].filter(Boolean).join(' · ')}
                </p>
              </div>
              {label ? (
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[12px] tabular-nums ${overdue ? 'bg-coral/10 text-coral' : 'text-zinc-500'}`}>{label}</span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
