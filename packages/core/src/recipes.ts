import { scaleAmount } from './amounts';
import { createdTime, daysBetween } from './dates';
import { recipeFitsPreference } from './diet';
import { fuzzyIncludes, normalizeText } from './text';
import type {
  Article,
  Course,
  DietPreference,
  Id,
  ISODate,
  Member,
  Recipe,
  RecipeIngredient,
  RecipeStep,
} from './types';

export {
  chooseVariant,
  defaultVariantId,
  ingredientsForVariant,
  shownVariantId,
  type VariantChoice,
} from './recipe-variants';

const COURSE_LABELS: Record<Course, string> = {
  breakfast: 'Frühstück',
  main: 'Hauptgericht',
  side: 'Beilage',
  dessert: 'Dessert',
  snack: 'Snack',
  drink: 'Getränk',
};

/** Steps for everyone plus those of the given variants (all variants when undefined). */
export function stepsForVariants(recipe: Recipe, variantIds?: Id[]): RecipeStep[] {
  return recipe.steps.filter(
    (step) =>
      step.variantId === undefined ||
      variantIds === undefined ||
      variantIds.includes(step.variantId),
  );
}
/** German label: "Frühstück", "Hauptgericht", "Beilage", "Dessert", "Snack", "Getränk". */
export function courseLabel(course: Course): string {
  return COURSE_LABELS[course];
}

function searchableTexts(recipe: Recipe, articlesById: Record<Id, Article>): string[] {
  const texts = [recipe.title, ...recipe.tags];
  if (recipe.notes !== undefined) texts.push(recipe.notes);
  if (recipe.description !== undefined) texts.push(recipe.description);
  for (const ingredient of recipe.ingredients) {
    const article = articlesById[ingredient.articleId];
    if (article) texts.push(article.name, ...article.synonyms);
  }
  return texts;
}

/**
 * Keyword search over title, the names and synonyms of the ingredients' articles, tags,
 * notes and description; typo tolerant; several words must all match. Recipes with every word in
 * the title come first, the given order is kept otherwise.
 * Empty query → all recipes in the given order.
 * "halumi" finds "Halloumi-Pfanne"; "Karotten" finds recipes with the article Möhren.
 */
export function searchRecipes(
  query: string,
  recipes: Recipe[],
  articlesById: Record<Id, Article>,
): Recipe[] {
  const words = normalizeText(query)
    .split(' ')
    .filter((word) => word !== '');
  if (words.length === 0) return [...recipes];

  const titleHits: Recipe[] = [];
  const otherHits: Recipe[] = [];
  for (const recipe of recipes) {
    if (words.every((word) => fuzzyIncludes(word, recipe.title))) {
      titleHits.push(recipe);
      continue;
    }
    const texts = searchableTexts(recipe, articlesById);
    if (words.every((word) => texts.some((text) => fuzzyIncludes(word, text)))) {
      otherHits.push(recipe);
    }
  }
  return [...titleHits, ...otherHits];
}

export interface RecipeFilter {
  /** Recipe must have a variant that fits this preference. */
  diet?: DietPreference;
  /** Recipes without a known duration do not pass. */
  maxMinutes?: number;
  course?: Course;
  /** Favourite of this member. */
  favoriteOf?: Id;
  /** Every listed member finds a fitting variant. */
  fitsAll?: Member[];
  /** Not cooked within the last n days (never cooked counts too). */
  notCookedSinceDays?: number;
}
/** Recipes that pass every criterion set in the filter, in the given order. */
export function filterRecipes(
  recipes: Recipe[],
  filter: RecipeFilter,
  articlesById: Record<Id, Article>,
  today: ISODate,
): Recipe[] {
  const { diet, maxMinutes, course, favoriteOf, fitsAll, notCookedSinceDays } = filter;
  return recipes.filter((recipe) => {
    if (diet !== undefined && !recipeFitsPreference(recipe, diet, articlesById)) return false;
    if (maxMinutes !== undefined) {
      if (recipe.totalMinutes === undefined || recipe.totalMinutes > maxMinutes) return false;
    }
    if (course !== undefined && recipe.course !== course) return false;
    if (favoriteOf !== undefined && !recipe.favoriteOf.includes(favoriteOf)) return false;
    if (
      fitsAll !== undefined &&
      !fitsAll.every((member) => recipeFitsPreference(recipe, member.dietPreference, articlesById))
    ) {
      return false;
    }
    if (notCookedSinceDays !== undefined && recipe.lastCookedOn !== undefined) {
      if (daysBetween(recipe.lastCookedOn, today) < notCookedSinceDays) return false;
    }
    return true;
  });
}

function byTitle(a: Recipe, b: Recipe): number {
  return a.title.localeCompare(b.title, 'de');
}

// ISO dates order like plain strings; the empty string stands for "never cooked" and sorts first.
function lastCookedKey(recipe: Recipe): string {
  return recipe.lastCookedOn ?? '';
}

export type RecipeSort = 'recent' | 'new' | 'title' | 'rating' | 'count';
/**
 * recent = last cooked first (never cooked last); new = created last first; rating = best average
 * rating first (unrated last); count = most often cooked first. Ties are ordered by title.
 */
export function sortRecipes(recipes: Recipe[], by: RecipeSort): Recipe[] {
  const compare: Record<RecipeSort, (a: Recipe, b: Recipe) => number> = {
    recent: (a, b) =>
      lastCookedKey(a) === lastCookedKey(b) ? 0 : lastCookedKey(a) < lastCookedKey(b) ? 1 : -1,
    new: (a, b) => createdTime(b) - createdTime(a),
    title: () => 0,
    rating: (a, b) => (averageRating(b) ?? 0) - (averageRating(a) ?? 0),
    count: (a, b) => b.cookedCount - a.cookedCount,
  };
  return [...recipes].sort((a, b) => compare[by](a, b) || byTitle(a, b));
}
/** Average rating over all members, undefined when unrated. */
export function averageRating(recipe: Recipe): number | undefined {
  const ratings = Object.values(recipe.ratings);
  if (ratings.length === 0) return undefined;
  return ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length;
}

/**
 * One ingredient as shown in the recipe: amount scaled by the factor, the article name and the
 * Hinweis after "·" ("4 Zwiebeln · fein gehackt"); without Hinweis no "·" (AC-011, AC-013). The
 * Einkaufs-Zusatz is not part of it (AC-012).
 */
export function ingredientLine(
  ingredient: Pick<RecipeIngredient, 'amount' | 'prepNote'>,
  articleName: string,
  factor = 1,
): string {
  const amount = ingredient.amount ? scaleAmount(ingredient.amount, factor).text : '';
  const line = [amount, articleName].filter((part) => part !== '').join(' ');
  const prepNote = ingredient.prepNote?.trim() ?? '';
  return prepNote === '' ? line : `${line} · ${prepNote}`;
}
