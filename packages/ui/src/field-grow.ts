/** Space above and below the text of a growing field. */
export const GROW_PADDING = 12;

/** A growing field stops at this many lines and scrolls from then on. */
const GROW_MAX_LINES = 4;

/**
 * The height of a composer field (`TextField grow`, spec 0062, decision 14): one line, growing
 * with the measured text up to four lines (the agent: 4.5, spec 0067, AC-009 — the half line
 * shows that more stands above). Empty it is one line again: the browser measures a textarea at
 * least as high as it is, so it would never shrink after sending.
 */
export function growHeight(input: {
  contentHeight: number;
  lineHeight: number;
  empty: boolean;
  maxLines?: number;
}): number {
  const min = GROW_PADDING * 2 + input.lineHeight;
  if (input.empty) return min;
  const max = GROW_PADDING * 2 + input.lineHeight * (input.maxLines ?? GROW_MAX_LINES);
  return Math.min(max, Math.max(min, Math.ceil(input.contentHeight)));
}
