import {
  insertAtCursor,
  promptSendStep,
  type DictationOutcome,
  type PromptSendEvent,
  type PromptSendPhase,
} from '@housekeeping/core';
import { toast } from '@housekeeping/ui';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { useDictation, type DictationStatus } from './use-dictation';

// Spec 0068, AC-005 and AC-007.
const NOTHING_HEARD = 'Nichts verstanden – sprich noch einmal oder tippe.';
const SEND_BROKE_OFF = 'Die Spracheingabe brach ab – gesendet ist, was bis dahin ankam.';
const FINISH_BROKE_OFF = 'Die Spracheingabe brach ab – im Feld steht, was bis dahin ankam.';

type Selection = { start: number; end: number };
/** The whole field after the words went in; undefined when the field went away meanwhile. */
type Finished = Promise<{ text: string; outcome: DictationOutcome } | undefined>;

export interface PromptDictation {
  status: DictationStatus;
  /** Listening or finishing: the field shows `shown` and is read-only (spec 0040, decision 6). */
  hearing: boolean;
  /** Dictation runs or a send waits for it: send stays usable without text (spec 0068, REQ-003). */
  pending: boolean;
  /** The field's text with the live words at the insert point. */
  shown: string;
  /** Calm German message under the field (refused microphone, nothing heard). */
  error: string | undefined;
  /** The microphone: the first tap listens, the second puts the words into the field. */
  toggle(): void;
  /** Send or the window's primary action (spec 0068, REQ-001). */
  send(): void;
  /** The caret while typing: the words go there. */
  select(selection: Selection): void;
  /** The person typed: the message goes. */
  typed(): void;
  /** The field went away (tab change, window closed): listening stops, nothing is sent (AC-008). */
  cancel(): void;
}

/**
 * The dictation of an AI prompt field (spec 0068): `send` while listening stops, waits for the
 * last phrase (core `finalizeDictation`, at most 1.5 s), puts it at the caret through
 * `onChangeText` and calls `onSend` once after the next render — so `onSend` reads the whole text
 * from its own state. Without dictation `send` is `onSend` at once.
 */
export function usePromptDictation(options: {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
}): PromptDictation {
  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
  });
  const dictation = useDictation({ onStopWord: () => finishIntoField() });
  const status = useRef(dictation.status);
  useLayoutEffect(() => {
    status.current = dictation.status;
  });
  const selection = useRef<Selection | undefined>(undefined);
  // Where the live words show: the caret at the moment listening started.
  const [anchor, setAnchor] = useState<Selection | undefined>(undefined);
  const phase = useRef<PromptSendPhase>('ready');
  const finishing = useRef<Finished | undefined>(undefined);
  const [queued, setQueued] = useState(0);
  // Mirrors a phase other than `ready` for the render: send stays usable (REQ-003).
  const [waiting, setWaiting] = useState(false);
  const [notice, setNotice] = useState<string>();
  const mounted = useRef(true);
  // Moves on with every cancel: a finish still on its way then leaves the field alone.
  const round = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const step = (event: PromptSendEvent) => {
    const next = promptSendStep(phase.current, event);
    phase.current = next.phase;
    return next.effect;
  };

  // One finish at a time: the second mic tap, „Ende“ and send share it (AC-016).
  const finish = () => {
    if (finishing.current) return finishing.current;
    const mine = round.current;
    const run: Finished = dictation.stop().then((result) => {
      if (finishing.current === run) finishing.current = undefined;
      if (!mounted.current || round.current !== mine) return undefined;
      const { value, onChangeText } = latest.current;
      const next = insertAtCursor(value, selection.current, result.text);
      selection.current = { start: next.cursor, end: next.cursor };
      if (next.text !== value) onChangeText(next.text);
      return { text: next.text, outcome: result.outcome };
    });
    finishing.current = run;
    return run;
  };

  function finishIntoField() {
    void finish().then((result) => {
      if (result?.outcome === 'failed' && phase.current === 'ready')
        toast.show({ message: FINISH_BROKE_OFF });
    });
  }

  // The field now holds the whole text: the fresh `onSend` reads it (AC-001, AC-006).
  useEffect(() => {
    if (queued === 0 || phase.current !== 'queued') return;
    phase.current = promptSendStep(phase.current, { type: 'sent' }).phase;
    setWaiting(false);
    latest.current.onSend();
  }, [queued]);

  const send = () => {
    // A finish on its way (second mic tap) counts as stopping until its words are in the field.
    const effect = step({
      type: 'press',
      dictation: finishing.current ? 'stopping' : status.current,
    });
    if (effect === 'send') {
      latest.current.onSend();
      return;
    }
    if (effect === 'abandon-start-and-send') {
      dictation.cancel();
      latest.current.onSend();
      return;
    }
    if (effect !== 'finalize') return;
    setWaiting(true);
    void finish().then((result) => {
      if (!result) return;
      const after = step({ type: 'finished', text: result.text });
      if (after !== 'send-after-commit') setWaiting(false);
      if (after === 'nothing-heard') setNotice(NOTHING_HEARD);
      if (after !== 'send-after-commit') return;
      if (result.outcome === 'failed') toast.show({ message: SEND_BROKE_OFF });
      setQueued((count) => count + 1);
    });
  };

  const cancelDictation = dictation.cancel;
  const cancel = useCallback(() => {
    round.current += 1;
    finishing.current = undefined;
    phase.current = promptSendStep(phase.current, { type: 'cancel' }).phase;
    setWaiting(false);
    cancelDictation();
  }, [cancelDictation, setWaiting]);

  const listening = dictation.status === 'listening';
  const hearing = listening || dictation.status === 'stopping';
  const shown =
    hearing && dictation.transcript
      ? insertAtCursor(options.value, anchor, dictation.transcript).text
      : options.value;

  return {
    status: dictation.status,
    hearing,
    pending: dictation.status !== 'idle' || waiting,
    shown,
    error: dictation.error ?? notice,
    toggle: () => {
      if (listening) {
        finishIntoField();
        return;
      }
      if (dictation.status !== 'idle') return;
      setNotice(undefined);
      setAnchor(selection.current);
      dictation.start();
    },
    send,
    select: (next) => {
      // The live words move the caret; the insert point stays where the person put it.
      if (hearing) return;
      selection.current = next;
    },
    typed: () => {
      setNotice(undefined);
      if (dictation.error) dictation.dismissError();
    },
    cancel,
  };
}
