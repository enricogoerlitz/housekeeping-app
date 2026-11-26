// Spec 0033, REQ-006, decision 10: iOS opens the keyboard only for a focus() that runs inside the
// user's tap. A window to create or edit something mounts later (after a menu closed, after the
// address changed), so its first field would get the cursor but no keyboard. The known way round:
// the tap itself focuses a hidden text field that is already in the page (the keyboard opens),
// and the window's field takes the focus over from it once it is there; moving the focus from one
// text field to another keeps the keyboard open. Until then nothing else may take the focus (a
// menu hands it back to its button, react-native-web's modals move it into themselves or back to
// where it was), or the keyboard closes again: for this short while `focus()` of anything but a
// text field does nothing. Only on iPhone and iPad; elsewhere the window's own focus is enough.

import { isAppleTouchBrowser } from './field-autofill';

/**
 * How long a tap's keyboard waits for its window (spec 0033, decision 10).
 *
 * @public The tests wait for it.
 */
export const HANDOVER_MS = 1500;

let proxy: HTMLInputElement | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let nativeFocus: HTMLElement['focus'] | null = null;

function isTextField(element: unknown): boolean {
  return (
    element instanceof HTMLTextAreaElement ||
    (element instanceof HTMLInputElement &&
      !/^(button|checkbox|radio|file|submit)$/.test(element.type))
  );
}

function proxyField(): HTMLInputElement {
  if (proxy?.isConnected) return proxy;
  const input = document.createElement('input');
  input.type = 'text';
  input.setAttribute('aria-hidden', 'true');
  input.setAttribute('autocomplete', 'off');
  input.name = 'hksearchkeyboard';
  input.tabIndex = -1;
  // In the page and focusable (not display: none), out of sight; 16 px so iOS does not zoom.
  Object.assign(input.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '1px',
    height: '1px',
    opacity: '0',
    fontSize: '16px',
    border: '0',
    padding: '0',
    pointerEvents: 'none',
    caretColor: 'transparent',
  });
  document.body.append(input);
  proxy = input;
  return input;
}

function holdFocus() {
  if (nativeFocus) return;
  const original = HTMLElement.prototype.focus;
  nativeFocus = original;
  HTMLElement.prototype.focus = function focusTextOnly(this: HTMLElement, options?: FocusOptions) {
    if (isTextField(this)) original.call(this, options);
  };
}

function release() {
  clearTimeout(timer);
  timer = undefined;
  if (nativeFocus) HTMLElement.prototype.focus = nativeFocus;
  nativeFocus = null;
  if (proxy && document.activeElement === proxy) proxy.blur();
}

/**
 * Call synchronously in the tap that opens a window to create or edit something: on iPhone and
 * iPad the keyboard opens now and goes to the window's first field (`handOverKeyboard`).
 *
 * @public Metro resolves the import of the native twin to this file on the web.
 */
export function openKeyboardNow(): void {
  if (typeof document === 'undefined' || !isAppleTouchBrowser(navigator)) return;
  const input = proxyField();
  holdFocus();
  input.focus({ preventScroll: true });
  clearTimeout(timer);
  // No window took it (nothing to type after all): the keyboard goes again.
  timer = setTimeout(release, HANDOVER_MS);
}

/**
 * A window's first field takes the keyboard of `openKeyboardNow`; false when none waits. The
 * focus stays held a moment longer, while the menu or the window still move it.
 *
 * @public Metro resolves the import of the native twin to this file on the web.
 */
export function handOverKeyboard(input: unknown): boolean {
  if (!proxy || document.activeElement !== proxy || !isTextField(input)) return false;
  (input as HTMLElement).focus({ preventScroll: true });
  return document.activeElement === input;
}
