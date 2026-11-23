import { type Id, type MealPlanEntry, type Recipe } from '@housekeeping/core';

import { entryTitle } from '@/features/meal-plan/labels';

/**
 * The title of a planned entry on the Übersicht, the same on the card and the desktop tile (spec
 * 0020, AC-019): leftovers "Reste von Lasagne" while their recipe is there, otherwise the
 * calendar's name ("Reste von Donnerstag"); a recipe whose recipe is gone keeps its text.
 */
export function plannedTitle(
  entry: MealPlanEntry,
  recipesById: Record<Id, Recipe>,
  entries: MealPlanEntry[],
  restaurantsById: Record<Id, { name: string }>,
  activitiesById: Record<Id, { name: string }>,
): string {
  const recipe = entry.recipeId ? recipesById[entry.recipeId] : undefined;
  const fallback = () => entryTitle(entry, recipesById, entries, restaurantsById, activitiesById);
  if (entry.kind === 'leftovers') return recipe ? `Reste von ${recipe.title}` : fallback();
  if (entry.kind === 'recipe') return recipe?.title ?? entry.text ?? fallback();
  return fallback();
}
