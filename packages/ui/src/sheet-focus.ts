import { createContext } from 'react';

/**
 * Set by a window (Sheet) for its content (spec 0033, REQ-006): a text field with `autoFocus`
 * hands its input to the window, which focuses it once it has slid in, without scrolling
 * anything, and keeps the focus there while other layers (a menu closing) still move it.
 */
export const SheetFocusContext = createContext<((input: unknown) => () => void) | undefined>(
  undefined,
);

/** How long after the window took the focus a focus moved out of it is taken back. */
export const FOCUS_SETTLE_MS = 600;

/** Focuses a text input without letting the browser scroll anything to it. */
export function focusQuietly(input: unknown): void {
  if (typeof HTMLElement !== 'undefined' && input instanceof HTMLElement) {
    input.focus({ preventScroll: true });
    return;
  }
  (input as { focus?: () => void } | null)?.focus?.();
}
