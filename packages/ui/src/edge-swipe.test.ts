import { describe, expect, it } from 'vitest';

import {
  EDGE_SWIPE_START,
  nextEdgeSwipe,
  systemSwipeNavigation,
  type EdgeSwipeSignal,
} from './edge-swipe';

const WIDTH = 390;
const run = (signals: EdgeSwipeSignal[]) => signals.reduce(nextEdgeSwipe, EDGE_SWIPE_START);

describe('telling the iOS edge swipe from the app’s own Back (spec 0034, REQ-003)', () => {
  it('AC-007: a swipe from the left edge that iOS takes over, then the page goes back: no animation', () => {
    const state = run([
      { type: 'touchstart', x: 6, width: WIDTH },
      { type: 'touchmove', x: 30 },
      { type: 'touchcancel' },
      { type: 'popstate' },
    ]);
    expect(systemSwipeNavigation(state)).toBe(true);
  });

  it('AC-007: also when iOS lets the page see the whole move and no cancel', () => {
    const state = run([
      { type: 'touchstart', x: 10, width: WIDTH },
      { type: 'touchmove', x: 140 },
      { type: 'touchend' },
      { type: 'popstate' },
    ]);
    expect(systemSwipeNavigation(state)).toBe(true);
  });

  it('the forward swipe from the right edge counts the same', () => {
    const state = run([
      { type: 'touchstart', x: 385, width: WIDTH },
      { type: 'touchmove', x: 300 },
      { type: 'popstate' },
    ]);
    expect(systemSwipeNavigation(state)).toBe(true);
  });

  it('AC-006: a tap on "‹ Essen" close to the edge is the app’s own Back, which slides', () => {
    const state = run([
      { type: 'touchstart', x: 18, width: WIDTH },
      { type: 'touchend' },
      // The router's own history step fires a popstate, too.
      { type: 'popstate' },
    ]);
    expect(systemSwipeNavigation(state)).toBe(false);
  });

  it('a swipe that starts inside the page is never the system’s', () => {
    const state = run([
      { type: 'touchstart', x: 120, width: WIDTH },
      { type: 'touchmove', x: 300 },
      { type: 'popstate' },
    ]);
    expect(systemSwipeNavigation(state)).toBe(false);
  });

  it('an edge swipe the person gave up leads to no page change, and the next touch forgets it', () => {
    let state = run([{ type: 'touchstart', x: 6, width: WIDTH }, { type: 'touchcancel' }]);
    expect(systemSwipeNavigation(state)).toBe(false);
    state = run([
      { type: 'touchstart', x: 6, width: WIDTH },
      { type: 'touchcancel' },
      { type: 'touchstart', x: 200, width: WIDTH },
      { type: 'touchend' },
      { type: 'popstate' },
    ]);
    expect(systemSwipeNavigation(state)).toBe(false);
  });
});
