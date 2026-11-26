// The field with the cursor in view while the keyboard is open (spec 0044, REQ-004). Pure
// geometry, so it is tested in Node; `keyboard.web.ts` measures and scrolls.

import type { Band } from './scroll-reveal';

/** Room kept around the field inside the visible part. */
const REVEAL_MARGIN = 16;

/**
 * The scroll offset of the scroll area around a focused field, or null when it stays: the field
 * fully inside the part of the area the keyboard leaves visible (with a margin) stays where it
 * is; any other comes into the upper third of that part, where suggestions below it still fit.
 * All bands in window coordinates.
 */
export function keyboardRevealScrollTop(input: {
  field: Band;
  /** The scroll area's own box. */
  area: Band;
  /** The visible area of the window (above the keyboard). */
  visible: Band;
  scrollTop: number;
  maxScrollTop: number;
}): number | null {
  const { field, area, visible, scrollTop } = input;
  const top = Math.max(area.top, visible.top) + REVEAL_MARGIN;
  const bottom = Math.min(area.bottom, visible.bottom) - REVEAL_MARGIN;
  if (bottom <= top) return null;
  if (field.top >= top && field.bottom <= bottom) return null;
  const height = field.bottom - field.top;
  const room = bottom - top;
  const target = height >= room ? top : top + (room - height) / 3;
  const next = Math.round(
    Math.min(Math.max(0, input.maxScrollTop), Math.max(0, scrollTop + field.top - target)),
  );
  return next === Math.round(scrollTop) ? null : next;
}
