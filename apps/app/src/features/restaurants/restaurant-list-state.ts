import {
  restaurantListFromParams,
  restaurantListToParams,
  type Id,
  type RestaurantListFilter,
  type RestaurantListSort,
} from '@housekeeping/core';

import { createListSession } from '@/lib/list-session';
import { useSettings } from '@/lib/settings';
import { usePageParams } from '@/lib/url-state';

// Search, filter and sort of "Essen → Restaurants" stand in the address next to
// `ansicht=restaurants` (spec 0019, REQ-011); only the random order is drawn anew per page load.
// Mirrors recipe-list-state.ts, also the sort kept on the device (spec 0036, REQ-002).

const session = createListSession();

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
  const settings = useSettings();
  const state = restaurantListFromParams(params, settings.listSorts.restaurants);
  const current = session.useCurrent();
  const write = (next: Partial<typeof state>) =>
    replace(restaurantListToParams({ ...state, ...next }));
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
      settings.update({ listSorts: { ...settings.listSorts, restaurants: sort } });
      write({ sort });
    },
    reshuffle: session.reshuffle,
    shuffleFor: (ids) => session.shuffleFor(current, ids),
  };
}
