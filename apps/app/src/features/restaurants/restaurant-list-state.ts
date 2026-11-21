import {
  DEFAULT_RESTAURANT_SORT,
  EMPTY_RESTAURANT_LIST_FILTER,
  shuffleOrder,
  type Id,
  type RestaurantListFilter,
  type RestaurantListSort,
} from '@housekeeping/core';
import { useSyncExternalStore } from 'react';

// Search, filter, sort and the random order of "Essen → Restaurants" while the app runs (spec
// 0008, REQ-005, E14): opening a restaurant, switching tabs or views keeps them; a restart starts
// over with "A–Z". Mirrors recipe-list-state.ts.

export interface RestaurantListState {
  query: string;
  filter: RestaurantListFilter;
  sort: RestaurantListSort;
  /** The random order of all restaurant ids, drawn when "Zufall" is chosen or mixed again. */
  shuffle: readonly Id[];
  /**
   * Counts the changes of filter, sort and order. The list keeps its scroll position per round,
   * so each change starts at the top and "Zurück" returns to the same place.
   */
  round: number;
}

let state: RestaurantListState = {
  query: '',
  filter: EMPTY_RESTAURANT_LIST_FILTER,
  sort: DEFAULT_RESTAURANT_SORT,
  shuffle: [],
  round: 0,
};
const listeners = new Set<() => void>();

function update(next: Partial<RestaurantListState>, restart: boolean) {
  state = { ...state, ...next, round: restart ? state.round + 1 : state.round };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const snapshot = () => state;

export interface RestaurantListActions {
  setQuery: (query: string) => void;
  setFilter: (filter: RestaurantListFilter) => void;
  /** "Zufall" draws a new order over the given ids each time it is chosen. */
  setSort: (sort: RestaurantListSort, ids: readonly Id[]) => void;
  /** "⟳ Neu mischen". */
  reshuffle: (ids: readonly Id[]) => void;
}

const actions: RestaurantListActions = {
  setQuery: (query) => update({ query }, false),
  setFilter: (filter) => update({ filter }, true),
  setSort: (sort, ids) =>
    update(sort === 'random' ? { sort, shuffle: shuffleOrder(ids, Math.random) } : { sort }, true),
  reshuffle: (ids) => update({ shuffle: shuffleOrder(ids, Math.random) }, true),
};

/** The list state of "Essen → Restaurants" and its changes. */
export function useRestaurantListState(): RestaurantListState & RestaurantListActions {
  const current = useSyncExternalStore(subscribe, snapshot, snapshot);
  return { ...current, ...actions };
}
