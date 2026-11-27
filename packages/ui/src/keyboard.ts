import { NO_KEYBOARD, type KeyboardState } from './keyboard-state';

/** The software keyboard (spec 0032). The app ships as a PWA; natively it reports none. */
export function useKeyboard(): KeyboardState {
  return NO_KEYBOARD;
}

/** A tap asked for the keyboard (spec 0044, decision 4); natively there is nothing to prepare. */
export function expectKeyboard(_ms: number): void {
  return undefined;
}

/** A window closed while the keyboard was open (web only, B-03). */
export function keyboardLeaving(): void {
  return undefined;
}
