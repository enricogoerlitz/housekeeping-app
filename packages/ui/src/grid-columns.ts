// Columns of a tile grid (spec 0008, REQ-004). Pure geometry, so it is tested in Node.

export interface GridColumnsOptions {
  /** Narrowest a column may get, e.g. 260 for recipe tiles on the desktop. */
  minColumnWidth: number;
  /** Space between two columns; default 0. */
  gap?: number;
  /** Fewest columns, also when they get narrower than `minColumnWidth`; default 1. */
  minColumns?: number;
}

/** As many columns of at least `minColumnWidth` as fit into `width`, never fewer than the minimum. */
export function columnsFor(width: number, options: GridColumnsOptions): number {
  const gap = options.gap ?? 0;
  const fit = Math.floor((width + gap) / (options.minColumnWidth + gap));
  return Math.max(1, options.minColumns ?? 1, fit);
}

export interface GridCell<T> {
  item: T;
  /** Position in the original data. */
  index: number;
}

export type GridRow<T> =
  { kind: 'header'; item: T; index: number } | { kind: 'cells'; cells: GridCell<T>[] };

/**
 * The items as rows of `columns` cells, so a list draws (and virtualises) whole rows. A group
 * heading takes a row of its own; the row before it may stay short.
 */
export function gridRows<T>(
  data: readonly T[],
  columns: number,
  isGroupHeader?: (item: T) => boolean,
): GridRow<T>[] {
  const rows: GridRow<T>[] = [];
  let cells: GridCell<T>[] = [];
  const flush = () => {
    if (cells.length > 0) rows.push({ kind: 'cells', cells });
    cells = [];
  };
  data.forEach((item, index) => {
    if (isGroupHeader?.(item)) {
      flush();
      rows.push({ kind: 'header', item, index });
      return;
    }
    cells.push({ item, index });
    if (cells.length >= columns) flush();
  });
  flush();
  return rows;
}
