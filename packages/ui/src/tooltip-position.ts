// Where a tooltip stands and when it is needed (spec 0035, REQ-005). Pure, so it is tested
// without a layout engine.

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Room between the tooltip and its line, and to the window's edges. */
const GAP = 6;
const EDGE = 8;

/**
 * Above the anchor at its left edge; below it when there is no room above. Always inside the
 * window, `EDGE` px from its sides.
 */
export function tooltipPosition(
  anchor: Rect,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
): { left: number; top: number } {
  const above = anchor.y - GAP - size.height;
  const top = above >= EDGE ? above : anchor.y + anchor.height + GAP;
  const left = Math.max(EDGE, Math.min(anchor.x, viewport.width - EDGE - size.width));
  return { left, top };
}

/**
 * True when a text is cut off: wider than its box (one line with "…") or taller (clamped lines).
 * One pixel is rounding, not a cut.
 */
export function isTruncated(node: {
  scrollWidth: number;
  clientWidth: number;
  scrollHeight: number;
  clientHeight: number;
}): boolean {
  return node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1;
}
