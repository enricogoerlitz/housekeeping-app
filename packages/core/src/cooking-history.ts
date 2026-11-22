import type { CollectionRecipe, Id, ISODate, MealPlanEntry, Recipe } from './types';

// "Gekocht" according to the calendar (spec 0009, E10, Offene Frage 2 A and 3 A). Nothing is
// stored: the list "Essen" combines the stored history (sample data) with this, online
// and offline alike.

export interface CookedFromCalendar {
  lastCookedOn: ISODate;
  count: number;
}

/**
 * What the calendar says was cooked, per recipe id: every recipe entry with a day up to and
 * including today that is not marked "nicht gekocht", like visitsOf for restaurants and
 * activities. An entry counts for its recipe, and for a collection also for every recipe it
 * contains today. Free text, leftovers, entries without a day and later days count for nothing.
 */
export function cookingHistory(
  entries: readonly MealPlanEntry[],
  collectionRecipes: readonly CollectionRecipe[],
  today: ISODate,
): Record<Id, CookedFromCalendar> {
  const history: Record<Id, CookedFromCalendar> = {};
  const count = (recipeId: Id, date: ISODate): void => {
    const known = history[recipeId];
    history[recipeId] = {
      lastCookedOn: known === undefined || date > known.lastCookedOn ? date : known.lastCookedOn,
      count: (known?.count ?? 0) + 1,
    };
  };
  for (const entry of entries) {
    if (entry.kind !== 'recipe' || entry.recipeId === undefined) continue;
    if (entry.date === null || entry.date > today || entry.notCooked) continue;
    count(entry.recipeId, entry.date);
    for (const row of collectionRecipes) {
      if (row.collectionId === entry.recipeId) count(row.recipeId, entry.date);
    }
  }
  return history;
}

/**
 * The recipes with the calendar added to their stored history: the later of both days as
 * "zuletzt gekocht", the sum of both counts. A recipe the calendar says nothing about is returned
 * as it is.
 */
export function withCookingHistory(
  recipes: readonly Recipe[],
  history: Readonly<Record<Id, CookedFromCalendar>>,
): Recipe[] {
  return recipes.map((recipe) => {
    const cooked = history[recipe.id];
    if (cooked === undefined) return recipe;
    const stored = recipe.lastCookedOn;
    return {
      ...recipe,
      lastCookedOn:
        stored !== undefined && stored > cooked.lastCookedOn ? stored : cooked.lastCookedOn,
      cookedCount: recipe.cookedCount + cooked.count,
    };
  });
}
