import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import {
  householdNotices,
  startHouseholdWatch,
} from './announcements';
import type { LatencySample } from './LatencyMeter';
import type { ToolCard } from './ReceiptCard';
import { HouseholdLocked, streamTurn } from './simClient';
import type { RingState } from './StatusRing';
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
import { TAP_LIMIT_MS, TAP_MS, useSpeechInput } from './useSpeechInput';
import { useSpeechOutput, type SpeechHooks } from './useSpeechOutput';

export const SAMPLES = [
  'Remember Mia is allergic to peanuts',
  'Add milk to my shopping list',
  'Plan dinners for this week and add the groceries',
  "What's my briefing?",
  'What is Mia allergic to?',
];

export interface TraceTurn {
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

export interface SimStatus {
  linked: boolean;
  mode: 'oauth' | 'dev-token' | 'unconfigured';
  model: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function authLabel(status: SimStatus | null): string {
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

export function useAssistant() {
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
  const [tapMode, setTapMode] = useState(false);
  const [debugMode] = useState(() => new URLSearchParams(window.location.search).get('debug') === '1');
  const conversationId = useRef<string | undefined>(undefined);
  const turnSerial = useRef(0);
  const traceRef = useRef<HTMLOListElement | null>(null);
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
  const pressedAt = useRef(0);
  const tapping = useRef(false);
  const tapTimer = useRef(0);
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
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    if (params.get('linked') === '1' && code && state) {
      pendingLink.current = { code, state };
      window.history.replaceState({}, '', window.location.pathname || '/');
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
    if (traceRef.current) traceRef.current.scrollTop = 0;
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
    if (/blocked|no microphone|needs chrome/i.test(message)) {
      document.getElementById('alexa-utterance')?.focus();
    }
  }, []);

  const { supported, listening, interim, blocked, start, stop: stopInput } = useSpeechInput((text) => {
    void submit(text);
  }, onMicError);
  const listeningRef = useRef(listening);
  listeningRef.current = listening;
  const speakingRef = useRef(speaking);
  speakingRef.current = speaking;
  const voiceReady = supported && !blocked;

  const bargeIn = useCallback(() => {
    haltSpeech();
    start();
  }, [haltSpeech, start]);

  /** Voice input cannot start here. Say why once and hand the keyboard to the text box. */
  const explainNoVoice = useCallback(() => {
    setMicNote(blocked ?? 'Voice input needs Chrome or Edge. Type below.');
    document.getElementById('alexa-utterance')?.focus();
  }, [blocked]);

  const endTap = useCallback(() => {
    tapping.current = false;
    setTapMode(false);
    window.clearTimeout(tapTimer.current);
  }, []);

  /** Tap to talk: listen until the next tap, the phrase ends, or the time limit. */
  const beginTap = useCallback(() => {
    tapping.current = true;
    setTapMode(true);
    window.clearTimeout(tapTimer.current);
    tapTimer.current = window.setTimeout(() => {
      tapping.current = false;
      setTapMode(false);
      stopInput();
    }, TAP_LIMIT_MS);
  }, [stopInput]);

  useEffect(() => {
    if (!listening) endTap();
  }, [endTap, listening]);

  /** The ring is the device's main button, like the light bar on an Echo. */
  const pressRing = useCallback(() => {
    if (speakingRef.current) {
      haltSpeech();
      return;
    }
    if (listeningRef.current) {
      endTap();
      stopInput();
      return;
    }
    if (!voiceReady) {
      explainNoVoice();
      return;
    }
    bargeIn();
    beginTap();
  }, [bargeIn, beginTap, endTap, explainNoVoice, haltSpeech, stopInput, voiceReady]);

  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const voiceReadyRef = useRef(voiceReady);
  voiceReadyRef.current = voiceReady;
  const explainRef = useRef(explainNoVoice);
  explainRef.current = explainNoVoice;
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
      if (!voiceReadyRef.current) {
        explainRef.current();
        return;
      }
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
          // A finished plan is the answer to the last yes, so it stays on the device, not only in the toast.
          if (notices.runIds.length > 0) setCaption(notices.lines[notices.lines.length - 1] ?? '');
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

  const onTalkPointerDown = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    if (!voiceReady) {
      explainNoVoice();
      return;
    }
    if (tapping.current && listening) {
      // Second tap: send what was heard.
      endTap();
      stopInput();
      return;
    }
    holding.current = true;
    pressedAt.current = Date.now();
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* pointer already released */ }
    bargeIn();
  }, [bargeIn, endTap, explainNoVoice, listening, stopInput, voiceReady]);

  const onTalkPointerUp = useCallback(() => {
    if (!holding.current) return;
    holding.current = false;
    // A quick tap keeps listening until the next tap. A hold sends on release.
    if (Date.now() - pressedAt.current < TAP_MS) {
      beginTap();
      return;
    }
    stopInput();
  }, [beginTap, stopInput]);

  const onTalkPointerCancel = useCallback(() => {
    if (!holding.current) return;
    holding.current = false;
    stopInput();
  }, [stopInput]);

  const onTalkKeyDown = useCallback((event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    pressRing();
  }, [pressRing]);

  const link = useCallback(async () => {
    setLinkNote(null);
    const response = await fetch('/api/alexa-sim/link');
    if (response.status === 401) {
      setLocked(true);
      return;
    }
    const body = asRecord(await response.json());
    if (typeof body?.url === 'string') window.location.assign(body.url);
    else setLinkNote('Linking is not configured on this server.');
  }, []);

  const decide = useCallback((utterance: string) => {
    void submit(utterance);
  }, [submit]);

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

  const latest = turns[turns.length - 1];
  const userLine = listening && interim ? interim : latest?.utterance ?? '';
  const approvalBody = approval ? approvalCopy(approval) : '';
  const newestFirst = [...turns].reverse();
  const talkLabel = !voiceReady
    ? 'Mic unavailable'
    : listening && tapMode
      ? 'Tap to send'
      : listening
        ? 'Listening…'
        : 'Tap to talk';

  return {
    turns,
    newestFirst,
    phase,
    ring,
    caption,
    toast,
    busy,
    speaking,
    listening,
    interim,
    supported,
    blocked,
    micNote,
    status,
    linkNote,
    locked,
    samples,
    approval,
    approvalBody,
    debugMode,
    draft,
    setDraft,
    userLine,
    voiceReady,
    tapMode,
    talkLabel,
    submit,
    decide,
    pressRing,
    haltSpeech,
    link,
    unlock,
    onTalkPointerDown,
    onTalkPointerUp,
    onTalkPointerCancel,
    onTalkKeyDown,
    approveRef: approveRef as RefObject<HTMLButtonElement | null>,
    talkRef: talkRef as RefObject<HTMLButtonElement | null>,
    traceRef,
  };
}

export type AssistantState = ReturnType<typeof useAssistant>;
