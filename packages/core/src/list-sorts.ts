import { ACTIVITY_SORTS, type ActivitySort } from './activities';
import { RECIPE_SORTS, type RecipeListSort } from './recipe-list';
import { RESTAURANT_SORTS, type RestaurantListSort } from './restaurant-list';

/**
 * The sort each list was last given on this device (spec 0036, REQ-002). It applies whenever the
 * address names none; a list without one uses its default.
 */
export interface ListSorts {
  recipes?: RecipeListSort;
  restaurants?: RestaurantListSort;
  activities?: ActivitySort;
}

function oneOf<T extends string>(options: readonly { value: T }[], value: unknown): T | undefined {
  return options.find((option) => option.value === value)?.value;
}

/** The stored sorts; anything that is not a sort of that list is dropped. */
export function parseListSorts(value: unknown): ListSorts {
  if (typeof value !== 'object' || value === null) return {};
  const record = value as Record<string, unknown>;
  const sorts: ListSorts = {};
  const recipes = oneOf(RECIPE_SORTS, record.recipes);
  const restaurants = oneOf(RESTAURANT_SORTS, record.restaurants);
  const activities = oneOf(ACTIVITY_SORTS, record.activities);
  if (recipes) sorts.recipes = recipes;
  if (restaurants) sorts.restaurants = restaurants;
  if (activities) sorts.activities = activities;
  return sorts;
}
