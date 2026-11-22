import type { Id, ISODate, MealPlanEntry } from './types';

// What deleting a restaurant or an activity does to the meal plan (spec 0024, REQ-010). The
// server's delete_restaurant / delete_activity apply the same rules in one transaction; the device
// uses this to show the deletion at once.

export type PlaceKind = 'restaurant' | 'activity';

export interface PlaceDeletionEffect {
  /** Entries up to and including today, now free text. */
  converted: MealPlanEntry[];
  /** Entries on a later day or without a day (vorgemerkt). */
  removedIds: Id[];
}

/**
 * Entries of the restaurant or activity up to and including `today` (today counts as history)
 * become free text with the name and the Zusatz in parentheses ("Eislaufen (Halle Nord)"), without
 * the reference, the Zusatz and the time (free text has none); eaters, guests and the reminder
 * stay. Entries on a later day and those without a day go. Other entries are not touched.
 */
export function placeDeletionEffect(
  entries: readonly MealPlanEntry[],
  kind: PlaceKind,
  place: { id: Id; name: string },
  today: ISODate,
): PlaceDeletionEffect {
  const converted: MealPlanEntry[] = [];
  const removedIds: Id[] = [];
  for (const entry of entries) {
    const target = kind === 'restaurant' ? entry.restaurantId : entry.activityId;
    if (target !== place.id) continue;
    if (entry.date === null || entry.date > today) {
      removedIds.push(entry.id);
      continue;
    }
    const text = entry.note ? `${place.name} (${entry.note})` : place.name;
    const next: MealPlanEntry = {
      ...entry,
      kind: 'text',
      text,
      note: undefined,
      reservedAt: undefined,
    };
    if (kind === 'restaurant') next.restaurantId = undefined;
    else next.activityId = undefined;
    converted.push(next);
  }
  return { converted, removedIds };
}
