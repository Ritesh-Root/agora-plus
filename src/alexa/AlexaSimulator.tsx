import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { LatencyMeter, type LatencySample } from './LatencyMeter';
import { ReceiptCard, type ToolCard } from './ReceiptCard';
import { HouseholdLocked, streamTurn } from './simClient';
import { StatusRing, type RingState } from './StatusRing';
import { useSpeechInput } from './useSpeechInput';
import { useSpeechOutput } from './useSpeechOutput';

const SAMPLES = [
  'Remember Mia is allergic to peanuts',
  'Plan dinners for this week and add the groceries',
  "What's my briefing?",
  'What is Mia allergic to?',
];

interface TranscriptTurn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  tools: ToolCard[];
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
        className="w-full rounded-2xl border border-paper/20 bg-ink px-3 py-2 text-sm text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-butter"
      />
      {error ? <p className="text-sm text-butter">{error}</p> : null}
      <button
        type="submit"
        disabled={pending || !passcode}
        className="w-full rounded-full bg-butter px-4 py-2 text-[11px] font-black uppercase tracking-widest text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper disabled:opacity-40"
      >
        Unlock
      </button>
    </form>
  );
}

export default function AlexaSimulator() {
  const [locked, setLocked] = useState(false);
  const [status, setStatus] = useState<SimStatus | null>(null);
  const [turns, setTurns] = useState<TranscriptTurn[]>([]);
  const [draft, setDraft] = useState('');
  const [phase, setPhase] = useState<'idle' | 'thinking' | 'approval' | 'error'>('idle');
  const [speaking, setSpeaking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [samples, setSamples] = useState<LatencySample[]>([]);
  const [linkNote, setLinkNote] = useState<string | null>(null);
  const conversationId = useRef<string | undefined>(undefined);
  const turnSerial = useRef(0);
  const bottom = useRef<HTMLDivElement | null>(null);
  const pendingLink = useRef<{ code: string; state: string } | null>(null);
  const { speak, stop } = useSpeechOutput(setSpeaking);

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
    document.title = 'AGORA+ voice';
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
        await finishPendingLink();
        await refreshStatus();
      } catch {
        setLinkNote('The household could not be reached.');
      }
    })();
  }, [finishPendingLink, refreshStatus]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [turns, speaking]);

  const submit = useCallback(async (utterance: string) => {
    const text = utterance.trim();
    if (!text || busy) return;
    const serial = turnSerial.current + 1;
    turnSerial.current = serial;
    stop();
    const started = performance.now();
    let ttfsMs: number | null = null;
    setBusy(true);
    setPhase('thinking');
    setDraft('');
    let nextPhase: 'idle' | 'approval' | 'error' = 'idle';
    setTurns((current) => [
      ...current,
      { id: `user-${serial}`, role: 'user', text, tools: [] },
      { id: `assistant-${serial}`, role: 'assistant', text: '', tools: [] },
    ]);

    const patchAssistant = (patch: (turn: TranscriptTurn) => TranscriptTurn) => {
      setTurns((current) => current.map((turn) => turn.id === `assistant-${serial}` ? patch(turn) : turn));
    };

    try {
      await streamTurn(text, conversationId.current, (frame) => {
        if (serial !== turnSerial.current) return;
        const data = frame.data;
        if (frame.event === 'ack' && typeof data.text === 'string') {
          if (typeof data.conversationId === 'string') conversationId.current = data.conversationId;
          patchAssistant((turn) => ({ ...turn, text: data.text as string }));
          speak(data.text, () => {
            if (ttfsMs === null) ttfsMs = Math.round(performance.now() - started);
          });
        } else if (frame.event === 'tool_call' && typeof data.name === 'string') {
          const card: ToolCard = { name: data.name, status: 'running', speech: '' };
          patchAssistant((turn) => ({ ...turn, tools: [...turn.tools, card] }));
        } else if (frame.event === 'tool_result' && typeof data.name === 'string') {
          const receipt = asRecord(data.receipt);
          patchAssistant((turn) => {
            const tools = [...turn.tools];
            const index = (() => {
              for (let cursor = tools.length - 1; cursor >= 0; cursor -= 1) {
                if (tools[cursor]?.name === data.name && tools[cursor]?.status === 'running') return cursor;
              }
              return -1;
            })();
            const next: ToolCard = {
              name: data.name as string,
              status: data.status === 'needs_approval' || data.status === 'error' ? data.status : 'ok',
              speech: typeof data.speech === 'string' ? data.speech : '',
              ...(receipt ? { receipt: { verified: receipt.verified === true } } : {}),
              ...(typeof data.approvalId === 'string' ? { approvalId: data.approvalId } : {}),
              ...(typeof data.ms === 'number' ? { ms: data.ms } : {}),
            };
            if (index >= 0) tools[index] = next;
            else tools.push(next);
            return { ...turn, tools };
          });
          if (data.status === 'needs_approval') {
            nextPhase = 'approval';
            setPhase('approval');
          }
        } else if (frame.event === 'approval_required' && typeof data.approvalId === 'string') {
          const summary = typeof data.summary === 'string' ? data.summary : '';
          patchAssistant((turn) => ({
            ...turn,
            tools: turn.tools.map((card) => card.approvalId === data.approvalId ? { ...card, summary, status: 'needs_approval' } : card),
          }));
          nextPhase = 'approval';
          setPhase('approval');
        } else if (frame.event === 'final' && typeof data.text === 'string') {
          if (typeof data.conversationId === 'string') conversationId.current = data.conversationId;
          patchAssistant((turn) => ({ ...turn, text: data.text as string }));
          speak(data.text, () => {
            if (serial !== turnSerial.current) return;
            const finalMs = Math.round(performance.now() - started);
            const measured = ttfsMs ?? finalMs;
            console.info(JSON.stringify({ ttfsMs: measured, finalMs }));
            setSamples((current) => [...current, { ttfsMs: measured, finalMs }].slice(-10));
          });
        } else if (frame.event === 'error') {
          const message = typeof data.message === 'string' ? data.message : 'The voice turn failed.';
          patchAssistant((turn) => ({ ...turn, text: message }));
          setPhase('error');
          nextPhase = 'error';
          speak(message, () => {
            if (serial !== turnSerial.current) return;
            const finalMs = Math.round(performance.now() - started);
            console.info(JSON.stringify({ ttfsMs: ttfsMs ?? finalMs, finalMs }));
          });
        }
      });
    } catch (error) {
      if (error instanceof HouseholdLocked) setLocked(true);
      else {
        nextPhase = 'error';
        setPhase('error');
        patchAssistant((turn) => ({ ...turn, text: 'The voice turn failed.' }));
      }
    } finally {
      if (serial === turnSerial.current) {
        setBusy(false);
        setPhase(nextPhase);
      }
    }
  }, [busy, speak, stop]);

  const { supported, listening, interim, start, stop: stopInput } = useSpeechInput((text) => {
    void submit(text);
  });

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat || busy) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('input, textarea, select')) return;
      if (target instanceof HTMLElement && target.closest('a, button') && !target.closest('#talk-btn')) return;
      event.preventDefault();
      start();
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
  }, [busy, start, stopInput]);

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

  return (
    <div className="flex min-h-dvh items-center justify-center bg-paper p-3 text-ink">
      <div className="w-full max-w-[440px] rounded-[2rem] bg-ink p-2 shadow-[0_24px_60px_-24px_rgba(23,21,15,0.55)]">
        <section
          className="relative flex h-[min(760px,calc(100dvh-1.5rem))] flex-col overflow-hidden rounded-[1.6rem] border border-white/10 bg-[#221f18] text-paper"
          aria-label="AGORA+ voice · simulated Alexa+ experience (unofficial)"
        >
          <header className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-butter">AGORA+</p>
              <h1 className="text-sm font-black leading-snug">AGORA+ voice · simulated Alexa+ experience (unofficial)</h1>
            </div>
            <a
              href="/"
              className="shrink-0 rounded-full border border-paper/20 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-butter"
            >
              Office
            </a>
          </header>

          <div className="flex items-center justify-between gap-2 px-4 py-2 text-[11px]">
            {status?.linked ? (
              <span className="font-bold text-butter">Linked ✓</span>
            ) : (
              <button
                type="button"
                onClick={() => void link()}
                className="rounded-full bg-butter px-3 py-1 text-[10px] font-black uppercase tracking-widest text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper"
              >
                Link AGORA+
              </button>
            )}
            {status ? (
              <span className="rounded-full border border-paper/20 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider">{status.mode}</span>
            ) : null}
          </div>
          {linkNote ? <p className="px-4 text-[11px] text-butter">{linkNote}</p> : null}

          <div className="px-4 py-2">
            <StatusRing state={ring} />
            <p className="mt-2 text-center text-[11px] uppercase tracking-[0.18em] text-paper/60">{ring}</p>
            {interim ? <p className="mt-1 text-center text-sm text-butter">{interim}</p> : null}
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4" aria-live="polite" aria-relevant="additions">
            {turns.map((turn) => (
              <div key={turn.id} className={turn.role === 'user' ? 'text-right' : 'text-left'}>
                <p className={`inline-block max-w-full rounded-2xl px-3 py-2 text-sm leading-snug ${turn.role === 'user' ? 'bg-butter text-ink' : 'bg-white/5 text-paper'}`}>
                  {turn.text || (turn.role === 'assistant' ? '…' : '')}
                </p>
                {turn.tools.length > 0 ? (
                  <div className="mt-2 space-y-2">
                    {turn.tools.map((card, index) => (
                      <ReceiptCard
                        key={`${card.name}-${index}`}
                        card={card}
                        busy={busy}
                        onApprove={() => void submit('Yes, go ahead.')}
                        onDecline={() => void submit('No, cancel that.')}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
            <div ref={bottom} />
          </div>

          <div className="space-y-3 border-t border-white/10 px-4 py-3">
            <LatencyMeter samples={samples} />
            <div className="flex flex-wrap gap-2">
              {SAMPLES.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  disabled={busy}
                  onClick={() => void submit(prompt)}
                  className="rounded-full border border-paper/20 px-3 py-1 text-left text-[11px] text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-butter disabled:opacity-40"
                >
                  {prompt}
                </button>
              ))}
            </div>
            {!supported ? <p className="text-[11px] text-paper/70">Speech recognition needs a Chromium browser. Type below.</p> : null}
            <div className="flex items-center gap-2">
              <button
                type="button"
                id="talk-btn"
                aria-pressed={listening}
                disabled={!supported || busy}
                onPointerDown={(event) => {
                  event.preventDefault();
                  start();
                }}
                onPointerUp={() => stopInput()}
                onPointerCancel={() => stopInput()}
                className="h-11 shrink-0 rounded-full bg-butter px-4 text-[10px] font-black uppercase tracking-widest text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper disabled:opacity-40"
              >
                {listening ? 'Listening' : 'Hold to talk'}
              </button>
              <form
                className="flex min-w-0 flex-1 gap-2"
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
                  className="min-w-0 flex-1 rounded-full border border-paper/20 bg-ink px-3 py-2 text-sm text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-butter"
                />
                <button
                  type="submit"
                  disabled={busy || !draft.trim()}
                  className="rounded-full border border-paper/30 px-3 text-[10px] font-black uppercase tracking-widest text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-butter disabled:opacity-40"
                >
                  Send
                </button>
              </form>
            </div>
            <p className="text-center text-[10px] text-paper/50">Hold Space to talk. Answers stay to two short sentences.</p>
          </div>

          {locked ? (
            <div className="absolute inset-0 flex items-center justify-center bg-ink/80 p-6">
              <div className="w-full max-w-xs rounded-3xl border border-paper/15 bg-[#221f18] p-4">
                <PasscodeForm onUnlocked={unlock} />
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
