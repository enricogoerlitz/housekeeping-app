import { describe, expect, it } from 'vitest';

import {
  expectedKeyboard,
  keyboardSheetFrame,
  keyboardState,
  keyboardStep,
  NO_KEYBOARD,
} from './keyboard-state';

describe('keyboardState (spec 0032, REQ-001)', () => {
  it('AC-001: a visible area of 400 px of 844 px is an open keyboard 444 px high', () => {
    expect(keyboardState({ windowHeight: 844, visibleHeight: 400 })).toEqual({
      open: true,
      inset: 444,
      visibleHeight: 400,
    });
  });

  it('AC-002: the whole window visible is a closed keyboard', () => {
    expect(keyboardState({ windowHeight: 844, visibleHeight: 844 })).toEqual({
      open: false,
      inset: 0,
      visibleHeight: 844,
    });
  });

  it('AC-003: 100 px less (the browser bar) is no keyboard', () => {
    expect(keyboardState({ windowHeight: 844, visibleHeight: 744 }).open).toBe(false);
    expect(keyboardState({ windowHeight: 844, visibleHeight: 744 }).inset).toBe(0);
  });

  it('a zoomed page (visible area larger than the window) is no keyboard', () => {
    expect(keyboardState({ windowHeight: 844, visibleHeight: 900 }).open).toBe(false);
  });
});

describe('keyboardSheetFrame (spec 0032, REQ-002)', () => {
  it('AC-004: with the keyboard open the window fills the visible area below the top gap', () => {
    expect(keyboardSheetFrame({ height: 760, maxHeight: 760 }, 400, 12)).toEqual({
      height: 388,
      maxHeight: 388,
    });
    // A small window keeps its own height by content, only capped.
    expect(keyboardSheetFrame({ maxHeight: 422 }, 400, 12)).toEqual({ maxHeight: 388 });
  });
});

describe('keyboardState with the visible area moved (spec 0044, REQ-002)', () => {
  it('AC-008: moved down by 120 px, the keyboard starts at the bottom of the visible area', () => {
    expect(keyboardState({ windowHeight: 844, visibleHeight: 464, offsetTop: 120 })).toEqual({
      open: true,
      inset: 260,
      visibleHeight: 464,
    });
  });
});

describe('keyboardStep (spec 0044, REQ-002, decision 2)', () => {
  const open = (visibleHeight: number) => keyboardState({ windowHeight: 844, visibleHeight });

  it('AC-003: the keyboard coming is taken at once', () => {
    expect(keyboardStep(NO_KEYBOARD, open(464))).toBe('now');
  });

  it('AC-010: the keyboard going is taken at once', () => {
    expect(keyboardStep(open(464), open(844))).toBe('now');
  });

  it('AC-007: a new height of the open keyboard waits until it has settled', () => {
    expect(keyboardStep(open(464), open(420))).toBe('settle');
    expect(keyboardStep(NO_KEYBOARD, open(800))).toBe('settle');
  });

  it('AC-004: the measured keyboard replaces the expected one at once', () => {
    expect(keyboardStep(expectedKeyboard(844, 380), open(464))).toBe('now');
  });

  it('AC-004: while a keyboard is expected, a full viewport does not cancel it', () => {
    expect(keyboardStep(expectedKeyboard(844, 380), open(844))).toBe('keep');
  });
});

describe('expectedKeyboard (spec 0044, REQ-002, decision 4)', () => {
  it('AC-004: the last measured height', () => {
    expect(expectedKeyboard(844, 380)).toEqual({
      open: true,
      inset: 380,
      visibleHeight: 464,
      expected: true,
    });
  });

  it('AC-005: without one, 45 % of the window', () => {
    expect(expectedKeyboard(844, undefined).inset).toBe(380);
    expect(expectedKeyboard(700, undefined).inset).toBe(315);
  });
});
