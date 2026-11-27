// A row that scrolls sideways fades out at an edge where more follows, so a chip there reads as
// "more this way" instead of being cut into a half circle (review 0003).

import { createContext } from 'react';

/** How wide the fade is: about half a chip's height. */
const FADE = 28;

export interface ScrollFade {
  start: boolean;
  end: boolean;
}

/** Which edges fade: the start once scrolled, the end while more follows (1 px for rounding). */
export function scrollFade(row: { offset: number; content: number; view: number }): ScrollFade {
  return {
    start: row.offset > 1,
    end: row.offset + row.view < row.content - 1,
  };
}

/** The CSS mask for those edges; undefined when nothing fades. */
export function scrollFadeMask(fade: ScrollFade): string | undefined {
  if (!fade.start && !fade.end) return undefined;
  const start = fade.start ? FADE : 0;
  const end = fade.end ? FADE : 0;
  return `linear-gradient(to right, transparent 0px, #000 ${start}px, #000 calc(100% - ${end}px), ${fade.end ? 'transparent' : '#000'} 100%)`;
}

/**
 * Where a row scrolls so an item (its start and end in the row's content, px) stands whole and
 * clear of the fades: a chip just chosen at the end must not stay half under the fade, "Unfertig
 * (4" (iPhone click-through, review 0004, iN-08). Undefined when it stands so already.
 */
export function revealOffset(
  row: { offset: number; content: number; view: number },
  item: { start: number; end: number },
): number | undefined {
  let next = row.offset;
  if (item.end + FADE > next + row.view) next = item.end + FADE - row.view;
  if (item.start - FADE < next) next = item.start - FADE;
  next = Math.min(Math.max(next, 0), Math.max(row.content - row.view, 0));
  return Math.abs(next - row.offset) < 1 ? undefined : next;
}

/** Set by a `ScrollRow` for its items: a chosen chip hands its element over to be revealed. */
export const ScrollRowRevealContext = createContext<((item: unknown) => void) | undefined>(
  undefined,
);
