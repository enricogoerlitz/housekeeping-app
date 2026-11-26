import { useSyncExternalStore } from 'react';

import { isAppleTouchBrowser } from './field-autofill';
import { createSettler, KEYBOARD_SETTLE_MS } from './keyboard-settle';
import { keyboardRevealScrollTop } from './keyboard-reveal';
import {
  expectedKeyboard,
  keyboardState,
  keyboardStep,
  NO_KEYBOARD,
  type KeyboardState,
} from './keyboard-state';
import { PHONE_MAX_WIDTH } from './sheet-size';

// The software keyboard on the web (spec 0032, REQ-001, decision 1). iOS keeps the layout at the
// full height and only shrinks the visual viewport, then scrolls the page to the focused field.
// While the keyboard is open the app is as high as the visible area (`--app-height`, read by
// #root in index.html) and the page is scrolled back, so nothing sits under the keyboard.
// Spec 0044 (decisions 1–4): the keyboard coming or going counts at once, other heights once they
// have settled; the field with the cursor is scrolled into the upper third of what is visible,
// inside its own scroll area; on iPhone the cursor moving to the next field does not let Safari
// scroll the page; a tap that asked for the keyboard (`expectKeyboard`) gets its height ahead.

let state: KeyboardState = NO_KEYBOARD;
const listeners = new Set<() => void>();

function windowHeight(): number {
  return document.documentElement.clientHeight || window.innerHeight;
}

function read(): KeyboardState {
  const viewport = typeof window === 'undefined' ? null : window.visualViewport;
  if (!viewport) return NO_KEYBOARD;
  return keyboardState({
    windowHeight: windowHeight(),
    visibleHeight: viewport.height,
    offsetTop: viewport.offsetTop,
  });
}

/** iOS scrolls the layout to the focused field; the app stands at the top of the window. */
function scrollBack() {
  if (window.scrollY !== 0 || (window.visualViewport?.offsetTop ?? 0) !== 0) {
    window.scrollTo(0, 0);
  }
}

// ---------- The last measured height, per window size (decision 4) ----------

const STORE_KEY = 'housekeeping.keyboard.v1';
let measured: Record<string, number> | undefined;

function sizeKey(): string {
  return `${document.documentElement.clientWidth || window.innerWidth}x${windowHeight()}`;
}

function measuredInsets(): Record<string, number> {
  if (measured) return measured;
  measured = {};
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(STORE_KEY) ?? '{}');
    if (stored && typeof stored === 'object') {
      for (const [key, value] of Object.entries(stored)) {
        if (typeof value === 'number' && value > 0) measured[key] = value;
      }
    }
  } catch {
    // Storage can be unavailable (private mode); the estimate applies.
  }
  return measured;
}

function remember(next: KeyboardState) {
  if (!next.open || next.expected) return;
  const insets = measuredInsets();
  const key = sizeKey();
  if (insets[key] === next.inset) return;
  insets[key] = next.inset;
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(insets));
  } catch {
    // Kept in memory only.
  }
}

// ---------- Taking a new state ----------

function apply(next: KeyboardState) {
  const root = document.documentElement;
  if (next.open) root.style.setProperty('--app-height', `${next.visibleHeight}px`);
  else root.style.removeProperty('--app-height');
  // Also once it closes: else a window stands where iOS left the page, mid-screen (AC-009).
  scrollBack();
}

function take(next: KeyboardState) {
  apply(next);
  remember(next);
  const same =
    next.open === state.open && next.inset === state.inset && next.expected === state.expected;
  if (same) return;
  state = next;
  listeners.forEach((listener) => listener());
  if (next.open) revealSoon();
}

const settler = createSettler<KeyboardState>(KEYBOARD_SETTLE_MS, take);

function update() {
  // Whatever iOS scrolls meanwhile goes back at once.
  scrollBack();
  const next = read();
  const step = keyboardStep(state, next);
  if (step === 'keep') return;
  if (step === 'settle') {
    settler.push(next);
    return;
  }
  settler.cancel();
  take(next);
}

// ---------- The keyboard a tap asked for (decision 4) ----------

let expectation: ReturnType<typeof setTimeout> | undefined;

function endExpectation() {
  clearTimeout(expectation);
  expectation = undefined;
  if (!state.expected) return;
  // Not come after all: whatever the viewport says now.
  state = { ...state, expected: false };
  take(read());
}

