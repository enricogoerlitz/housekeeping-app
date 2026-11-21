import { describe, expect, it } from 'vitest';

import { menuKey } from './menu-keys';

// Six sort entries as in spec 0008, AC-010: "Zuletzt gekocht" … "Zufall".
const COUNT = 6;

describe('menu keyboard (spec 0008, platforms)', () => {
  it('arrow keys move the focus and wrap around at both ends', () => {
    expect(menuKey('ArrowDown', 0, COUNT, true)).toEqual({ focus: 1 });
    expect(menuKey('ArrowDown', 5, COUNT, true)).toEqual({ focus: 0 });
    expect(menuKey('ArrowUp', 0, COUNT, true)).toEqual({ focus: 5 });
    expect(menuKey('ArrowUp', 3, COUNT, true)).toEqual({ focus: 2 });
  });

  it('Home and End jump to the first and the last entry', () => {
    expect(menuKey('Home', 4, COUNT, false)).toEqual({ focus: 0 });
    expect(menuKey('End', 1, COUNT, false)).toEqual({ focus: 5 });
  });

  it('Space picks the focused value in a choice menu; Enter is the pressable’s own', () => {
    expect(menuKey(' ', 2, COUNT, true)).toEqual({ choose: 2 });
    expect(menuKey('Enter', 2, COUNT, true)).toBeUndefined();
  });

  it('Space in an action menu is left to the entry, which handles it itself', () => {
    expect(menuKey(' ', 2, COUNT, false)).toBeUndefined();
  });

  it('ignores other keys and empty menus', () => {
    expect(menuKey('a', 0, COUNT, true)).toBeUndefined();
    expect(menuKey('ArrowDown', 0, 0, true)).toBeUndefined();
  });
});
