// Shared by the platform files speech.ts (native) and speech.web.ts.

export interface SpeechSession {
  /** Stops listening and resolves with everything recognised. */
  stop(): Promise<string>;
  /** Stops without a result (screen closed). */
  cancel(): void;
}

export interface SpeechHandlers {
  /** The transcript so far, including the words still being recognised. */
  onTranscript(text: string): void;
  /** Recognition stopped by itself with a problem; the German text for the person. */
  onError(message: string): void;
}

/** A dictation problem whose message is meant for the person (German). */
export class SpeechError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SpeechError';
  }
}

export const SPEECH_FAILED_MESSAGE = 'Die Spracheingabe hat gerade nicht geklappt';
