import { visitsOf } from './meal-plan';
import { fuzzyIncludes, normalizeText } from './text';
import type { Activity, Id, ISODate, MealPlanEntry } from './types';

/**
 * An existing activity with the same normalised name ("bouldern" → "Bouldern"). Same rule as the
 * unique `name_key` in the database, which the client fills with normalizeText.
 */
export function findDuplicateActivity(name: string, activities: Activity[]): Activity | undefined {
  const key = normalizeText(name);
  if (key === '') return undefined;
  return activities.find((activity) => normalizeText(activity.name) === key);
}

/**
 * The search of "Aktivitäten" and of "Einplanen" (spec 0031, REQ-021): name, description, place
 * and address. An empty search matches every activity.
 */
export function activityMatches(query: string, activity: Activity): boolean {
  if (!query.trim()) return true;
  return [activity.name, activity.description, activity.placeName, activity.address].some(
    (field) => field !== undefined && fuzzyIncludes(query, field),
  );
}

export type ActivitySort = 'name' | 'rating' | 'recent';

/** The sort menu, with the same words as for restaurants (spec 0031, REQ-021). */
export const ACTIVITY_SORTS: readonly { value: ActivitySort; label: string }[] = [
  { value: 'name', label: 'A–Z' },
  { value: 'rating', label: 'Bewertung' },
  { value: 'recent', label: 'Zuletzt besucht' },
];

export interface ActivitySortContext {
  me: Id;
  /** The meal plan; what was done is an activity entry up to today (visitsOf). */
  entries: MealPlanEntry[];
  today: ISODate;
}

/**
 * "Bewertung": the own rating, best first, unrated last; "Zuletzt besucht": the last time first,
 * never done last (AC-053). Ties and "A–Z" go by name.
 */
export function sortActivities(
  activities: readonly Activity[],
  sort: ActivitySort,
  context: ActivitySortContext,
): Activity[] {
  const daysSince = new Map(
    sort === 'recent'
      ? activities.map((activity) => [
          activity.id,
          visitsOf('activity', activity.id, context.entries, context.today).daysSince ??
            Number.POSITIVE_INFINITY,
        ])
      : [],
  );
  const compare = (a: Activity, b: Activity): number => {
    if (sort === 'rating') return (b.ratings[context.me] ?? 0) - (a.ratings[context.me] ?? 0);
    if (sort === 'recent') {
      const daysA = daysSince.get(a.id) ?? Number.POSITIVE_INFINITY;
      const daysB = daysSince.get(b.id) ?? Number.POSITIVE_INFINITY;
      return daysA === daysB ? 0 : daysA - daysB;
    }
    return 0;
  };
  return [...activities].sort((a, b) => compare(a, b) || a.name.localeCompare(b.name, 'de'));
}
