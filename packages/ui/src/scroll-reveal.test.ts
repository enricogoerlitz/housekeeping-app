import { describe, expect, it } from 'vitest';

import { revealScrollTop } from './scroll-reveal';

const view = { top: 100, bottom: 700 };

describe('revealScrollTop (spec 0033, REQ-004)', () => {
  it('AC-012: a section that is fully visible needs no scrolling', () => {
    expect(
      revealScrollTop({ item: { top: 200, bottom: 600 }, view, scrollTop: 300, align: 'start' }),
    ).toBeNull();
    expect(
      revealScrollTop({ item: { top: 100, bottom: 700 }, view, scrollTop: 0, align: 'nearest' }),
    ).toBeNull();
  });

  it('below the visible area: start brings its top to the top of the view', () => {
    expect(
      revealScrollTop({ item: { top: 650, bottom: 900 }, view, scrollTop: 300, align: 'start' }),
    ).toBe(850);
  });

  it('above the visible area: its top comes to the top of the view', () => {
    expect(
      revealScrollTop({ item: { top: 40, bottom: 160 }, view, scrollTop: 300, align: 'start' }),
    ).toBe(240);
    expect(
      revealScrollTop({ item: { top: 40, bottom: 160 }, view, scrollTop: 300, align: 'nearest' }),
    ).toBe(240);
  });

  it('nearest scrolls only as far as the hidden part', () => {
    expect(
      revealScrollTop({ item: { top: 650, bottom: 760 }, view, scrollTop: 300, align: 'nearest' }),
    ).toBe(360);
  });

  it('taller than the view: nearest shows its top', () => {
    expect(
      revealScrollTop({ item: { top: 400, bottom: 1400 }, view, scrollTop: 0, align: 'nearest' }),
    ).toBe(300);
  });

  it('never scrolls above the start', () => {
    expect(
      revealScrollTop({ item: { top: 0, bottom: 50 }, view, scrollTop: 20, align: 'start' }),
    ).toBe(0);
  });
});
