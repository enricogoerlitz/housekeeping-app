// The field with the cursor in view while the keyboard is open (spec 0044, REQ-004). Pure
// geometry, so it is tested in Node; `keyboard.web.ts` measures and scrolls.

import type { Band } from './scroll-reveal';

/** Room kept around the field inside the visible part. */
const REVEAL_MARGIN = 16;
/** How much of the next field has to show for iOS to let ˅ reach it. */
const NEXT_PEEK = 44;

/**
 * The scroll offset of the scroll area around a focused field, or null when it stays: the field
 * fully inside the part of the area the keyboard leaves visible (with a margin) stays where it
 * is; any other comes into the upper third of that part, where suggestions below it still fit.
 * iOS lets ˅ reach only a next field that is in view when a field takes the focus (iPhone
 * click-through, review 0003): given `next`, the field goes up further until the next one shows its
 * first 44 px, if that is possible without the field passing the top margin. All bands in window coordinates.
 */
export function keyboardRevealScrollTop(input: {
  field: Band;
  /** The scroll area's own box. */
  area: Band;
  /** The visible area of the window (above the keyboard). */
  visible: Band;
  scrollTop: number;
  maxScrollTop: number;
  /** The next text field in the same area, if any. */
  next?: Band;
}): number | null {
  const { field, area, visible, scrollTop, next: following } = input;
  const top = Math.max(area.top, visible.top) + REVEAL_MARGIN;
  const bottom = Math.min(area.bottom, visible.bottom) - REVEAL_MARGIN;
  if (bottom <= top) return null;
  const inView = field.top >= top && field.bottom <= bottom;
  // How far the area has to move up for the next field to peek in (≤ 0: it already does). A next
  // field too far below to show along with this one is left out.
  const need = following
    ? following.top + Math.min(NEXT_PEEK, following.bottom - following.top) - bottom
    : 0;
  const nextNeed = need > 0 && need <= field.top - top ? need : 0;
  if (inView && nextNeed === 0) return null;
  const height = field.bottom - field.top;
  const room = bottom - top;
  const target = height >= room ? top : top + (room - height) / 3;
  let delta = inView ? 0 : field.top - target;
  if (nextNeed > 0 && nextNeed > delta) delta = nextNeed;
  const next = Math.round(
    Math.min(Math.max(0, input.maxScrollTop), Math.max(0, scrollTop + delta)),
  );
  return next === Math.round(scrollTop) ? null : next;
}
