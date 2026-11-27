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
  /** Not measured yet: a tap asked for the keyboard and it is on its way (spec 0044, REQ-002). */
  expected?: boolean;
}

export const NO_KEYBOARD: KeyboardState = { open: false, inset: 0, visibleHeight: 0 };

/**
 * The keyboard from the window and the visual viewport. iOS may leave the visible area moved down
 * (`offsetTop`, spec 0044, decision 3): the keyboard starts at the visible area's bottom edge.
 */
export function keyboardState(input: {
  windowHeight: number;
  visibleHeight: number;
  offsetTop?: number;
}): KeyboardState {
  const covered = Math.round(input.windowHeight - input.visibleHeight);
  const open = covered > KEYBOARD_MIN;
  const inset = Math.max(0, covered - Math.round(input.offsetTop ?? 0));
  return { open, inset: open ? inset : 0, visibleHeight: Math.round(input.visibleHeight) };
}

/**
 * How a new reading of the viewport is taken (spec 0044, decision 2): the keyboard coming or
 * going at once (WebKit reports its final height at the start of the movement), any other height
 * once the readings have settled. While a keyboard is expected, a viewport without one keeps the
 * expectation.
 */
export function keyboardStep(
  current: KeyboardState,
  next: KeyboardState,
): 'now' | 'settle' | 'keep' {
  if (current.expected) return next.open ? 'now' : 'keep';
  return current.open === next.open ? 'settle' : 'now';
}

/** The keyboard's share of the window before one was ever measured (spec 0044, decision 4). */
const EXPECTED_SHARE = 0.45;

/** The keyboard a tap asked for, before it is there: as high as last time, else an estimate. */
export function expectedKeyboard(
  windowHeight: number,
  lastInset: number | undefined,
): KeyboardState {
  const inset = lastInset ?? Math.round(windowHeight * EXPECTED_SHARE);
  return { open: true, inset, visibleHeight: windowHeight - inset, expected: true };
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

/**
 * The window height a sheet's size is taken from. React Native Web reports the visible area as
 * the window, so with the keyboard open a small window ("s", half the height) shrank to half of
 * what the keyboard leaves and cut its second field (iPhone click-through, I-04): the sizes go by
 * the whole screen, the keyboard frame then bounds them.
 */
export function sheetWindowHeight(windowHeight: number, keyboard: KeyboardState): number {
  if (!keyboard.open) return windowHeight;
  return Math.max(windowHeight, keyboard.visibleHeight + keyboard.inset);
}
