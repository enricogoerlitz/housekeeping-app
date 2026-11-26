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
