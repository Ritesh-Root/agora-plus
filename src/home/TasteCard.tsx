import { useEffect, useState, type FormEvent } from 'react';
import { Check, ChevronRight, Loader2, RotateCw, Sparkles } from 'lucide-react';
import { OCCASION_LABEL, type CouncilRequest, type CouncilResult, type TasteMember, type TasteOccasion } from '../../shared/taste';
import { relativePast } from './homeView';
import { OCCASION_ICON, PersonDot } from './tasteIcons';
import { AFFINITY_NOTE, ageLabel, buildCouncilRequest, lowestFitLine, needsLocation, OCCASIONS, progressSteps, resultKey } from './tasteView';
import type { TasteLoad } from './useTaste';
import { cardClass, fieldClass, focusRing, pressable, primaryButton, quietButton } from './ui';

/** How long each simulated progress line stays up. The server answers in one response, 5 to 20 s. */
export const STEP_MS = 1600;

export function TasteCard({
  load,
  recent,
  pending,
  error,
  now,
  onAsk,
  onOpen,
  onRetry,
}: {
  load: TasteLoad | null;
  recent: CouncilResult[];
  pending: boolean;
  error: string | null;
  now: number;
  onAsk: (request: CouncilRequest) => Promise<CouncilResult | null>;
  onOpen: (result: CouncilResult) => void;
  onRetry: () => void;
}) {
  const [occasion, setOccasion] = useState<TasteOccasion>('movie_night');
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(() => new Set());
  const [location, setLocation] = useState('');
  const [step, setStep] = useState(0);
  const [announce, setAnnounce] = useState('');
  const [failed, setFailed] = useState<CouncilResult | null>(null);

  const members = load?.kind === 'ready' ? load.snapshot.members : [];
  const included = members.filter((member) => !excluded.has(member.who));
  const steps = progressSteps(included.map((member) => member.who));

  useEffect(() => {
    if (!pending) {
      setStep(0);
      return;
    }
    const timer = window.setInterval(() => setStep((current) => Math.min(current + 1, steps.length - 1)), STEP_MS);
    return () => window.clearInterval(timer);
  }, [pending, steps.length]);

  if (!load || load.kind === 'missing' || load.kind === 'locked') {
    if (load) return null;
    return (
      <section aria-labelledby="taste-title" aria-busy="true" className={`${cardClass} space-y-2`}>
        <TasteHeader ready />
        <p className="text-sm text-zinc-500">Reading the family's favourites…</p>
      </section>
    );
  }

  if (load.kind === 'failed') {
    return (
      <section aria-labelledby="taste-title" className={`${cardClass} space-y-3`}>
        <TasteHeader ready={false} />
        <div className="flex flex-wrap items-center gap-3">
          <p className="min-w-0 flex-1 text-sm text-zinc-500">Taste Council unavailable right now.</p>
          <button type="button" onClick={onRetry} className={`inline-flex items-center gap-1.5 ${quietButton}`}>
            <RotateCw size={14} strokeWidth={1.75} aria-hidden="true" /> Try again
          </button>
        </div>
      </section>
    );
  }

  const { qlooReady } = load.snapshot;
  const toggle = (who: string) => {
    setExcluded((current) => {
      const next = new Set(current);
      if (next.has(who)) next.delete(who);
      else next.add(who);
      return next;
    });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending || included.length === 0) return;
    setFailed(null);
    setAnnounce('');
    const result = await onAsk(buildCouncilRequest(occasion, members, excluded, location));
    if (!result) return;
    if (result.picks.length === 0) {
      setFailed(result);
      setAnnounce(result.note || 'The council could not agree on anything.');
      return;
    }
    setAnnounce(`The council picked ${result.picks[0]?.name}.`);
    onOpen(result);
  };

  return (
    <section aria-labelledby="taste-title" data-testid="taste-card" className={`${cardClass} space-y-5`}>
      <TasteHeader ready={qlooReady} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,17rem)]">
        <form onSubmit={(event) => void submit(event)} className="min-w-0 space-y-5">
          <fieldset className="min-w-0">
            <legend className="text-[13px] font-medium text-ink">
              Who is in{members.length > 0 ? <span className="font-normal text-zinc-500"> · {included.length} of {members.length}</span> : null}
            </legend>
            {members.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-500 text-pretty">No favourites saved yet. Add one in Family, like “Mia loves Encanto” or “Dadi loves Raj Kapoor films”.</p>
            ) : (
              <ul className="mt-2 flex flex-wrap gap-2">
                {members.map((member) => (
                  <li key={member.who} className="min-w-0 max-w-full">
                    <MemberChip member={member} on={!excluded.has(member.who)} disabled={pending} onToggle={() => toggle(member.who)} />
                  </li>
                ))}
              </ul>
            )}
          </fieldset>

          <fieldset className="min-w-0">
            <legend className="text-[13px] font-medium text-ink">What are we choosing?</legend>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {OCCASIONS.map((value) => {
                const Icon = OCCASION_ICON[value];
                return (
                  <label key={value} className="relative min-w-0 cursor-pointer">
                    <input
                      type="radio"
                      name="taste-occasion"
                      value={value}
                      checked={occasion === value}
                      disabled={pending}
                      onChange={() => setOccasion(value)}
                      className="peer sr-only"
                    />
                    <span className="flex h-full min-h-12 items-center gap-2.5 rounded-2xl bg-zinc-50 px-3 py-2.5 text-[13px] leading-snug text-ink ring-1 ring-inset ring-ink/5 transition-colors duration-150 hover:bg-zinc-100 peer-checked:bg-butter peer-checked:font-medium peer-checked:ring-ink/10 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink peer-disabled:cursor-default motion-reduce:transition-none">
                      <Icon size={18} strokeWidth={1.75} className="shrink-0" aria-hidden="true" />
                      <span className="min-w-0 text-pretty">{OCCASION_LABEL[value]}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {needsLocation(occasion) ? (
            <div className="space-y-1.5">
              <label htmlFor="taste-location" className="block text-[13px] font-medium text-ink">Where <span className="font-normal text-zinc-500">(optional)</span></label>
              <input
                id="taste-location"
                value={location}
                disabled={pending}
                onChange={(event) => setLocation(event.target.value)}
                maxLength={80}
                placeholder="City or neighbourhood"
                autoComplete="address-level2"
                className={`${fieldClass} block w-full sm:max-w-sm`}
              />
            </div>
          ) : null}

          <div className="space-y-3">
            <button
              type="submit"
              disabled={pending || included.length === 0}
              aria-busy={pending}
              className={`inline-flex items-center gap-2 px-5 py-2.5 ${primaryButton}`}
            >
              {pending
                ? <Loader2 size={16} strokeWidth={2} className="motion-safe:animate-spin" aria-hidden="true" />
                : <Sparkles size={16} strokeWidth={1.75} aria-hidden="true" />}
              {pending ? 'The council is meeting…' : 'Ask the council'}
            </button>
            {pending ? <CouncilProgress steps={steps} step={step} /> : null}
            {error && !pending ? <p role="alert" className="rounded-2xl bg-coral/10 px-3 py-2 text-[13px] text-coral text-pretty">{error}</p> : null}
            {failed && !pending ? (
              <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl bg-coral/10 px-3 py-2 text-[13px] text-coral">
                <p className="min-w-0 flex-1 text-pretty">{failed.note || 'Qloo did not return anything everyone could share.'}</p>
                {failed.calls.length > 0 ? (
                  <button type="button" onClick={() => onOpen(failed)} className={`font-medium underline underline-offset-2 ${focusRing}`}>See Qloo calls</button>
                ) : null}
              </div>
            ) : null}
            <p className="text-[12px] text-zinc-500 text-pretty">{AFFINITY_NOTE}</p>
          </div>
          <p className="sr-only" aria-live="polite">{announce}</p>
        </form>

        <RecentCouncils recent={recent} now={now} onOpen={onOpen} />
      </div>
    </section>
  );
}

function TasteHeader({ ready }: { ready: boolean }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="min-w-0 max-w-[62ch] space-y-1">
        <h2 id="taste-title" className="text-[15px] font-semibold text-ink text-balance">Taste Council</h2>
        <p className="text-[13px] leading-relaxed text-zinc-500 text-pretty">
          Family facts like “Mia loves Encanto” become taste signals. Qloo ranks one shortlist for each person, and the council
          picks the option whose lowest rank is highest, so nobody is left out. Keeper drops anything that clashes with an allergy or diet.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 text-[12px] font-medium text-zinc-600">
          {ready ? <span className="h-1.5 w-1.5 rounded-full bg-sage" aria-hidden="true" /> : null}
          Powered by Qloo
        </span>
        {!ready ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-coral/10 px-2.5 py-1 text-[12px] font-medium text-coral">
            <span className="h-1.5 w-1.5 rounded-full bg-coral" aria-hidden="true" />
            Qloo not connected
          </span>
        ) : null}
      </div>
    </div>
  );
}

