import { describe, expect, it } from 'vitest';

import { keyboardSheetFrame, keyboardState } from './keyboard-state';

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
