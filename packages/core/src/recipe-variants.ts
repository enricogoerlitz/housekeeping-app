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

/**
 * The variant chosen on the recipe page, together with the default it was chosen against
 * (spec 0008, AC-033).
 */
export interface VariantChoice {
  variantId?: Id;
  defaultId?: Id;
}

/** A choice on the recipe page; without a variant it is the recipe's default. */
export function chooseVariant(recipe: Recipe, variantId?: Id): VariantChoice {
  const defaultId = defaultVariantId(recipe);
  return { variantId: variantId ?? defaultId, defaultId };
}

/**
 * The variant the recipe page shows (AC-033): a new default ("Als Standard", then "Fertig")
 * replaces the choice, so the new default is preselected; a chosen variant that is gone falls
 * back to the default; otherwise the choice stays.
 */
export function shownVariantId(recipe: Recipe, choice: VariantChoice): Id | undefined {
  const defaultId = defaultVariantId(recipe);
  if (defaultId !== choice.defaultId) return defaultId;
  return recipe.variants.some((variant) => variant.id === choice.variantId)
    ? choice.variantId
    : defaultId;
}
