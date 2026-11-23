import {
  recipeListFromParams,
  recipeListToParams,
  shuffleOrder,
  type Id,
  type RecipeListFilter,
  type RecipeListSort,
} from '@housekeeping/core';
import { useState } from 'react';

import { usePageParams } from '@/lib/url-state';

// Search, filter and sort of "Essen → Rezepte" stand in the address (spec 0019, REQ-011), so a
// reload and a copied address show the same list; opening a recipe, switching tabs or views keeps
// them (spec 0008, E14). Only the random order is drawn anew per page load (AC-035).

let shuffle: readonly Id[] = [];
let round = 0;

export interface RecipeListState {
  query: string;
  filter: RecipeListFilter;
  sort: RecipeListSort;
  /**
   * Counts the changes of filter, sort and order. The list keeps its scroll position per round,
   * so each change starts at the top and "Zurück" returns to the same place (AC-011, AC-015).
   */
  round: number;
}

export interface RecipeListActions {
  setQuery: (query: string) => void;
  setFilter: (filter: RecipeListFilter) => void;
  /** "Zufall" draws a new order over the given ids each time it is chosen. */
  setSort: (sort: RecipeListSort, ids: readonly Id[]) => void;
  /** "⟳ Neu mischen". */
  reshuffle: (ids: readonly Id[]) => void;
  /** The random order over the given ids; drawn once after a reload with "Zufall". */
  shuffleFor: (ids: readonly Id[]) => readonly Id[];
}

/** The list state of "Essen → Rezepte" and its changes; each change replaces the address. */
export function useRecipeListState(): RecipeListState & RecipeListActions {
  const { params, replace } = usePageParams('rezepte');
  const state = recipeListFromParams(params);
  const [, rerender] = useState(0);
  const write = (next: Partial<typeof state>, restart: boolean) => {
    if (restart) round += 1;
    replace(recipeListToParams({ ...state, ...next }));
  };
  return {
    ...state,
    round,
    setQuery: (query) => write({ query }, false),
    setFilter: (filter) => write({ filter }, true),
    setSort: (sort, ids) => {
      if (sort === 'random') shuffle = shuffleOrder(ids, Math.random);
      write({ sort }, true);
    },
    reshuffle: (ids) => {
      shuffle = shuffleOrder(ids, Math.random);
      round += 1;
      rerender((count) => count + 1);
    },
    shuffleFor: (ids) => {
      if (shuffle.length === 0 && ids.length > 0) shuffle = shuffleOrder(ids, Math.random);
      return shuffle;
    },
  };
}
