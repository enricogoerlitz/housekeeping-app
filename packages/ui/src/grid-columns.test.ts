import { describe, expect, it } from 'vitest';

import { columnsFor, gridRows } from './grid-columns';

// Content width next to the sidebar: window − sidebar (256) − 2 × page margin (36).
const DESKTOP_CONTENT = 1440 - 256 - 2 * 36;
// Phone: window − 2 × page margin (16 … 20, per theme).
const PHONE_CONTENTS = [390 - 2 * 16, 390 - 2 * 20];
const TILES = { minColumnWidth: 260, gap: 12, minColumns: 2 };

describe('columnsFor (spec 0008, REQ-004)', () => {
  it('AC-014: desktop width with sidebar holds four tiles, each at least 260 px wide', () => {
    const columns = columnsFor(DESKTOP_CONTENT, TILES);
    expect(columns).toBe(4);
    const tile = (DESKTOP_CONTENT - TILES.gap * (columns - 1)) / columns;
    expect(tile).toBeGreaterThanOrEqual(260);
  });

  it('AC-014: phone width holds two tiles', () => {
    for (const width of PHONE_CONTENTS) expect(columnsFor(width, TILES)).toBe(2);
  });

  it('never goes below one column or the minimum, also before the width is measured', () => {
    expect(columnsFor(0, TILES)).toBe(2);
    expect(columnsFor(0, { minColumnWidth: 260 })).toBe(1);
    expect(columnsFor(200, { minColumnWidth: 260 })).toBe(1);
  });

  it('takes as many columns as fit, counting the gaps between them', () => {
    // 3 × 260 + 2 × 12 = 804: three fit exactly, one pixel less only two.
    expect(columnsFor(804, { minColumnWidth: 260, gap: 12 })).toBe(3);
    expect(columnsFor(803, { minColumnWidth: 260, gap: 12 })).toBe(2);
    // Without a gap: 520 holds two of 260.
    expect(columnsFor(520, { minColumnWidth: 260 })).toBe(2);
  });

  it('stays at four on the widest page (content is capped at 1320 px)', () => {
    expect(columnsFor(1320, TILES)).toBe(4);
  });
});

describe('gridRows', () => {
  const letters = ['a', 'b', 'c', 'd', 'e'];

  it('groups the items into rows of the column count, the last one may be shorter', () => {
    expect(gridRows(letters, 2)).toEqual([
      {
        kind: 'cells',
        cells: [
          { item: 'a', index: 0 },
          { item: 'b', index: 1 },
        ],
      },
      {
        kind: 'cells',
        cells: [
          { item: 'c', index: 2 },
          { item: 'd', index: 3 },
        ],
      },
      { kind: 'cells', cells: [{ item: 'e', index: 4 }] },
    ]);
  });

  it('puts a group heading on a row of its own and starts a new row after it', () => {
    const items = ['H1', 'a', 'b', 'c', 'H2', 'd'];
    const rows = gridRows(items, 2, (item) => item.startsWith('H'));
    expect(
      rows.map((row) => (row.kind === 'header' ? row.item : row.cells.map((c) => c.item))),
    ).toEqual(['H1', ['a', 'b'], ['c'], 'H2', ['d']]);
    expect(rows[3]).toEqual({ kind: 'header', item: 'H2', index: 4 });
  });

  it('returns no rows for no items and one row per item with one column', () => {
    expect(gridRows([], 3)).toEqual([]);
    expect(gridRows(['a', 'b'], 1)).toHaveLength(2);
  });
});
