import type { CollectionRecipe, Id, ISODate, MealPlanEntry, Recipe } from './types';

// What deleting a recipe does to the meal plan (spec 0008, E3). The server's delete_recipe applies
// the same rules in one transaction; the device uses this to show the deletion at once.

export interface RecipeDeletionEffect {
  /** Entries of the recipe up to and including today, now free text; everything else kept. */
  converted: MealPlanEntry[];
  /**
   * Entries of the recipe on a later day or without a day (vorgemerkt), and leftovers without a
   * recipe of their own that point to a removed entry (also leftovers of those).
   */
  removedIds: Id[];
  /** Rows "Enthaltenes Rezept" of the deleted collection or recipe (spec 0009, E11). */
  removedCollectionRecipeIds: Id[];
  /** How many collections the deleted recipe is taken out of; 0 for a collection. */
  collections: number;
}

/**
 * Entries of the recipe up to and including `today` (the device's date; today counts as history)
 * become free text: kind "text", no recipe, no variant split, and as text the title, for
 * leftovers "Reste von <Titel>". Eaters, guests, portions, cook and "nicht gekocht" stay. Entries
 * on a later day and those without a day are removed, and with them leftovers that name no recipe
 * and point to a removed entry, on any day and also leftovers of those: without dish and recipe
 * they would mean nothing (meal_plan_entries_kind_complete). Other entries are not touched.
 */
export function recipeDeletionEffect(
  entries: readonly MealPlanEntry[],
  recipe: Pick<Recipe, 'id' | 'title'>,
  today: ISODate,
  collectionRecipes: readonly CollectionRecipe[],
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
  const removed = new Set(removedIds);
  for (let index = 0; index < removedIds.length; index++) {
    const source = removedIds[index];
    for (const entry of entries) {
      if (
        entry.kind === 'leftovers' &&
        entry.recipeId === undefined &&
        entry.leftoversOfEntryId === source &&
        !removed.has(entry.id)
      ) {
        removed.add(entry.id);
        removedIds.push(entry.id);
      }
    }
  }
  const rows = collectionRecipes.filter(
    (row) => row.collectionId === recipe.id || row.recipeId === recipe.id,
  );
  const collections = new Set(
    rows.filter((row) => row.recipeId === recipe.id).map((row) => row.collectionId),
  );
  return {
    converted,
    removedIds,
    removedCollectionRecipeIds: rows.map((row) => row.id),
    collections: collections.size,
  };
}

/**
 * The notice after deleting: "Halloumi-Pfanne gelöscht" (AC-043; "Rückgängig" is the action); a
 * recipe that was in collections adds "· auch aus 2 Sammlungen entfernt" (spec 0009, AC-033).
 */
export function recipeDeletedLabel(title: string, collections: number): string {
  if (collections <= 0) return `${title} gelöscht`;
  const where = collections === 1 ? '1 Sammlung' : `${collections} Sammlungen`;
  return `${title} gelöscht · auch aus ${where} entfernt`;
}
