import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TextField } from './controls';
import { HANDOVER_MS, handOverKeyboard, openKeyboardNow } from './keyboard-proxy';
import { Sheet } from './overlay';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15';
const userAgent = Object.getOwnPropertyDescriptor(window.navigator, 'userAgent');
const asIPhone = () =>
  Object.defineProperty(window.navigator, 'userAgent', { configurable: true, value: IPHONE });

let button: HTMLButtonElement;
let field: HTMLInputElement;

beforeEach(() => {
  vi.useFakeTimers();
  button = document.createElement('button');
  field = document.createElement('input');
  document.body.append(button, field);
});
afterEach(() => {
  act(() => vi.runAllTimers());
  vi.useRealTimers();
  button.remove();
  field.remove();
  if (userAgent) Object.defineProperty(window.navigator, 'userAgent', userAgent);
  else Reflect.deleteProperty(window.navigator, 'userAgent');
});

const focused = () => document.activeElement;

describe('openKeyboardNow (spec 0033, REQ-006, decision 10)', () => {
  it('AC-018: on an iPhone a tap focuses a hidden text field at once, so iOS opens the keyboard', () => {
    asIPhone();
    openKeyboardNow();
    const proxy = focused();
    expect(proxy).toBeInstanceOf(HTMLInputElement);
    const style = (proxy as HTMLInputElement).style;
    // 16 px or more, or iOS zooms in; in the page, but out of sight and out of the way.
    expect(parseFloat(style.fontSize)).toBeGreaterThanOrEqual(16);
    expect(style.display).not.toBe('none');
    expect(style.opacity).toBe('0');
    expect(proxy?.getAttribute('aria-hidden')).toBe('true');
    expect(proxy?.getAttribute('autocomplete')).toBe('off');
  });

  it('AC-018: until the window takes it, nothing but a text field gets the focus', () => {
    asIPhone();
    openKeyboardNow();
    const proxy = focused();
    // A menu handing the focus back to its button would close the keyboard.
    button.focus();
    expect(focused()).toBe(proxy);
    expect(handOverKeyboard(field)).toBe(true);
    expect(focused()).toBe(field);
  });

  it('handed over, the hidden field leaves the page: a window closing gives the focus back to it, which kept the keyboard open (I-05)', () => {
    asIPhone();
    openKeyboardNow();
    const proxy = focused() as HTMLInputElement;
    expect(handOverKeyboard(field)).toBe(true);
    expect(proxy.isConnected).toBe(false);
    // react-native-web's modal hands the focus back to what had it before it opened.
    proxy.focus();
    expect(focused()).not.toBe(proxy);
  });

  it('gives up after a while when no window took the keyboard', () => {
    asIPhone();
    openKeyboardNow();
    act(() => vi.advanceTimersByTime(HANDOVER_MS));
    expect(focused()).toBe(document.body);
    button.focus();
    expect(focused()).toBe(button);
    expect(handOverKeyboard(field)).toBe(false);
    expect(focused()).not.toBe(field);
  });

  it('AC-017: does nothing with a mouse (not an iPhone or iPad)', () => {
    openKeyboardNow();
    expect(focused()).toBe(document.body);
    expect(handOverKeyboard(field)).toBe(false);
  });

  it('AC-018: a window opened by such a tap puts the cursor into its field once it stands (I-04)', () => {
    asIPhone();
    openKeyboardNow();
    const proxy = focused();
    render(
      <Sheet visible onClose={() => undefined} title="Neues Rezept" size="m">
        <TextField label="Titel" value="" onChangeText={() => undefined} autoFocus testID="title" />
      </Sheet>,
    );
    // While it slides in, the hidden field keeps the keyboard.
    expect(focused()).toBe(proxy);
    act(() => vi.advanceTimersByTime(300));
    expect(focused()).toBe(screen.getByTestId('title'));
  });

  it('a field of a window that focuses itself (no claim) takes the keyboard once the window stands', () => {
    asIPhone();
    openKeyboardNow();
    function Search() {
      return <input data-testid="search" ref={(node) => node?.focus()} />;
    }
    render(
      <Sheet visible onClose={() => undefined} title="Suchen" size="m">
        <Search />
      </Sheet>,
    );
    act(() => vi.advanceTimersByTime(300));
    expect(focused()).toBe(screen.getByTestId('search'));
  });

  it('AC-020: a window that only shows takes nothing; the keyboard is let go', () => {
    asIPhone();
    render(
      <Sheet visible onClose={() => undefined} title="Bad putzen" size="m">
        <TextField label="Notiz" value="" onChangeText={() => undefined} testID="note" />
      </Sheet>,
    );
    expect(focused()).not.toBe(screen.getByTestId('note'));
    expect(focused()).not.toBeInstanceOf(HTMLInputElement);
  });
});
