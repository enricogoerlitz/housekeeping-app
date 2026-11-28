import {
  agentChatAnswering,
  AiError,
  aiErrorMessage,
  loadAgentChat,
  sendAgentMessage,
} from '@housekeeping/api';
import type {
  AgentAttachment,
  AgentBadgeSlug,
  AgentCard,
  AgentExtra,
  AgentMessage,
  AgentPlace,
  AgentSource,
  AgentStep,
  AgentStreamEvent,
  Id,
} from '@housekeeping/core';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { AttachmentPreview } from './agent-attachments';

// Spec 0066, REQ-005/REQ-008: the messages of one chat while the page is open. They come from the
// stream or, for a chat of "Verlauf", online from Foundry; they are never stored on the device.

export interface ChatTurn {
  key: string;
  role: 'user' | 'assistant';
  text: string;
  cards: AgentCard[];
  cardsTitle?: string;
  cardsPending: boolean;
  followUps: string[];
  sources: AgentSource[];
  steps: AgentStep[];
  /** Spec 0067, step B: proposals, recipe drafts and images of an answer. */
  extras: AgentExtra[];
  /** Loaded from "Verlauf": its proposals are shown, not applied again. */
  loaded?: boolean;
  /** `waiting`: another answer runs in this chat, this one starts after it (AC-024). */
  status: 'streaming' | 'waiting' | 'done' | 'stopped' | 'error';
  error?: string;
  /** Spec 0067: the badges and the number of photos and files of a message of the person. */
  badges?: AgentBadgeSlug[];
  attachments?: number;
  /** Preview feedback 28.11.: the local copies of this message's files, while the page is open. */
  previews?: AttachmentPreview[];
}

/** Spec 0067: the hints and files of one message. */
export interface SendExtras {
  badges?: readonly AgentBadgeSlug[];
  attachments?: readonly AgentAttachment[];
  previews?: readonly AttachmentPreview[];
  /**
   * Preview feedback 28.11. (like ChatGPT): the turn of the person's message she edited; it and
   * everything after it are replaced by this message.
   */
  editTurn?: number;
}

export type ChatLoad =
  { status: 'idle' } | { status: 'loading' } | { status: 'error'; message: string };

let turnSeq = 0;
const turnKey = () => `t${(turnSeq += 1)}`;

function turn(role: ChatTurn['role'], text: string, status: ChatTurn['status']): ChatTurn {
  return {
    key: turnKey(),
    role,
    text,
    cards: [],
    cardsPending: false,
    followUps: [],
    sources: [],
    steps: [],
    extras: [],
    status,
  };
}

/** A message of a chat from "Verlauf", as a turn of this page. */
function loadedTurn(message: AgentMessage): ChatTurn {
  return {
    ...turn(message.role, message.text, 'done'),
    cards: message.cards,
    cardsTitle: message.cardsTitle,
    followUps: message.followUps,
    sources: message.sources,
    steps: message.steps,
    extras: message.extras,
    loaded: true,
    ...(message.attachments ? { attachments: message.attachments } : {}),
  };
}

/** AC-024: how often and how long the page asks whether the other answer is done. */
const WAIT_POLL_MS = 3000;
const WAIT_POLLS = 60;
const BUSY_RETRIES = 3;

const pause = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    });
  });

/** Until no answer runs in the chat any more (or the person stops waiting). */
async function waitWhileAnswering(chatId: Id, signal: AbortSignal): Promise<void> {
  for (let poll = 0; poll < WAIT_POLLS && !signal.aborted; poll += 1) {
    await pause(WAIT_POLL_MS, signal);
    if (signal.aborted) return;
    const answering = await agentChatAnswering(chatId).catch(() => false);
    if (!answering) return;
  }
}

function applyEvent(current: ChatTurn, event: AgentStreamEvent): ChatTurn {
  switch (event.type) {
    case 'text':
      return { ...current, text: current.text + event.delta };
    case 'step': {
      const others = current.steps.filter((step) => step.id !== event.step.id);
      const index = current.steps.findIndex((step) => step.id === event.step.id);
      const steps = [...others];
      steps.splice(index < 0 ? steps.length : index, 0, event.step);
      return { ...current, steps };
    }
    case 'cards_pending':
      return { ...current, cardsPending: true };
    case 'cards':
      return {
        ...current,
        cards: event.cards,
        cardsTitle: event.title,
        followUps: event.followUps,
        cardsPending: false,
      };
    case 'sources':
      return { ...current, sources: event.sources };
    case 'extra':
      return { ...current, extras: [...current.extras, event.extra] };
    case 'done':
      return {
        ...current,
        status: 'done',
        cardsPending: false,
        steps: current.steps.map((step) => ({ ...step, status: 'done' })),
      };
    default:
      return current;
  }
}

export interface AgentChat {
  chatId?: Id;
  /** The title the server gave a chat created here, until the history has its row. */
  title?: string;
  turns: ChatTurn[];
  load: ChatLoad;
  busy: boolean;
  send: (message: string, place: AgentPlace, extras?: SendExtras) => void;
  stop: () => void;
  /** "Neuer Chat": an empty page. */
  reset: () => void;
}

/**
 * `chatId` is the chat of the address; a chat created by the first answer reports its id through
 * `onCreated` and is not loaded again.
 */
