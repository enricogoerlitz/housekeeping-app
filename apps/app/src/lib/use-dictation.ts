import { aiErrorMessage } from '@housekeeping/api';
import { useCallback, useEffect, useRef, useState } from 'react';

import { startSpeech } from './speech';
import { SpeechError, type SpeechSession } from './speech-common';

export type DictationStatus = 'idle' | 'starting' | 'listening' | 'stopping';

export interface Dictation {
  status: DictationStatus;
  /** What was understood so far (interim words included). */
  transcript: string;
  /** Calm German message when dictation could not start or broke off. */
  error: string | undefined;
  start(): void;
  /** Stops listening and resolves with the transcript ('' when nothing was running). */
  stop(): Promise<string>;
  dismissError(): void;
}

/** Real dictation (backend mode, web): microphone → Azure Speech, interim transcript shown live. */
export function useDictation(): Dictation {
  const [status, setStatus] = useState<DictationStatus>('idle');
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | undefined>();
  const session = useRef<SpeechSession | undefined>(undefined);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      session.current?.cancel();
      session.current = undefined;
    };
  }, []);

  const start = useCallback(() => {
    if (session.current) return;
    setError(undefined);
    setTranscript('');
    setStatus('starting');
    startSpeech({
      onTranscript: (text) => {
        if (mounted.current) setTranscript(text);
      },
      onError: (message) => {
        session.current?.cancel();
        session.current = undefined;
        if (!mounted.current) return;
        setError(message);
        setStatus('idle');
      },
    })
      .then((started) => {
        if (!mounted.current) {
          started.cancel();
          return;
        }
        session.current = started;
        setStatus('listening');
      })
      .catch((caught: unknown) => {
        if (!mounted.current) return;
        setError(caught instanceof SpeechError ? caught.message : aiErrorMessage(caught));
        setStatus('idle');
      });
  }, []);

  const stop = useCallback(async () => {
    const running = session.current;
    if (!running) return '';
    session.current = undefined;
    setStatus('stopping');
    const text = await running.stop();
    if (mounted.current) setStatus('idle');
    return text;
  }, []);

  const dismissError = useCallback(() => setError(undefined), []);

  return { status, transcript, error, start, stop, dismissError };
}
