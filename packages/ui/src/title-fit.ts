// A bar with a title between buttons (a phone window's "Abbrechen · Titel · Einplanen", a page's
// "‹ Essen · Titel · Abbrechen Speichern"): when the buttons leave too little room, the title
// takes a line of its own below them instead of shrinking to "Q…" (review 0003).

/** Pixels the measured widths may be off by, rounded (review 0004, I-04). */
const ROUNDING_SLACK = 2;

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
  // The parts are laid out in whole pixels (offsetWidth), so the room may seem up to a pixel or
  // two wider than it is: a title that fits only that closely is cut (I-04, review 0004).
  return input.title > room - ROUNDING_SLACK;
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
 * words, so a too long word overflows instead of being cut; `slack` pixels do not count (one
 * rounding pixel, plus a hyphen's room with `hyphenHang`).
 */
export function wordOverflows(
  node: { scrollWidth?: number; clientWidth?: number } | null | undefined,
  slack = 1,
): boolean {
  const scroll = node?.scrollWidth ?? 0;
  const client = node?.clientWidth ?? 0;
  return client > 0 && scroll > client + slack;
}

/** A hyphen is about a third of the font size wide; a little more, so it always fits. */
const HYPHEN_EM = 0.4;

/**
 * Room for a hyphen past the line (review 0004, N-18): "Kichererbsen-" a few pixels wider than a
 * narrow calendar column breaks after its hyphen and lets it stand out, instead of breaking the
 * word right before it ("Kichererbsen|-Eintopf"). In px for a font size in px.
 */
export function hyphenHang(fontSize: number): number {
  return Math.ceil(fontSize * HYPHEN_EM);
}
