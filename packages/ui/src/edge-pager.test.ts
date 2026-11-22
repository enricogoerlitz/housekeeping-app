import { describe, expect, it } from 'vitest';

import {
  AUTO_SCROLL_MAX_SPEED,
  EDGE_PAGER_IDLE,
  autoScrollSpeed,
  edgePagerStep,
  edgeZoneAt,
  type EdgePagerState,
} from './edge-pager';

const viewport = { width: 400, height: 800 };

describe('autoScrollSpeed', () => {
  it('is zero outside the 64 px bands at the top and bottom', () => {
    expect(autoScrollSpeed(400, viewport)).toBe(0);
    expect(autoScrollSpeed(64, viewport)).toBe(0);
    expect(autoScrollSpeed(800 - 64, viewport)).toBe(0);
  });

  it('scrolls up in the top band and down in the bottom band', () => {
    expect(autoScrollSpeed(40, viewport)).toBeLessThan(0);
    expect(autoScrollSpeed(760, viewport)).toBeGreaterThan(0);
  });

  it('is faster nearer the edge, at most the full speed', () => {
    expect(Math.abs(autoScrollSpeed(10, viewport))).toBeGreaterThan(
      Math.abs(autoScrollSpeed(50, viewport)),
    );
    expect(autoScrollSpeed(790, viewport)).toBeGreaterThan(autoScrollSpeed(750, viewport));
    expect(autoScrollSpeed(0, viewport)).toBe(-AUTO_SCROLL_MAX_SPEED);
    expect(autoScrollSpeed(-30, viewport)).toBe(-AUTO_SCROLL_MAX_SPEED);
    expect(autoScrollSpeed(800, viewport)).toBe(AUTO_SCROLL_MAX_SPEED);
    expect(autoScrollSpeed(900, viewport)).toBe(AUTO_SCROLL_MAX_SPEED);
    expect(autoScrollSpeed(32, viewport)).toBeCloseTo(-AUTO_SCROLL_MAX_SPEED / 2);
  });
});

describe('edgeZoneAt', () => {
  it('the zones start 20 px from the screen edge, clear of the back gesture', () => {
    expect(edgeZoneAt(19, viewport)).toBeNull();
    expect(edgeZoneAt(0, viewport)).toBeNull();
    expect(edgeZoneAt(20, viewport)).toBe('previous');
    expect(edgeZoneAt(67, viewport)).toBe('previous');
    expect(edgeZoneAt(68, viewport)).toBeNull();
    expect(edgeZoneAt(200, viewport)).toBeNull();
    expect(edgeZoneAt(332, viewport)).toBeNull();
    expect(edgeZoneAt(333, viewport)).toBe('next');
    expect(edgeZoneAt(380, viewport)).toBe('next');
    expect(edgeZoneAt(381, viewport)).toBeNull();
  });
});

describe('edgePagerStep', () => {
  /** Feeds (x, time) pairs and returns the pages turned per step. */
  function pages(samples: [number, number][]): number[] {
    let state: EdgePagerState = EDGE_PAGER_IDLE;
    return samples.map(([x, time]) => {
      const step = edgePagerStep(state, { x, time, viewport });
      state = step.state;
      return step.page;
    });
  }

  it('AC-009: holding at the right edge pages forward after 600 ms, then every 900 ms', () => {
    expect(
      pages([
        [360, 0],
        [360, 599],
        [360, 600],
        [360, 1000],
        [360, 1499],
        [360, 1500],
        [360, 2400],
      ]),
    ).toEqual([0, 0, 1, 0, 0, 1, 1]);
  });

  it('holding at the left edge pages back', () => {
    expect(
      pages([
        [40, 0],
        [40, 600],
      ]),
    ).toEqual([0, -1]);
  });

  it('leaving the zone resets the dwell time', () => {
    expect(
      pages([
        [360, 0],
        [360, 500],
        [200, 550],
        [360, 600],
        [360, 1100],
        [360, 1200],
      ]),
    ).toEqual([0, 0, 0, 0, 0, 1]);
  });

  it('moving from one zone straight into the other starts over', () => {
    expect(
      pages([
        [360, 0],
        [360, 600],
        [40, 700],
        [40, 1299],
        [40, 1300],
      ]),
    ).toEqual([0, 1, 0, 0, -1]);
  });

  it('never pages at the outermost 20 px', () => {
    expect(
      pages([
        [5, 0],
        [5, 5000],
        [395, 6000],
        [395, 9000],
      ]),
    ).toEqual([0, 0, 0, 0]);
  });
});