function MemberChip({ member, on, disabled, onToggle }: { member: TasteMember; on: boolean; disabled: boolean; onToggle: () => void }) {
  const age = ageLabel(member.ageBand);
  const likes = member.loves.length > 0 ? member.loves : member.likesTags;
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onToggle}
      title={on ? `Leave ${member.who} out of this council` : `Bring ${member.who} into this council`}
      className={`flex max-w-full items-center gap-2.5 rounded-2xl py-2 pl-2 pr-3 text-left ring-1 ring-inset transition-colors duration-150 motion-reduce:transition-none ${
        on ? 'bg-paper ring-ink/15 shadow-[0_1px_2px_rgba(23,21,15,0.06)]' : 'bg-zinc-50 ring-ink/5 hover:bg-zinc-100'
      } ${focusRing} ${pressable}`}
    >
      <PersonDot name={member.who} className={on ? '' : 'opacity-40 grayscale'} />
      <span className="min-w-0">
        <span className={`block text-sm font-medium ${on ? 'text-ink' : 'text-zinc-500'}`}>
          {member.who}
          {age ? <span className="font-normal text-zinc-500"> · {age}</span> : null}
          {!on ? <span className="font-normal text-zinc-500"> · sitting out</span> : null}
        </span>
        {likes.length > 0 ? (
          <span className="block max-w-[15rem] truncate text-[12px] text-zinc-500">{likes.slice(0, 3).join(' · ')}</span>
        ) : null}
        {member.constraints.length > 0 ? (
          <span className="block max-w-[15rem] truncate text-[12px] text-sage">Keeper watches: {member.constraints.slice(0, 2).join(', ')}</span>
        ) : null}
      </span>
      <span
        className={`ml-1 grid h-5 w-5 shrink-0 place-items-center self-center rounded-full ${on ? 'bg-ink text-paper' : 'ring-1 ring-inset ring-zinc-300'}`}
        aria-hidden="true"
      >
        {on ? <Check size={12} strokeWidth={3} /> : null}
      </span>
    </button>
  );
}

