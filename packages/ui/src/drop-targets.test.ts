import { describe, expect, it } from 'vitest';

import { cellRect, gridCellAt, hitTest, type DropTarget } from './drop-targets';

const week: DropTarget[] = [
  { id: 'wed-evening', rect: { x: 0, y: 0, width: 100, height: 40 } },
  { id: 'fri-evening', rect: { x: 100, y: 0, width: 100, height: 40 } },
  { id: 'fri-noon', rect: { x: 100, y: 40, width: 100, height: 40 } },
];

describe('hitTest', () => {
  it('AC-003: a point over no target hits nothing, so the drop is cancelled', () => {
    expect(hitTest({ x: 50, y: -20 }, week)).toBeNull();
    expect(hitTest({ x: 250, y: 10 }, week)).toBeNull();
    expect(hitTest({ x: 10, y: 10 }, [])).toBeNull();
  });

  it('finds the target under the point', () => {
    expect(hitTest({ x: 150, y: 20 }, week)).toBe('fri-evening');
    expect(hitTest({ x: 150, y: 60 }, week)).toBe('fri-noon');
  });

  it('a shared edge belongs to exactly one target (left and top inclusive)', () => {
    expect(hitTest({ x: 100, y: 20 }, week)).toBe('fri-evening');
    expect(hitTest({ x: 150, y: 40 }, week)).toBe('fri-noon');
    expect(hitTest({ x: 200, y: 20 }, week)).toBeNull();
  });

  it('the smallest of nested targets wins, whatever the order', () => {
    const bar: DropTarget = { id: 'bar', rect: { x: 0, y: 0, width: 400, height: 100 } };
    const cell: DropTarget = { id: 'cell', rect: { x: 10, y: 10, width: 50, height: 50 } };
    expect(hitTest({ x: 20, y: 20 }, [bar, cell])).toBe('cell');
    expect(hitTest({ x: 20, y: 20 }, [cell, bar])).toBe('cell');
    expect(hitTest({ x: 300, y: 20 }, [cell, bar])).toBe('bar');
  });

  it('of equally large overlapping targets the later one (drawn on top) wins', () => {
    const a: DropTarget = { id: 'a', rect: { x: 0, y: 0, width: 50, height: 50 } };
    const b: DropTarget = { id: 'b', rect: { x: 25, y: 25, width: 50, height: 50 } };
    expect(hitTest({ x: 30, y: 30 }, [a, b])).toBe('b');
    expect(hitTest({ x: 30, y: 30 }, [b, a])).toBe('a');
  });

  it('ignores targets without area', () => {
    const empty: DropTarget = { id: 'empty', rect: { x: 0, y: 0, width: 0, height: 50 } };
    expect(hitTest({ x: 0, y: 10 }, [empty])).toBeNull();
  });

  it('a month grid counts only where it has a day: a blank cell hits what lies below', () => {
    // November 2026 in a year view: the 1st is a Sunday (cell 6), the 30th is cell 35.
    const year: DropTarget = { id: 'year', rect: { x: 0, y: 0, width: 1000, height: 1000 } };
    const november: DropTarget = {
      id: '2026-11',
      rect: { x: 0, y: 0, width: 70, height: 60 },
      grid: { rows: 6, firstCell: 6, lastCell: 35 },
    };
    expect(hitTest({ x: 65, y: 5 }, [year, november])).toBe('2026-11');
    expect(hitTest({ x: 5, y: 5 }, [year, november])).toBe('year');
    expect(hitTest({ x: 5, y: 5 }, [november])).toBeNull();
  });
});

describe('gridCellAt', () => {
  // Six weeks of seven 10 × 10 cells, starting at (100, 200).
  const rect = { x: 100, y: 200, width: 70, height: 60 };

  it('returns the offset of the cell from the first cell of the grid', () => {
    expect(gridCellAt({ x: 100, y: 200 }, { rect, rows: 6 })).toBe(0);
    expect(gridCellAt({ x: 165, y: 205 }, { rect, rows: 6 })).toBe(6);
    expect(gridCellAt({ x: 105, y: 215 }, { rect, rows: 6 })).toBe(7);
    expect(gridCellAt({ x: 132, y: 248 }, { rect, rows: 6 })).toBe(4 * 7 + 3);
    expect(gridCellAt({ x: 169.9, y: 259.9 }, { rect, rows: 6 })).toBe(41);
  });

  it('is null outside the grid rectangle', () => {
    expect(gridCellAt({ x: 99, y: 210 }, { rect, rows: 6 })).toBeNull();
    expect(gridCellAt({ x: 170, y: 210 }, { rect, rows: 6 })).toBeNull();
    expect(gridCellAt({ x: 110, y: 260 }, { rect, rows: 6 })).toBeNull();
    expect(gridCellAt({ x: 110, y: 199 }, { rect, rows: 6 })).toBeNull();
  });

  it('is null on cells before the first or after the last day', () => {
    const grid = { rect, rows: 6, firstCell: 6, lastCell: 35 };
    expect(gridCellAt({ x: 105, y: 205 }, grid)).toBeNull();
    expect(gridCellAt({ x: 165, y: 205 }, grid)).toBe(6);
    expect(gridCellAt({ x: 105, y: 255 }, grid)).toBe(35);
    expect(gridCellAt({ x: 115, y: 255 }, grid)).toBeNull();
  });

  it('is null for a grid without rows or area', () => {
    expect(gridCellAt({ x: 110, y: 210 }, { rect, rows: 0 })).toBeNull();
    expect(
      gridCellAt({ x: 100, y: 200 }, { rect: { x: 100, y: 200, width: 0, height: 0 }, rows: 6 }),
    ).toBeNull();
  });
});

describe('cellRect', () => {
  const grid = { rect: { x: 10, y: 20, width: 70, height: 60 }, rows: 6 };

  it('is the rectangle of one day of a month grid, for the single highlight', () => {
    expect(cellRect(grid, 0)).toEqual({ x: 10, y: 20, width: 10, height: 10 });
    expect(cellRect(grid, 9)).toEqual({ x: 30, y: 30, width: 10, height: 10 });
    expect(cellRect(grid, 41)).toEqual({ x: 70, y: 70, width: 10, height: 10 });
  });

  it('lies under the point that gridCellAt mapped to the same cell', () => {
    const point = { x: 47, y: 55 };
    const cell = gridCellAt(point, grid);
    expect(cell).toBe(3 * 7 + 3);
    expect(hitTest(point, [{ id: 'day', rect: cellRect(grid, cell ?? -1) }])).toBe('day');
  });
});
