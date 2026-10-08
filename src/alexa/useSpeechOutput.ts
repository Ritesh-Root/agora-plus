import { useCallback, useRef } from 'react';

interface QueuedSpeech {
  text: string;
  onStart?: () => void;
}

function browserSpeak(text: string, token: number, generation: () => number, onStart?: () => void): Promise<void> {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    if (!synth) {
      onStart?.();
      resolve();
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    const cap = window.setTimeout(() => resolve(), Math.min(15000, 2000 + text.length * 60));
    utterance.onstart = () => {
      if (generation() === token) onStart?.();
    };
    utterance.onend = () => {
      window.clearTimeout(cap);
      resolve();
    };
    utterance.onerror = () => {
      window.clearTimeout(cap);
      resolve();
    };
    synth.speak(utterance);
  });
}

async function playPolly(
  text: string,
  token: number,
  generation: () => number,
  audioRef: { current: HTMLAudioElement | null },
  onStart?: () => void,
): Promise<void> {
  const response = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (generation() !== token) return;
  if (!response.ok) throw new Error('tts');
  const blob = await response.blob();
  if (generation() !== token) return;
  const url = URL.createObjectURL(blob);
  await new Promise<void>((resolve, reject) => {
    const audio = new Audio(url);
    audioRef.current = audio;
    const finish = (failed: boolean) => {
      URL.revokeObjectURL(url);
      if (audioRef.current === audio) audioRef.current = null;
      if (failed) reject(new Error('audio'));
      else resolve();
    };
    audio.onplaying = () => {
      if (generation() === token) onStart?.();
    };
    audio.onended = () => finish(false);
    audio.onerror = () => finish(true);
    audio.onpause = () => {
      if (generation() !== token) finish(false);
    };
    void audio.play().catch(() => finish(true));
  });
}

/** Speaks one line at a time. A new turn calls stop() so nothing overlaps. */
export function useSpeechOutput(onActive: (active: boolean) => void): { speak: (text: string, onStart?: () => void) => void; stop: () => void } {
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
        try {
          await playPolly(item.text, token, () => generation.current, audioRef, () => {
            setActive(true);
            item.onStart?.();
          });
        } catch {
          if (generation.current !== token) break;
          await browserSpeak(item.text, token, () => generation.current, () => {
            setActive(true);
            item.onStart?.();
          });
        }
      }
    } finally {
      draining.current = false;
      if (queue.current.length > 0) void drain();
      else if (generation.current === token) setActive(false);
    }
  }, [setActive]);

  const speak = useCallback((text: string, onStart?: () => void) => {
    const trimmed = text.trim();
    if (!trimmed) {
      onStart?.();
      return;
    }
    queue.current.push({ text: trimmed, onStart });
    void drain();
  }, [drain]);

  return { speak, stop };
}
