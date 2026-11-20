import { describe, expect, it } from 'vitest';

import { sheetFrame } from './sheet-size';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };

describe('sheet sizes (spec 0005, REQ-003)', () => {
  it('AC-014: a large window on a phone is 90 % of 844 px high, whatever it shows', () => {
    expect(sheetFrame('l', PHONE)).toEqual({ height: 760, maxHeight: 760 });
    expect(sheetFrame('m', PHONE)).toEqual({ height: 760, maxHeight: 760 });
  });

  it('AC-015: desktop dialogs are 440 wide by content, 560 × 640 and 760 × 720', () => {
    expect(sheetFrame('s', DESKTOP)).toEqual({ width: 440, maxHeight: 765 });
    expect(sheetFrame('m', DESKTOP)).toEqual({ width: 560, height: 640, maxHeight: 640 });
    expect(sheetFrame('l', DESKTOP)).toEqual({ width: 760, height: 720, maxHeight: 720 });
  });

  it('AC-016: in a 700 px high window the large dialog takes 85 % of the height', () => {
    expect(sheetFrame('l', { width: 1440, height: 700 })).toEqual({
      width: 760,
      height: 595,
      maxHeight: 595,
    });
  });

  it('AC-017: a small window on a phone grows with its content up to half the height', () => {
    expect(sheetFrame('s', PHONE)).toEqual({ maxHeight: 422 });
  });

  it('keeps a gap to the window edges on narrow tablets', () => {
    expect(sheetFrame('l', { width: 720, height: 1000 }).width).toBe(688);
  });
});
