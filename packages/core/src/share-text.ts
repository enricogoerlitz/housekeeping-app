import { formatQty } from './amounts';
import { collectionContentLabel, contentsInBook, type RecipeBook } from './collections';
import { groupIngredients } from './ingredient-groups';
import {
  defaultVariantId,
  ingredientLine,
  ingredientsForVariant,
  stepsForVariants,
} from './recipes';
import type { Activity, Id, Recipe, RecipeIngredient, RecipeLink, Restaurant } from './types';

// "Teilen" (spec 0042, REQ-004, Decision 3): a text that reads without the app, sent through the
// share menu of the device or copied, with the app's link at the end for members.

/** Blocks separated by an empty line; empty blocks drop out. */
function blocks(...parts: (string[] | undefined)[]): string {
  return parts
    .filter((part): part is string[] => part !== undefined && part.length > 0)
    .map((part) => part.join('\n'))
    .join('\n\n');
}

function portions(servings: number): string {
  return servings === 1 ? '1 Portion' : `${formatQty(servings)} Portionen`;
}

function appBlock(appUrl: string | undefined): string[] | undefined {
  return appUrl ? [`In der App: ${appUrl}`] : undefined;
}

function linkBlock(links: readonly RecipeLink[]): string[] | undefined {
  if (links.length === 0) return undefined;
  return ['Links', ...links.map((link) => `- ${link.label ? `${link.label}: ` : ''}${link.url}`)];
}

function ingredientLines(
  ingredients: readonly RecipeIngredient[],
  articleName: (articleId: Id) => string,
  factor: number,
): string[] {
  return groupIngredients(ingredients).flatMap((part) => [
    ...(part.group === undefined ? [] : [`${part.group}:`]),
    ...part.items.map((item) => `- ${ingredientLine(item, articleName(item.articleId), factor)}`),
  ]);
}

/**
 * A recipe (AC-008): title, portions (and the variant), description, the ingredients with their
 * amounts at these portions, the steps of the variant, the links and the app link.
 */
export function recipeShareText(input: {
  recipe: Recipe;
  articleName: (articleId: Id) => string;
  /** The portions shown; the recipe's own when undefined. */
  servings?: number;
  /** The variant shown; the default variant when undefined. */
  variantId?: Id;
  appUrl?: string;
}): string {
  const { recipe } = input;
  const servings = input.servings ?? recipe.servings;
  const variantId = input.variantId ?? defaultVariantId(recipe);
  const variant = recipe.variants.find((candidate) => candidate.id === variantId);
  const ingredients = ingredientsForVariant(recipe, variantId);
  const steps = stepsForVariants(recipe, variantId === undefined ? undefined : [variantId]);
  const factor = recipe.servings > 0 ? servings / recipe.servings : 1;
  const description = recipe.description?.trim();
  return blocks(
    [recipe.title, variant ? `${portions(servings)} · ${variant.name}` : portions(servings)],
    description ? [description] : undefined,
    ingredients.length > 0
      ? ['Zutaten', ...ingredientLines(ingredients, input.articleName, factor)]
      : undefined,
    steps.length > 0
      ? ['Zubereitung', ...steps.map((step, index) => `${index + 1}. ${step.text}`)]
      : undefined,
    linkBlock(recipe.links),
    appBlock(input.appUrl),
  );
}

/** A collection ("Sammlung"): title, portions, the recipes it contains, its own ingredients. */
export function collectionShareText(input: {
  collection: Recipe;
  book: RecipeBook;
  articleName: (articleId: Id) => string;
  appUrl?: string;
}): string {
  const { collection } = input;
  const contents = contentsInBook(collection, input.book);
  const description = collection.description?.trim();
  return blocks(
    [collection.title, portions(collection.servings)],
    description ? [description] : undefined,
    contents.length > 0
      ? ['Enthält', ...contents.map((content) => `- ${collectionContentLabel(content)}`)]
      : undefined,
    collection.ingredients.length > 0
      ? ['Dazu', ...ingredientLines(collection.ingredients, input.articleName, 1)]
      : undefined,
    linkBlock(collection.links),
    appBlock(input.appUrl),
  );
}

function placeLines(place: { address?: string; mapsUrl?: string; websiteUrl?: string }): string[] {
  return [
    place.address?.trim(),
    place.mapsUrl ? `Karte: ${place.mapsUrl}` : undefined,
    place.websiteUrl ? `Webseite: ${place.websiteUrl}` : undefined,
  ].filter((line): line is string => Boolean(line));
}

/** A restaurant (AC-009): name, cuisine, address, map link, website and the app link. */
export function restaurantShareText(restaurant: Restaurant, appUrl?: string): string {
  return blocks(
    [
      restaurant.name,
      ...(restaurant.cuisine?.trim() ? [restaurant.cuisine.trim()] : []),
      ...placeLines(restaurant),
    ],
    appBlock(appUrl),
  );
}

/** An activity: name, description, place name, address, map link, website and the app link. */
export function activityShareText(activity: Activity, appUrl?: string): string {
  return blocks(
    [
      activity.name,
      ...[activity.description?.trim(), activity.placeName?.trim()].filter((line): line is string =>
        Boolean(line),
      ),
      ...placeLines(activity),
    ],
    appBlock(appUrl),
  );
}
