import {
  restaurantListFromParams,
  restaurantListToParams,
  shuffleOrder,
  type Id,
  type RestaurantListFilter,
  type RestaurantListSort,
} from '@housekeeping/core';
import { useState } from 'react';

import { usePageParams } from '@/lib/url-state';

// Search, filter and sort of "Essen → Restaurants" stand in the address next to
// `ansicht=restaurants` (spec 0019, REQ-011); only the random order is drawn anew per page load.
// Mirrors recipe-list-state.ts.

let shuffle: readonly Id[] = [];
let round = 0;

export interface RestaurantListState {
  query: string;
  filter: RestaurantListFilter;
  sort: RestaurantListSort;
  /** Counts the changes of filter, sort and order; each change starts the list at the top. */
  round: number;
}

export interface RestaurantListActions {
  setQuery: (query: string) => void;
  setFilter: (filter: RestaurantListFilter) => void;
  /** "Zufall" draws a new order over the given ids each time it is chosen. */
  setSort: (sort: RestaurantListSort, ids: readonly Id[]) => void;
  /** "⟳ Neu mischen". */
  reshuffle: (ids: readonly Id[]) => void;
  /** The random order over the given ids; drawn once after a reload with "Zufall". */
  shuffleFor: (ids: readonly Id[]) => readonly Id[];
}

/** The list state of "Essen → Restaurants" and its changes; each change replaces the address. */
export function useRestaurantListState(): RestaurantListState & RestaurantListActions {
  const { params, replace } = usePageParams('rezepte');
  const state = restaurantListFromParams(params);
  const [, rerender] = useState(0);
  const write = (next: Partial<typeof state>, restart: boolean) => {
    if (restart) round += 1;
    replace(restaurantListToParams({ ...state, ...next }));
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
