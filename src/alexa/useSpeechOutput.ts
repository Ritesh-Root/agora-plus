import { useCallback, useRef } from 'react';

export interface SpeechHooks {
  /** Fires only when audio actually starts (`onstart` / `playing`). */
  onStart?: () => void;
  /** Fires when this line finishes. `played` is false when nothing was heard. */
  onDone?: (played: boolean) => void;
}

interface QueuedSpeech {
  text: string;
  hooks?: SpeechHooks;
}

function browserSpeak(text: string, token: number, generation: () => number, onStart?: () => void): Promise<boolean> {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    if (!synth) {
      resolve(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    let played = false;
    let settled = false;
    const finish = (heard: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(cap);
      resolve(heard);
    };
    const cap = window.setTimeout(() => finish(played), Math.min(15000, 2000 + text.length * 60));
    utterance.onstart = () => {
      if (generation() !== token) return;
      played = true;
      onStart?.();
    };
    utterance.onend = () => finish(played);
    utterance.onerror = () => finish(played);
    synth.speak(utterance);
  });
}

const POLLY_RETRY_MS = 5 * 60_000;
let pollyOffUntil = 0;

async function playPolly(
  text: string,
  token: number,
  generation: () => number,
  audioRef: { current: HTMLAudioElement | null },
  onStart?: () => void,
): Promise<boolean> {
  // After one 503 the server has no Polly; skip the round trip and let the browser voice speak now.
  if (Date.now() < pollyOffUntil) throw new Error('tts');
  const response = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (generation() !== token) return false;
  if (!response.ok) {
    if (response.status === 503) pollyOffUntil = Date.now() + POLLY_RETRY_MS;
    throw new Error('tts');
  }
  const blob = await response.blob();
  if (generation() !== token) return false;
  const url = URL.createObjectURL(blob);
  return new Promise<boolean>((resolve, reject) => {
    const audio = new Audio(url);
    audioRef.current = audio;
    let played = false;
    let settled = false;
    const finish = (heard: boolean, fallback: boolean) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      if (audioRef.current === audio) audioRef.current = null;
      if (fallback) reject(new Error('audio'));
      else resolve(heard);
    };
    audio.onplaying = () => {
      if (generation() !== token) return;
      if (audio.muted || audio.volume === 0) return;
      played = true;
      onStart?.();
    };
    audio.onended = () => finish(played, false);
    audio.onerror = () => finish(played, !played);
    audio.onpause = () => {
      if (generation() !== token) finish(played, false);
    };
    void audio.play().catch(() => finish(played, !played));
  });
}

/** Speaks one line at a time. A new turn calls stop() so nothing overlaps. */
export function useSpeechOutput(onActive: (active: boolean) => void): {
  speak: (text: string, hooks?: SpeechHooks) => void;
  stop: () => void;
} {
  const onActiveRef = useRef(onActive);
  onActiveRef.current = onActive;
  const queue = useRef<QueuedSpeech[]>([]);
  const generation = useRef(0);
  const draining = useRef(false);
  const active = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const setActive = useCallback((value: boolean) => {
    if (active.current === value) return;
    active.current = value;
    onActiveRef.current(value);
  }, []);

  const stop = useCallback(() => {
    generation.current += 1;
    queue.current = [];
    audioRef.current?.pause();
    window.speechSynthesis?.cancel();
    setActive(false);
  }, [setActive]);

  const drain = useCallback(async () => {
    if (draining.current) return;
    draining.current = true;
    const token = generation.current;
    try {
      while (queue.current.length > 0 && generation.current === token) {
        const item = queue.current.shift();
        if (!item) break;
        let played = false;
        try {
          played = await playPolly(item.text, token, () => generation.current, audioRef, () => {
            setActive(true);
            item.hooks?.onStart?.();
          });
        } catch {
          if (generation.current !== token) break;
          played = await browserSpeak(item.text, token, () => generation.current, () => {
            setActive(true);
            item.hooks?.onStart?.();
          });
        }
        if (generation.current !== token) break;
        item.hooks?.onDone?.(played);
      }
    } finally {
      draining.current = false;
      // Lines queued by a newer turn while this loop was finishing must still play,
      // or the acknowledgement stays on screen and the answer is never spoken.
      if (queue.current.length > 0) void drain();
      else if (generation.current === token) setActive(false);
    }
  }, [setActive]);

  const speak = useCallback((text: string, hooks?: SpeechHooks) => {
    const trimmed = text.trim();
    if (!trimmed) {
      hooks?.onDone?.(false);
      return;
    }
    queue.current.push({ text: trimmed, hooks });
    void drain();
  }, [drain]);

  return { speak, stop };
}
