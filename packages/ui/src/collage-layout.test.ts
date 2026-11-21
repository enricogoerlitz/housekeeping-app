import { describe, expect, it } from 'vitest';

import { COLLAGE_MAX_PHOTOS, collageInsets, collageLayout } from './collage-layout';

describe('collageLayout (spec 0009, E14)', () => {
  it('AC-005: no photo gives no tile, so the placeholder with the stack symbol shows', () => {
    expect(collageLayout(0)).toEqual([]);
  });

  it('AC-005: one photo (e.g. the collection’s own) fills the whole frame', () => {
    expect(collageLayout(1)).toEqual([{ index: 0, x: 0, y: 0, width: 1, height: 1 }]);
  });

  it('AC-004: two photos stand side by side, in their order', () => {
    expect(collageLayout(2)).toEqual([
      { index: 0, x: 0, y: 0, width: 0.5, height: 1 },
      { index: 1, x: 0.5, y: 0, width: 0.5, height: 1 },
    ]);
  });

  it('three photos fill the 2 × 2 grid: the first takes the left column, the others stack right', () => {
    expect(collageLayout(3)).toEqual([
      { index: 0, x: 0, y: 0, width: 0.5, height: 1 },
      { index: 1, x: 0.5, y: 0, width: 0.5, height: 0.5 },
      { index: 2, x: 0.5, y: 0.5, width: 0.5, height: 0.5 },
    ]);
  });

  it('four photos fill the 2 × 2 grid row by row', () => {
    expect(collageLayout(4)).toEqual([
      { index: 0, x: 0, y: 0, width: 0.5, height: 0.5 },
      { index: 1, x: 0.5, y: 0, width: 0.5, height: 0.5 },
      { index: 2, x: 0, y: 0.5, width: 0.5, height: 0.5 },
      { index: 3, x: 0.5, y: 0.5, width: 0.5, height: 0.5 },
    ]);
  });

  it('shows at most four photos: the fifth and later are left out', () => {
    expect(COLLAGE_MAX_PHOTOS).toBe(4);
    expect(collageLayout(5)).toEqual(collageLayout(4));
    expect(collageLayout(12)).toHaveLength(4);
  });

  it('covers the frame without overlap for every count', () => {
    for (let count = 1; count <= 5; count += 1) {
      const area = collageLayout(count).reduce((sum, tile) => sum + tile.width * tile.height, 0);
      expect(area).toBe(1);
    }
  });

  it('treats a broken count as no photo', () => {
    expect(collageLayout(-1)).toEqual([]);
    expect(collageLayout(Number.NaN)).toEqual([]);
    expect(collageLayout(2.7)).toEqual(collageLayout(2));
  });
});

describe('collageInsets', () => {
  it('puts half the gap on inner edges only, so outer edges stay flush with the frame', () => {
    const [left, right] = collageLayout(2);
    expect(collageInsets(left!, 2)).toEqual({ left: 0, right: 1, top: 0, bottom: 0 });
    expect(collageInsets(right!, 2)).toEqual({ left: 1, right: 0, top: 0, bottom: 0 });
  });

  it('separates the stacked tiles of three photos', () => {
    const [, top, bottom] = collageLayout(3);
    expect(collageInsets(top!, 2)).toEqual({ left: 1, right: 0, top: 0, bottom: 1 });
    expect(collageInsets(bottom!, 2)).toEqual({ left: 1, right: 0, top: 1, bottom: 0 });
  });

  it('gives a single photo no inset', () => {
    expect(collageInsets(collageLayout(1)[0]!, 2)).toEqual({
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
    });
  });
});
