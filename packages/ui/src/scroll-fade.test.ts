import { describe, expect, it } from 'vitest';

import { scrollFade, scrollFadeMask } from './scroll-fade';

describe('scrollFade (review 0003: chips cut hard at the end of the filter row)', () => {
  it('a row that fits fades nowhere', () => {
    expect(scrollFade({ offset: 0, content: 300, view: 300 })).toEqual({
      start: false,
      end: false,
    });
  });

  it('a longer row fades at the end while more follows, at the start once scrolled', () => {
    expect(scrollFade({ offset: 0, content: 500, view: 300 })).toEqual({ start: false, end: true });
    expect(scrollFade({ offset: 100, content: 500, view: 300 })).toEqual({
      start: true,
      end: true,
    });
    // Scrolled to the end (within a pixel of rounding): the last chip stands whole.
    expect(scrollFade({ offset: 199.5, content: 500, view: 300 })).toEqual({
      start: true,
      end: false,
    });
  });

  it('the mask is opaque where nothing fades and transparent at a fading edge', () => {
    expect(scrollFadeMask({ start: false, end: false })).toBeUndefined();
    expect(scrollFadeMask({ start: false, end: true })).toBe(
      'linear-gradient(to right, transparent 0px, #000 0px, #000 calc(100% - 28px), transparent 100%)',
    );
    expect(scrollFadeMask({ start: true, end: false })).toBe(
      'linear-gradient(to right, transparent 0px, #000 28px, #000 calc(100% - 0px), #000 100%)',
    );
  });
});
