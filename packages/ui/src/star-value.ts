// Half stars for the Stars control (spec 0011, REQ-004): which value a point on the stars means,
// how a star is drawn, and how mouse, finger and keyboard change the value. Pure logic without
// React, so it runs in Node. The domain rule for valid ratings lives in core (`isHalfStar`);
// ui imports nothing internal, so the few numbers it needs are repeated here.

const STARS = 5;
const MIN = 0.5;
const MAX = 5;

export interface StarLayout {
  /** Width of one star in points. */
  size: number;
  /** Space between two stars in points. */
  gap: number;
}

/**
 * The value a point `x` (points from the left edge of the first star) stands for: the left half
 * of a star is half a star, the right half and the gap after it the full star. Points past either
 * end give 0.5 or 5, so a drag beyond the stars stays in range.
 */
export function starValueAt(x: number, layout: StarLayout): number {
  if (!(x > 0)) return MIN;
  const pitch = layout.size + layout.gap;
  const index = Math.floor(x / pitch);
  if (index >= STARS) return MAX;
  const inStar = x - index * pitch;
  return index + (inStar < layout.size / 2 ? 0.5 : 1);
}

export type StarFill = 'full' | 'half' | 'empty';

/** How star `star` (1 … 5) is drawn for `value`. */
export function starFill(star: number, value: number): StarFill {
  if (value >= star) return 'full';
  if (value >= star - 0.5) return 'half';
  return 'empty';
}

export interface StarPointer {
  /** The value shown while the pointer is over the stars or a finger drags; none = the saved one. */
  preview?: number;
  /** A mouse button or finger is down. */
  pressing: boolean;
}

export const IDLE_STAR_POINTER: StarPointer = { pressing: false };

export type StarPointerEvent =
  /** The mouse is over a half star (web, iPad pointer). */
  | { type: 'hover'; value: number }
  /** The pointer left the stars. */
  | { type: 'leave' }
  /** A finger or mouse button went down on a half star. */
  | { type: 'down'; value: number }
  /** The finger or mouse moved while down. */
  | { type: 'move'; value: number }
  /** Let go: sets the shown value. */
  | { type: 'up' }
  /** The system took the gesture, e.g. the list scrolls: nothing is set. */
  | { type: 'cancel' };

/**
 * One step of the pointer interaction. Hovering only previews (AC-018); a tap or the end of a drag
 * sets the value under the pointer (AC-017). Afterwards the stars show the saved value again.
 */
export function starPointer(
  state: StarPointer,
  event: StarPointerEvent,
): { state: StarPointer; commit?: number } {
  switch (event.type) {
    case 'hover':
      return { state: state.pressing ? state : { pressing: false, preview: event.value } };
    case 'leave':
      return { state: state.pressing ? state : IDLE_STAR_POINTER };
    case 'down':
      return { state: { pressing: true, preview: event.value } };
    case 'move':
      return { state: state.pressing ? { pressing: true, preview: event.value } : state };
    case 'up':
      if (!state.pressing || state.preview === undefined) return { state: IDLE_STAR_POINTER };
      return { state: IDLE_STAR_POINTER, commit: state.preview };
    case 'cancel':
      return { state: IDLE_STAR_POINTER };
  }
}

export type StarStep = 'increment' | 'decrement' | 'first' | 'last';

/**
 * Keyboard and screen-reader steps of 0.5 within 0.5 … 5. An unrated value (0) starts at 0.5 and
 * stays unrated on a step down.
 */
export function stepStars(value: number, step: StarStep): number {
  switch (step) {
    case 'first':
      return MIN;
    case 'last':
      return MAX;
    case 'increment':
      return Math.min(MAX, Math.max(MIN, Math.floor(value * 2) / 2 + 0.5));
    case 'decrement':
      if (!(value > 0)) return 0;
      return Math.max(MIN, Math.ceil(value * 2) / 2 - 0.5);
  }
}

/** What a screen reader says, e.g. "4,5 von 5 Sternen". */
export function starsLabel(value: number): string {
  const number = Number.isInteger(value) ? String(value) : String(value).replace('.', ',');
  return `${number} von ${STARS} Sternen`;
}
