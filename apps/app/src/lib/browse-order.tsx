import { browseNeighbour, browsePosition, type Id } from '@housekeeping/core';
import type { TabSwipe } from '@housekeeping/ui';
import { createContext, useContext } from 'react';

// Spec 0034, REQ-008: the order of the list a recipe, collection or restaurant was opened from,
// only in memory while the app runs. Opening from anywhere else (calendar, overview, AI search)
// forgets it, so there is nothing to swipe to (AC-019).

type BrowseList = 'recipes' | 'restaurants';

let remembered: { list: BrowseList; ids: readonly Id[] } | undefined;

/** The list opens one of its entries in this order; undefined forgets the last one. */
export function rememberBrowseOrder(list: BrowseList, ids: readonly Id[] | undefined): void {
  remembered = ids ? { list, ids: [...ids] } : undefined;
}

/**
 * The swipe of an entry's page through the remembered list: a step opens the neighbour, past
 * the ends it springs back (AC-018); undefined when the entry came from no list.
 */
export function browseSwipe(
  list: BrowseList,
  id: Id,
  open: (next: Id) => void,
): TabSwipe | undefined {
  const order = remembered?.list === list ? remembered.ids : undefined;
  const position = browsePosition(order, id);
  if (!position) return undefined;
  return {
    ...position,
    onStep: (step) => {
      const next = browseNeighbour(order, id, step);
      if (next) open(next);
    },
  };
}

const BrowseSwipeContext = createContext<TabSwipe | undefined>(undefined);

/** Set by the page of an entry around its detail; its Screen takes it as `tabSwipe`. */
export const BrowseSwipeProvider = BrowseSwipeContext.Provider;

export function useBrowseSwipe(): TabSwipe | undefined {
  return useContext(BrowseSwipeContext);
}
