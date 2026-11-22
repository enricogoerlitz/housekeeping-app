import { describe, expect, it } from 'vitest';

import {
  AUTO_SCROLL_MAX_SPEED,
  EDGE_PAGER_IDLE,
  autoScrollSpeed,
  edgePagerStep,
  edgeZoneAt,
  type EdgePagerState,
  type Span,
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
  it('the zones are 32 px wide and start 20 px from the screen edge, clear of the back gesture', () => {
    expect(edgeZoneAt(19, viewport)).toBeNull();
    expect(edgeZoneAt(0, viewport)).toBeNull();
    expect(edgeZoneAt(20, viewport)).toBe('previous');
    expect(edgeZoneAt(51, viewport)).toBe('previous');
    expect(edgeZoneAt(52, viewport)).toBeNull();
    expect(edgeZoneAt(200, viewport)).toBeNull();
    expect(edgeZoneAt(348, viewport)).toBeNull();
    expect(edgeZoneAt(349, viewport)).toBe('next');
    expect(edgeZoneAt(380, viewport)).toBe('next');
    expect(edgeZoneAt(381, viewport)).toBeNull();
  });

  it('AC-009: over a day of a phone grid the zone ends at the middle of that day', () => {
    // A 390 px phone: the month grid runs from 20 to 370, a day is 50 px wide.
    const phone = { width: 390, height: 844 };
    const monday = { x: 20, width: 50 };
    const sunday = { x: 320, width: 50 };
    expect(edgeZoneAt(30, phone, monday)).toBe('previous');
    expect(edgeZoneAt(44, phone, monday)).toBe('previous');
    expect(edgeZoneAt(45, phone, monday)).toBeNull();
    expect(edgeZoneAt(50, phone, monday)).toBeNull();
    expect(edgeZoneAt(345, phone, sunday)).toBeNull();
    expect(edgeZoneAt(346, phone, sunday)).toBe('next');
    expect(edgeZoneAt(360, phone, sunday)).toBe('next');
  });

  it('a wide target (a week row, a desktop day) keeps the whole zone', () => {
    const row = { x: 16, width: 368 };
    expect(edgeZoneAt(51, viewport, row)).toBe('previous');
    expect(edgeZoneAt(349, viewport, row)).toBe('next');
  });

  it('a tiny target (a day of the year view) keeps at least 16 px of the zone', () => {
    const tiny = { x: 16, width: 14 };
    expect(edgeZoneAt(35, viewport, tiny)).toBe('previous');
    expect(edgeZoneAt(36, viewport, tiny)).toBeNull();
  });
});

describe('edgePagerStep', () => {
  /** Feeds (x, time) pairs and returns the pages turned per step. */
  function pages(samples: [number, number][], target: Span | null = null): number[] {
    let state: EdgePagerState = EDGE_PAGER_IDLE;
    return samples.map(([x, time]) => {
      const step = edgePagerStep(state, { x, time, viewport, target });
      state = step.state;
      return step.page;
    });
  }

  it('AC-009: holding at the right edge pages forward after 1 s, then every 1.2 s', () => {
    expect(
      pages([
        [365, 0],
        [365, 999],
        [365, 1000],
        [365, 1500],
        [365, 2199],
        [365, 2200],
        [365, 3400],
      ]),
    ).toEqual([0, 0, 1, 0, 0, 1, 1]);
  });

  it('holding at the left edge pages back', () => {
    expect(
      pages([
        [30, 0],
        [30, 1000],
      ]),
    ).toEqual([0, -1]);
  });

  it('AC-009: resting on the middle of a Monday of the phone month turns no page', () => {
    const monday = { x: 20, width: 50 };
    expect(
      pages(
        [
          [46, 0],
          [46, 5000],
          [30, 5100],
          [30, 6099],
          [30, 6100],
        ],
        monday,
      ),
    ).toEqual([0, 0, 0, 0, -1]);
  });

  it('leaving the zone resets the dwell time', () => {
    expect(
      pages([
        [365, 0],
        [365, 900],
        [200, 950],
        [365, 1000],
        [365, 1999],
        [365, 2000],
      ]),
    ).toEqual([0, 0, 0, 0, 0, 1]);
  });

  it('moving from one zone straight into the other starts over', () => {
    expect(
      pages([
        [365, 0],
        [365, 1000],
        [30, 1100],
        [30, 2099],
        [30, 2100],
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
