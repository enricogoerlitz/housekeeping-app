import type { Id, Recipe, RecipeIngredient } from './types';

// Internal module, reachable from outside only through recipes.ts. It exists because recipes.ts
// (filtering by diet) and diet.ts (diet of a variant) both need these rules and would otherwise
// import each other.

/** The variant marked as default, else the first one; undefined for recipes without variants. */
export function defaultVariantId(recipe: Recipe): Id | undefined {
  return (recipe.variants.find((variant) => variant.isDefault) ?? recipe.variants[0])?.id;
}
/** Base ingredients plus those of the given variant (default variant when undefined). */
export function ingredientsForVariant(recipe: Recipe, variantId?: Id): RecipeIngredient[] {
  const chosen = variantId ?? defaultVariantId(recipe);
  return recipe.ingredients.filter(
    (ingredient) => ingredient.variantId === undefined || ingredient.variantId === chosen,
  );
}
