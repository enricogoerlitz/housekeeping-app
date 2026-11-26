import {
  recipeListFromParams,
  recipeListToParams,
  type Id,
  type RecipeListFilter,
  type RecipeListSort,
} from '@housekeeping/core';

import { createListSession } from '@/lib/list-session';
import { useSettings } from '@/lib/settings';
import { usePageParams } from '@/lib/url-state';

// Search, filter and sort of "Essen → Rezepte" stand in the address (spec 0019, REQ-011), so a
// reload and a copied address show the same list; opening a recipe, switching tabs or views keeps
// them (spec 0008, E14). Only the random order is drawn anew per page load (AC-035). The sort
// chosen last is also kept on the device and applies when the address names none (spec 0036,
// REQ-002).

const session = createListSession();

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
  const settings = useSettings();
  const state = recipeListFromParams(params, settings.listSorts.recipes);
  const current = session.useCurrent();
  const write = (next: Partial<typeof state>) => replace(recipeListToParams({ ...state, ...next }));
  return {
    ...state,
    round: current.round,
    setQuery: (query) => write({ query }),
    setFilter: (filter) => {
      session.restart();
      write({ filter });
    },
    setSort: (sort, ids) => {
      if (sort === 'random') session.reshuffle(ids);
      else session.restart();
      settings.update({ listSorts: { ...settings.listSorts, recipes: sort } });
      write({ sort });
    },
    reshuffle: session.reshuffle,
    shuffleFor: (ids) => session.shuffleFor(current, ids),
  };
}
