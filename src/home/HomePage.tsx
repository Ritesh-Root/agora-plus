import { useCallback, useEffect, useRef, useState } from 'react';
import { Code, House } from 'lucide-react';
import { groupTasks } from '../interface/householdView';
import { useAssistant } from '../alexa/useAssistant';
import { ApprovalsCard } from './ApprovalsCard';
import { AssistantCard } from './AssistantCard';
import { ConnectSheet } from './ConnectSheet';
import { FamilyCard } from './FamilyCard';
import { briefTitle, formatHomeStamp, greetingForHour, suggestionTone, todayTasks } from './homeView';
import { ListCard } from './ListCard';
import { PasscodeForm } from './PasscodeForm';
import { PlanSheet } from './PlanSheet';
import { PlansCard } from './PlansCard';
import { TodayCard } from './TodayCard';
import { UnderTheHood } from './UnderTheHood';
import { useHousehold } from './useHousehold';
import { cardClass, focusRing, pressable } from './ui';

function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    let interval = 0;
    const delay = 60_000 - (Date.now() % 60_000);
    const timeout = window.setTimeout(() => {
      tick();
      interval = window.setInterval(tick, 60_000);
    }, delay);
    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, []);
  return now;
}

export default function HomePage() {
  const assistant = useAssistant();
  const household = useHousehold();
  const now = useNow();
  const [hood, setHood] = useState(false);
  const [connect, setConnect] = useState(false);
  const [planId, setPlanId] = useState<string | null>(null);
  const wasBusy = useRef(false);
  const locked = assistant.locked || household.locked;
  const { refresh } = household;

  useEffect(() => {
    document.title = 'AGORA+ Home';
    const previous = document.body.style.background;
    document.body.style.background = '#f4f0e6';
    return () => {
      document.body.style.background = previous;
    };
  }, []);

  useEffect(() => {
    if (wasBusy.current && !assistant.busy) void refresh();
    wasBusy.current = assistant.busy;
  }, [assistant.busy, refresh]);

  const onLocked = useCallback(() => {
    void refresh();
  }, [refresh]);

  const groups = groupTasks(household.snapshot.tasks);
  const shopping = groups.find((group) => group.name === 'Shopping')?.tasks ?? [];
  // Anything with a time today already sits in Today, so the to-do list does not repeat it.
  const inToday = new Set(todayTasks(household.snapshot.tasks, now).map((task) => task.id));
  const todo = (groups.find((group) => group.name === 'To-do')?.tasks ?? []).filter((task) => !inToday.has(task.id));
  const briefing = household.snapshot.briefing.length > 0 ? household.snapshot.briefing : household.snapshot.suggestions;
  const planRun = household.snapshot.recentRuns.find((run) => run.id === planId);
  const extras = groups.filter((group) => group.name !== 'Shopping' && group.name !== 'To-do');

  return (
    <div className="min-h-dvh overflow-x-hidden bg-[#f4f0e6] text-ink">
      <div inert={locked ? true : undefined} className={locked ? 'pointer-events-none select-none blur-sm' : undefined}>
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-ink/10 bg-paper px-4">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-butter text-ink" aria-hidden="true">
              <House size={18} strokeWidth={1.75} />
            </span>
            <span className="text-[15px] font-semibold">AGORA+</span>
            <span className="text-[13px] text-zinc-500">Home</span>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <p className="hidden text-[13px] tabular-nums text-zinc-500 sm:block">{formatHomeStamp(now)}</p>
            <button
              type="button"
              onClick={() => { setConnect(true); setHood(false); setPlanId(null); }}
              className={`rounded-full px-3 py-2 text-sm font-medium text-ink ${focusRing} ${pressable}`}
            >
              Connect
            </button>
            <button
              type="button"
              aria-label="Under the hood"
              aria-expanded={hood}
              onClick={() => { setHood((open) => !open); setConnect(false); setPlanId(null); }}
              className={`inline-flex h-10 items-center gap-2 rounded-full px-2 text-sm font-medium text-ink lg:px-3 ${hood ? 'bg-zinc-100' : ''} ${focusRing} ${pressable}`}
            >
              <Code size={18} strokeWidth={1.75} aria-hidden="true" />
              <span className="hidden lg:inline">Under the hood</span>
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1320px] px-4 py-6 sm:px-6">
          <section className="space-y-3">
            <h1 className="text-[30px] font-semibold leading-tight text-ink text-balance">{greetingForHour(now.getHours())}</h1>
            {briefing.length === 0 ? (
              <p className="text-sm text-zinc-500">Nothing urgent at home.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {briefing.map((line) => {
                  const tone = suggestionTone(line);
                  const dot = tone === 'safety' ? 'bg-coral' : tone === 'reminder' ? 'bg-butter' : 'bg-zinc-300';
                  return (
                    <li key={line} className="inline-flex max-w-full items-center gap-2 rounded-full bg-paper px-3 py-1.5 text-[13px] text-ink shadow-[0_1px_2px_rgba(23,21,15,0.06)]">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
                      {line}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-start">
            <div className="lg:sticky lg:top-20 lg:max-h-[calc(100dvh-5.5rem)] lg:w-[400px] lg:shrink-0 lg:overflow-y-auto lg:rounded-[1.75rem]">
              <AssistantCard assistant={assistant} onOpenHood={() => { setHood(true); setConnect(false); setPlanId(null); }} />
            </div>
            <div className="min-w-0 flex-1 space-y-4">
              {household.error ? <p role="status" className="text-[13px] text-zinc-500">{household.error}</p> : null}
              <ApprovalsCard approvals={household.snapshot.pendingApprovals} hideId={assistant.approval?.approvalId} onDecide={household.decideApproval} />
              {/* Two independent columns, so a tall card never leaves a hole beside a short one. */}
              <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
                <div className="space-y-4">
                  <TodayCard tasks={household.snapshot.tasks} now={now} onComplete={household.completeTask} />
                  <ListCard
                    name="Shopping"
                    tasks={shopping}
                    doneLabel="In the basket"
                    clearLabel="Clear basket"
                    list="shopping"
                    onAdd={household.addTask}
                    onComplete={household.completeTask}
                    onReopen={household.reopenTask}
                    onRemove={household.removeTask}
                  />
                  <ListCard
                    name="To-do"
                    tasks={todo}
                    doneLabel="Done"
                    clearLabel="Clear done"
                    onAdd={household.addTask}
                    onComplete={household.completeTask}
                    onReopen={household.reopenTask}
                    onRemove={household.removeTask}
                  />
                  {extras.map((group) => (
                    <ListCard
                      key={group.name}
                      name={group.name}
                      tasks={group.tasks}
                      doneLabel="Done"
                      clearLabel="Clear done"
                      list={group.tasks.find((task) => task.list)?.list ?? group.name}
                      onAdd={household.addTask}
                      onComplete={household.completeTask}
                      onReopen={household.reopenTask}
                      onRemove={household.removeTask}
                    />
                  ))}
                </div>
                <div className="space-y-4">
                  <PlansCard runs={household.snapshot.recentRuns} now={now.getTime()} onRead={(id) => { setPlanId(id); setHood(false); setConnect(false); }} />
                  <FamilyCard
                    memory={household.snapshot.memory}
                    onAdd={household.addMemory}
                    onPatch={household.patchMemory}
                    onDelete={household.deleteMemory}
                  />
                </div>
              </div>
            </div>
          </div>
          <footer className="py-8 text-center">
            <a href="/office" className={`text-[13px] text-zinc-500 underline-offset-2 hover:text-ink hover:underline ${focusRing}`}>Team view (3D)</a>
          </footer>
        </main>

        <UnderTheHood
          open={hood}
          onClose={() => setHood(false)}
          turns={assistant.newestFirst}
          samples={assistant.samples}
          status={assistant.status}
          busy={assistant.busy}
          onDecide={assistant.decide}
          traceRef={assistant.traceRef}
        />
        <ConnectSheet open={connect} onClose={() => setConnect(false)} />
        <PlanSheet runId={planId} title={planRun ? briefTitle(planRun.brief) : ''} onClose={() => setPlanId(null)} onLocked={onLocked} />
      </div>
      {locked ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#f4f0e6]/70 p-4 backdrop-blur-md">
          <div role="dialog" aria-modal="true" aria-labelledby="home-passcode-title" className={`${cardClass} w-full max-w-sm`}>
            <PasscodeForm onUnlocked={() => { assistant.unlock(); void refresh(); }} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
