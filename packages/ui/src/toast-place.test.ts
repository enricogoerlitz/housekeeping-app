import { describe, expect, it } from 'vitest';

import { toastBottom } from './toast-place';

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
