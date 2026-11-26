import { shuffleOrder, type Id } from '@housekeeping/core';
import { useSyncExternalStore } from 'react';

// What a list keeps while the app runs, beside the address: the random order and the round
// (spec 0008, E14). It lives outside React so it survives leaving the tab, and reaches the
// components through useSyncExternalStore: the React Compiler memoises by reactive values, and a
// plain module variable is none, so "Neu mischen" changed nothing (spec 0036, REQ-001).

export interface ListSessionState {
  /** The random order; empty until it is first needed. */
  shuffle: readonly Id[];
  /** Counts the changes of filter, sort and order; each change starts the list at the top. */
  round: number;
}

export interface ListSession {
  /** The current state; a change renders the components that read it. */
  useCurrent: () => ListSessionState;
  /** A new round (filter or sort changed). */
  restart: () => void;
  /** A new random order over the ids and a new round ("Neu mischen", "Zufall" chosen). */
  reshuffle: (ids: readonly Id[]) => void;
  /** The random order; drawn once over the ids when there is none yet (after a reload). */
  shuffleFor: (state: ListSessionState, ids: readonly Id[]) => readonly Id[];
}

export function createListSession(): ListSession {
  let state: ListSessionState = { shuffle: [], round: 0 };
  const listeners = new Set<() => void>();
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  const set = (next: ListSessionState) => {
    state = next;
    for (const listener of listeners) listener();
  };
  const read = () => state;
  return {
    useCurrent: () => useSyncExternalStore(subscribe, read, read),
    restart: () => set({ ...state, round: state.round + 1 }),
    reshuffle: (ids) => set({ shuffle: shuffleOrder(ids, Math.random), round: state.round + 1 }),
    shuffleFor: (seen, ids) => {
      if (seen.shuffle.length > 0 || ids.length === 0) return seen.shuffle;
      // The first draw happens while rendering: it is kept without a new render, which would
      // only show the same order again.
      if (state.shuffle.length === 0) state = { ...state, shuffle: shuffleOrder(ids, Math.random) };
      return state.shuffle;
    },
  };
}
