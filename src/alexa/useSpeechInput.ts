import { useCallback, useEffect, useRef, useState } from 'react';
import { recognitionError } from './micErrors';

interface SpeechControls {
  supported: boolean;
  listening: boolean;
  interim: string;
  start: () => void;
  stop: () => void;
}

/** Push-to-talk. Interim words stay on screen until the phrase is released. */
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
      if (message) {
        errorNote.current = message;
        onErrorRef.current?.(message);
      }
      setListening(false);
    };
    rec.onend = () => {
      recognition.current = null;
      setListening(false);
      const blocked = errorNote.current;
      const text = (liveText.current || finalText.current).trim();
      finalText.current = '';
      liveText.current = '';
      errorNote.current = null;
      setInterim('');
      if (blocked || !text) return;
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

  return { supported, listening, interim, start, stop };
}
