import { normalizeText } from './text';
import type { Activity } from './types';

/**
 * An existing activity with the same normalised name ("bouldern" → "Bouldern"). Same rule as the
 * unique `name_key` in the database, which the client fills with normalizeText.
 */
export function findDuplicateActivity(name: string, activities: Activity[]): Activity | undefined {
  const key = normalizeText(name);
  if (key === '') return undefined;
  return activities.find((activity) => normalizeText(activity.name) === key);
}
