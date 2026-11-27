import { aiErrorMessage } from '@housekeeping/api';
import { finalizeDictation, type FinalizedDictation, type StartTimer } from '@housekeeping/core';
import { useCallback, useEffect, useRef, useState } from 'react';

import { startSpeech } from './speech';
import { SpeechError, type SpeechSession } from './speech-common';

const startTimer: StartTimer = (run, ms) => {
  const timer = setTimeout(run, ms);
  return () => clearTimeout(timer);
};

export type DictationStatus = 'idle' | 'starting' | 'listening' | 'stopping';

export interface Dictation {
  status: DictationStatus;
  /** What was understood so far (interim words included). */
  transcript: string;
  /** Calm German message when dictation could not start or broke off. */
  error: string | undefined;
  start(): void;
  /**
   * Stops listening and resolves with the final transcript, or after at most 1.5 s with what was
   * shown (spec 0068, decision 2); `failed` when recognition broke off meanwhile (AC-007).
   * Resolves with '' when nothing was running.
   */
  stop(): Promise<FinalizedDictation>;
  /** Stops without a result, also while still starting (spec 0068, AC-008, AC-009). */
  cancel(): void;
  dismissError(): void;
}

/**
 * Dictation (web): microphone → Azure Speech, interim transcript shown live. `onStopWord` runs
 * when the person says „Ende“ on its own (spec 0040, decision 7), e.g. to finish like a second tap.
 */
export function useDictation(options?: { onStopWord?: () => void }): Dictation {
  const [status, setStatus] = useState<DictationStatus>('idle');
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | undefined>();
  const session = useRef<SpeechSession | undefined>(undefined);
  // Each start gets a number; a cancel moves it on, so a start still on its way ends itself.
  const attempt = useRef(0);
  const heard = useRef('');
  // Set while stopping: a break-off then ends the wait with what was shown (AC-007).
  const breakOff = useRef<(() => void) | undefined>(undefined);
  const mounted = useRef(true);
  const onStopWord = useRef(options?.onStopWord);
  useEffect(() => {
    onStopWord.current = options?.onStopWord;
  });

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      attempt.current += 1;
      session.current?.cancel();
      session.current = undefined;
    };
  }, []);

  const start = useCallback(() => {
    if (session.current) return;
    attempt.current += 1;
    const mine = attempt.current;
    const current = () => mounted.current && attempt.current === mine;
    setError(undefined);
    setTranscript('');
    heard.current = '';
    setStatus('starting');
    startSpeech({
      onTranscript: (text) => {
        heard.current = text;
        if (current()) setTranscript(text);
      },
      onStopWord: () => {
        if (current()) onStopWord.current?.();
      },
      onError: (message) => {
        if (breakOff.current) {
          breakOff.current();
          return;
        }
        if (!current()) return;
        session.current?.cancel();
        session.current = undefined;
        setError(message);
        setStatus('idle');
      },
    })
      .then((started) => {
        if (!current()) {
          started.cancel();
          return;
        }
        session.current = started;
        setStatus('listening');
      })
      .catch((caught: unknown) => {
        if (!current()) return;
        setError(caught instanceof SpeechError ? caught.message : aiErrorMessage(caught));
        setStatus('idle');
      });
  }, []);

  const stop = useCallback(async (): Promise<FinalizedDictation> => {
    const running = session.current;
    if (!running) return { text: '', outcome: 'final' };
    session.current = undefined;
    setStatus('stopping');
    const final = new Promise<string>((resolve, reject) => {
      breakOff.current = () => reject(new SpeechError('broke off'));
      running.stop().then(resolve, reject);
    });
    const result = await finalizeDictation(final, () => heard.current, startTimer);
    breakOff.current = undefined;
    // A wait that ran out leaves the recogniser to close itself.
    if (result.outcome !== 'final') running.cancel();
    if (mounted.current) setStatus('idle');
    return result;
  }, []);

  const cancel = useCallback(() => {
    attempt.current += 1;
    session.current?.cancel();
    session.current = undefined;
    breakOff.current = undefined;
    if (mounted.current) setStatus('idle');
  }, []);

  const dismissError = useCallback(() => setError(undefined), []);

  return { status, transcript, error, start, stop, cancel, dismissError };
}
