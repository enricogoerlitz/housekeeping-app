// Streaming speech recognition in the browser (spec 0003, AC-028; ADR-0009): the microphone
// streams straight to Azure Speech with a short-lived token from the edge function
// `speech-token`. The Foundry key never reaches the browser. The Speech SDK is large, so it is
// loaded only when the microphone is pressed.
import { isDictationStopWord } from '@housekeeping/core';
import { AI_UNAVAILABLE_MESSAGE, getSpeechToken } from '@housekeeping/api';

import {
  SPEECH_FAILED_MESSAGE,
  SpeechError,
  type SpeechHandlers,
  type SpeechSession,
} from './speech-common';

// Spec 0040, AC-009: says where the switch is; typing goes on meanwhile.
const MIC_DENIED_MESSAGE =
  'Ohne Freigabe fürs Mikrofon geht die Spracheingabe nicht. Erlaube sie in den Einstellungen – ' +
  'auf dem iPhone unter Einstellungen › Apps › Safari › Mikrofon, am Computer über das Symbol ' +
  'neben der Adresse. Tippen geht weiter.';
const NO_MIC_MESSAGE = 'Kein Mikrofon gefunden';

/** Asks for the microphone once, so a refusal gets a clear message instead of a dead session. */
async function ensureMicrophone(): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) throw new SpeechError(NO_MIC_MESSAGE);
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    for (const track of stream.getTracks()) track.stop();
  } catch (error) {
    const name = error instanceof DOMException ? error.name : '';
    if (name === 'NotAllowedError' || name === 'SecurityError')
      throw new SpeechError(MIC_DENIED_MESSAGE);
    throw new SpeechError(NO_MIC_MESSAGE);
  }
}

export async function startSpeech(handlers: SpeechHandlers): Promise<SpeechSession> {
  await ensureMicrophone();
  // Throws AiError (German message) or OfflineError; the token is never logged.
  const token = await getSpeechToken();
  const sdk = await import('microsoft-cognitiveservices-speech-sdk').catch(() => {
    throw new SpeechError(SPEECH_FAILED_MESSAGE);
  });

  const config = sdk.SpeechConfig.fromAuthorizationToken(token.token, token.region);
  config.speechRecognitionLanguage = token.language;
  if (token.model) config.setModel(token.model);
  // The SDK would run its timers in a worker from a data: URL, which the CSP forbids
  // (`worker-src 'self'`, spec 0003, AC-028, 27.11.); "off" keeps them on the page.
  config.setProperty(sdk.PropertyId.WebWorkerLoadType, 'off');
  const audio = sdk.AudioConfig.fromDefaultMicrophoneInput();
  // The SDK would load its audio worklet from a blob: URL, which the CSP forbids; the export
  // ships the same file next to the app (scripts/finish-web-export.mjs).
  if (!__DEV__) audio.setProperty('MICROPHONE-WorkletSourceUrl', '/speech-processor.js');
  const recognizer = new sdk.SpeechRecognizer(config, audio);

  const finals: string[] = [];
  let partial = '';
  // A trailing „Ende“ still being recognised is the stop word on its way; it never shows.
  const transcript = () =>
    [...finals, isDictationStopWord(partial) ? '' : partial]
      .filter((part) => part !== '')
      .join(' ');

  recognizer.recognizing = (_sender, event) => {
    partial = event.result.text;
    handlers.onTranscript(transcript());
  };
  recognizer.recognized = (_sender, event) => {
    const said = event.result.reason === sdk.ResultReason.RecognizedSpeech ? event.result.text : '';
    const stopWord = isDictationStopWord(said);
    if (said && !stopWord) finals.push(said);
    partial = '';
    handlers.onTranscript(transcript());
    if (stopWord) handlers.onStopWord?.();
  };
  recognizer.canceled = (_sender, event) => {
    if (event.reason !== sdk.CancellationReason.Error) return;
    const unreachable =
      event.errorCode === sdk.CancellationErrorCode.ConnectionFailure ||
      event.errorCode === sdk.CancellationErrorCode.ServiceTimeout ||
      event.errorCode === sdk.CancellationErrorCode.ServiceError;
    handlers.onError(unreachable ? AI_UNAVAILABLE_MESSAGE : SPEECH_FAILED_MESSAGE);
  };

  await new Promise<void>((resolve, reject) =>
    recognizer.startContinuousRecognitionAsync(resolve, () => {
      recognizer.close();
      reject(new SpeechError(SPEECH_FAILED_MESSAGE));
    }),
  );

  let closed = false;
  let stopping = false;
  const close = () => {
    if (closed) return;
    closed = true;
    recognizer.close();
  };
  return {
    stop: () =>
      new Promise<string>((resolve) => {
        stopping = true;
        recognizer.stopContinuousRecognitionAsync(
          () => {
            close();
            resolve(transcript());
          },
          () => {
            close();
            resolve(transcript());
          },
        );
      }),
    cancel: () => {
      if (closed) return;
      // A stop that waited too long (spec 0068, decision 2) is not asked to stop twice.
      if (stopping) {
        close();
        return;
      }
      recognizer.stopContinuousRecognitionAsync(close, close);
    },
  };
}