function CouncilProgress({ steps, step }: { steps: string[]; step: number }) {
  return (
    <div className="rounded-[1.25rem] bg-zinc-50 p-3 sm:p-4">
      <p className="sr-only" aria-live="polite">{steps[step]}</p>
      <ol className="space-y-1.5" aria-label="Council progress">
        {steps.map((line, index) => {
          const done = index < step;
          const current = index === step;
          return (
            <li key={line} className={`flex items-center gap-2.5 text-[13px] ${done ? 'text-zinc-500' : current ? 'font-medium text-ink' : 'text-zinc-400'}`}>
              <span className="grid h-5 w-5 shrink-0 place-items-center" aria-hidden="true">
                {done ? <Check size={14} strokeWidth={2} className="text-sage" />
                  : current ? <Loader2 size={14} strokeWidth={2} className="motion-safe:animate-spin" />
                    : <span className="h-1.5 w-1.5 rounded-full bg-zinc-300" />}
              </span>
              <span className="min-w-0 text-pretty">{done ? line.replace(/…$/, '') : line}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function RecentCouncils({ recent, now, onOpen }: { recent: CouncilResult[]; now: number; onOpen: (result: CouncilResult) => void }) {
  return (
    <div className="min-w-0 lg:border-l lg:border-ink/5 lg:pl-6">
      <h3 className="text-[13px] font-medium text-ink">Recent councils</h3>
      {recent.length === 0 ? (
        <p className="mt-2 text-[13px] text-zinc-500 text-pretty">The last three councils show here, with every Qloo call behind them.</p>
      ) : (
        <ul className="mt-1 divide-y divide-ink/5">
          {recent.slice(0, 3).map((result) => {
            const Icon = OCCASION_ICON[result.occasion];
            const top = result.picks[0];
            const when = relativePast(result.startedAt, now);
            return (
              <li key={resultKey(result)}>
                <button type="button" onClick={() => onOpen(result)} className={`-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-zinc-50 ${focusRing}`}>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-zinc-100 text-ink" aria-hidden="true">
                    <Icon size={16} strokeWidth={1.75} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{top ? top.name : 'No pick'}</span>
                    <span className="block truncate text-[12px] text-zinc-500">
                      {OCCASION_LABEL[result.occasion]}
                      {top ? ` · ${lowestFitLine(top)}` : result.status === 'error' ? ' · Qloo error' : ''}
                    </span>
                  </span>
                  {when ? <span className="shrink-0 text-[12px] tabular-nums text-zinc-500">{when}</span> : null}
                  <ChevronRight size={16} strokeWidth={1.75} className="shrink-0 text-zinc-400" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
