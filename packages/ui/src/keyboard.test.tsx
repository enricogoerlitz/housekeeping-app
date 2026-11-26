// Spec 0044 "Tastatur und Fenster auf dem iPhone": the field with the cursor stays in view, and on
// iPhone Safari does not move the page when the cursor goes from one field to the next.
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useKeyboard } from './keyboard';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15';
const userAgent = Object.getOwnPropertyDescriptor(window.navigator, 'userAgent');
const asIPhone = () =>
  Object.defineProperty(window.navigator, 'userAgent', { configurable: true, value: IPHONE });

const viewport = window.visualViewport as unknown as EventTarget & {
  visible?: number;
  offsetTop: number;
};

function setWindow(width: number, height: number) {
  const root = document.documentElement;
  Object.defineProperty(root, 'clientWidth', { configurable: true, value: width });
  Object.defineProperty(root, 'clientHeight', { configurable: true, value: height });
}

/** The keyboard as iOS reports it: one resize at the start of its movement. */
function keyboardTo(visible: number | undefined) {
  viewport.visible = visible;
  act(() => {
    viewport.dispatchEvent(new Event('resize'));
  });
}

function frames() {
  act(() => vi.advanceTimersByTime(100));
}

function Listener() {
  useKeyboard();
  return null;
}

/** A scroll area from `top` to the window bottom with a field at `fieldTop` (unscrolled). */
function scrollArea(top: number, fieldTop: number, parent: HTMLElement = document.body) {
  const area = document.createElement('div');
  area.style.overflowY = 'auto';
  Object.defineProperty(area, 'clientHeight', { configurable: true, value: 844 - top });
  Object.defineProperty(area, 'scrollHeight', { configurable: true, value: 3000 });
  area.getBoundingClientRect = () => ({ top, bottom: 844 }) as DOMRect;
  const field = document.createElement('input');
  field.getBoundingClientRect = () => {
    const at = fieldTop - area.scrollTop;
    return { top: at, bottom: at + 44 } as DOMRect;
  };
  area.append(field);
  parent.append(area);
  return { area, field };
}

beforeEach(() => {
  vi.useFakeTimers({
    toFake: [
      'setTimeout',
      'clearTimeout',
      'setInterval',
      'clearInterval',
      'requestAnimationFrame',
      'cancelAnimationFrame',
    ],
  });
  setWindow(390, 844);
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
});
afterEach(() => {
  keyboardTo(undefined);
  act(() => vi.runOnlyPendingTimers());
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.replaceChildren();
  if (userAgent) Object.defineProperty(window.navigator, 'userAgent', userAgent);
  else Reflect.deleteProperty(window.navigator, 'userAgent');
});

describe('the field with the cursor in view (spec 0044, REQ-004)', () => {
  it('AC-016: tapped below the coming keyboard, the field comes into the upper third', () => {
    render(<Listener />);
    const { area, field } = scrollArea(100, 700);
    act(() => field.focus());
    // iOS scrolls the page to the field as the keyboard comes.
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 150 });
    keyboardTo(464);
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
    frames();
    // 100 + 16 + (332 − 44) / 3 = 212.
    expect(area.scrollTop).toBe(700 - 212);
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('AC-017: the cursor moving to a field under the open keyboard brings that one up', () => {
    render(<Listener />);
    const { area } = scrollArea(100, 200);
    const next = document.createElement('input');
    next.getBoundingClientRect = () => ({ top: 600 - area.scrollTop, bottom: 644 }) as DOMRect;
    area.append(next);
    act(() => (area.firstElementChild as HTMLInputElement).focus());
    keyboardTo(464);
    frames();
    expect(area.scrollTop).toBe(0);
    act(() => next.focus());
    frames();
    expect(area.scrollTop).toBe(600 - 212);
  });

  it('AC-018: a field in a window scrolls the window content, not the page behind', () => {
    render(<Listener />);
    const page = scrollArea(100, 300);
    const sheet = scrollArea(300, 470, page.area);
    sheet.area.getBoundingClientRect = () => ({ top: 300, bottom: 450 }) as DOMRect;
    keyboardTo(464);
    frames();
    act(() => sheet.field.focus());
    frames();
    expect(sheet.area.scrollTop).toBe(Math.round(470 - (316 + 74 / 3)));
    expect(page.area.scrollTop).toBe(0);
  });

  it('AC-019: without a keyboard (desktop) the app scrolls nothing itself', () => {
    render(<Listener />);
    const { area, field } = scrollArea(100, 700);
    act(() => field.focus());
    frames();
    expect(area.scrollTop).toBe(0);
  });
});

describe('the cursor moving between fields on iPhone (spec 0044, REQ-005)', () => {
  function twoFields() {
    const first = document.createElement('input');
    const second = document.createElement('input');
    document.body.append(first, second);
    act(() => first.focus());
    return { first, second };
  }

  it('AC-020: the next field takes the focus without Safari scrolling to it', () => {
    asIPhone();
    render(<Listener />);
    const { second } = twoFields();
    const focus = vi.spyOn(second, 'focus');
    act(() => second.focus());
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(document.activeElement).toBe(second);
  });

  it('AC-021: elsewhere the browser keeps its own focus handling', () => {
    render(<Listener />);
    const { second } = twoFields();
    const focus = vi.spyOn(second, 'focus');
    act(() => second.focus());
    expect(focus).toHaveBeenCalledTimes(1);
    expect(focus).not.toHaveBeenCalledWith({ preventScroll: true });
  });

  it('AC-021: moving to a button is left alone', () => {
    asIPhone();
    render(<Listener />);
    const { first } = twoFields();
    const button = document.createElement('button');
    document.body.append(button);
    const focus = vi.spyOn(button, 'focus');
    act(() => button.focus());
    expect(focus).toHaveBeenCalledTimes(1);
    expect(first).not.toBe(document.activeElement);
  });
});
