import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  householdNotices,
  startHouseholdWatch,
} from './announcements';
import { LatencyMeter, type LatencySample } from './LatencyMeter';
import { ReceiptCard, type ToolCard } from './ReceiptCard';
import { HouseholdLocked, streamTurn } from './simClient';
import { RING_LABEL, StatusRing, type RingState } from './StatusRing';
import {
  approvalCopy,
  visibleApproval,
  captionAck,
  captionAckFinished,
  captionAnswer,
  createTurnClock,
  emptyCaption,
  isDecline,
  noteAudioStart,
  noteFinal,
  noteLineDone,
  noteLineQueued,
  noteStreamDone,
  takeSample,
  type Caption,
  type TurnClock,
} from './turnTiming';
import { useSpeechInput } from './useSpeechInput';
import { useSpeechOutput, type SpeechHooks } from './useSpeechOutput';

const SAMPLES = [
  'Remember Mia is allergic to peanuts',
  'Add milk to my shopping list',
  'Plan dinners for this week and add the groceries',
  "What's my briefing?",
  'What is Mia allergic to?',
];

/** Spyglass, 30 Sep 2025. Listed in docs/research/sources.json. */
const ALEXA_WAIT_SOURCE = 'https://spyglass.org/broken-alexa-plus/';
/** The Verge, 8 Oct 2026, one-year Alexa+ review. */
const VERGE_WAIT_SOURCE = 'https://www.theverge.com/tech/1007565/amazon-alexa-plus-review-one-year-echo-show-dot-max';

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-butter';
const FOCUS_INK = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink';
const DOCUMENT_TITLE = 'AGORA+ voice (unofficial Alexa+ simulator)';

interface TraceTurn {
  id: string;
  utterance: string;
  spoken: string;
  ackText: string;
  ackMs?: number;
  totalMs?: number;
  route?: 'fast' | 'model';
  tools: ToolCard[];
  errorDetail?: string;
}

interface SimStatus {
  linked: boolean;
  mode: 'oauth' | 'dev-token' | 'unconfigured';
  model: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function authLabel(status: SimStatus | null): string {
  if (status?.mode === 'oauth') return 'OAuth linked';
  if (status?.mode === 'dev-token') return 'dev-token';
  return 'not linked';
}

function eventSummary(data: Record<string, unknown>): string {
  const chunks: string[] = [];
  if (typeof data.summary === 'string') chunks.push(data.summary.trim());
  if (typeof data.preview === 'string') chunks.push(data.preview.trim());
  if (Array.isArray(data.steps)) {
    const lines = data.steps
      .filter((step): step is string => typeof step === 'string')
      .map((step) => step.trim())
      .filter(Boolean);
    if (lines.length > 0) chunks.push(lines.join('\n'));
  }
  return chunks.reduce((best, chunk) => (chunk.length > best.length ? chunk : best), '');
}

function withSummary(card: ToolCard, incoming: string): ToolCard {
  if (!incoming) return card;
  if ((card.summary?.length ?? 0) >= incoming.length) return card;
  return { ...card, summary: incoming };
}

function pendingCard(turns: TraceTurn[], phase: string): ToolCard | undefined {
  return visibleApproval(turns, phase);
}

function PasscodeForm({ onUnlocked }: { onUnlocked: () => void }) {
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode }),
      });
      if (!response.ok) {
        setError('That passcode is not right.');
        return;
      }
      onUnlocked();
    } catch {
      setError('The household could not be reached.');
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-3">
      <label htmlFor="alexa-passcode" className="block text-sm text-paper">Household passcode</label>
      <input
        id="alexa-passcode"
        type="password"
        autoComplete="off"
        value={passcode}
        onChange={(event) => setPasscode(event.target.value)}
        className={`w-full rounded-2xl border border-paper/20 bg-ink px-3 py-2 text-sm text-paper ${FOCUS}`}
      />
      {error ? <p className="text-sm text-butter">{error}</p> : null}
      <button
        type="submit"
        disabled={pending || !passcode}
        className="w-full rounded-full bg-butter px-4 py-2 text-[11px] font-black uppercase tracking-widest text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-40"
      >
        Unlock
      </button>
    </form>
  );
}

