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
  /** Above and below the text; the composer's is its own (`composerLayout`). */
  padding?: number;
}): number {
  const padding = input.padding ?? GROW_PADDING;
  const min = padding * 2 + input.lineHeight;
  if (input.empty) return min;
  const max = padding * 2 + input.lineHeight * (input.maxLines ?? GROW_MAX_LINES);
  return Math.min(max, Math.max(min, Math.ceil(input.contentHeight)));
}

/**
 * The chat composer (`TextField composer`, spec 0067; Enrico 28.11.: the proportions of the
 * Gemini and ChatGPT apps): one rounded field 46 pt high at one line, "+" left and mic and send
 * right as 34 pt circles, 8 pt between them and the text, which is one step above body text.
 */
export const COMPOSER = {
  /** The whole field at one line, its border included. */
  height: 46,
  /** "+", the microphone and "Senden". */
  button: 34,
  /** Between the controls and the text. */
  gap: 8,
  /** The text: body text one point larger, its line two (17/24 on the 16/22 themes). */
  fontStep: 1,
  lineStep: 2,
} as const;

/**
 * The same inset around the buttons on every side, and the text padded so one line is exactly as
 * high as a button: its centre is the buttons' centre, and while the field grows they stay on the
 * last line.
 */
export function composerLayout(input: { border: number; lineHeight: number }): {
  border: number;
  inset: number;
  textPadding: number;
} {
  return {
    border: input.border,
    inset: (COMPOSER.height - 2 * input.border - COMPOSER.button) / 2,
    textPadding: (COMPOSER.button - input.lineHeight) / 2,
  };
}
