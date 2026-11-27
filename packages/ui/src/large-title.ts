// A page with its own big title (the recipe page) shows the title in its bar only once the big one
// has scrolled under the bar (spec 0056, REQ-009). Measured on the web; elsewhere the bar falls
// back to the shrunk header (`collapsed`).

/**
 * Whether the big title is under the bar: its bottom edge at or above the bar's bottom edge, both
 * in window coordinates. Unknown when either cannot be measured.
 */
export function largeTitleUnder(
  title: number | undefined,
  bar: number | undefined,
): boolean | undefined {
  if (title === undefined || bar === undefined) return undefined;
  return title <= bar;
}

/** The bottom edge of a laid-out DOM node in window coordinates; nothing without a box or DOM. */
export function bottomEdge(node: unknown): number | undefined {
  const measure = (node as { getBoundingClientRect?: () => Partial<DOMRect> } | null)
    ?.getBoundingClientRect;
  if (typeof measure !== 'function') return undefined;
  const rect = measure.call(node);
  if (!rect.width && !rect.height) return undefined;
  return rect.bottom;
}
