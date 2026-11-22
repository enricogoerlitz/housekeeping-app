import { formatQty } from './amounts';
import {
  combineDiets,
  deriveRecipeDiet,
  dietFitsPreference,
  foodDiets,
  recipeFitsPreference,
} from './diet';
import { ingredientsForVariant } from './recipe-variants';
import { defaultVariantId } from './recipe-variants';
import { contributionsFromEntry, type PlannedContribution } from './shopping';
import { recipeSource } from './shopping-list';
import type {
  Article,
  CollectionRecipe,
  Diet,
  DietPreference,
  Id,
  MealPlanEntry,
  PlanEntryVariant,
  Recipe,
} from './types';

// "Sammlungen" (spec 0009): a recipe of the kind "collection" bundles own ingredients and other
// recipes (CollectionRecipe rows). Here is how a collection is resolved into what it contains,
// scaled for the shopping list, described and judged by diet.

/** E15, Offene Frage 5 A: recipes per collection; recipes removed in one "Fertig". */
export const COLLECTION_LIMITS = { recipes: 50, removeAtOnce: 20 } as const;

/** The recipes of the household with the rows that say what each collection contains. */
export interface RecipeBook {
  recipesById: Readonly<Record<Id, Recipe>>;
  collectionRecipes: readonly CollectionRecipe[];
}

/** One recipe of a collection as it counts: with its portions and variant resolved. */
export interface CollectionContent {
  row: CollectionRecipe;
  recipe: Recipe;
  /** Own portions, else those of the collection. */
  servings: number;
  /** True when it takes the portions of the collection ("übernimmt"). */
  inherits: boolean;
  /** The chosen variant while the recipe still has it, else its default; undefined without. */
  variantId?: Id;
}

