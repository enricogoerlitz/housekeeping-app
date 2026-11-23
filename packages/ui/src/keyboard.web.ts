import { useSyncExternalStore } from 'react';

import { keyboardState, NO_KEYBOARD, type KeyboardState } from './keyboard-state';

// The software keyboard on the web (spec 0032, REQ-001, decision 1). iOS keeps the layout at the
// full height and only shrinks the visual viewport, then scrolls the page to the focused field.
// While the keyboard is open the app is as high as the visible area (`--app-height`, read by
// #root in index.html) and the page is scrolled back, so nothing sits under the keyboard.

let state: KeyboardState = NO_KEYBOARD;
const listeners = new Set<() => void>();

function read(): KeyboardState {
  const viewport = typeof window === 'undefined' ? null : window.visualViewport;
  if (!viewport) return NO_KEYBOARD;
  const windowHeight = document.documentElement.clientHeight || window.innerHeight;
  return keyboardState({ windowHeight, visibleHeight: viewport.height });
}

function apply(next: KeyboardState) {
  const root = document.documentElement;
  if (next.open) {
    root.style.setProperty('--app-height', `${next.visibleHeight}px`);
    if (window.scrollY !== 0 || (window.visualViewport?.offsetTop ?? 0) !== 0) {
      window.scrollTo(0, 0);
    }
  } else {
    root.style.removeProperty('--app-height');
  }
}

function update() {
  const next = read();
  apply(next);
  if (next.open === state.open && next.inset === state.inset) return;
  state = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  const viewport = window.visualViewport;
  if (listeners.size === 0 && viewport) {
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    update();
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && viewport) {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
    }
  };
}

const snapshot = () => state;
const serverSnapshot = () => NO_KEYBOARD;

/** The software keyboard: open, how much it covers, the visible height. */
export function useKeyboard(): KeyboardState {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