export default function AlexaSimulator() {
  const [locked, setLocked] = useState(false);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<SimStatus | null>(null);
  const [turns, setTurns] = useState<TraceTurn[]>([]);
  const [draft, setDraft] = useState('');
  const [phase, setPhase] = useState<'idle' | 'thinking' | 'approval' | 'error'>('idle');
  const [speaking, setSpeaking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [samples, setSamples] = useState<LatencySample[]>([]);
  const [linkNote, setLinkNote] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [micNote, setMicNote] = useState<string | null>(null);
  const [debugMode] = useState(() => new URLSearchParams(window.location.search).get('debug') === '1');
  const conversationId = useRef<string | undefined>(undefined);
  const turnSerial = useRef(0);
  const trace = useRef<HTMLOListElement | null>(null);
  const pendingLink = useRef<{ code: string; state: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const clock = useRef<TurnClock>(createTurnClock());
  const captionState = useRef<Caption>(emptyCaption());
  const silenced = useRef(false);
  const openedAt = useRef(Date.now());
  const approvedAt = useRef<number | null>(null);
  const seenTasks = useRef(new Set<string>());
  const seenRuns = useRef(new Set<string>());
  const toastTimer = useRef(0);
  const holding = useRef(false);
  const approveRef = useRef<HTMLButtonElement | null>(null);
  const talkRef = useRef<HTMLButtonElement | null>(null);
  const focusedApproval = useRef<string | null>(null);
  const { speak, stop } = useSpeechOutput(setSpeaking);
  const speakRef = useRef(speak);
  speakRef.current = speak;

  const showToast = useCallback((line: string) => {
    setToast(line);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 8000);
  }, []);

  const publishSample = useCallback((next: TurnClock) => {
    const taken = takeSample(next);
    clock.current = taken.clock;
    if (!taken.sample) return;
    console.info(JSON.stringify(taken.sample));
    setSamples((current) => [...current, taken.sample!].slice(-10));
  }, []);

  const haltSpeech = useCallback(() => {
    silenced.current = true;
    stop();
    publishSample({ ...clock.current, pendingLines: 0 });
  }, [publishSample, stop]);

  const refreshStatus = useCallback(async () => {
    const response = await fetch('/api/alexa-sim/status');
    if (response.status === 401) {
      setLocked(true);
      return;
    }
    const body = asRecord(await response.json());
    if (!body) return;
    setStatus({
      linked: body.linked === true,
      mode: body.mode === 'oauth' || body.mode === 'dev-token' ? body.mode : 'unconfigured',
      model: typeof body.model === 'string' ? body.model : '',
    });
  }, []);

  const finishPendingLink = useCallback(async () => {
    const pending = pendingLink.current;
    if (!pending) return;
    const response = await fetch('/api/alexa-sim/link/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pending),
    });
    if (response.status === 401) {
      setLocked(true);
      return;
    }
    pendingLink.current = null;
    if (!response.ok) setLinkNote('AGORA+ could not be linked.');
  }, []);

  const unlock = useCallback(() => {
    setLocked(false);
    setReady(true);
    void (async () => {
      try {
        await finishPendingLink();
        await refreshStatus();
      } catch {
        setLinkNote('The household could not be reached.');
      }
    })();
  }, [finishPendingLink, refreshStatus]);

  useEffect(() => {
    document.title = DOCUMENT_TITLE;
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    if (params.get('linked') === '1' && code && state) {
      pendingLink.current = { code, state };
      window.history.replaceState({}, '', '/alexa');
    }
    void (async () => {
      try {
        const session = await fetch('/api/session');
        const body = asRecord(await session.json());
        if (body?.required === true && body.active !== true) {
          setLocked(true);
          return;
        }
        setReady(true);
        await finishPendingLink();
        await refreshStatus();
      } catch {
        setLinkNote('The household could not be reached.');
      }
    })();
  }, [finishPendingLink, refreshStatus]);

  useEffect(() => {
    if (trace.current) trace.current.scrollTop = 0;
  }, [turns]);

  useEffect(() => () => {
    window.clearTimeout(toastTimer.current);
    abortRef.current?.abort();
  }, []);

  const submit = useCallback(async (utterance: string) => {
    const text = utterance.trim();
    if (!text) return;
    const serial = turnSerial.current + 1;
    turnSerial.current = serial;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const wallStart = Date.now();
    if (phase === 'approval' && !isDecline(text)) approvedAt.current = wallStart;
    silenced.current = false;
    stop();
    clock.current = createTurnClock();
    captionState.current = emptyCaption();
    setCaption('');
    const started = performance.now();
    const elapsed = () => Math.round(performance.now() - started);
    const pushClock = (next: TurnClock) => {
      if (serial !== turnSerial.current) return;
      publishSample(next);
    };
    const pushCaption = (next: Caption) => {
      if (serial !== turnSerial.current) return;
      captionState.current = next;
      setCaption(next.visible);
    };
    const say = (line: string, kind: 'ack' | 'answer') => {
      pushClock(noteLineQueued(clock.current));
      const hooks: SpeechHooks = {
        onStart: () => pushClock(noteAudioStart(clock.current, elapsed())),
        onDone: () => {
          pushClock(noteLineDone(clock.current));
          if (kind === 'ack') pushCaption(captionAckFinished(captionState.current));
        },
      };
      if (silenced.current) {
        hooks.onDone?.(false);
        return;
      }
      speak(line, hooks);
    };
    setBusy(true);
    setPhase('thinking');
    setDraft('');
    setMicNote(null);
    let nextPhase: 'idle' | 'approval' | 'error' = phase === 'approval' ? 'approval' : 'idle';
    const id = `turn-${serial}`;
    setTurns((current) => [
      ...current,
      { id, utterance: text, spoken: '', ackText: '', tools: [] },
    ]);

    const patch = (update: (turn: TraceTurn) => TraceTurn) => {
      setTurns((current) => current.map((turn) => turn.id === id ? update(turn) : turn));
    };

    try {
      await streamTurn(text, conversationId.current, (frame) => {
        if (serial !== turnSerial.current) return;
        const data = frame.data;
        if (frame.event === 'ack' && typeof data.text === 'string') {
          if (typeof data.conversationId === 'string') conversationId.current = data.conversationId;
          const ackText = data.text;
          const ackAt = elapsed();
          patch((turn) => ({
            ...turn,
            ackText,
            spoken: ackText,
            ackMs: ackAt,
          }));
          pushCaption(captionAck(captionState.current, ackText));
          say(ackText, 'ack');
        } else if (frame.event === 'tool_call' && typeof data.name === 'string') {
          const card: ToolCard = { name: data.name, status: 'running', speech: '' };
          patch((turn) => ({ ...turn, tools: [...turn.tools, card] }));
        } else if (frame.event === 'tool_result' && typeof data.name === 'string') {
          const receipt = asRecord(data.receipt);
          const incoming = eventSummary(data);
          patch((turn) => {
            const tools = [...turn.tools];
            const index = (() => {
              for (let cursor = tools.length - 1; cursor >= 0; cursor -= 1) {
                if (tools[cursor]?.name === data.name && tools[cursor]?.status === 'running') return cursor;
              }
              return -1;
            })();
            const next: ToolCard = withSummary({
              name: data.name as string,
              status: data.status === 'needs_approval' || data.status === 'error' ? data.status : 'ok',
              speech: typeof data.speech === 'string' ? data.speech : '',
              ...(receipt ? { receipt: { verified: receipt.verified === true, ...(typeof receipt.action === 'string' ? { action: receipt.action } : {}), ...(typeof receipt.id === 'string' ? { id: receipt.id } : {}) } } : {}),
              ...(typeof data.approvalId === 'string' ? { approvalId: data.approvalId } : {}),
              ...(typeof data.ms === 'number' ? { ms: data.ms } : {}),
            }, incoming);
            if (index >= 0) tools[index] = next;
            else tools.push(next);
            return { ...turn, tools };
          });
          if (data.name === 'approve_action' && data.status !== 'needs_approval' && data.status !== 'error') {
            nextPhase = 'idle';
          }
          if (data.status === 'needs_approval') {
            nextPhase = 'approval';
            setPhase('approval');
          }
        } else if (frame.event === 'approval_required' && typeof data.approvalId === 'string') {
          const summary = eventSummary(data) || (typeof data.summary === 'string' ? data.summary : '');
          patch((turn) => ({
            ...turn,
            tools: turn.tools.map((card) => card.approvalId === data.approvalId ? withSummary({ ...card, status: 'needs_approval' }, summary) : card),
          }));
          nextPhase = 'approval';
          setPhase('approval');
        } else if (frame.event === 'final' && typeof data.text === 'string') {
          if (typeof data.conversationId === 'string') conversationId.current = data.conversationId;
          if (typeof data.runId === 'string' && data.runId && approvedAt.current === null) approvedAt.current = wallStart;
          const timings = asRecord(data.timings);
          const route = timings?.route === 'fast' || timings?.route === 'model' ? timings.route : undefined;
          patch((turn) => ({
            ...turn,
            spoken: data.text as string,
            ...(typeof timings?.totalMs === 'number' ? { totalMs: timings.totalMs } : {}),
            ...(route ? { route } : {}),
          }));
          pushCaption(captionAnswer(captionState.current, data.text));
          pushClock(noteFinal(clock.current, elapsed()));
          say(data.text, 'answer');
        } else if (frame.event === 'error') {
          const message = typeof data.message === 'string' ? data.message : 'The voice turn failed.';
          const detail = typeof data.detail === 'string' ? data.detail : message;
          const route = data.route === 'fast' || data.route === 'model' ? data.route : undefined;
          patch((turn) => ({
            ...turn,
            spoken: message,
            errorDetail: detail,
            totalMs: elapsed(),
            ...(route ? { route } : {}),
          }));
          setPhase('error');
          nextPhase = 'error';
          pushCaption(captionAnswer(captionState.current, message));
          pushClock(noteFinal(clock.current, elapsed()));
          say(message, 'answer');
        }
      }, controller.signal);
    } catch (error) {
      if (controller.signal.aborted || serial !== turnSerial.current) return;
      if (error instanceof HouseholdLocked) setLocked(true);
      else {
        nextPhase = 'error';
        setPhase('error');
        patch((turn) => ({ ...turn, spoken: 'The voice turn failed.', errorDetail: 'The voice turn failed.' }));
        pushCaption(captionAnswer(captionState.current, 'The voice turn failed.'));
        pushClock(noteFinal(clock.current, elapsed()));
        say('The voice turn failed.', 'answer');
      }
    } finally {
      if (serial === turnSerial.current) {
        pushClock(noteStreamDone(clock.current));
        setBusy(false);
        setPhase(nextPhase);
      }
    }
  }, [phase, publishSample, speak, stop]);

  const onMicError = useCallback((message: string) => {
    setMicNote(message);
    if (message === 'Microphone blocked') {
      document.getElementById('alexa-utterance')?.focus();
    }
  }, []);

  const { supported, listening, interim, start, stop: stopInput } = useSpeechInput((text) => {
    void submit(text);
  }, onMicError);
  const listeningRef = useRef(listening);
  listeningRef.current = listening;

  const bargeIn = useCallback(() => {
    haltSpeech();
    start();
  }, [haltSpeech, start]);

  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const speakingRef = useRef(speaking);
  speakingRef.current = speaking;
  const approval = pendingCard(turns, phase);
  const approvalRef = useRef(approval);
  approvalRef.current = approval;
  const submitRef = useRef(submit);
  submitRef.current = submit;
  const haltRef = useRef(haltSpeech);
  haltRef.current = haltSpeech;

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (approvalRef.current) {
          event.preventDefault();
          submitRef.current('no');
          return;
        }
        if (speakingRef.current) {
          event.preventDefault();
          haltRef.current();
        }
        return;
      }
      if (event.code !== 'Space' || event.repeat) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('input, textarea, select')) return;
      if (target instanceof HTMLElement && target.closest('a, button') && !target.closest('#talk-btn')) return;
      event.preventDefault();
      bargeIn();
    };
    const up = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return;
      stopInput();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [bargeIn, stopInput]);

  useEffect(() => {
    const id = approval?.approvalId ?? null;
    if (id && !busy) {
      if (focusedApproval.current !== id) {
        focusedApproval.current = id;
        approveRef.current?.focus();
      }
      return;
    }
    if (!id && focusedApproval.current) {
      focusedApproval.current = null;
      talkRef.current?.focus();
    }
  }, [approval?.approvalId, busy]);

  useEffect(() => {
    if (!ready || locked) return;
    let cancelled = false;
    const stopWatch = startHouseholdWatch(() => {
      void (async () => {
        if (cancelled || listeningRef.current) return;
        try {
          const response = await fetch('/api/household');
          if (response.status === 401) {
            setLocked(true);
            return;
          }
          if (!response.ok) return;
          const notices = householdNotices(
            await response.json(),
            Date.now(),
            openedAt.current,
            approvedAt.current,
            seenTasks.current,
            seenRuns.current,
          );
          if (cancelled || notices.lines.length === 0) return;
          for (const taskId of notices.taskIds) seenTasks.current.add(taskId);
          for (const runId of notices.runIds) seenRuns.current.add(runId);
          showToast(notices.lines.join(' '));
          for (const line of notices.lines) speakRef.current(line);
        } catch {
          // The next poll tries again. A missed reminder is not an error on screen.
        }
      })();
    });
    return () => {
      cancelled = true;
      stopWatch();
    };
  }, [locked, ready, showToast]);

  const ring: RingState = listening
    ? 'listening'
    : speaking
      ? 'speaking'
      : phase === 'thinking'
        ? 'thinking'
        : phase === 'approval'
          ? 'approval'
          : phase === 'error'
            ? 'error'
            : 'idle';

  const link = async () => {
    setLinkNote(null);
    const response = await fetch('/api/alexa-sim/link');
    if (response.status === 401) {
      setLocked(true);
      return;
    }
    const body = asRecord(await response.json());
    if (typeof body?.url === 'string') window.location.assign(body.url);
    else setLinkNote('Linking is not configured on this server.');
  };

  const latest = turns[turns.length - 1];
  const userLine = listening && interim ? interim : latest?.utterance ?? '';
  const approvalBody = approval ? approvalCopy(approval) : '';
  const newestFirst = [...turns].reverse();

  const decide = (utterance: string) => {
    void submit(utterance);
  };

  return (
    <div className="min-h-dvh overflow-x-hidden bg-paper text-ink lg:h-dvh lg:overflow-hidden">
      <div className="flex min-h-dvh flex-col lg:h-full lg:flex-row">
        <section className="flex min-w-0 flex-col lg:h-full lg:w-[58%] lg:max-w-[920px] lg:shrink-0" aria-label="Simulated Alexa+ device">
          <div className="flex items-center justify-center px-3 pt-3 lg:min-h-0 lg:flex-1 lg:px-6 lg:pt-6">
            <div
              data-testid="alexa-device"
              className="w-full max-w-full overflow-hidden rounded-[2rem] bg-ink p-2 shadow-[0_24px_60px_-24px_rgba(23,21,15,0.55)] ring-1 ring-ink/10 lg:h-full lg:max-h-[640px]"
            >
              <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[1.6rem] border border-paper/10 bg-zinc-900 text-paper">
                <header className="flex items-start justify-between gap-3 border-b border-paper/10 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-butter">AGORA+</p>
                    <h1 className="text-sm font-black leading-snug">AGORA+ voice · simulated Alexa+ experience (unofficial)</h1>
                  </div>
                  <a href="/" className={`shrink-0 rounded-full border border-paper/20 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-paper ${FOCUS}`}>
                    Office
                  </a>
                </header>

                <div className="flex items-center justify-between gap-2 px-4 py-2 text-[11px]">
                  {status?.linked ? (
                    <span className="font-bold text-butter">Linked ✓</span>
                  ) : (
                    <button type="button" onClick={() => void link()} className="rounded-full bg-butter px-3 py-1 text-[10px] font-black uppercase tracking-widest text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
                      Link AGORA+
                    </button>
                  )}
                  {status && (status.mode !== 'dev-token' || debugMode) ? (
                    <span className="rounded-full border border-paper/20 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider">{status.mode}</span>
                  ) : null}
                </div>
                {linkNote ? <p className="px-4 text-[11px] text-butter">{linkNote}</p> : null}

                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4">
                  <div className="m-auto flex w-full flex-col items-center">
                    <StatusRing state={ring} />
                    <p className="mt-3 text-center text-[11px] font-bold uppercase tracking-[0.18em] text-paper/60">{RING_LABEL[ring]}</p>
                    <div className="mt-4 min-h-16 w-full text-center" aria-live="polite" aria-atomic="true" data-testid="alexa-caption">
                      {userLine ? <p className="text-[clamp(16px,2.6dvh,22px)] leading-snug text-paper/70 transition-opacity duration-200 motion-reduce:transition-none">{userLine}</p> : null}
                      <p className="mt-1 text-[clamp(16px,2.6dvh,22px)] font-medium leading-snug text-paper transition-opacity duration-200 motion-reduce:transition-none">
                        {caption || (busy ? '…' : '')}
                      </p>
                    </div>
                    {toast ? (
                      <p role="status" data-testid="alexa-toast" className="mt-3 w-full rounded-2xl border border-paper/15 px-3 py-2 text-center text-sm text-paper">
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
                      className="mt-4 rounded-3xl border border-butter/50 bg-butter/15 p-4 shadow-[0_12px_32px_-20px_rgba(23,21,15,0.8)]"
                    >
                      <p id="alexa-approval-title" className="text-[10px] font-black uppercase tracking-[0.16em] text-butter">Waiting for approval</p>
                      <p id="alexa-approval-body" className="mt-2 whitespace-pre-wrap text-base leading-snug text-paper">{approvalBody}</p>
                      <div className="mt-3 flex gap-2">
                        <button
                          ref={approveRef}
                          type="button"
                          disabled={busy}
                          onClick={() => decide('yes')}
                          className="flex-1 rounded-full bg-butter px-3 py-2 text-[11px] font-black uppercase tracking-widest text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-40"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => decide('no')}
                          className={`flex-1 rounded-full border border-paper/30 px-3 py-2 text-[11px] font-black uppercase tracking-widest text-paper ${FOCUS} disabled:opacity-40`}
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="shrink-0 space-y-3 px-3 py-3 lg:px-6 lg:pb-5">
            {!supported ? <p className="text-[11px] text-ink/70">Speech recognition needs a Chromium browser. Type below.</p> : null}
            {micNote ? <p className="text-[11px] text-ink" role="status">{micNote}</p> : null}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                id="talk-btn"
                ref={talkRef}
                aria-pressed={listening}
                disabled={!supported}
                onPointerDown={(event) => {
                  if (!supported) return;
                  event.preventDefault();
                  holding.current = true;
                  try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* pointer already released */ }
                  bargeIn();
                }}
                onPointerUp={() => {
                  holding.current = false;
                  stopInput();
                }}
                onPointerCancel={() => {
                  holding.current = false;
                  stopInput();
                }}
                onPointerLeave={() => {
                  if (!holding.current) return;
                  holding.current = false;
                  stopInput();
                }}
                className={`h-11 min-w-32 shrink-0 rounded-full bg-butter px-4 text-[10px] font-black uppercase tracking-widest text-ink ${FOCUS_INK} disabled:opacity-40`}
              >
                {listening ? 'Listening' : 'Hold to talk'}
              </button>
              {speaking ? (
                <button
                  type="button"
                  data-testid="alexa-stop"
                  onClick={() => haltSpeech()}
                  className={`h-11 shrink-0 rounded-full border border-ink bg-paper px-4 text-[10px] font-black uppercase tracking-widest text-ink ${FOCUS_INK}`}
                >
                  Stop
                </button>
              ) : null}
              <form
                className="flex min-w-0 flex-1 basis-full gap-2 sm:basis-64"
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
                  className={`min-w-0 flex-1 rounded-full border border-ink/15 bg-paper px-3 py-2 text-sm text-ink ${FOCUS_INK}`}
                />
                <button
                  type="submit"
                  disabled={!draft.trim()}
                  className={`rounded-full border border-ink/20 px-3 text-[10px] font-black uppercase tracking-widest text-ink ${FOCUS_INK} disabled:opacity-40`}
                >
                  Send
                </button>
              </form>
              {SAMPLES.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  disabled={busy}
                  onClick={() => void submit(prompt)}
                  className={`min-w-0 max-w-full whitespace-normal rounded-full border border-ink/15 px-3 py-1 text-left text-[11px] leading-snug text-ink ${FOCUS_INK} disabled:opacity-40`}
                >
                  {prompt}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-ink/60">Hold Space to talk. Press Escape to stop. Answers stay to two short sentences.</p>
          </div>
        </section>

        <aside className="flex min-w-0 flex-col border-t border-ink/10 bg-ink text-paper lg:h-full lg:min-h-0 lg:flex-1 lg:border-l lg:border-t-0" aria-label="Under the hood" data-testid="alexa-trace">
          <div className="shrink-0 space-y-3 border-b border-paper/10 px-4 py-4">
            <h2 className="text-sm font-black uppercase tracking-[0.16em] text-butter">Under the hood</h2>
            <p className="text-[11px] leading-relaxed text-paper/80">
              MCP · Streamable HTTP · 2025-11-25 · auth: {authLabel(status)}
            </p>
            <LatencyMeter samples={samples} className="text-left" />
            <p className="text-[11px] leading-relaxed text-paper/60">
              Reported Alexa+ wait: up to 15 s (<a href={ALEXA_WAIT_SOURCE} className={`underline decoration-paper/30 underline-offset-2 ${FOCUS}`}>Spyglass, Sep 2025</a>) and 3-5 s for simple commands (<a href={VERGE_WAIT_SOURCE} className={`underline decoration-paper/30 underline-offset-2 ${FOCUS}`}>The Verge, Oct 2026</a>). This meter is time to first audio.
            </p>
          </div>
          <ol ref={trace} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {newestFirst.length === 0 ? <li className="text-[11px] text-paper/50">No turn yet.</li> : null}
            {newestFirst.map((turn) => (
              <li key={turn.id} className="rounded-2xl border border-paper/10 bg-zinc-950 p-3">
                <p className="text-sm leading-snug text-paper">{turn.utterance}</p>
                <p className="mt-2 text-[11px] tabular-nums text-paper/70">
                  <span className="font-mono uppercase tracking-wider">ack</span>
                  {turn.ackText ? ` · ${turn.ackText}` : ''}
                  {typeof turn.ackMs === 'number' ? ` · ${turn.ackMs} ms` : ''}
                </p>
                {turn.route ? (
                  <p className="mt-2">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${turn.route === 'fast' ? 'bg-butter text-ink' : 'bg-paper/10 text-paper'}`}>
                      {turn.route === 'fast' ? 'fast path · no model' : 'Claude on Bedrock'}
                    </span>
                  </p>
                ) : null}
                {turn.tools.length > 0 ? (
                  <div className="mt-2 space-y-2">
                    {turn.tools.map((card, index) => (
                      <div key={`${card.name}-${index}`}>
                        <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-paper/50">tools/call</p>
                        <ReceiptCard
                          card={card}
                          busy={busy}
                          showActions={false}
                          onApprove={() => decide('yes')}
                          onDecline={() => decide('no')}
                        />
                      </div>
                    ))}
                  </div>
                ) : null}
                {turn.errorDetail ? (
                  <p className="mt-2 break-words font-mono text-[11px] leading-relaxed text-butter">{turn.errorDetail}</p>
                ) : null}
                {typeof turn.totalMs === 'number' ? (
                  <p className="mt-2 text-[11px] tabular-nums text-paper/70">final · {turn.totalMs} ms</p>
                ) : null}
              </li>
            ))}
          </ol>
        </aside>
      </div>

      {locked ? (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-ink/80 p-6">
          <div role="dialog" aria-modal="true" aria-labelledby="alexa-passcode" className="w-full max-w-xs rounded-3xl border border-paper/15 bg-zinc-900 p-4">
            <PasscodeForm onUnlocked={unlock} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
