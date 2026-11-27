// Spec 0068: sending a prompt while dictation runs. Pressing send stops listening, waits briefly
// for the final result of the last phrase, puts it into the field and sends the whole text once.

/** How long send waits for the last phrase's final result (decision 2). */
export const DICTATION_FINALIZE_MS = 1500;

/** `final`: the recogniser's result; `timeout`: what was shown; `failed`: broke off (AC-007). */
export type DictationOutcome = 'final' | 'timeout' | 'failed';

export interface FinalizedDictation {
  text: string;
  outcome: DictationOutcome;
}

/** Starts a timer and returns its cancel (core has no clock of its own). */
export type StartTimer = (run: () => void, ms: number) => () => void;

/**
 * Waits for `stop` (the recogniser's final text) at most `timeoutMs`; after that, or when it
 * fails, `latest()` — the words shown so far, interim ones included — is used (AC-003, AC-007).
 */
export function finalizeDictation(
  stop: Promise<string>,
  latest: () => string,
  startTimer: StartTimer,
  timeoutMs: number = DICTATION_FINALIZE_MS,
): Promise<FinalizedDictation> {
  return new Promise((resolve) => {
    let settled = false;
    let cancelTimer = () => {};
    const settle = (result: FinalizedDictation) => {
      if (settled) return;
      settled = true;
      cancelTimer();
      resolve(result);
    };
    cancelTimer = startTimer(() => settle({ text: latest(), outcome: 'timeout' }), timeoutMs);
    stop.then(
      (text) => settle({ text, outcome: 'final' }),
      () => settle({ text: latest(), outcome: 'failed' }),
    );
  });
}

/** The dictation hook's states (apps/app use-dictation.ts). */
export type PromptDictationStatus = 'idle' | 'starting' | 'listening' | 'stopping';

/** `ready`: nothing pending; `finalizing`: waiting for the last words; `queued`: in the field, sends next. */
export type PromptSendPhase = 'ready' | 'finalizing' | 'queued';

export type PromptSendEvent =
  | { type: 'press'; dictation: PromptDictationStatus }
  /** The finished dictation is in the field; `text` is the whole field. */
  | { type: 'finished'; text: string }
  | { type: 'sent' }
  /** The window closed or the field went away (AC-008). */
  | { type: 'cancel' };

export type PromptSendEffect =
  'none' | 'send' | 'abandon-start-and-send' | 'finalize' | 'send-after-commit' | 'nothing-heard';

/** One step of the send flow (spec 0068, REQ-001); the caller runs the effect. */
export function promptSendStep(
  phase: PromptSendPhase,
  event: PromptSendEvent,
): { phase: PromptSendPhase; effect: PromptSendEffect } {
  if (event.type === 'cancel') return { phase: 'ready', effect: 'none' };
  if (event.type === 'press') {
    // AC-006: one press is enough; the rest wait for the send.
    if (phase !== 'ready') return { phase, effect: 'none' };
    if (event.dictation === 'idle') return { phase, effect: 'send' };
    // AC-009: nothing said yet.
    if (event.dictation === 'starting') return { phase, effect: 'abandon-start-and-send' };
    return { phase: 'finalizing', effect: 'finalize' };
  }
  if (event.type === 'finished') {
    if (phase !== 'finalizing') return { phase, effect: 'none' };
    return event.text.trim() === ''
      ? { phase: 'ready', effect: 'nothing-heard' }
      : { phase: 'queued', effect: 'send-after-commit' };
  }
  return phase === 'queued' ? { phase: 'ready', effect: 'none' } : { phase, effect: 'none' };
}
