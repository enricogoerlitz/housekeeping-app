import { describe, expect, it } from 'vitest';

import {
  claimsTabSwipe,
  neighbourTab,
  tabSwipe,
  tabSwipeOffset,
  tabSwipeStep,
  tabSwipeTouchAction,
  TAB_SWIPE_EDGE,
  TAB_SWIPE_RUBBER_MAX,
} from './tab-swipe';

const middle = { index: 1, count: 3, width: 390 };
const first = { index: 0, count: 3, width: 390 };
const last = { index: 2, count: 3, width: 390 };

describe('swipe between view tabs (spec 0029, REQ-003)', () => {
  it('AC-009: a swipe to the left over a fifth of the width goes to the next tab', () => {
    expect(tabSwipeStep(-80, 0, middle)).toBe(1);
    expect(tabSwipeStep(80, 0, middle)).toBe(-1);
  });

  it('AC-009: a short fast flick is enough, against its own move it is not', () => {
    expect(tabSwipeStep(-20, -0.6, middle)).toBe(1);
    expect(tabSwipeStep(20, 0.6, middle)).toBe(-1);
    expect(tabSwipeStep(-60, 0.6, middle)).toBe(0);
  });

  it('AC-012: a short slow release stays on the tab', () => {
    expect(tabSwipeStep(-60, -0.1, middle)).toBe(0);
    expect(tabSwipeStep(0, 0, middle)).toBe(0);
  });

  it('AC-009: the threshold is a fifth of the width, at least 48 pt', () => {
    expect(tabSwipeStep(-77, 0, middle)).toBe(0);
    expect(tabSwipeStep(-78, 0, middle)).toBe(1);
    expect(tabSwipeStep(-47, 0, { ...middle, width: 200 })).toBe(0);
    expect(tabSwipeStep(-48, 0, { ...middle, width: 200 })).toBe(1);
  });

  it('AC-011: no tab before the first or after the last', () => {
    expect(tabSwipeStep(200, 1, first)).toBe(0);
    expect(tabSwipeStep(-200, -1, last)).toBe(0);
    expect(tabSwipeStep(-200, -1, first)).toBe(1);
  });

  it('AC-009: the content follows the finger 1:1 towards a neighbour', () => {
    expect(tabSwipeOffset(-120, middle)).toBe(-120);
    expect(tabSwipeOffset(120, middle)).toBe(120);
    expect(tabSwipeOffset(-120, first)).toBe(-120);
  });

  it('AC-011: at the first and last tab it gives a quarter, at most 64 pt', () => {
    expect(tabSwipeOffset(100, first)).toBe(25);
    expect(tabSwipeOffset(-100, last)).toBe(-25);
    expect(tabSwipeOffset(1000, first)).toBe(TAB_SWIPE_RUBBER_MAX);
    expect(TAB_SWIPE_RUBBER_MAX).toBe(64);
  });

  it('AC-012: only a clearly sideways move away from the screen edges is taken', () => {
    // The start is where the finger is now minus the way so far (moveX - dx).
    expect(claimsTabSwipe({ dx: 14, dy: 3, moveX: 214 }, 390)).toBe(true);
    expect(claimsTabSwipe({ dx: 14, dy: 10, moveX: 214 }, 390)).toBe(false);
    expect(claimsTabSwipe({ dx: 5, dy: 0, moveX: 205 }, 390)).toBe(false);
    expect(TAB_SWIPE_EDGE).toBe(20);
    expect(claimsTabSwipe({ dx: 30, dy: 0, moveX: 49 }, 390)).toBe(false);
    expect(claimsTabSwipe({ dx: -30, dy: 0, moveX: 341 }, 390)).toBe(false);
    expect(claimsTabSwipe({ dx: -30, dy: 0, moveX: 340 }, 390)).toBe(true);
  });

  it('AC-023 (0030): the start comes from the move, not from x0, which PanResponder sets only on grant', () => {
    // Before the grant PanResponder reports x0 = 0; a swipe from the middle must still be taken.
    const beforeGrant = { dx: -25, dy: 0, moveX: 275, x0: 0 };
    expect(claimsTabSwipe(beforeGrant, 390)).toBe(true);
  });

  it('neighbourTab picks the tab a step away and nothing past the ends', () => {
    const options = [{ value: 'a' }, { value: 'b' }, { value: 'c' }] as const;
    expect(neighbourTab(options, 'a', 1)).toBe('b');
    expect(neighbourTab(options, 'c', -1)).toBe('b');
    expect(neighbourTab(options, 'c', 1)).toBeUndefined();
    expect(neighbourTab(options, 'a', -1)).toBeUndefined();
    expect(neighbourTab(options, 'x', 1)).toBeUndefined();
  });

  it('AC-009: a step reports the neighbouring tab like a tap on it', () => {
    const chosen: string[] = [];
    const options = [{ value: 'anstehend' }, { value: 'alle' }, { value: 'verlauf' }];
    const swipe = tabSwipe(options, 'anstehend', (next) => chosen.push(next));
    expect(swipe).toMatchObject({ index: 0, count: 3 });
    swipe.onStep(1);
    swipe.onStep(-1);
    expect(chosen).toEqual(['alle']);
  });
});

describe('the tab swipe reaches iOS (spec 0030, REQ-007)', () => {
  it('AC-023, AC-024: the scroll area of a page with a tab swipe pans only vertically on the web', () => {
    expect(tabSwipeTouchAction(true, 'web')).toEqual({ touchAction: 'pan-y' });
  });

  it('AC-025: without a tab swipe, or natively, nothing changes', () => {
    expect(tabSwipeTouchAction(false, 'web')).toBeNull();
    expect(tabSwipeTouchAction(true, 'ios')).toBeNull();
  });
});
