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
