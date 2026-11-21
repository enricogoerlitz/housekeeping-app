import type { Id, ISODate, MealPlanEntry, Recipe } from './types';

// What deleting a recipe does to the meal plan (spec 0008, E3). The server's delete_recipe applies
// the same rules in one transaction; the device uses this to show the deletion at once.

export interface RecipeDeletionEffect {
  /** Entries of the recipe up to and including today, now free text; everything else kept. */
  converted: MealPlanEntry[];
  /** Entries of the recipe on a later day or without a day (vorgemerkt). */
  removedIds: Id[];
}

/**
 * Entries of the recipe up to and including `today` (the device's date; today counts as history)
 * become free text: kind "text", no recipe, no variant split, and as text the title, for
 * leftovers "Reste von <Titel>". Eaters, guests, portions, cook and "nicht gekocht" stay. Entries
 * on a later day and those without a day are removed. Other entries are not touched.
 */
export function recipeDeletionEffect(
  entries: readonly MealPlanEntry[],
  recipe: Pick<Recipe, 'id' | 'title'>,
  today: ISODate,
): RecipeDeletionEffect {
  const converted: MealPlanEntry[] = [];
  const removedIds: Id[] = [];
  for (const entry of entries) {
    if (entry.recipeId !== recipe.id) continue;
    if (entry.date === null || entry.date > today) {
      removedIds.push(entry.id);
      continue;
    }
    converted.push({
      ...entry,
      kind: 'text',
      recipeId: undefined,
      variants: [],
      text: entry.kind === 'leftovers' ? `Reste von ${recipe.title}` : recipe.title,
    });
  }
  return { converted, removedIds };
}

/** The notice after deleting: "Halloumi-Pfanne gelöscht" (AC-043; "Rückgängig" is the action). */
export function recipeDeletedLabel(title: string): string {
  return `${title} gelöscht`;
}
