import type { SheetFrame } from './sheet-size';

// The software keyboard on phones (spec 0032, REQ-001, decision 1). iOS shrinks only the visible
// area (visualViewport), not the layout; a difference this large is a keyboard, a smaller one is
// browser chrome (AC-003).
const KEYBOARD_MIN = 150;

export interface KeyboardState {
  open: boolean;
  /** How much of the window the keyboard covers, 0 when closed. */
  inset: number;
  visibleHeight: number;
}

export const NO_KEYBOARD: KeyboardState = { open: false, inset: 0, visibleHeight: 0 };

export function keyboardState(input: {
  windowHeight: number;
  visibleHeight: number;
}): KeyboardState {
  const covered = Math.round(input.windowHeight - input.visibleHeight);
  const open = covered > KEYBOARD_MIN;
  return { open, inset: open ? covered : 0, visibleHeight: Math.round(input.visibleHeight) };
}

/** A phone window while the keyboard is open: at most the visible area below the top gap. */
export function keyboardSheetFrame(
  frame: SheetFrame,
  visibleHeight: number,
  topGap: number,
): SheetFrame {
  const room = Math.max(0, visibleHeight - topGap);
  return {
    ...(frame.height === undefined ? {} : { height: Math.min(frame.height, room) }),
    maxHeight: Math.min(frame.maxHeight, room),
  };
}
