import { Check, Mic, Square } from 'lucide-react';
import { RING_LABEL, StatusRing } from '../alexa/StatusRing';
import { SAMPLES, type AssistantState } from '../alexa/useAssistant';
import { latestWriteLine, planSteps } from './homeView';
import { cardClass, fieldClass, focusRing, pressable, primaryButton, quietButton } from './ui';

export function AssistantCard({ assistant, onOpenHood }: { assistant: AssistantState; onOpenHood: () => void }) {
  const {
    approval,
    approvalBody,
    approveRef,
    blocked,
    busy,
    caption,
    debugMode,
    decide,
    draft,
    haltSpeech,
    link,
    linkNote,
    listening,
    micNote,
    onTalkKeyDown,
    onTalkPointerCancel,
    onTalkPointerDown,
    onTalkPointerUp,
    pressRing,
    ring,
    samples,
    setDraft,
    speaking,
    status,
    submit,
    supported,
    talkLabel,
    talkRef,
    toast,
    turns,
    userLine,
    voiceReady,
  } = assistant;
  const latest = turns[turns.length - 1];
  const wrote = latest ? latestWriteLine(latest.tools, latest.utterance) : null;
  const steps = approvalBody ? planSteps(approvalBody) : null;
  const lastSample = samples[samples.length - 1];

  return (
    <section aria-label="Assistant" data-testid="alexa-device" className={`${cardClass} space-y-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-ink text-balance">Assistant</h2>
          <p className="mt-1 inline-flex rounded-full bg-zinc-100 px-2.5 py-1 text-[12px] text-zinc-500">Simulated Alexa+ voice · unofficial</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {status?.linked ? (
            <span className="text-sm font-medium text-sage">Linked ✓</span>
          ) : (
            <button type="button" onClick={() => void link()} className={primaryButton}>Link AGORA+</button>
          )}
          {debugMode && status ? (
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-mono text-[12px] text-zinc-500">{status.mode}</span>
          ) : null}
        </div>
      </div>
      {linkNote ? <p className="text-[13px] text-zinc-500">{linkNote}</p> : null}

      <div className="flex flex-col items-center">
        <button
          type="button"
          data-testid="alexa-ring"
          onClick={pressRing}
          aria-label={speaking ? 'Stop speaking' : listening ? 'Stop listening and send' : voiceReady ? 'Tap to talk' : 'Voice input unavailable, type below'}
          className={`rounded-full ${pressable} ${focusRing}`}
        >
          <StatusRing state={ring} />
        </button>
        <p className="mt-3 text-center text-[13px] text-zinc-500">{RING_LABEL[ring]}</p>
        <div className="mt-4 min-h-16 w-full text-center" aria-live="polite" aria-atomic="true" data-testid="alexa-caption">
          {userLine ? <p className="text-[15px] leading-snug text-zinc-500">{userLine}</p> : null}
          <p className={`mt-1 font-medium leading-snug text-ink text-balance ${caption.length > 140 ? 'text-[16px]' : 'text-[19px]'}`}>{caption || (busy ? '…' : '')}</p>
          {turns.length === 0 && !caption && !busy ? (
            <p className="text-[15px] leading-snug text-zinc-500 text-balance">Ask about your day, add to a list, or have the team plan something.</p>
          ) : null}
        </div>
        {wrote ? (
          <p className="mt-3 inline-flex items-center gap-1.5 text-[13px] text-sage">
            <Check size={18} strokeWidth={1.75} aria-hidden="true" />
            {wrote}
          </p>
        ) : null}
        {toast && toast !== caption ? (
          <p role="status" data-testid="alexa-toast" className="mt-3 w-full rounded-2xl bg-butter/25 px-3 py-2 text-center text-sm text-ink">
            {toast}
          </p>
        ) : null}
        {approval ? (
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="alexa-approval-title"
            aria-describedby="alexa-approval-body"
            data-testid="alexa-approval"
            className="mt-4 w-full rounded-[1.25rem] bg-butter/20 p-4"
          >
            <p id="alexa-approval-title" className="text-[15px] font-semibold text-ink">Waiting for you</p>
            <div id="alexa-approval-body" className="mt-2 text-[15px] leading-snug text-ink">
              {steps ? (
                <ol className="list-decimal space-y-1 pl-5">
                  {steps.map((step) => <li key={step}>{step}</li>)}
                </ol>
              ) : (
                <p className="whitespace-pre-wrap">{approvalBody}</p>
              )}
            </div>
            <div className="mt-3 flex gap-2">
              <button ref={approveRef} type="button" disabled={busy} onClick={() => decide('yes')} className={`${primaryButton} flex-1`}>
                Approve
              </button>
              <button type="button" disabled={busy} onClick={() => decide('no')} className={`${quietButton} flex-1`}>
                Decline
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {!supported ? <p className="text-[13px] text-zinc-500">Voice input needs Chrome or Edge. Type below.</p> : null}
      {supported && (blocked ?? micNote) ? (
        <p className="text-[13px] text-ink" role="status" data-testid="alexa-mic-note">{blocked ?? micNote}</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          id="talk-btn"
          ref={talkRef}
          aria-pressed={listening}
          aria-disabled={!voiceReady}
          title={voiceReady ? 'Tap to talk, or hold and let go to send' : blocked ?? 'Voice input needs Chrome or Edge'}
          onPointerDown={onTalkPointerDown}
          onPointerUp={onTalkPointerUp}
          onPointerCancel={onTalkPointerCancel}
          onKeyDown={onTalkKeyDown}
          className={`inline-flex h-10 min-w-32 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium ${focusRing} ${pressable} ${voiceReady ? 'bg-butter text-ink' : 'cursor-not-allowed bg-zinc-100 text-zinc-500'}`}
        >
          <Mic size={18} strokeWidth={1.75} aria-hidden="true" />
          {talkLabel}
        </button>
        {speaking ? (
          <button type="button" data-testid="alexa-stop" onClick={() => haltSpeech()} className={`inline-flex h-10 items-center gap-2 ${quietButton}`}>
            <Square size={18} strokeWidth={1.75} aria-hidden="true" />
            Stop
          </button>
        ) : null}
        <form
          className="flex min-w-0 flex-1 basis-full gap-2 sm:basis-48"
          onSubmit={(event) => {
            event.preventDefault();
            void submit(draft);
          }}
        >
          <label className="sr-only" htmlFor="alexa-utterance">Type a request</label>
          <input
            id="alexa-utterance"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Type a request"
            className={fieldClass}
          />
          <button type="submit" disabled={!draft.trim()} className={quietButton}>Send</button>
        </form>
      </div>
      <div className="flex flex-wrap gap-2">
        {SAMPLES.map((prompt) => (
          <button
            key={prompt}
            type="button"
            disabled={busy}
            onClick={() => void submit(prompt)}
            className={`max-w-full rounded-full bg-zinc-100 px-3 py-1.5 text-left text-[13px] leading-snug text-ink disabled:opacity-40 ${focusRing} ${pressable}`}
          >
            {prompt}
          </button>
        ))}
      </div>
      <p className="text-[13px] text-zinc-500">Tap the ring or hold Space to talk. Esc stops.</p>
      {lastSample ? (
        <button type="button" onClick={onOpenHood} className={`text-[13px] tabular-nums text-zinc-500 ${focusRing} ${pressable}`}>
          {lastSample.ttfsMs === null ? 'Text only' : `${lastSample.ttfsMs} ms to first audio`}
        </button>
      ) : null}
    </section>
  );
}