/**
 * A tap asked for the keyboard (`openKeyboardNow`): until it is there, at most `ms`, the app
 * takes the height it had last time. Only at phone width; with the keyboard open nothing changes.
 *
 * @public `keyboard-proxy.web.ts` calls it.
 */
export function expectKeyboard(ms: number): void {
  if (typeof document === 'undefined' || state.open) return;
  if ((document.documentElement.clientWidth || window.innerWidth) >= PHONE_MAX_WIDTH) return;
  settler.cancel();
  const height = windowHeight();
  const last = measuredInsets()[sizeKey()];
  // A stored value is a claim: only a keyboard lower than the window counts.
  take(expectedKeyboard(height, last !== undefined && last < height ? last : undefined));
  clearTimeout(expectation);
  expectation = setTimeout(endExpectation, ms);
}

// ---------- The field with the cursor (REQ-004) ----------

function isTextField(element: unknown): element is HTMLInputElement | HTMLTextAreaElement {
  return (
    element instanceof HTMLTextAreaElement ||
    (element instanceof HTMLInputElement &&
      !/^(button|checkbox|radio|file|submit|range|color|image|reset)$/.test(element.type))
  );
}

function scrollArea(node: HTMLElement): HTMLElement | null {
  for (let parent = node.parentElement; parent; parent = parent.parentElement) {
    if (parent === document.body || parent === document.documentElement) return null;
    const { overflowY } = getComputedStyle(parent);
    if (overflowY === 'auto' || overflowY === 'scroll') return parent;
  }
  return null;
}

/** Scrolls the scroll area around the focused field so the field is in view (spec 0044). */
function revealFocused() {
  const field = document.activeElement;
  if (!state.open || !isTextField(field)) return;
  const area = scrollArea(field);
  if (!area) return;
  const viewport = window.visualViewport;
  const visibleTop = viewport?.offsetTop ?? 0;
  const top = keyboardRevealScrollTop({
    field: field.getBoundingClientRect(),
    area: area.getBoundingClientRect(),
    // While the keyboard is only expected, the visible area is the one it will leave.
    visible: state.expected
      ? { top: 0, bottom: state.visibleHeight }
      : { top: visibleTop, bottom: visibleTop + (viewport?.height ?? state.visibleHeight) },
    scrollTop: area.scrollTop,
    maxScrollTop: area.scrollHeight - area.clientHeight,
  });
  if (top === null) return;
  // A React Native Web ScrollView replaces its node's scrollTo with its own ({ x, y }): the
  // browser's own method, or plain scrollTop, moves it as asked.
  const smooth = typeof HTMLElement.prototype.scrollTo === 'function';
  if (smooth) Reflect.apply(HTMLElement.prototype.scrollTo, area, [{ top, behavior: 'smooth' }]);
  else area.scrollTop = top;
}

let frame: number | undefined;

/** After the layout has taken the new height (and a window its new place): two frames. */
function revealSoon() {
  if (frame !== undefined) cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    frame = requestAnimationFrame(() => {
      frame = undefined;
      revealFocused();
    });
  });
}

function onFocusIn(event: FocusEvent) {
  if (state.open && isTextField(event.target)) revealSoon();
}

// REQ-005, decision 1 (React Aria, `usePreventScroll`): Safari scrolls the whole page to a field
// the cursor moves to (˄ ˅, a tap, another keyboard), even inside a scroll area of its own. Taking
// the focus once more with `preventScroll` while it moves keeps Safari still; REQ-004 scrolls.
let refocusing = false;
function onBlur(event: FocusEvent) {
  const next = event.relatedTarget;
  if (refocusing || !isTextField(next) || !isAppleTouchBrowser(navigator)) return;
  refocusing = true;
  try {
    next.focus({ preventScroll: true });
  } finally {
    refocusing = false;
  }
}

// ---------- The store ----------

function listen(on: boolean) {
  const viewport = window.visualViewport;
  if (on) {
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('blur', onBlur, true);
  } else {
    viewport?.removeEventListener('resize', update);
    viewport?.removeEventListener('scroll', update);
    document.removeEventListener('focusin', onFocusIn, true);
    document.removeEventListener('blur', onBlur, true);
  }
}

/**
 * Takes the keyboard's current height at once instead of after it has settled (tests).
 *
 * @public The component tests' stand-in keyboard calls it.
 */
export function settleKeyboard(): void {
  if (state.expected) return;
  settler.push(read());
  settler.flush();
}

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) {
    listen(true);
    settleKeyboard();
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      listen(false);
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
