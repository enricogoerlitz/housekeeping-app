// Spec 0034, REQ-008: on the page of a recipe, a collection or a restaurant a sideways swipe opens
// the next or previous entry in the order of the list it was opened from ("Zufall" too). Pure, so
// the app only keeps the order of the last list in memory.

import type { Id } from './types';

/** Where an entry stands in the list it came from; the shape a view-tab swipe takes. */
export interface BrowsePosition {
  index: number;
  count: number;
}

/** The entry's place in `order`; undefined without a list, outside it or alone in it (AC-019). */
export function browsePosition(
  order: readonly Id[] | undefined,
  id: Id,
): BrowsePosition | undefined {
  if (!order || order.length < 2) return undefined;
  const index = order.indexOf(id);
  return index < 0 ? undefined : { index, count: order.length };
}

/** The entry `step` away from `id` in `order`, or undefined past the ends (AC-018). */
export function browseNeighbour(
  order: readonly Id[] | undefined,
  id: Id,
  step: -1 | 1,
): Id | undefined {
  const position = browsePosition(order, id);
  if (!position) return undefined;
  return order?.[position.index + step];
}
