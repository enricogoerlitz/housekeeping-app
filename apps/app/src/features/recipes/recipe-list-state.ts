import {
  DEFAULT_RECIPE_SORT,
  EMPTY_RECIPE_LIST_FILTER,
  shuffleOrder,
  type Id,
  type RecipeListFilter,
  type RecipeListSort,
} from '@housekeeping/core';
import { useSyncExternalStore } from 'react';

// Search, filter, sort and the random order of "Essen → Rezepte" while the app runs (spec 0008,
// E14): opening a recipe, switching tabs or views keeps them; a restart starts over.

export interface RecipeListState {
  query: string;
  filter: RecipeListFilter;
  sort: RecipeListSort;
  /** The random order of all recipe ids, drawn when "Zufall" is chosen or mixed again. */
  shuffle: readonly Id[];
  /**
   * Counts the changes of filter, sort and order. The list keeps its scroll position per round,
   * so each change starts at the top and "Zurück" returns to the same place (AC-011, AC-015).
   */
  round: number;
}

let state: RecipeListState = {
  query: '',
  filter: EMPTY_RECIPE_LIST_FILTER,
  sort: DEFAULT_RECIPE_SORT,
  shuffle: [],
  round: 0,
};
const listeners = new Set<() => void>();

function update(next: Partial<RecipeListState>, restart: boolean) {
  state = { ...state, ...next, round: restart ? state.round + 1 : state.round };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const snapshot = () => state;

export interface RecipeListActions {
  setQuery: (query: string) => void;
  setFilter: (filter: RecipeListFilter) => void;
  /** "Zufall" draws a new order over the given ids each time it is chosen. */
  setSort: (sort: RecipeListSort, ids: readonly Id[]) => void;
  /** "⟳ Neu mischen". */
  reshuffle: (ids: readonly Id[]) => void;
}

const actions: RecipeListActions = {
  setQuery: (query) => update({ query }, false),
  setFilter: (filter) => update({ filter }, true),
  setSort: (sort, ids) =>
    update(sort === 'random' ? { sort, shuffle: shuffleOrder(ids, Math.random) } : { sort }, true),
  reshuffle: (ids) => update({ shuffle: shuffleOrder(ids, Math.random) }, true),
};

/** The list state of "Essen → Rezepte" and its changes. */
export function useRecipeListState(): RecipeListState & RecipeListActions {
  const current = useSyncExternalStore(subscribe, snapshot, snapshot);
  return { ...current, ...actions };
}
