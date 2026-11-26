import { useSyncExternalStore } from 'react';

import { createSettler, KEYBOARD_SETTLE_MS } from './keyboard-settle';
import { keyboardState, NO_KEYBOARD, type KeyboardState } from './keyboard-state';
import { revealInScrollParent } from './scroll-reveal';

// The software keyboard on the web (spec 0032, REQ-001, decision 1). iOS keeps the layout at the
// full height and only shrinks the visual viewport, then scrolls the page to the focused field.
// While the keyboard is open the app is as high as the visible area (`--app-height`, read by
// #root in index.html) and the page is scrolled back, so nothing sits under the keyboard.
// Spec 0033, REQ-003: the viewport reports several heights while the keyboard moves; the app
// takes only the last one, so a window moves once and stays.

let state: KeyboardState = NO_KEYBOARD;
const listeners = new Set<() => void>();

function read(): KeyboardState {
  const viewport = typeof window === 'undefined' ? null : window.visualViewport;
  if (!viewport) return NO_KEYBOARD;
  const windowHeight = document.documentElement.clientHeight || window.innerHeight;
  return keyboardState({ windowHeight, visibleHeight: viewport.height });
}

/** iOS scrolls the layout to the focused field; the app stands at the top of the window. */
function scrollBack() {
  if (window.scrollY !== 0 || (window.visualViewport?.offsetTop ?? 0) !== 0) {
    window.scrollTo(0, 0);
  }
}

function apply(next: KeyboardState) {
  const root = document.documentElement;
  if (next.open) root.style.setProperty('--app-height', `${next.visibleHeight}px`);
  else root.style.removeProperty('--app-height');
  // Also once it closes: else a window stands where iOS left the page, mid-screen (AC-009).
  scrollBack();
}

const settler = createSettler<KeyboardState>(KEYBOARD_SETTLE_MS, (next) => {
  apply(next);
  if (next.open === state.open && next.inset === state.inset) return;
  const opened = next.open && !state.open;
  state = next;
  listeners.forEach((listener) => listener());
  // The app just got shorter: the field being typed in stays in view, inside its own scroll
  // area only (AC-008, AC-010).
  if (opened) {
    requestAnimationFrame(() => {
      const active = document.activeElement;
      if (active instanceof HTMLElement && active !== document.body) {
        revealInScrollParent(active, { align: 'nearest' });
      }
    });
  }
});

function update() {
  // Whatever iOS scrolls meanwhile goes back at once; the height waits until it has settled.
  scrollBack();
  settler.push(read());
}

/**
 * Takes the keyboard's current height at once instead of after it has settled (tests).
 *
 * @public The component tests' stand-in keyboard calls it.
 */
export function settleKeyboard(): void {
  settler.push(read());
  settler.flush();
}

function subscribe(listener: () => void): () => void {
  const viewport = window.visualViewport;
  if (listeners.size === 0 && viewport) {
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    settleKeyboard();
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && viewport) {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
      settler.cancel();
    }
  };
}

const snapshot = () => state;
const serverSnapshot = () => NO_KEYBOARD;

/**
 * The software keyboard: open, how much it covers, the visible height.
 *
 * @public Metro resolves the import of the native twin to this file on the web.
 */
export function useKeyboard(): KeyboardState {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