function bySortThenId(a: CollectionRecipe, b: CollectionRecipe): number {
  return a.sort - b.sort || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/**
 * What a collection contains, by `sort`, equal values by id (E5). A row whose recipe is not in the
 * local cache (just deleted on another device) is left out. A chosen variant the recipe no longer
 * has falls back to its default (Offene Frage 4 A).
 */
export function collectionContents(
  collection: Pick<Recipe, 'id' | 'servings'>,
  collectionRecipes: readonly CollectionRecipe[],
  recipesById: Readonly<Record<Id, Recipe>>,
): CollectionContent[] {
  return collectionRecipes
    .filter((row) => row.collectionId === collection.id)
    .sort(bySortThenId)
    .flatMap((row): CollectionContent[] => {
      const recipe = recipesById[row.recipeId];
      if (recipe === undefined) return [];
      const kept = recipe.variants.some((variant) => variant.id === row.variantId);
      return [
        {
          row,
          recipe,
          servings: row.servings ?? collection.servings,
          inherits: row.servings === undefined,
          variantId: kept ? row.variantId : defaultVariantId(recipe),
        },
      ];
    });
}

/** collectionContents with the household's recipe book. */
export function contentsInBook(
  collection: Pick<Recipe, 'id' | 'servings'>,
  book: RecipeBook,
): CollectionContent[] {
  return collectionContents(collection, book.collectionRecipes, book.recipesById);
}

// ---------- Texts ----------

/** "2 Rezepte", "1 Rezept"; "" for none, so a tile or calendar row shows no count (AC-024). */
export function collectionRecipeCountLabel(count: number): string {
  if (count <= 0) return '';
  return count === 1 ? '1 Rezept' : `${count} Rezepte`;
}

/** A calendar row of a collection: "Grillabend · 2 Rezepte", "Sommerfest" without recipes. */
export function collectionEntryLabel(title: string, recipeCount: number): string {
  const count = collectionRecipeCountLabel(recipeCount);
  return count === '' ? title : `${title} · ${count}`;
}

/** The line under the title: "für 6 · 2 Rezepte · 4 eigene Zutaten"; parts with 0 drop out. */
export function collectionSummary(
  collection: Pick<Recipe, 'servings' | 'ingredients'>,
  contents: readonly CollectionContent[],
): string {
  const own = collection.ingredients.length;
  const parts = [
    `für ${formatQty(collection.servings)}`,
    collectionRecipeCountLabel(contents.length),
  ];
  if (own > 0) parts.push(own === 1 ? '1 eigene Zutat' : `${own} eigene Zutaten`);
  return parts.filter((part) => part !== '').join(' · ');
}

/**
 * A row under "Enthält": "Kartoffelsalat · 6 Port. (wie Sammlung)" for portions taken from the
 * collection (spec 0023, AC-058), "Grillgemüse · vegan · 8 Port.". The variant is named only when
 * the recipe has variants and another than its default is chosen (AC-016).
 */
export function collectionContentLabel(content: CollectionContent): string {
  const { recipe } = content;
  const parts = [recipe.title];
  if (content.variantId !== undefined && content.variantId !== defaultVariantId(recipe)) {
    const variant = recipe.variants.find((candidate) => candidate.id === content.variantId);
    if (variant) parts.push(variant.name);
  }
  const portions = `${formatQty(content.servings)} Port.`;
  parts.push(content.inherits ? `${portions} (wie Sammlung)` : portions);
  return parts.join(' · ');
}

// ---------- Diet ----------

/**
 * The diet of everything in the collection (AC-020): its own ingredients and each contained recipe
 * in its chosen variant, combined like the ingredients of a recipe; "kein Lebensmittel" does not
 * count (spec 0023, REQ-008). A collection without food is "unknown", like a recipe without
 * ingredients.
 */
export function collectionDiet(
  collection: Pick<Recipe, 'ingredients'>,
  contents: readonly CollectionContent[],
  articlesById: Record<Id, Article>,
): Diet {
  const diets = [
    ...foodDiets(collection.ingredients, articlesById),
    ...contents.flatMap((content) =>
      foodDiets(ingredientsForVariant(content.recipe, content.variantId), articlesById).length === 0
        ? []
        : [deriveRecipeDiet(content.recipe, content.variantId, articlesById)],
    ),
  ];
  return diets.length === 0 ? 'unknown' : combineDiets(diets);
}

/** A collection fits a preference only when everything in it fits (AC-020). */
export function collectionFitsPreference(
  collection: Pick<Recipe, 'ingredients'>,
  contents: readonly CollectionContent[],
  pref: DietPreference,
  articlesById: Record<Id, Article>,
): boolean {
  return dietFitsPreference(collectionDiet(collection, contents, articlesById), pref);
}

/** recipeFitsPreference for a recipe, collectionFitsPreference for a collection. */
export function dishFitsPreference(
  recipe: Recipe,
  pref: DietPreference,
  articlesById: Record<Id, Article>,
  book: RecipeBook,
): boolean {
  if (recipe.kind === 'collection') {
    return collectionFitsPreference(recipe, contentsInBook(recipe, book), pref, articlesById);
  }
  return recipeFitsPreference(recipe, pref, articlesById);
}

// ---------- Shopping ----------

/** How much of a collection is put on the list, and from which plan entry (none from its page). */
export interface CollectionPortions {
  /** Planned portions: those of the entry, or those of the collection from its page. */
  portions: number;
  entry?: Pick<MealPlanEntry, 'id' | 'date'>;
}

/**
 * What a collection brings onto the list (E6, REQ-005), not merged. Factor = planned portions ÷
 * portions of the collection. Own ingredients follow the rules of a recipe without variants with
 * that factor ("Anzahl" stays 1×, "Rezeptmenge" scales). Each contained recipe counts as a plan
 * entry for "its portions × factor" of its chosen variant, so there is no split over variants.
 * Rounding happens once at the end, by contributionsFromEntry. Every contribution names the
 * collection as its recipe and the entry (empty from the page); the Herkunft is "Grillabend" or
 * "Grillabend · Kartoffelsalat", from an entry with the day "(Sa)".
 */
export function collectionContributions(
  collection: Recipe,
  contents: readonly CollectionContent[],
  articlesById: Record<Id, Article>,
  planned: CollectionPortions,
): PlannedContribution[] {
  const { entry } = planned;
  const factor = collection.servings > 0 ? planned.portions / collection.servings : 1;
  const asEntry = (
    recipeId: Id,
    portions: number,
    variants: PlanEntryVariant[],
  ): MealPlanEntry => ({
    id: entry?.id ?? '',
    date: entry?.date ?? null,
    slotId: '',
    kind: 'recipe',
    recipeId,
    eaterIds: [],
    guests: 0,
    portions,
    variants,
    sort: 0,
  });
  const fromCollection = (
    contributions: PlannedContribution[],
    contained?: Pick<Recipe, 'title'>,
  ): PlannedContribution[] => {
    const { label } = recipeSource(collection, entry, contained);
    return contributions.map((contribution) => ({
      ...contribution,
      recipeId: collection.id,
      entryId: entry?.id ?? '',
      label,
    }));
  };

  const own = contributionsFromEntry(
    asEntry(collection.id, planned.portions, []),
    collection,
    articlesById,
    '',
  );
  const contained = contents.flatMap((content) => {
    const portions = content.servings * factor;
    const variants =
      content.variantId === undefined ? [] : [{ variantId: content.variantId, portions }];
    return fromCollection(
      contributionsFromEntry(
        asEntry(content.recipe.id, portions, variants),
        content.recipe,
        articlesById,
        '',
      ),
      content.recipe,
    );
  });
  return [...fromCollection(own), ...contained];
}

/** "Auf die Liste" on the page of the collection: something to buy for its portions. */
export function canPutCollectionOnList(
  collection: Recipe,
  contents: readonly CollectionContent[],
): boolean {
  // The pantry flag does not decide whether something is bought, so no articles are needed here.
  return (
    collectionContributions(collection, contents, {}, { portions: collection.servings }).length > 0
  );
}

/**
 * Why "Auf die Liste" is greyed out on the page of a collection with nothing in it: "Noch nichts
 * enthalten" (AC-028). Undefined otherwise; content with nothing to buy uses the hint of the recipe
 * page.
 */
export function collectionListHint(
  collection: Pick<Recipe, 'ingredients'>,
  contents: readonly CollectionContent[],
): string | undefined {
  return collection.ingredients.length === 0 && contents.length === 0
    ? 'Noch nichts enthalten'
    : undefined;
}

// ---------- Photo ----------

/** At most this many photos in the collage of a collection (E14). */
const COVER_PHOTOS = 4;

function hasPhoto(recipe: Pick<Recipe, 'photo' | 'photoPath'>): boolean {
  return recipe.photoPath !== undefined || recipe.photo !== undefined;
}

/**
 * The recipes whose photo the cover shows (E14, AC-004, AC-005): a recipe or a collection with a
 * photo of its own, just that; else for a collection the first four contained recipes with a photo,
 * in their order; nothing means the placeholder.
 */
export function coverPhotos(recipe: Recipe, contents: readonly CollectionContent[]): Recipe[] {
  if (hasPhoto(recipe)) return [recipe];
  if (recipe.kind !== 'collection') return [];
  return contents
    .map((content) => content.recipe)
    .filter(hasPhoto)
    .slice(0, COVER_PHOTOS);
}
