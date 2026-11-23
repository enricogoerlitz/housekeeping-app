import { describe, expect, it } from 'vitest';

import { claimsSwipe, swipeStep } from './swipe-step';

describe('horizontal swipe (spec 0016, REQ-006 week strip)', () => {
  it('AC-022: a swipe to the left goes to the next day, to the right to the previous one', () => {
    expect(swipeStep(-80, 0)).toBe(1);
    expect(swipeStep(80, 0)).toBe(-1);
  });

  it('a short fast flick counts, a short slow move does not', () => {
    expect(swipeStep(-24, -0.6)).toBe(1);
    expect(swipeStep(24, 0.6)).toBe(-1);
    expect(swipeStep(-24, -0.1)).toBe(0);
    expect(swipeStep(0, 0)).toBe(0);
  });

  it('spec 0021, AC-047: in the calendar a swipe left pages to the next period, right back', () => {
    // November → Dezember and back; a slow short move or a scroll does not page.
    expect(swipeStep(-120, -0.2)).toBe(1);
    expect(swipeStep(120, 0.2)).toBe(-1);
    expect(swipeStep(-10, -0.2)).toBe(0);
    expect(claimsSwipe(-30, 40)).toBe(false);
  });

  it('takes the gesture only when it runs clearly sideways, so vertical scrolling stays', () => {
    expect(claimsSwipe(14, 3)).toBe(true);
    expect(claimsSwipe(-14, 3)).toBe(true);
    expect(claimsSwipe(14, 12)).toBe(false);
    expect(claimsSwipe(6, 0)).toBe(false);
  });
});
