import { scaleAmount } from './amounts';
import { ingredientsForVariant } from './recipe-variants';
import type { Id, Recipe, RecipeIngredient } from './types';

// The cooking mode with the portions chosen when it opens (spec 0018, REQ-002, E-02). The recipe
// page passes its portions in the address (`?portionen=6`); a deep link is input, so only a whole
// number from 1 counts, otherwise the recipe's own portions.

const WHOLE_NUMBER = /^[1-9]\d*$/;

/** The portions of the cooking mode from the address; the recipe's own without a valid value. */
export function cookingServings(
  value: string | readonly string[] | undefined,
  recipe: Pick<Recipe, 'servings'>,
): number {
  const first = typeof value === 'string' ? value : value?.[0];
  if (first === undefined || !WHOLE_NUMBER.test(first)) return recipe.servings;
  const servings = Number(first);
  return Number.isSafeInteger(servings) ? servings : recipe.servings;
}

/** "1 Portion", "6 Portionen". */
export function servingsLabel(servings: number): string {
  return servings === 1 ? '1 Portion' : `${servings} Portionen`;
}

/**
 * The ingredients of the variant with their amounts for `servings` portions, scaled as on the
 * recipe page (AC-004, AC-006).
 */
export function cookingIngredients(
  recipe: Recipe,
  variantId: Id | undefined,
  servings: number,
): RecipeIngredient[] {
  const factor = servings / recipe.servings;
  return ingredientsForVariant(recipe, variantId).map((ingredient) =>
    ingredient.amount
      ? { ...ingredient, amount: scaleAmount(ingredient.amount, factor) }
      : ingredient,
  );
}
