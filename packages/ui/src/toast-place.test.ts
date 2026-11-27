import { describe, expect, it } from 'vitest';

import { keyboardToastBottom, toastBottom, toastEdge } from './toast-place';

// A phone 844 high; the toast 48 high stands 95 above the bottom edge (tab bar and gap).
const base = { bottom: 95, windowHeight: 844, toastHeight: 48, gap: 12 };

describe('toastBottom (spec 0033, REQ-009)', () => {
  it('AC-025: buttons right above the tab bar: the toast stands above them', () => {
    // "Einplanen" and "Auf die Liste" from 717 to 763.
    expect(toastBottom({ ...base, obstacles: [{ top: 717, bottom: 763 }] })).toBe(844 - 717 + 12);
  });

  it('buttons elsewhere on the screen: the toast keeps its place', () => {
    expect(toastBottom({ ...base, obstacles: [{ top: 200, bottom: 246 }] })).toBe(95);
    expect(toastBottom({ ...base, obstacles: [] })).toBe(95);
  });

  it('buttons scrolled out below the screen do not move it', () => {
    expect(toastBottom({ ...base, obstacles: [{ top: 900, bottom: 946 }] })).toBe(95);
  });

  it('of several obstacles in its way, it clears the highest', () => {
    expect(
      toastBottom({
        ...base,
        obstacles: [
          { top: 717, bottom: 763 },
          { top: 660, bottom: 706 },
        ],
      }),
    ).toBe(844 - 660 + 12);
  });

  it('never leaves the upper half of the screen to clear an obstacle', () => {
    expect(toastBottom({ ...base, obstacles: [{ top: 100, bottom: 760 }] })).toBe(95);
  });
});

describe('toastEdge (spec 0033, REQ-009, decision 12)', () => {
  // A phone 390 × 844; "Foto gespeichert" is 140 wide and stands centred (125–265).
  const spot = { windowWidth: 390, windowHeight: 844, toastWidth: 140, toastHeight: 48 };

  it('AC-025: on the rating stars above "Kochen" the toast moves to the top', () => {
    // The place above the buttons (bottom 295) covers the stars at 520–530 across the width.
    expect(
      toastEdge({
        ...spot,
        bottom: 295,
        top: 8,
        pressable: [{ top: 510, bottom: 540, left: 20, right: 370 }],
      }),
    ).toEqual({ top: 8 });
  });

  it('nothing to press under it: it keeps its place at the bottom', () => {
    expect(
      toastEdge({
        ...spot,
        bottom: 95,
        top: 8,
        pressable: [{ top: 510, bottom: 540, left: 20, right: 370 }],
      }),
    ).toEqual({ bottom: 95 });
  });

  it('a button beside it, not under it, does not move it', () => {
    expect(
      toastEdge({
        ...spot,
        bottom: 95,
        top: 8,
        pressable: [{ top: 710, bottom: 750, left: 20, right: 110 }],
      }),
    ).toEqual({ bottom: 95 });
  });

  it('the top is taken as well: it stays at the bottom', () => {
    expect(
      toastEdge({
        ...spot,
        bottom: 95,
        top: 8,
        pressable: [
          { top: 710, bottom: 750, left: 0, right: 390 },
          { top: 10, bottom: 50, left: 0, right: 390 },
        ],
      }),
    ).toEqual({ bottom: 95 });
  });
});

describe('keyboardToastBottom: the toast with the keyboard open (iPhone click-through)', () => {
  // Window 714 high, keyboard covers the lower 330, the toast is 48 high.
  const open = { windowHeight: 714, inset: 330, toastHeight: 48 };

  it('stands 12 above the keyboard when nothing with the cursor is there', () => {
    expect(keyboardToastBottom({ ...open })).toBe(342);
    expect(keyboardToastBottom({ ...open, field: { top: 100, bottom: 150 } })).toBe(342);
  });

  it('a field with the cursor right above the keyboard ("Was fehlt?") stays free: the toast goes above it', () => {
    // Field 324–374 (layout coordinates): the toast ends 8 above it, at 316.
    expect(keyboardToastBottom({ ...open, field: { top: 324, bottom: 374 } })).toBe(714 - 316);
  });

  it('no room above the field: on the keyboard as before', () => {
    expect(keyboardToastBottom({ ...open, field: { top: 30, bottom: 380 } })).toBe(342);
  });
});
