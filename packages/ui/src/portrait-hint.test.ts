import { describe, expect, it } from 'vitest';

import { needsPortraitHint } from './portrait-hint';

describe('the hint to hold the phone upright (spec 0034, REQ-009)', () => {
  it('AC-021: an iPhone held sideways gets the hint', () => {
    expect(needsPortraitHint({ width: 844, height: 390, finePointer: false })).toBe(true);
  });

  it('AC-021: held upright again everything is as before', () => {
    expect(needsPortraitHint({ width: 390, height: 844, finePointer: false })).toBe(false);
  });

  it('AC-021: the keyboard shrinking the window of an upright iPhone is no turn (iPhone click-through)', () => {
    // iOS Safari with the keyboard open: the visible area is 402 × 384, the screen is upright.
    expect(
      needsPortraitHint({
        width: 402,
        height: 384,
        finePointer: false,
        orientation: 'portrait',
        screen: { width: 402, height: 874 },
      }),
    ).toBe(false);
  });

  it('AC-021: held sideways with the keyboard open it still asks to turn the phone', () => {
    expect(
      needsPortraitHint({
        width: 874,
        height: 180,
        finePointer: false,
        orientation: 'landscape',
        screen: { width: 402, height: 874 },
      }),
    ).toBe(true);
  });

  it('an iPad held sideways with the keyboard open gets no hint', () => {
    expect(
      needsPortraitHint({
        width: 1180,
        height: 420,
        finePointer: false,
        orientation: 'landscape',
        screen: { width: 820, height: 1180 },
      }),
    ).toBe(false);
  });

  it('a tablet sideways, a desktop window and a short browser window never get it', () => {
    expect(needsPortraitHint({ width: 1180, height: 820, finePointer: false })).toBe(false);
    expect(needsPortraitHint({ width: 1440, height: 900, finePointer: true })).toBe(false);
    expect(needsPortraitHint({ width: 900, height: 420, finePointer: true })).toBe(false);
  });
});
