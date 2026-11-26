import { describe, expect, it } from 'vitest';

import { needsPortraitHint } from './portrait-hint';

describe('the hint to hold the phone upright (spec 0034, REQ-009)', () => {
  it('AC-021: an iPhone held sideways gets the hint', () => {
    expect(needsPortraitHint({ width: 844, height: 390, finePointer: false })).toBe(true);
  });

  it('AC-021: held upright again everything is as before', () => {
    expect(needsPortraitHint({ width: 390, height: 844, finePointer: false })).toBe(false);
  });

  it('a tablet sideways, a desktop window and a short browser window never get it', () => {
    expect(needsPortraitHint({ width: 1180, height: 820, finePointer: false })).toBe(false);
    expect(needsPortraitHint({ width: 1440, height: 900, finePointer: true })).toBe(false);
    expect(needsPortraitHint({ width: 900, height: 420, finePointer: true })).toBe(false);
  });
});
