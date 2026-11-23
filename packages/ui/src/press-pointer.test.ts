import { describe, expect, it } from 'vitest';

import { pressedWithFinger } from './press-pointer';

describe('pressedWithFinger (spec 0031, REQ-031)', () => {
  it('AC-073: a tap with a finger counts as a finger', () => {
    expect(pressedWithFinger({ nativeEvent: { pointerType: 'touch' } }, true)).toBe(true);
  });

  it('AC-074: a click with the mouse is no finger, even on a touch screen', () => {
    expect(pressedWithFinger({ nativeEvent: { pointerType: 'mouse' } }, false)).toBe(false);
  });

  it('a pen and the keyboard are no finger', () => {
    expect(pressedWithFinger({ nativeEvent: { pointerType: 'pen' } }, false)).toBe(false);
    expect(pressedWithFinger({ nativeEvent: { pointerType: '' } }, false)).toBe(false);
  });

  it('without a pointer type the main pointer decides', () => {
    expect(pressedWithFinger({ nativeEvent: {} }, false)).toBe(true);
    expect(pressedWithFinger({ nativeEvent: {} }, true)).toBe(false);
    expect(pressedWithFinger(undefined, false)).toBe(true);
  });
});
