import { useState } from 'react';
import { AlertTriangle, Award, Check, ChevronDown, ListPlus, ShieldAlert } from 'lucide-react';
import { OCCASION_LABEL, type CouncilPick, type CouncilResult, type QlooCallRecord } from '../../shared/taste';
import { Sheet } from './Sheet';
import { PersonDot } from './tasteIcons';
import { AFFINITY_NOTE, becauseLine, compactArgs, fitPercent, formatMs, lowestFit, lowestFitLine, rankLabel, resultKey, taskTitle, whyWinner } from './tasteView';
import { focusRing, quietButton } from './ui';

export function TasteSheet({
  result,
  onClose,
  onAddTask,
}: {
  result: CouncilResult | null;
  onClose: () => void;
  onAddTask: (title: string) => Promise<boolean>;
}) {
  const title = result ? `${OCCASION_LABEL[result.occasion]}${result.location ? ` · ${result.location}` : ''}` : 'Taste Council';
  return (
    <Sheet open={result !== null} onClose={onClose} title={title} testId="taste-sheet" wide>
      {result ? <CouncilView key={resultKey(result)} result={result} onAddTask={onAddTask} /> : null}
    </Sheet>
  );
}

/** The result body, exported so it renders on its own in tests. */
export function CouncilView({ result, onAddTask }: { result: CouncilResult; onAddTask?: (title: string) => Promise<boolean> }) {
  const [winner, ...others] = result.picks;
  const why = whyWinner(result.picks);
  return (
    <div className="space-y-6 pb-2">
      <StatusNote result={result} />

      {result.speech ? (
        <p className="border-l-4 border-butter pl-4 text-[17px] leading-relaxed text-ink text-pretty">{result.speech}</p>
      ) : null}

      {winner ? <Winner pick={winner} /> : null}
      {why ? <p className="text-[13px] leading-relaxed text-zinc-600 text-pretty"><span className="font-medium text-ink">Why it wins: </span>{why}</p> : null}

      {others.length > 0 ? (
        <section aria-labelledby="taste-others" className="space-y-2">
          <h3 id="taste-others" className="text-[13px] font-medium text-ink">Also considered</h3>
          <ol className="space-y-2">
            {others.map((pick, index) => <OtherPick key={`${pick.entityId ?? pick.name}-${index}`} pick={pick} place={index + 2} />)}
          </ol>
        </section>
      ) : null}

      {result.vetoes.length > 0 ? (
        <section aria-labelledby="taste-vetoes" className="space-y-2">
          <h3 id="taste-vetoes" className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
            <ShieldAlert size={16} strokeWidth={1.75} className="text-coral" aria-hidden="true" />
            Keeper removed
          </h3>
          <ul className="space-y-1.5">
            {result.vetoes.map((veto, index) => (
              <li key={`${veto.name}-${index}`} className="flex items-start gap-2.5 rounded-2xl bg-coral/10 px-3 py-2.5 text-sm">
                {veto.who ? <PersonDot name={veto.who} size="h-6 w-6 text-[12px]" /> : null}
                <span className="min-w-0 text-pretty">
                  <span className="font-medium text-ink line-through decoration-coral/60">{veto.name}</span>
                  {veto.fact ? <span className="text-zinc-600"> because “{veto.fact}”</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {onAddTask && winner ? <AddToTodo title={taskTitle(result)} onAddTask={onAddTask} /> : null}

      <QlooCalls calls={result.calls} />

      <p className="text-[12px] leading-relaxed text-zinc-500 text-pretty">
        {AFFINITY_NOTE}
        {result.ms > 0 ? ` Council took ${formatMs(result.ms)}.` : ''}
      </p>
    </div>
  );
}

function StatusNote({ result }: { result: CouncilResult }) {
  if (result.status === 'ok') return null;
  const degraded = result.status === 'degraded';
  return (
    <div role="status" className={`flex items-start gap-2.5 rounded-2xl px-3 py-2.5 text-[13px] ${degraded ? 'bg-butter/30 text-ink' : 'bg-coral/10 text-coral'}`}>
      <AlertTriangle size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden="true" />
      <p className="min-w-0 text-pretty">
        <span className="font-medium">{degraded ? 'Some Qloo calls failed. ' : 'Qloo could not answer. '}</span>
        {result.note ?? (degraded ? 'These picks use the calls that worked.' : 'Nothing was picked.')}
      </p>
    </div>
  );
}

function Winner({ pick }: { pick: CouncilPick }) {
  const worst = lowestFit(pick);
  return (
    <article aria-labelledby="taste-winner" className="overflow-hidden rounded-[1.5rem] bg-zinc-50 ring-1 ring-inset ring-ink/5">
      <div className="flex gap-4 p-4 sm:p-5">
        <PickImage url={pick.imageUrl} className="h-32 w-24 rounded-xl sm:h-40 sm:w-28" />
        <div className="min-w-0 flex-1 space-y-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-butter px-2.5 py-0.5 text-[12px] font-medium text-ink">
            <Award size={14} strokeWidth={1.75} aria-hidden="true" /> Council pick
          </span>
          <h3 id="taste-winner" className="text-2xl font-semibold leading-tight text-ink text-balance break-words">{pick.name}</h3>
          {pick.subtitle ? <p className="text-sm text-zinc-500 text-pretty">{pick.subtitle}</p> : null}
          {pick.tags.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5" aria-label="Qloo tags">
              {pick.tags.slice(0, 5).map((tag) => (
                <li key={tag} className="rounded-full bg-paper px-2 py-0.5 text-[12px] text-zinc-600 ring-1 ring-inset ring-ink/10">{tag}</li>
              ))}
            </ul>
          ) : null}
          {worst ? <p className="text-[13px] font-medium text-ink">{lowestFitLine(pick)}{worst.rank !== null && worst.of > 0 ? ` of ${worst.of}` : ''}</p> : null}
        </div>
      </div>
      <div className="border-t border-ink/5 bg-paper/60 px-2 py-2 sm:px-3">
        <FitList pick={pick} />
      </div>
    </article>
  );
}

function PickImage({ url, className }: { url?: string; className: string }) {
  const [broken, setBroken] = useState(false);
  if (!url || broken) return null;
  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      className={`shrink-0 bg-zinc-100 object-cover ${className}`}
    />
  );
}

/** One row per person: where this option sat on their own Qloo ranking, and the favourites behind it. */
function FitList({ pick }: { pick: CouncilPick }) {
  const worst = lowestFit(pick);
  return (
    <ul className="space-y-0.5" aria-label={`How ${pick.name} ranked for each person`}>
      {pick.fits.map((fit) => {
        const lowest = fit === worst && pick.fits.length > 1;
        const because = becauseLine(fit);
        return (
          <li key={fit.who} className={`flex items-start gap-3 rounded-xl px-2 py-2 ${lowest ? 'bg-butter/25' : ''}`}>
            <PersonDot name={fit.who} size="h-7 w-7 text-[12px]" className="mt-0.5" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-ink">{fit.who}</span>
                {lowest ? <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] font-medium text-paper">Lowest fit</span> : null}
                <span className={`ml-auto shrink-0 text-[13px] tabular-nums ${fit.rank === null ? 'text-zinc-500' : 'font-medium text-ink'}`}>{rankLabel(fit)}</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-200" aria-hidden="true">
                <div className={`h-full rounded-full ${lowest ? 'bg-butter-600' : 'bg-sage'}`} style={{ width: `${fitPercent(fit)}%` }} />
              </div>
              {because ? <p className="mt-1 text-[12px] text-zinc-500 text-pretty">{because}</p> : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function OtherPick({ pick, place }: { pick: CouncilPick; place: number }) {
  const worst = lowestFit(pick);
  return (
    <li className="rounded-2xl ring-1 ring-inset ring-ink/10">
      <details className="group">
        <summary className={`flex cursor-pointer list-none items-center gap-3 rounded-2xl p-3 hover:bg-zinc-50 [&::-webkit-details-marker]:hidden ${focusRing}`}>
          <span className="w-5 shrink-0 text-center text-[13px] tabular-nums text-zinc-500">{place}</span>
          <PickImage url={pick.imageUrl} className="h-12 w-9 rounded-lg" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-ink">{pick.name}</span>
            {pick.subtitle ? <span className="block truncate text-[12px] text-zinc-500">{pick.subtitle}</span> : null}
            <span className="mt-1.5 flex flex-wrap gap-1.5">
              {pick.fits.map((fit) => {
                const lowest = fit === worst && pick.fits.length > 1;
                return (
                  <span
                    key={fit.who}
                    className={`inline-flex items-center gap-1 rounded-full py-0.5 pl-0.5 pr-2 text-[12px] tabular-nums ${lowest ? 'bg-coral/10 font-medium text-coral' : 'bg-zinc-100 text-zinc-600'}`}
                  >
                    <PersonDot name={fit.who} size="h-4 w-4 text-[10px]" />
                    <span className="sr-only">{fit.who} </span>
                    {fit.rank === null ? '–' : `#${fit.rank}`}
                    {lowest ? <span className="sr-only"> (lowest fit)</span> : null}
                  </span>
                );
              })}
            </span>
          </span>
          <ChevronDown size={16} strokeWidth={1.75} className="shrink-0 text-zinc-400 transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
        </summary>
        <div className="px-1 pb-2">
          {pick.tags.length > 0 ? <p className="px-2 pb-1 text-[12px] text-zinc-500">{pick.tags.slice(0, 4).join(' · ')}</p> : null}
          <FitList pick={pick} />
        </div>
      </details>
    </li>
  );
}

function AddToTodo({ title, onAddTask }: { title: string; onAddTask: (title: string) => Promise<boolean> }) {
  const [state, setState] = useState<'idle' | 'saving' | 'added' | 'failed'>('idle');
  const add = async () => {
    setState('saving');
    setState((await onAddTask(title)) ? 'added' : 'failed');
  };
  return (
    <div className="flex flex-wrap items-center gap-3">
      {state === 'added' ? (
        <p role="status" className="inline-flex items-center gap-1.5 text-sm font-medium text-sage">
          <Check size={16} strokeWidth={2} aria-hidden="true" /> Added “{title}” to the to-do list
        </p>
      ) : (
        <button type="button" onClick={() => void add()} disabled={state === 'saving'} className={`inline-flex items-center gap-2 ${quietButton}`}>
          <ListPlus size={16} strokeWidth={1.75} aria-hidden="true" />
          Add “{title}” to to-do
        </button>
      )}
      {state === 'failed' ? <p role="alert" className="text-[13px] text-coral">That did not save. Try again.</p> : null}
    </div>
  );
}

const CALL_PILL: Record<QlooCallRecord['status'], string> = {
  ok: 'bg-sage/15 text-sage',
  empty: 'bg-zinc-100 text-zinc-600',
  needs_input: 'bg-zinc-100 text-zinc-600',
  partial: 'bg-butter/40 text-ink',
  degraded: 'bg-butter/40 text-ink',
  error: 'bg-coral/10 text-coral',
};

function QlooCalls({ calls }: { calls: QlooCallRecord[] }) {
  if (calls.length === 0) return null;
  const total = calls.reduce((sum, call) => sum + call.ms, 0);
  const failed = calls.filter((call) => call.status === 'error' || call.status === 'degraded').length;
  return (
    <details className="group rounded-2xl bg-zinc-50" data-testid="taste-calls">
      <summary className={`flex cursor-pointer list-none items-center gap-2 rounded-2xl p-3 text-sm font-medium text-ink [&::-webkit-details-marker]:hidden ${focusRing}`}>
        <span className="min-w-0 flex-1">Qloo calls</span>
        <span className="text-[12px] font-normal tabular-nums text-zinc-500">
          {calls.length} {calls.length === 1 ? 'call' : 'calls'}{failed > 0 ? ` · ${failed} failed` : ''} · {formatMs(total)}
        </span>
        <ChevronDown size={16} strokeWidth={1.75} className="shrink-0 text-zinc-400 transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
      </summary>
      <ol className="space-y-2 px-3 pb-3">
        {calls.map((call, index) => (
          <li key={`${call.tool}-${index}`} className="rounded-xl bg-paper p-3">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-mono text-[12px] text-ink">{call.tool}</span>
              {call.forWho ? <span className="text-[12px] text-zinc-500">for {call.forWho}</span> : null}
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${CALL_PILL[call.status]}`}>{call.status.replace('_', ' ')}</span>
              <span className="ml-auto text-[12px] tabular-nums text-zinc-500">
                {call.resultCount} {call.resultCount === 1 ? 'result' : 'results'} · {formatMs(call.ms)}
              </span>
            </div>
            {call.summary ? <p className="mt-1 text-[13px] text-zinc-600 text-pretty">{call.summary}</p> : null}
            <pre className="mt-2 whitespace-pre-wrap break-all font-mono text-[12px] leading-relaxed text-zinc-500">{compactArgs(call.args)}</pre>
          </li>
        ))}
      </ol>
    </details>
  );
}
