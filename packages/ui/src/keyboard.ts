import { NO_KEYBOARD, type KeyboardState } from './keyboard-state';

/** The software keyboard (spec 0032). The app ships as a PWA; natively it reports none. */
export function useKeyboard(): KeyboardState {
  return NO_KEYBOARD;
}
