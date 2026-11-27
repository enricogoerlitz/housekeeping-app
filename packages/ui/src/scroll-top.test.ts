import { afterEach, describe, expect, it, vi } from 'vitest';

import { isShown, registerTopScroller, scrollShownToTop } from './scroll-top';

const shownNode = { getClientRects: () => [{}] };
const hiddenNode = { getClientRects: () => [] };

describe('scrollShownToTop (spec 0057, REQ-002)', () => {
  const off: (() => void)[] = [];
  afterEach(() => off.splice(0).forEach((unregister) => unregister()));

  it('AC-009, AC-010: scrolls the page that is shown to the top, not the hidden tabs', () => {
    const shown = vi.fn();
    const hidden = vi.fn();
    off.push(registerTopScroller({ node: () => shownNode, toTop: shown }));
    off.push(registerTopScroller({ node: () => hiddenNode, toTop: hidden }));
    expect(scrollShownToTop(true)).toBe(1);
    expect(shown).toHaveBeenCalledWith(true);
    expect(hidden).not.toHaveBeenCalled();
  });

  it('AC-013: passes "without animation" on, for reduced motion', () => {
    const toTop = vi.fn();
    off.push(registerTopScroller({ node: () => shownNode, toTop }));
    scrollShownToTop(false);
    expect(toTop).toHaveBeenCalledWith(false);
  });

  it('forgets a page that unmounted', () => {
    const toTop = vi.fn();
    registerTopScroller({ node: () => shownNode, toTop })();
    expect(scrollShownToTop(true)).toBe(0);
    expect(toTop).not.toHaveBeenCalled();
  });
});

describe('isShown', () => {
  it('is false for no node or a node without boxes (display: none)', () => {
    expect(isShown(null)).toBe(false);
    expect(isShown(hiddenNode)).toBe(false);
    expect(isShown(shownNode)).toBe(true);
  });

  it('is true where a node cannot be measured (native)', () => {
    expect(isShown({})).toBe(true);
  });
});
