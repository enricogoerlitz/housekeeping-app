import { useSyncExternalStore } from 'react';

import { isAppleTouchBrowser } from './field-autofill';
import { createSettler, KEYBOARD_DRIFT_MS, KEYBOARD_SETTLE_MS } from './keyboard-settle';
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
/** Kept in memory where the storage is unavailable (private mode). */
let measured: Record<string, number> | undefined;

function sizeKey(): string {
  return `${document.documentElement.clientWidth || window.innerWidth}x${windowHeight()}`;
}

function measuredInsets(): Record<string, number> {
  try {
    const read: Record<string, number> = {};
    const stored: unknown = JSON.parse(window.localStorage.getItem(STORE_KEY) ?? '{}');
    if (stored && typeof stored === 'object') {
      for (const [key, value] of Object.entries(stored)) {
        if (typeof value === 'number' && value > 0) read[key] = value;
      }
    }
    measured = read;
  } catch {
    // Storage can be unavailable (private mode); the memory or the estimate applies.
    measured ??= {};
  }
  return measured ?? {};
}

function remember(next: KeyboardState) {
  if (!next.open || next.expected) return;
  const insets = measuredInsets();
  const key = sizeKey();
  // The tallest keyboard seen (with suggestions) stands for the next one: a guess too small lets
  // Safari push the whole page up until the app sets it back (iPhone click-through, review 0003);
  // one too tall only leaves a gap until the real height comes.
  if ((insets[key] ?? 0) >= next.inset) return;
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
    next.open === state.open &&
    next.inset === state.inset &&
    next.expected === state.expected &&
    next.leaving === state.leaving;
  if (same) return;
  state = next;
  listeners.forEach((listener) => listener());
  if (next.open) revealSoon();
}

const settler = createSettler<KeyboardState>(KEYBOARD_SETTLE_MS, take);
const drift = createSettler<KeyboardState>(KEYBOARD_DRIFT_MS, take);

function update() {
  // Whatever iOS scrolls meanwhile goes back at once.
  scrollBack();
  const next = read();
  if (leaving !== undefined) {
    // WebKit reports the keyboard until it has gone; a field taking the cursor ends this early.
    if (next.open) return;
    endLeaving();
  }
  const step = keyboardStep(state, next);
  if (step === 'keep') return;
  if (step === 'drift') {
    drift.push(next);
    return;
  }
  drift.cancel();
  if (step === 'same') {
    settler.cancel();
    return;
  }
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
  drift.cancel();
  const height = windowHeight();
  const last = measuredInsets()[sizeKey()];
  // A stored value is a claim: only a keyboard lower than the window counts.
  take(expectedKeyboard(height, last !== undefined && last < height ? last : undefined));
  clearTimeout(expectation);
  expectation = setTimeout(endExpectation, ms);
}

// ---------- A window closing takes the keyboard along (B-03) ----------

/** How long a keyboard said to be leaving may still be reported before the app believes it. */
const LEAVING_MS = 1000;
let leaving: ReturnType<typeof setTimeout> | undefined;

function endLeaving() {
  clearTimeout(leaving);
  leaving = undefined;
}

/**
 * The cursor left the last field on iPhone: the keyboard goes now. Safari reports it gone only
 * about 0.5 s later; until then a window floated where the keyboard had been and dropped after it,
 * a closing window slid out only down to there, and the page stayed as high as the keyboard left
 * it, half drawn as the keyboard went (iPhone click-through 27.11., B-03). The app takes it as gone
 * at once; readings that still show it are ignored until one shows it gone, a field takes the
 * cursor again, or `LEAVING_MS` have passed. A window closing calls it too: dragged away, its
 * field can lose the cursor without a blur event.
 *
 * @public `Sheet` calls it as it closes.
 */
