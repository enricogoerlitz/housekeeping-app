// Decisions of the swipe between view tabs on phones (spec 0029, REQ-003, decision 6). Pure, so the
// thresholds are tested in Node; the component only feeds in the responder's numbers.

import type { ViewStyle } from 'react-native';

import { claimsSwipe } from './swipe-step';

/** A move starting this close to the left or right screen edge belongs to the system back gesture. */
export const TAB_SWIPE_EDGE = 20;
/** Share of the width from which a release changes the tab … */
const COMMIT_SHARE = 0.2;
/** … but never less than this (narrow screens). */
const COMMIT_MIN = 48;
/** A shorter move still changes the tab when released this fast (pt/ms) in its own direction. */
const FLICK_VELOCITY = 0.4;
const FLICK_DISTANCE = 16;
/** Without a neighbour the content follows only this share of the move … */
const RUBBER = 0.25;
/** … and at most this far. */
export const TAB_SWIPE_RUBBER_MAX = 64;

export interface TabSwipePosition {
  /** Index of the shown tab. */
  index: number;
  /** Number of tabs. */
  count: number;
  /** Width of the swiping area. */
  width: number;
}

/** Whether there is a tab in the direction the content moves (dx < 0 shows the next one). */
function hasNeighbour(dx: number, position: Pick<TabSwipePosition, 'index' | 'count'>): boolean {
  return dx < 0 ? position.index < position.count - 1 : position.index > 0;
}

/** The part of PanResponder's gesture state a claim reads. */
export interface TabSwipeMove {
  /** Way so far since the finger went down. */
  dx: number;
  dy: number;
  /** Where the finger is now. */
  moveX: number;
}

/**
 * Whether a move is a tab swipe and not scrolling or going back. The start is `moveX - dx`:
 * PanResponder sets `x0` only on the grant, before it reads 0, so an edge check on it refused
 * every swipe (spec 0030, REQ-007).
 */
export function claimsTabSwipe(move: TabSwipeMove, width: number): boolean {
  const start = move.moveX - move.dx;
  if (start < TAB_SWIPE_EDGE || start > width - TAB_SWIPE_EDGE) return false;
  return claimsSwipe(move.dx, move.dy);
}

/** Where the content stands while the finger is down: 1:1, gently resisting without a neighbour. */
export function tabSwipeOffset(dx: number, position: Pick<TabSwipePosition, 'index' | 'count'>) {
  if (hasNeighbour(dx, position)) return dx;
  return Math.sign(dx) * Math.min(TAB_SWIPE_RUBBER_MAX, Math.abs(dx) * RUBBER);
}

/** On release: +1 to the next tab, -1 to the previous one, 0 to spring back. */
export function tabSwipeStep(dx: number, vx: number, position: TabSwipePosition): -1 | 0 | 1 {
  if (dx === 0 || !hasNeighbour(dx, position)) return 0;
  const fast = Math.abs(vx) >= FLICK_VELOCITY;
  // Thrown back towards the start: the person changed their mind.
  if (fast && Math.sign(vx) !== Math.sign(dx)) return 0;
  const far = Math.abs(dx) >= Math.max(COMMIT_MIN, position.width * COMMIT_SHARE);
  const flick = fast && Math.abs(dx) >= FLICK_DISTANCE;
  if (!far && !flick) return 0;
  return dx < 0 ? 1 : -1;
}

/** What a screen hands to `Screen` so a swipe changes its view tabs. */
export interface TabSwipe {
  index: number;
  count: number;
  /** Same as a tap on the neighbouring tab. */
  onStep: (step: -1 | 1) => void;
}

/** The swipe for a row of view tabs: a step chooses the neighbour like a tap would. */
export function tabSwipe<T>(
  options: readonly { value: T }[],
  value: T,
  onChange: (next: T) => void,
): TabSwipe {
  return {
    index: options.findIndex((option) => option.value === value),
    count: options.length,
    onStep: (step) => {
      const next = neighbourTab(options, value, step);
      if (next !== undefined) onChange(next);
    },
  };
}

/** The value of the tab `step` away from `value`, or undefined past the ends. */
export function neighbourTab<T>(
  options: readonly { value: T }[],
  value: T,
  step: -1 | 1,
): T | undefined {
  const index = options.findIndex((option) => option.value === value);
  if (index < 0) return undefined;
  return options[index + step]?.value;
}

/**
 * The touch action of a page's scroll area under a tab swipe (spec 0030, REQ-007, Entscheidung 8).
 * Without it iOS takes every move in the scroll area as a native pan, the ScrollView becomes the
 * responder and never lets go, so the swipe never arrives; `touch-action` on the swipe area itself
 * does not help, since a scroll area starts its own. With `pan-y` inside the scroll area a sideways
 * finger stays with the page's script, vertical scrolling stays native; rows that scroll sideways
 * are scroll areas of their own and keep theirs.
 */
export function tabSwipeTouchAction(active: boolean, platform: string): ViewStyle | null {
  if (!active || platform !== 'web') return null;
  // React Native's types do not name touchAction; react-native-web passes it on to CSS.
  return { touchAction: 'pan-y' } as unknown as ViewStyle;
}
