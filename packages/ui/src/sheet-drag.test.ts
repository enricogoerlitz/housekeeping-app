import { describe, expect, it } from 'vitest';

import {
  releaseVelocity,
  sheetDragClaim,
  sheetDragOffset,
  sheetDragRelease,
  upwardShadow,
} from './sheet-drag';

const HEIGHT = 600;

describe('sheetDragRelease (spec 0033, REQ-001)', () => {
  it('AC-001: pulled down 40 % of its height and let go, the window closes', () => {
    expect(sheetDragRelease({ offset: 0.4 * HEIGHT, height: HEIGHT, velocity: 0.1 })).toBe(
      'dismiss',
    );
  });

  it('AC-002: pulled down 40 % and back up to the top before letting go, it stays', () => {
    expect(sheetDragRelease({ offset: 0, height: HEIGHT, velocity: -0.3 })).toBe('stay');
    // Released on the way back up, still below the threshold: stays as well.
    expect(sheetDragRelease({ offset: 0.2 * HEIGHT, height: HEIGHT, velocity: -0.8 })).toBe('stay');
  });

  it('AC-005: only 10 % slowly, it stays', () => {
    expect(sheetDragRelease({ offset: 0.1 * HEIGHT, height: HEIGHT, velocity: 0.1 })).toBe('stay');
  });

  it('a quick flick down closes it from a short distance (decision 1: > 0.5 px/ms)', () => {
    expect(sheetDragRelease({ offset: 40, height: HEIGHT, velocity: 0.8 })).toBe('dismiss');
    expect(sheetDragRelease({ offset: 40, height: HEIGHT, velocity: 0.5 })).toBe('stay');
  });

  it('past the threshold but flung back up, it stays', () => {
    expect(sheetDragRelease({ offset: 0.35 * HEIGHT, height: HEIGHT, velocity: -0.9 })).toBe(
      'stay',
    );
  });

  it('a window not measured yet never closes by distance alone', () => {
    expect(sheetDragRelease({ offset: 10, height: 0, velocity: 0 })).toBe('stay');
  });
});

describe('sheetDragOffset (spec 0033, decision 1)', () => {
  it('down it follows the finger 1:1', () => {
    expect(sheetDragOffset(0)).toBe(0);
    expect(sheetDragOffset(120)).toBe(120);
  });

  it('up it rubber-bands: less than the finger and never past its limit', () => {
    const small = sheetDragOffset(-20);
    const large = sheetDragOffset(-400);
    expect(small).toBeLessThan(0);
    expect(small).toBeGreaterThan(-20);
    expect(large).toBeLessThan(small);
    expect(large).toBeGreaterThan(-40);
  });
});

describe('sheetDragClaim (spec 0033, REQ-001)', () => {
  it('the header claims a vertical move once past the slop, either way', () => {
    expect(sheetDragClaim({ from: 'header', dx: 1, dy: 2, scrollTop: 0 })).toBe('undecided');
    expect(sheetDragClaim({ from: 'header', dx: 2, dy: 8, scrollTop: 0 })).toBe('drag');
    expect(sheetDragClaim({ from: 'header', dx: 2, dy: -8, scrollTop: 0 })).toBe('drag');
    expect(sheetDragClaim({ from: 'header', dx: 9, dy: 3, scrollTop: 0 })).toBe('native');
  });

  it('AC-003: content scrolled down keeps the move for itself (it scrolls back up)', () => {
    expect(sheetDragClaim({ from: 'content', dx: 0, dy: 12, scrollTop: 140 })).toBe('native');
  });

  it('AC-003: content at its top hands a move down to the window', () => {
    expect(sheetDragClaim({ from: 'content', dx: 0, dy: 1, scrollTop: 0 })).toBe('drag');
    expect(sheetDragClaim({ from: 'content', dx: 1, dy: 12, scrollTop: 0 })).toBe('drag');
  });

  it('content at its top keeps a move up (scrolling down) and a sideways one', () => {
    expect(sheetDragClaim({ from: 'content', dx: 0, dy: -6, scrollTop: 0 })).toBe('native');
    expect(sheetDragClaim({ from: 'content', dx: 10, dy: 4, scrollTop: 0 })).toBe('native');
  });

  it('content with no movement yet waits', () => {
    expect(sheetDragClaim({ from: 'content', dx: 0, dy: 0, scrollTop: 0 })).toBe('undecided');
  });
});

describe('releaseVelocity', () => {
  it('the speed of the last 100 ms, px/ms, down positive', () => {
    expect(
      releaseVelocity([
        { y: 0, t: 0 },
        { y: 100, t: 200 },
        { y: 160, t: 260 },
        { y: 200, t: 300 },
      ]),
    ).toBeCloseTo(1, 5);
  });

  it('one sample or none: no speed', () => {
    expect(releaseVelocity([])).toBe(0);
    expect(releaseVelocity([{ y: 10, t: 5 }])).toBe(0);
  });

  it('a finger that rested before letting go has no speed', () => {
    expect(
      releaseVelocity([
        { y: 0, t: 0 },
        { y: 200, t: 100 },
        { y: 200, t: 400 },
      ]),
    ).toBe(0);
  });
});

describe('upwardShadow (spec 0033, decision 2)', () => {
  it('turns the raised shadow of a theme to fall upwards', () => {
    expect(upwardShadow('0px 10px 28px rgba(0,0,0,0.18), 0px 2px 6px rgba(0,0,0,0.12)')).toBe(
      '0px -10px 28px rgba(0,0,0,0.18), 0px -2px 6px rgba(0,0,0,0.12)',
    );
  });
});
