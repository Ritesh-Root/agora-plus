import { useCallback, useEffect, useRef, useState } from 'react';
import { micBlockedReason, recognitionError } from './micErrors';

interface SpeechControls {
  supported: boolean;
  listening: boolean;
  interim: string;
  /** Set when the browser refused the microphone or has no speech service. Typing still works. */
  blocked: string | null;
  start: () => void;
  stop: () => void;
}

/** A press shorter than this is "tap to talk": listening continues until the next tap. */
export const TAP_MS = 350;
/** A tapped turn stops on its own after this, in case nobody taps again. */
export const TAP_LIMIT_MS = 12_000;

/** Push-to-talk or tap-to-talk. Interim words stay on screen until the phrase ends. */
export function useSpeechInput(
  onFinal: (text: string) => void,
  onError?: (message: string) => void,
): SpeechControls {
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const recognition = useRef<SpeechRecognition | null>(null);
  const finalText = useRef('');
  const liveText = useRef('');
  const errorNote = useRef<string | null>(null);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [blocked, setBlocked] = useState<string | null>(null);
  const supported = typeof window !== 'undefined'
    && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

  const stop = useCallback(() => {
    recognition.current?.stop();
  }, []);

  useEffect(() => {
    const onBlur = () => stop();
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }, [stop]);

  // Know about a denied microphone before the first press, and notice when it is allowed again.
  useEffect(() => {
    if (!supported || typeof navigator === 'undefined' || !navigator.permissions?.query) return;
    const denied = micBlockedReason('not-allowed');
    let status: PermissionStatus | null = null;
    let cancelled = false;
    const apply = () => {
      if (!status) return;
      if (status.state === 'denied') setBlocked(denied);
      else setBlocked((current) => (current === denied ? null : current));
    };
    navigator.permissions.query({ name: 'microphone' as PermissionName }).then((result) => {
      if (cancelled) return;
      status = result;
      apply();
      result.addEventListener('change', apply);
    }).catch(() => {
      // Some browsers cannot query the microphone. The first press reports instead.
    });
    return () => {
      cancelled = true;
      status?.removeEventListener('change', apply);
    };
  }, [supported]);

  const start = useCallback(() => {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor || recognition.current) return;
    const rec = new Ctor();
    rec.lang = 'en-US';
    rec.interimResults = true;
    rec.continuous = true;
    finalText.current = '';
    liveText.current = '';
    errorNote.current = null;
    rec.onresult = (event) => {
      let spoken = finalText.current;
      let live = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const piece = event.results[index]?.[0]?.transcript ?? '';
        if (event.results[index]?.isFinal) spoken += piece;
        else live += piece;
      }
      finalText.current = spoken;
      liveText.current = `${spoken}${live}`.trim();
      setInterim(liveText.current);
    };
    rec.onerror = (event) => {
      const message = recognitionError(event.error);
      const reason = micBlockedReason(event.error);
      if (reason) setBlocked(reason);
      if (message) {
        errorNote.current = message;
        onErrorRef.current?.(reason ?? message);
      }
      setListening(false);
    };
    rec.onstart = () => setBlocked(null);
    rec.onend = () => {
      recognition.current = null;
      setListening(false);
      const failed = errorNote.current;
      const text = (liveText.current || finalText.current).trim();
      finalText.current = '';
      liveText.current = '';
      errorNote.current = null;
      setInterim('');
      if (failed || !text) return;
      onFinalRef.current(text);
    };
    recognition.current = rec;
    setListening(true);
    setInterim('');
    try {
      rec.start();
    } catch {
      recognition.current = null;
      setListening(false);
    }
  }, []);

  return { supported, listening, interim, blocked, start, stop };
}