export function useAgentChat(chatId: Id | undefined, onCreated: (id: Id) => void): AgentChat {
  const [state, setState] = useState<{ chatId?: Id; title?: string; turns: ChatTurn[] }>(() => ({
    chatId,
    turns: [],
  }));
  const [load, setLoad] = useState<ChatLoad>(() =>
    chatId ? { status: 'loading' } : { status: 'idle' },
  );
  const [busy, setBusy] = useState(false);
  const running = useRef<AbortController | undefined>(undefined);
  // The chat the stream just created: the address follows it, nothing is loaded.
  const createdId = useRef<Id | undefined>(undefined);
  const created = useRef(onCreated);
  useEffect(() => {
    created.current = onCreated;
  });

  // Another chat in the address: start from its empty page while it loads (adjusted in render).
  const [address, setAddress] = useState(chatId);
  if (address !== chatId) {
    setAddress(chatId);
    if (chatId === undefined || chatId !== state.chatId) {
      setState(chatId ? { chatId, turns: [] } : { turns: [] });
      setLoad(chatId ? { status: 'loading' } : { status: 'idle' });
    }
  }

  // A chat from "Verlauf" or a reloaded address: its messages online (AC-025, AC-039).
  useEffect(() => {
    if (!chatId || chatId === createdId.current) return;
    running.current?.abort();
    let live = true;
    loadAgentChat(chatId).then(
      (messages) => {
        if (!live) return;
        setState({ chatId, turns: messages.map(loadedTurn) });
        setLoad({ status: 'idle' });
      },
      (error: unknown) => {
        if (live) setLoad({ status: 'error', message: aiErrorMessage(error) });
      },
    );
    return () => {
      live = false;
    };
  }, [chatId]);

  useEffect(() => () => running.current?.abort(), []);

  const send = useCallback(
    (message: string, place: AgentPlace, extras: SendExtras = {}) => {
      if (running.current && !running.current.signal.aborted) return;
      const controller = new AbortController();
      running.current = controller;
      const answer = turn('assistant', '', 'streaming');
      const question: ChatTurn = {
        ...turn('user', message.trim(), 'done'),
        ...(extras.badges?.length ? { badges: [...extras.badges] } : {}),
        ...(extras.attachments?.length ? { attachments: extras.attachments.length } : {}),
        ...(extras.previews?.length ? { previews: [...extras.previews] } : {}),
      };
      setBusy(true);
      const edit = extras.editTurn;
      const editFrom =
        edit === undefined
          ? undefined
          : state.turns.slice(0, edit).filter((entry) => entry.role === 'user').length;
      setState((current) => ({
        ...current,
        turns: [
          ...(edit === undefined ? current.turns : current.turns.slice(0, edit)),
          question,
          answer,
        ],
      }));
      const update = (change: (current: ChatTurn) => ChatTurn) =>
        setState((current) => ({
          ...current,
          turns: current.turns.map((entry) => (entry.key === answer.key ? change(entry) : entry)),
        }));
      const chatId = state.chatId;
      const attempt = (again: boolean) =>
        sendAgentMessage(
          {
            chatId,
            // After waiting for another answer the message goes as a new one.
            ...(editFrom !== undefined && !again ? { editFrom } : {}),
            message,
            place,
            badges: extras.badges,
            attachments: extras.attachments,
          },
          (event) => {
            if (event.type === 'chat') {
              setState((current) => ({ ...current, chatId: event.chatId, title: event.title }));
              createdId.current = event.chatId;
              created.current(event.chatId);
              return;
            }
            update((current) => applyEvent(current, event));
          },
          controller.signal,
        );
      // AC-024: another person's answer runs in this chat — "Agent antwortet gerade …" until it is
      // done, then her question and its answer appear and this message goes.
      const run = async () => {
        for (let tries = 0; ; tries += 1) {
          try {
            await attempt(tries > 0);
            return;
          } catch (error) {
            const busy = error instanceof AiError && error.reason === 'busy';
            if (!busy || !chatId || tries >= BUSY_RETRIES) throw error;
            update((current) => ({ ...current, status: 'waiting' }));
            await waitWhileAnswering(chatId, controller.signal);
            if (controller.signal.aborted) return;
            const messages = await loadAgentChat(chatId);
            setState((current) => ({
              ...current,
              turns: [...messages.map(loadedTurn), question, { ...answer, status: 'streaming' }],
            }));
          }
        }
      };
      run()
        .then(() => {
          if (controller.signal.aborted)
            update((current) => ({ ...current, status: 'stopped', cardsPending: false }));
          else
            update((current) =>
              current.status === 'streaming' || current.status === 'waiting'
                ? applyEvent(current, { type: 'done' })
                : current,
            );
        })
        .catch((error: unknown) =>
          update((current) => ({
            ...current,
            status: 'error',
            cardsPending: false,
            error: aiErrorMessage(error),
          })),
        )
        .finally(() => {
          if (running.current === controller) running.current = undefined;
          setBusy(false);
        });
    },
    [state.chatId, state.turns],
  );

  const stop = useCallback(() => running.current?.abort(), []);
  const reset = useCallback(() => {
    running.current?.abort();
    setState({ turns: [] });
    setLoad({ status: 'idle' });
  }, []);

  return {
    chatId: state.chatId,
    title: state.title,
    turns: state.turns,
    load,
    busy,
    send,
    stop,
    reset,
  };
}
