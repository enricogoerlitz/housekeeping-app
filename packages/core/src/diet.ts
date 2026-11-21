import { ingredientsForVariant } from './recipe-variants';
import type { Article, Diet, DietPreference, Id, Recipe } from './types';

const DIET_LABELS: Record<Diet, string> = {
  vegan: 'vegan',
  vegetarian: 'vegetarisch',
  fish: 'mit Fisch',
  meat: 'mit Fleisch',
  unknown: 'unbekannt',
};
const PREFERENCE_LABELS: Record<DietPreference, string> = {
  vegan: 'vegan',
  vegetarian: 'vegetarisch',
  flexible: 'isst alles',
};
// Higher wins when diets are combined. "unknown" ranks above vegetarian so that an unidentified
// ingredient can never make a dish look meat-free.
const DIET_RANK: Record<Diet, number> = { vegan: 0, vegetarian: 1, unknown: 2, fish: 3, meat: 4 };

/** German label: "vegan", "vegetarisch", "mit Fisch", "mit Fleisch", "unbekannt". */
export function dietLabel(diet: Diet): string {
  return DIET_LABELS[diet];
}
/** German label: "vegan", "vegetarisch", "isst alles". */
export function dietPreferenceLabel(pref: DietPreference): string {
  return PREFERENCE_LABELS[pref];
}
/**
 * The most restrictive-to-eat of several diets: vegan < vegetarian < fish < meat.
 * "unknown" wins over vegan and vegetarian (never silently vegan) but loses to fish and meat.
 * Empty input → "vegan".
 */
export function combineDiets(diets: Diet[]): Diet {
  return diets.reduce<Diet>(
    (highest, diet) => (DIET_RANK[diet] > DIET_RANK[highest] ? diet : highest),
    'vegan',
  );
}
/**
 * Diet of a recipe for one variant: base ingredients plus that variant's ingredients.
 * variantId undefined → default variant (or base only when the recipe has no variants).
 * An ingredient whose article is unknown here counts as "unknown", and so does a recipe without
 * ingredients.
 */
export function deriveRecipeDiet(
  recipe: Recipe,
  variantId: Id | undefined,
  articlesById: Record<Id, Article>,
): Diet {
  const ingredients = ingredientsForVariant(recipe, variantId);
  // Nothing is known about a recipe whose ingredients are not entered yet; combining an empty
  // list would call it vegan.
  if (ingredients.length === 0) return 'unknown';
  return combineDiets(
    ingredients.map((ingredient) => articlesById[ingredient.articleId]?.diet ?? 'unknown'),
  );
}
/** vegan pref → only vegan; vegetarian pref → vegan or vegetarian; flexible → everything. */
export function dietFitsPreference(diet: Diet, pref: DietPreference): boolean {
  if (pref === 'flexible') return true;
  if (pref === 'vegetarian') return diet === 'vegan' || diet === 'vegetarian';
  return diet === 'vegan';
}
/**
 * Ids of the variants a person with this preference can eat; ["base"] for a fitting recipe
 * without variants, [] when nothing fits.
 */
export function fittingVariantIds(
  recipe: Recipe,
  pref: DietPreference,
  articlesById: Record<Id, Article>,
): Id[] {
  const fits = (variantId: Id | undefined): boolean =>
    dietFitsPreference(deriveRecipeDiet(recipe, variantId, articlesById), pref);

  if (recipe.variants.length === 0) return fits(undefined) ? ['base'] : [];
  return recipe.variants.filter((variant) => fits(variant.id)).map((variant) => variant.id);
}
/** True when at least one variant (or the base) fits the preference. */
export function recipeFitsPreference(
  recipe: Recipe,
  pref: DietPreference,
  articlesById: Record<Id, Article>,
): boolean {
  return fittingVariantIds(recipe, pref, articlesById).length > 0;
}
