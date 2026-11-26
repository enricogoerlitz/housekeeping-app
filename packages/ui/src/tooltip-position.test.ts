import { describe, expect, it } from 'vitest';

import { isTruncated, tooltipPosition } from './tooltip-position';

const viewport = { width: 1440, height: 900 };

describe('tooltipPosition (spec 0035, REQ-005)', () => {
  it('AC-011: stands above the line, at its left edge', () => {
    const anchor = { x: 600, y: 400, width: 140, height: 22 };
    expect(tooltipPosition(anchor, { width: 220, height: 30 }, viewport)).toEqual({
      left: 600,
      top: 364,
    });
  });

  it('goes below the line when there is no room above', () => {
    const anchor = { x: 600, y: 20, width: 140, height: 22 };
    expect(tooltipPosition(anchor, { width: 220, height: 30 }, viewport).top).toBe(48);
  });

  it('stays inside the window at the right and left edge', () => {
    const right = { x: 1380, y: 400, width: 50, height: 22 };
    expect(tooltipPosition(right, { width: 220, height: 30 }, viewport).left).toBe(1212);
    const left = { x: -20, y: 400, width: 50, height: 22 };
    expect(tooltipPosition(left, { width: 220, height: 30 }, viewport).left).toBe(8);
  });
});

describe('isTruncated (spec 0035, AC-011, AC-012)', () => {
  it('AC-011: a cut off line or a clamped second line is truncated', () => {
    expect(
      isTruncated({ scrollWidth: 180, clientWidth: 120, scrollHeight: 16, clientHeight: 16 }),
    ).toBe(true);
    expect(
      isTruncated({ scrollWidth: 120, clientWidth: 120, scrollHeight: 48, clientHeight: 32 }),
    ).toBe(true);
  });

  it('AC-012: text that fits is not truncated, also with a pixel of rounding', () => {
    expect(
      isTruncated({ scrollWidth: 121, clientWidth: 120, scrollHeight: 16, clientHeight: 16 }),
    ).toBe(false);
  });
});
