import { describe, expect, it } from 'vitest';

import { stickyTopStyle } from './sticky';

describe('a head that stays at the top while its block scrolls (spec 0030, REQ-001)', () => {
  it('AC-001: on the web it sticks at the top of the scroll area, over the content, on the page colour', () => {
    expect(stickyTopStyle('web', '#FFFFFF')).toEqual({
      position: 'sticky',
      top: 0,
      zIndex: 2,
      backgroundColor: '#FFFFFF',
    });
  });

  it('elsewhere it stays in place', () => {
    expect(stickyTopStyle('ios', '#FFFFFF')).toEqual({});
  });
});
