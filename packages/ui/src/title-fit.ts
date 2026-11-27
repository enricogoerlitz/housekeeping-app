// A bar with a title between buttons (a phone window's "Abbrechen · Titel · Einplanen", a page's
// "‹ Essen · Titel · Abbrechen Speichern"): when the buttons leave too little room, the title
// takes a line of its own below them instead of shrinking to "Q…" (review 0003).

/**
 * Whether the title goes on its own line: its natural width is more than the row leaves beside
 * the actions. Widths in px; `padding` is both sides together, `gap` the space between parts.
 * Until the row and the title are measured, it stays in the row.
 */
export function titleOnOwnLine(input: {
  row: number;
  padding: number;
  gap: number;
  actions: readonly number[];
  title: number;
}): boolean {
  if (input.row <= 0 || input.title <= 0) return false;
  const actions = input.actions.reduce((sum, width) => sum + width, 0);
  const room = input.row - input.padding - actions - input.gap * input.actions.length;
  return input.title > room;
}

/**
 * The natural width of a title node: its text's own width where it can be measured, else its
 * `scrollWidth`. On its own line the title's box is as wide as the row, so `scrollWidth` alone
 * kept it there after the buttons beside it had shrunk (leaving the edit mode; I-19).
 */
export function naturalTitleWidth(
  node: { scrollWidth?: number; textWidth?: () => number } | null,
): number {
  if (!node) return 0;
  const text = node.textWidth?.() ?? 0;
  return Math.ceil(text > 0 ? text : (node.scrollWidth ?? 0));
}

/** The width of a DOM node's laid-out text (a Range around its contents), 0 elsewhere. */
export function domTextWidth(node: unknown): number {
  if (typeof document === 'undefined' || !(node instanceof Node)) return 0;
  const range = document.createRange();
  range.selectNodeContents(node);
  return typeof range.getBoundingClientRect === 'function'
    ? range.getBoundingClientRect().width
    : 0;
}

/**
 * Whether a word of a title is wider than its box (spec 0057, REQ-004): titles break only between
 * words, so a too long word overflows instead of being cut; one rounding pixel does not count.
 */
export function wordOverflows(
  node: { scrollWidth?: number; clientWidth?: number } | null | undefined,
): boolean {
  const scroll = node?.scrollWidth ?? 0;
  const client = node?.clientWidth ?? 0;
  return client > 0 && scroll > client + 1;
}
