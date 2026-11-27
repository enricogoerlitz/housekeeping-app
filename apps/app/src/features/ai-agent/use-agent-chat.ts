import { aiErrorMessage, loadAgentChat, sendAgentMessage } from '@housekeeping/api';
import type {
  AgentCard,
  AgentPlace,
  AgentSource,
  AgentStep,
  AgentStreamEvent,
  Id,
} from '@housekeeping/core';
import { useCallback, useEffect, useRef, useState } from 'react';

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
  status: 'streaming' | 'done' | 'stopped' | 'error';
  error?: string;
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
    status,
  };
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
  send: (message: string, place: AgentPlace) => void;
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
        setState({
          chatId,
          turns: messages.map((message) => ({
            ...turn(message.role, message.text, 'done'),
            cards: message.cards,
            cardsTitle: message.cardsTitle,
            followUps: message.followUps,
            sources: message.sources,
            steps: message.steps,
          })),
        });
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
    (message: string, place: AgentPlace) => {
      if (running.current && !running.current.signal.aborted) return;
      const controller = new AbortController();
      running.current = controller;
      const answer = turn('assistant', '', 'streaming');
      const question = turn('user', message.trim(), 'done');
      setBusy(true);
      setState((current) => ({ ...current, turns: [...current.turns, question, answer] }));
      const update = (change: (current: ChatTurn) => ChatTurn) =>
        setState((current) => ({
          ...current,
          turns: current.turns.map((entry) => (entry.key === answer.key ? change(entry) : entry)),
        }));
      sendAgentMessage(
        { chatId: state.chatId, message, place },
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
      )
        .then(() => {
          if (controller.signal.aborted)
            update((current) => ({ ...current, status: 'stopped', cardsPending: false }));
          else
            update((current) =>
              current.status === 'streaming' ? applyEvent(current, { type: 'done' }) : current,
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
    [state.chatId],
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
