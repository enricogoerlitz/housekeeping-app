import { normalizeText } from './text';
import type { Area, Article, Id } from './types';

// Rules of "Märkte & Bereiche" (spec 0007, REQ-009, REQ-010) without a screen.

/** Limit of the database (`areas_name_valid`). */
export const MAX_AREA_NAME_LENGTH = 80;

export type AreaNameProblem =
  | { kind: 'missing'; message: string }
  | { kind: 'tooLong'; message: string }
  /** Same name after normalising (case, umlauts, spaces) as another area of the household. */
  | { kind: 'taken'; existing: Area; message: string };

/**
 * Checks the name of a new area (no id) or of a renamed one (its id) against the household's
 * areas (AC-052): "Name fehlt", "Gibt es schon: Getränke"; at most 80 characters.
 * Undefined = fine.
 */
export function validateAreaName(
  name: string,
  areas: readonly Area[],
  ownId?: Id,
): AreaNameProblem | undefined {
  const trimmed = name.replace(/\s+/g, ' ').trim();
  if (trimmed === '') return { kind: 'missing', message: 'Name fehlt' };
  if (Array.from(trimmed).length > MAX_AREA_NAME_LENGTH) {
    return { kind: 'tooLong', message: 'Höchstens 80 Zeichen' };
  }
  const key = normalizeText(trimmed);
  const existing = areas.find((area) => area.id !== ownId && normalizeText(area.name) === key);
  return existing
    ? { kind: 'taken', existing, message: `Gibt es schon: ${existing.name}` }
    : undefined;
}

/**
 * Moves one entry to a new index (0-based, clamped to the ends) and returns the new order; used
 * for dragging and for the arrows "nach oben" / "nach unten" (AC-046, AC-053). An entry that is
 * not in the order leaves it unchanged.
 */
export function moveInOrder<T>(order: readonly T[], entry: T, toIndex: number): T[] {
  const from = order.indexOf(entry);
  if (from < 0) return [...order];
  const rest = order.filter((_, index) => index !== from);
  const to = Math.min(Math.max(0, toIndex), rest.length);
  return [...rest.slice(0, to), entry, ...rest.slice(to)];
}

/** What the screen reader says after a move: "Getränke, Position 1 von 14" (index 0-based). */
export function orderAnnouncement(name: string, index: number, total: number): string {
  return `${name}, Position ${index + 1} von ${total}`;
}

function bySort(a: Area, b: Area): number {
  return a.sort - b.sort || a.name.localeCompare(b.name, 'de');
}

/**
 * The new `sort` of each area whose place in the order without store changes (AC-053): the
 * ordered ids first, the remaining areas after them in their current order; unknown ids are
 * ignored. Only changed areas are returned, so one move patches few rows.
 */
export function areaSortPatches(
  areas: readonly Area[],
  orderedIds: readonly Id[],
): { id: Id; sort: number }[] {
  const byId = new Map(areas.map((area) => [area.id, area]));
  const ordered = orderedIds.flatMap((id) => {
    const area = byId.get(id);
    return area ? [area] : [];
  });
  const placed = new Set(ordered);
  const all = [...ordered, ...[...areas].sort(bySort).filter((area) => !placed.has(area))];
  return all.flatMap((area, sort) => (area.sort === sort ? [] : [{ id: area.id, sort }]));
}

/** The `sort` of a new area: after all others in the order without store (AC-052). */
export function nextAreaSort(areas: readonly Area[]): number {
  return areas.reduce((next, area) => Math.max(next, area.sort + 1), 0);
}

/**
 * The number of articles per area ("Getränke · 12 Artikel") and of those without area ("Ohne
 * Bereich · n Artikel"); an article whose area is not among the areas counts as without area,
 * like on the list.
 */
export function articleCountsByArea(
  articles: readonly Article[],
  areas: readonly Area[],
): { byArea: Map<Id, number>; withoutArea: number } {
  const byArea = new Map(areas.map((area) => [area.id, 0]));
  let withoutArea = 0;
  for (const article of articles) {
    const count = article.areaId === undefined ? undefined : byArea.get(article.areaId);
    if (count === undefined || article.areaId === undefined) withoutArea++;
    else byArea.set(article.areaId, count + 1);
  }
  return { byArea, withoutArea };
}
