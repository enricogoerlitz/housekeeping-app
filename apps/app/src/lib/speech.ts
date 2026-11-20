// Streaming speech recognition. Spec 0003 covers the web only (speech.web.ts); native apps get
// it with their own spec, so here it reports "not available".
import { SpeechError, type SpeechHandlers, type SpeechSession } from './speech-common';

export async function startSpeech(_handlers: SpeechHandlers): Promise<SpeechSession> {
  throw new SpeechError('Spracheingabe gibt es hier noch nicht');
}