export function keyboardLeaving(): void {
  if (typeof document === 'undefined' || !isAppleTouchBrowser(navigator)) return;
  if (!state.open || state.expected || isTextField(document.activeElement)) return;
  settler.cancel();
  drift.cancel();
  clearTimeout(expectation);
  expectation = undefined;
  endLeaving();
  leaving = setTimeout(() => {
    leaving = undefined;
    take(read());
  }, LEAVING_MS);
  take({ open: false, inset: 0, visibleHeight: windowHeight(), leaving: true });
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

/** The text field after `field` in the same scroll area that takes the cursor, if any. */
function nextField(
  field: HTMLElement,
  area: HTMLElement,
): HTMLInputElement | HTMLTextAreaElement | undefined {
  let passed = false;
  for (const candidate of area.querySelectorAll('input, textarea')) {
    if (candidate === field) passed = true;
    else if (passed && isTextField(candidate) && !candidate.disabled && !candidate.readOnly) {
      return candidate;
    }
  }
  return undefined;
}

/**
 * Scrolls the scroll area around a field so the field, and the start of the next one, are in view
 * (spec 0044). `smooth` glides;
 * without it the area stands there at once (the cursor moving with ˄ ˅, see `onBlur`).
 */
function reveal(field: HTMLInputElement | HTMLTextAreaElement, smooth: boolean) {
  if (!state.open) return;
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
    next: nextField(field, area)?.getBoundingClientRect(),
  });
  if (top === null) return;
  // A React Native Web ScrollView replaces its node's scrollTo with its own ({ x, y }): the
  // browser's own method, or plain scrollTop, moves it as asked.
  if (smooth && typeof HTMLElement.prototype.scrollTo === 'function') {
    Reflect.apply(HTMLElement.prototype.scrollTo, area, [{ top, behavior: 'smooth' }]);
  } else {
    area.scrollTop = top;
  }
}

function revealFocused() {
  const field = document.activeElement;
  if (isTextField(field)) reveal(field, true);
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

/** How long a tapped field waits for its keyboard (as `HANDOVER_MS` in keyboard-proxy). */
const TAP_KEYBOARD_MS = 1500;

function onFocusIn(event: FocusEvent) {
  if (!isTextField(event.target)) return;
  if (leaving !== undefined) {
    // The cursor came back before the keyboard went: whatever the viewport says.
    endLeaving();
    const now = read();
    if (now.open) {
      take(now);
      return;
    }
  }
  if (state.open) {
    revealSoon();
    return;
  }
  // A tapped field on iPhone: the app takes the coming keyboard's height at once, so the field
  // is already above it and Safari does not push the whole page up for a few frames before the
  // app sets it back (iPhone click-through, review 0003; spec 0044, decision 4).
  if (!isAppleTouchBrowser(navigator)) return;
  expectKeyboard(TAP_KEYBOARD_MS);
  // In place at once, before iOS decides which neighbours ˄ ˅ reach (see `onBlur`).
  reveal(event.target, false);
}

// REQ-005, decision 1 (React Aria, `usePreventScroll`): Safari scrolls the whole page to a field
// the cursor moves to (˄ ˅, a tap, another keyboard), even inside a scroll area of its own. Taking
// the focus once more with `preventScroll` while it moves keeps Safari still; REQ-004 scrolls.
// The field is put in place before it takes the focus: iOS decides then which neighbours ˄ ˅
// reach, and only offers visible ones (iPhone click-through, review 0003).
let refocusing = false;
let leavingCheck: ReturnType<typeof setTimeout> | undefined;

function onBlur(event: FocusEvent) {
  const next = event.relatedTarget;
  // The cursor left all fields before the expected keyboard came: none is coming.
  if (state.expected && !refocusing && !isTextField(next)) endExpectation();
  // A tap on a button: once its handler has run (it may give a field the cursor again within the
  // tap, "Titel fehlt"), the keyboard goes unless a field has the cursor (B-03).
  if (
    state.open &&
    !refocusing &&
    !isTextField(next) &&
    isTextField(event.target) &&
    isAppleTouchBrowser(navigator)
  ) {
    clearTimeout(leavingCheck);
    leavingCheck = setTimeout(keyboardLeaving, 0);
  }
  if (refocusing || !isTextField(next) || !isAppleTouchBrowser(navigator)) return;
  refocusing = true;
  try {
    reveal(next, false);
    next.focus({ preventScroll: true });
  } finally {
    refocusing = false;
  }
}

// Safari may also scroll the window alone, the visual viewport staying put (a field in a window
// on the keyboard): no viewport event comes, so the window's own scroll sets it back (iPhone
// click-through, review 0003).
function onWindowScroll() {
  if (state.open) scrollBack();
}

// ---------- The store ----------

function listen(on: boolean) {
  const viewport = window.visualViewport;
  if (on) {
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    window.addEventListener('scroll', onWindowScroll);
    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('blur', onBlur, true);
  } else {
    viewport?.removeEventListener('resize', update);
    viewport?.removeEventListener('scroll', update);
    window.removeEventListener('scroll', onWindowScroll);
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
      drift.cancel();
      endLeaving();
      clearTimeout(leavingCheck);
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
