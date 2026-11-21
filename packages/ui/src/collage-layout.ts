// Tiles of a photo collage (spec 0009, E14). Pure geometry, so it is tested in Node.

/** A collection shows the photos of at most this many of its recipes. */
export const COLLAGE_MAX_PHOTOS = 4;

/** One photo's place in the frame, in fractions of its width and height (0 … 1). */
export interface CollageTile {
  /** Position of the photo in the list handed in. */
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

const HALF = 0.5;

/**
 * Where each photo goes: none → no tile (the caller shows the placeholder), 1 → the whole frame,
 * 2 → side by side, 3 → the first in the left column and two stacked on the right, 4 → 2 × 2.
 * Photos after the fourth are left out; the order is kept.
 */
export function collageLayout(count: number): CollageTile[] {
  const shown = Number.isFinite(count)
    ? Math.min(COLLAGE_MAX_PHOTOS, Math.max(0, Math.floor(count)))
    : 0;
  switch (shown) {
    case 0:
      return [];
    case 1:
      return [{ index: 0, x: 0, y: 0, width: 1, height: 1 }];
    case 2:
      return [
        { index: 0, x: 0, y: 0, width: HALF, height: 1 },
        { index: 1, x: HALF, y: 0, width: HALF, height: 1 },
      ];
    case 3:
      return [
        { index: 0, x: 0, y: 0, width: HALF, height: 1 },
        { index: 1, x: HALF, y: 0, width: HALF, height: HALF },
        { index: 2, x: HALF, y: HALF, width: HALF, height: HALF },
      ];
    default:
      return [0, 1, 2, 3].map((index) => ({
        index,
        x: (index % 2) * HALF,
        y: Math.floor(index / 2) * HALF,
        width: HALF,
        height: HALF,
      }));
  }
}

export interface CollageInsets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Half the gap on each edge a tile shares with another; edges on the frame stay flush. */
export function collageInsets(tile: CollageTile, gap: number): CollageInsets {
  const half = gap / 2;
  return {
    left: tile.x > 0 ? half : 0,
    right: tile.x + tile.width < 1 ? half : 0,
    top: tile.y > 0 ? half : 0,
    bottom: tile.y + tile.height < 1 ? half : 0,
  };
}
