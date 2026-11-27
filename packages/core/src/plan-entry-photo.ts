import type { Activity, Id, MealPlanEntry, Recipe, Restaurant } from './types';

// The photo at the top of a plan entry's window (spec 0047, REQ-004): only where there is one,
// never a placeholder. Text entries and leftovers have none.

export type PlanEntryPhoto =
  /** A recipe's own or sample photo, or a collection's own photo or collage of its recipes. */
  | { kind: 'recipe'; recipe: Recipe }
  /** The own photo of a restaurant or an activity. */
  | { kind: 'place'; photoPath: string; name: string };

export function planEntryPhoto(
  entry: MealPlanEntry,
  lookups: {
    recipesById: Record<Id, Recipe>;
    restaurantsById: Record<Id, Restaurant>;
    activitiesById: Record<Id, Activity>;
  },
): PlanEntryPhoto | undefined {
  if (entry.kind === 'recipe' && entry.recipeId) {
    const recipe = lookups.recipesById[entry.recipeId];
    if (!recipe) return undefined;
    // A collection without a photo of its own may still show its recipes' collage.
    const photo = recipe.photoPath !== undefined || recipe.photo !== undefined;
    return photo || recipe.kind === 'collection' ? { kind: 'recipe', recipe } : undefined;
  }
  const place =
    entry.kind === 'restaurant' && entry.restaurantId
      ? lookups.restaurantsById[entry.restaurantId]
      : entry.kind === 'activity' && entry.activityId
        ? lookups.activitiesById[entry.activityId]
        : undefined;
  return place?.photoPath
    ? { kind: 'place', photoPath: place.photoPath, name: place.name }
    : undefined;
}
