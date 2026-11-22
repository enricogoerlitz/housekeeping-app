// Drop targets of a drag (spec 0016, plan decision 3): which measured rectangle lies under the
// pointer. Pure geometry in window coordinates, so it is tested in Node; measuring is the job of
// the drag provider. Month and year grids are measured once per month and the day is computed
// here (12 measurements instead of 365).

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A month as weeks × 7 columns, Monday first. Cells count from 0 at the top left. `firstCell`
 * and `lastCell` (inclusive) limit the cells that are days, e.g. a year view that leaves the
 * days of the neighbouring months blank.
 */
export interface GridShape {
  rows: number;
  firstCell?: number;
  lastCell?: number;
}

export interface CellGrid extends GridShape {
  rect: Rect;
}

export interface DropTarget {
  id: string;
  rect: Rect;
  grid?: GridShape;
}

const COLUMNS = 7;

/** Left and top edges belong to the rectangle, right and bottom do not, so neighbours never share a point. */
function contains(rect: Rect, point: Point): boolean {
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    point.x >= rect.x &&
    point.x < rect.x + rect.width &&
    point.y >= rect.y &&
    point.y < rect.y + rect.height
  );
}

/**
 * The cell under the point as an offset from the grid's first cell (the caller adds it to the
 * date of that cell), or null outside the grid or on a cell that is no day.
 */
export function gridCellAt(point: Point, grid: CellGrid): number | null {
  if (grid.rows <= 0 || !contains(grid.rect, point)) return null;
  const column = Math.min(
    COLUMNS - 1,
    Math.floor(((point.x - grid.rect.x) / grid.rect.width) * COLUMNS),
  );
  const row = Math.min(
    grid.rows - 1,
    Math.floor(((point.y - grid.rect.y) / grid.rect.height) * grid.rows),
  );
  const cell = row * COLUMNS + column;
  if (cell < (grid.firstCell ?? 0)) return null;
  if (cell > (grid.lastCell ?? grid.rows * COLUMNS - 1)) return null;
  return cell;
}

/**
 * The id of the target under the point, or null. Of nested targets the smallest wins (a cell
 * inside a bar); of equally large ones the later in the list, which is drawn on top. A grid
 * target counts only where it has a day, so a blank cell falls through to what lies below.
 */
export function hitTest(point: Point, targets: readonly DropTarget[]): string | null {
  let best: { id: string; area: number } | null = null;
  for (const target of targets) {
    if (!contains(target.rect, point)) continue;
    if (target.grid && gridCellAt(point, { ...target.grid, rect: target.rect }) === null) continue;
    const area = target.rect.width * target.rect.height;
    if (best === null || area <= best.area) best = { id: target.id, area };
  }
  return best?.id ?? null;
}
