import type { Band } from './scroll-reveal';

/**
 * How far above the bottom edge the toast stands (spec 0033, REQ-009): at `bottom`, unless that
 * would put it on one of the page's buttons that ask to stay clear; then above the highest of
 * them, but never higher than the middle of the screen.
 */
export function toastBottom(input: {
  bottom: number;
  windowHeight: number;
  toastHeight: number;
  gap: number;
  /** Rectangles in window coordinates. */
  obstacles: readonly Band[];
}): number {
  const { bottom, windowHeight, toastHeight, gap } = input;
  let result = bottom;
  // Clearing one obstacle can bring the toast onto the next one above it.
  for (let round = 0; round < input.obstacles.length; round += 1) {
    const top = windowHeight - result - toastHeight;
    const below = windowHeight - result;
    const hit = input.obstacles.filter(
      (box) => box.top < below && box.bottom > top && box.top < windowHeight,
    );
    if (hit.length === 0) break;
    result = windowHeight - Math.min(...hit.map((box) => box.top)) + gap;
  }
  return result > windowHeight / 2 ? bottom : result;
}

export interface Box extends Band {
  left: number;
  right: number;
}

const overlaps = (a: Box, b: Box) =>
  a.top < b.bottom && b.top < a.bottom && a.left < b.right && b.left < a.right;

/**
 * Which edge the toast stands at (spec 0033, REQ-009, decision 12): at its place `bottom` above
 * the bottom edge while that covers nothing to press; else `top` below the top edge when that is
 * free; else at the bottom after all. The toast is centred horizontally.
 */
export function toastEdge(input: {
  windowWidth: number;
  windowHeight: number;
  toastWidth: number;
  toastHeight: number;
  bottom: number;
  top: number;
  /** Everything to press on screen, in window coordinates. */
  pressable: readonly Box[];
}): { bottom: number } | { top: number } {
  const left = (input.windowWidth - input.toastWidth) / 2;
  const at = (top: number): Box => ({
    top,
    bottom: top + input.toastHeight,
    left,
    right: left + input.toastWidth,
  });
  const free = (box: Box) => !input.pressable.some((other) => overlaps(box, other));
  if (free(at(input.windowHeight - input.bottom - input.toastHeight))) {
    return { bottom: input.bottom };
  }
  return free(at(input.top)) ? { top: input.top } : { bottom: input.bottom };
}
