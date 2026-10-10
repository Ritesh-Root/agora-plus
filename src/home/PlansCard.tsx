import { Check } from 'lucide-react';
import type { RunItem } from '../interface/householdView';
import {
  briefTitle,
  householdRuns,
  personTint,
  planIsRunning,
  planTone,
  relativePast,
  roleLabel,
  safetySpans,
  taskWorkLabel,
  TEAM,
  wholeSentences,
} from './homeView';
import { cardClass, quietButton, SectionTitle } from './ui';

const PILL: Record<string, string> = {
  working: 'bg-butter text-ink motion-safe:animate-pulse motion-reduce:animate-none',
  done: 'bg-sage/15 text-sage',
  stopped: 'bg-zinc-100 text-zinc-500',
  attention: 'bg-coral/10 text-coral',
};

export function PlansCard({
  runs,
  now,
  onRead,
}: {
  runs: RunItem[];
  now: number;
  onRead: (id: string) => void;
}) {
  const shown = householdRuns(runs, 3);
  return (
    <section className={`${cardClass} space-y-4`}>
      <div className="space-y-1">
        <SectionTitle>Plans</SectionTitle>
        <p className="text-[13px] text-zinc-500">Ask for a plan and the team works on it after your yes. Keeper checks it against what the family saved.</p>
      </div>
      {shown.length === 0 ? <p className="text-sm text-zinc-500">No plans yet. Try "Plan dinners for this week".</p> : null}
      <ul className="divide-y divide-ink/5">
        {shown.map((run) => {
          const tone = planTone(run.status, run.error);
          const running = planIsRunning(run.status, run.error);
          const when = relativePast(run.finishedAt ?? run.startedAt, now);
          return (
            <li key={run.id} className="space-y-3 py-4 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="min-w-0 flex-1 text-[15px] font-medium text-ink text-balance">{briefTitle(run.brief) || 'Household plan'}</p>
                <span className={`rounded-full px-2.5 py-1 text-[12px] font-medium ${PILL[tone.tone]}`}>{tone.label}</span>
                {when ? <span className="text-[12px] tabular-nums text-zinc-500">{when}</span> : null}
              </div>
              {running ? <TeamAtWork run={run} /> : <FinishedPlan run={run} onRead={onRead} />}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Avatar({ name, size = 'h-8 w-8 text-sm' }: { name: string; size?: string }) {
  return (
    <span className={`grid shrink-0 place-items-center rounded-full font-medium text-ink ring-2 ring-paper ${size}`} style={{ backgroundColor: personTint(name) }} aria-hidden="true">
      {name.charAt(0)}
    </span>
  );
}

function TeamAtWork({ run }: { run: RunItem }) {
  const tasks = run.tasks ?? [];
  return (
    <div className="space-y-3 rounded-[1.25rem] bg-zinc-50 p-3">
      <ul className="flex flex-wrap gap-x-4 gap-y-2">
        {TEAM.map((member) => (
          <li key={member.name} className="flex items-center gap-2">
            <Avatar name={member.name} />
            <span className="text-[13px] text-ink">{member.name} <span className="text-zinc-500">{member.blurb}</span></span>
          </li>
        ))}
      </ul>
      {tasks.length === 0 ? <p className="text-sm text-zinc-500">Agora is splitting the plan into steps…</p> : null}
      <ol className="space-y-1.5">
        {tasks.map((task) => {
          const role = roleLabel(task.role);
          const label = taskWorkLabel(task.status);
          return (
            <li key={task.id || task.title} className="flex items-center gap-2 text-sm text-ink">
              <Avatar name={role} size="h-6 w-6 text-[12px]" />
              <span className="min-w-0 flex-1 text-pretty"><span className="text-zinc-500">{role} · </span>{task.title}</span>
              <span className={`shrink-0 text-[12px] ${label === 'Done' ? 'text-sage' : label === 'Needs help' ? 'text-coral' : label === 'Working' ? 'text-ink' : 'text-zinc-500'}`}>{label}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function FinishedPlan({ run, onRead }: { run: RunItem; onRead: (id: string) => void }) {
  const lead = wholeSentences(run.spokenSummary ?? '');
  const spans = safetySpans(lead);
  const tasks = run.tasks ?? [];
  const roles = TEAM.map((member) => member.name).filter((name) => name === 'Agora' || tasks.some((task) => roleLabel(task.role) === name));
  const doneCount = tasks.filter((task) => task.status === 'done').length;
  const finished = run.status === 'complete' || run.status === 'needs_revision';
  return (
    <div className="space-y-3">
      {lead ? (
        <p className="text-[15px] leading-relaxed text-ink text-pretty">
          {spans.map((part, index) => (
            <span key={`${part.text}-${index}`} className={part.safety ? 'font-medium text-coral' : undefined}>{part.text}</span>
          ))}
        </p>
      ) : null}
      {run.error ? <p className="text-[13px] text-coral">{run.error}</p> : null}
      <div className="flex flex-wrap items-center gap-3">
        {tasks.length > 0 ? (
          <div className="flex items-center gap-2" title={`Made by ${roles.join(', ')}`}>
            <div className="flex -space-x-2">
              {roles.map((name) => <Avatar key={name} name={name} size="h-7 w-7 text-[12px]" />)}
            </div>
            <span className="inline-flex items-center gap-1 text-[12px] text-zinc-500">
              {finished ? <Check size={14} strokeWidth={1.75} className="text-sage" aria-hidden="true" /> : null}
              {finished
                ? `${tasks.length} ${tasks.length === 1 ? 'step' : 'steps'} by ${roles.join(', ')}`
                : `${doneCount} of ${tasks.length} steps done`}
            </span>
          </div>
        ) : null}
        {finished ? (
          <div className="ml-auto flex flex-wrap gap-2">
            <button type="button" onClick={() => onRead(run.id)} className={quietButton}>Read plan</button>
            <a href={`/api/runs/${encodeURIComponent(run.id)}/document`} download className={`inline-flex items-center ${quietButton}`}>Download</a>
          </div>
        ) : null}
      </div>
    </div>
  );
}
