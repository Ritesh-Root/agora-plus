import { useCallback, useRef, useState } from 'react';

interface SpeechControls {
  supported: boolean;
  listening: boolean;
  interim: string;
  start: () => void;
  stop: () => void;
}

/** Push-to-talk. Interim words stay on screen until the phrase is final. */
export function useSpeechInput(onFinal: (text: string) => void): SpeechControls {
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;
  const recognition = useRef<SpeechRecognition | null>(null);
  const finalText = useRef('');
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const supported = typeof window !== 'undefined'
    && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

  const start = useCallback(() => {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor || recognition.current) return;
    const rec = new Ctor();
    rec.lang = 'en-US';
    rec.interimResults = true;
    rec.continuous = true;
    finalText.current = '';
    rec.onresult = (event) => {
      let spoken = finalText.current;
      let live = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const piece = event.results[index]?.[0]?.transcript ?? '';
        if (event.results[index]?.isFinal) spoken += piece;
        else live += piece;
      }
      finalText.current = spoken;
      setInterim(`${spoken}${live}`.trim());
    };
    rec.onerror = () => {
      setListening(false);
    };
    rec.onend = () => {
      recognition.current = null;
      setListening(false);
      const text = finalText.current.trim();
      finalText.current = '';
      setInterim('');
      if (text) onFinalRef.current(text);
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

  const stop = useCallback(() => {
    recognition.current?.stop();
  }, []);

  return { supported, listening, interim, start, stop };
}
