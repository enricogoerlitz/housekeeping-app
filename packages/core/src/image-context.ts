// Spec 0052, REQ-003: what an entry tells ai-image about the picture it wants — the kind, the
// title and the few facts that shape a good photo. No address, no notes, no personal data.
import { IMAGE_CONTEXT_LIMITS, type AiImageContext } from './ai-contract';
import { mainIngredientNames } from './recipe-draft';
import type { Activity, Article, Id, Recipe, Restaurant } from './types';

/** As many as the photo window's prefilled prompt names (defaultImagePrompt). */
const MAIN_INGREDIENTS = 3;

/** Trimmed and cut to `max` characters; undefined when empty. */
function text(value: string | undefined, max: number): string | undefined {
  const trimmed = value?.trim().slice(0, max).trim();
  return trimmed ? trimmed : undefined;
}

function context(
  kind: AiImageContext['kind'],
  title: string,
  fields: Omit<AiImageContext, 'kind' | 'title'>,
): AiImageContext {
  const out: AiImageContext = { kind, title: text(title, IMAGE_CONTEXT_LIMITS.title) ?? kind };
  const ingredients = fields.ingredients
    ?.flatMap((name) => text(name, IMAGE_CONTEXT_LIMITS.ingredient) ?? [])
    .slice(0, IMAGE_CONTEXT_LIMITS.ingredients);
  if (ingredients && ingredients.length > 0) out.ingredients = ingredients;
  const description = text(fields.description, IMAGE_CONTEXT_LIMITS.description);
  if (description) out.description = description;
  const category = text(fields.category, IMAGE_CONTEXT_LIMITS.category);
  if (category) out.category = category;
  const place = text(fields.place, IMAGE_CONTEXT_LIMITS.place);
  if (place) out.place = place;
  return out;
}

export function recipeImageContext(
  recipe: Recipe,
  articlesById: Record<Id, Article>,
): AiImageContext {
  if (recipe.kind === 'collection') return context('collection', recipe.title, {});
  return context('recipe', recipe.title, {
    ingredients: mainIngredientNames(recipe, articlesById).slice(0, MAIN_INGREDIENTS),
    description: recipe.description,
  });
}

/** The photo suggestions of a draft (spec 0045): its title and description. */
export function draftImageContext(draft: { title: string; description?: string }): AiImageContext {
  return context('recipe', draft.title, { description: draft.description });
}

export function restaurantImageContext(restaurant: Restaurant): AiImageContext {
  return context('restaurant', restaurant.name, { category: restaurant.cuisine });
}

/** `kindName`: the name of the activity's "Art", if it has one. */
export function activityImageContext(activity: Activity, kindName?: string): AiImageContext {
  return context('activity', activity.name, {
    category: kindName,
    place: activity.placeName,
    description: activity.description,
  });
}
