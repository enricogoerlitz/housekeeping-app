import { formatQty } from './amounts';
import { formatStars } from './ratings';
import { contentsInBook } from './collections';
import { averageRating, courseLabel, filterRecipes, sortRecipes, type RecipeSort } from './recipes';
import { normalizeText } from './text';
import { isUnfinishedRecipe } from './unfinished-recipes';
import type {
  Article,
  CollectionRecipe,
  Course,
  Id,
  ISODate,
  Member,
  Recipe,
  RecipeKind,
} from './types';

// The list on "Essen → Rezepte" (spec 0008, REQ-001 to REQ-004): quick chips, the filter panel
// with the household's cuisines, sorting with "Zufall", and the texts around the hits. The state
// itself lives in the app while it runs (E14); here are only the rules.

/** "Lange nicht gekocht": not cooked within this many days (as before spec 0008). */
export const RARELY_COOKED_DAYS = 21;

/**
 * Zeit in the filter panel, each "höchstens"; 30 is also the quick chip "< 30 Min" (E13). 120
 * ("< 2 Std") since spec 0037 (AC-016), for collections like a barbecue.
 */
export type TimeLimit = 15 | 30 | 60 | 120;
/** Bewertung in the filter panel: the average from this value on (E13). */
export type MinRating = 4 | 4.5;
/** Ernährung in the filter panel; one value at most (AC-006). */
export type DietFilter = 'vegetarian' | 'vegan';

export const TIME_LIMITS: readonly TimeLimit[] = [15, 30, 60, 120];
export const MIN_RATINGS: readonly MinRating[] = [4, 4.5];

export interface RecipeListFilter {
  /** "Art": only recipes or only collections; undefined = both (spec 0009, AC-018). */
  kind?: RecipeKind;
  /** Own favourites. */
  favorites: boolean;
  diet?: DietFilter;
  maxMinutes?: TimeLimit;
  /** Fits every member of the household. */
  fitsAll: boolean;
  /** Not cooked for RARELY_COOKED_DAYS days. */
  rare: boolean;
  /** Several: a recipe passes with one of them. */
  courses: Course[];
  /** Cuisine keys (cuisineKey); several: a recipe passes with one of them. */
  cuisines: string[];
  /** Tag keys (tagKey); several: a recipe passes only with all of them (spec 0037, REQ-006). */
  tags: string[];
  minRating?: MinRating;
  /** Only recipes without ingredients and steps (spec 0061, REQ-002). */
  unfinished: boolean;
}

export const EMPTY_RECIPE_LIST_FILTER: RecipeListFilter = {
  favorites: false,
  fitsAll: false,
  rare: false,
  unfinished: false,
  courses: [],
  cuisines: [],
  tags: [],
};

/** The quick chips in the filter row, in this order (REQ-002); "Unfertig" last (spec 0061). */
export type QuickFilter =
  'favorites' | 'fast' | 'vegetarian' | 'vegan' | 'fitsAll' | 'rare' | 'unfinished';

export const QUICK_FILTERS: readonly { value: QuickFilter; label: string }[] = [
  { value: 'favorites', label: 'Favoriten' },
  { value: 'fast', label: '< 30 Min' },
  { value: 'vegetarian', label: 'Vegetarisch' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'fitsAll', label: 'Passt für alle' },
  { value: 'rare', label: 'Lange nicht gekocht' },
  { value: 'unfinished', label: 'Unfertig' },
];

/**
 * The quick chips as shown (spec 0061, REQ-002): "Unfertig (n)" with the number of unfinished
 * recipes of the household, left out while there are none and it is off (AC-006, AC-009).
 */
export function shownQuickFilters(
  filter: RecipeListFilter,
  unfinished: number,
): { value: QuickFilter; label: string }[] {
  return QUICK_FILTERS.flatMap((chip) => {
    if (chip.value !== 'unfinished') return [chip];
    if (unfinished === 0 && !filter.unfinished) return [];
    return [{ value: chip.value, label: `${chip.label} (${unfinished})` }];
  });
}

export function isQuickFilterActive(filter: RecipeListFilter, chip: QuickFilter): boolean {
  switch (chip) {
    case 'favorites':
      return filter.favorites;
    case 'fast':
      return filter.maxMinutes === 30;
    case 'vegetarian':
    case 'vegan':
      return filter.diet === chip;
    case 'fitsAll':
      return filter.fitsAll;
    case 'rare':
      return filter.rare;
    case 'unfinished':
      return filter.unfinished;
  }
}

/**
 * Turns a quick chip on or off. Vegetarisch and Vegan replace each other, and "< 30 Min" replaces
 * another Zeit, because Ernährung and Zeit hold one value (AC-006).
 */
export function toggleQuickFilter(filter: RecipeListFilter, chip: QuickFilter): RecipeListFilter {
  const active = isQuickFilterActive(filter, chip);
  switch (chip) {
    case 'favorites':
      return { ...filter, favorites: !active };
    case 'fast':
      return { ...filter, maxMinutes: active ? undefined : 30 };
    case 'vegetarian':
    case 'vegan':
      return { ...filter, diet: active ? undefined : chip };
    case 'fitsAll':
      return { ...filter, fitsAll: !active };
    case 'rare':
      return { ...filter, rare: !active };
    case 'unfinished':
      return { ...filter, unfinished: !active };
  }
}

/** n in "Filter (n)": every active value, quick chips included (REQ-002). */
export function activeFilterCount(filter: RecipeListFilter): number {
  return (
    Number(filter.kind !== undefined) +
    Number(filter.favorites) +
    Number(filter.fitsAll) +
    Number(filter.rare) +
    Number(filter.unfinished) +
    Number(filter.diet !== undefined) +
    Number(filter.maxMinutes !== undefined) +
    Number(filter.minRating !== undefined) +
    filter.courses.length +
    filter.cuisines.length +
    filter.tags.length
  );
}

/** The section "Art" of the filter panel (spec 0009, AC-018). */
export const RECIPE_KINDS: readonly { value: RecipeKind; label: string }[] = [
  { value: 'recipe', label: 'Rezepte' },
  { value: 'collection', label: 'Sammlungen' },
];

function recipeKindLabel(kind: RecipeKind): string {
  return RECIPE_KINDS.find((entry) => entry.value === kind)?.label ?? '';
}

/** A tap on a value of "Art": exactly one value or none (AC-018). */
export function toggleRecipeKind(filter: RecipeListFilter, kind: RecipeKind): RecipeListFilter {
  return { ...filter, kind: filter.kind === kind ? undefined : kind };
}

/** "Filter" or "Filter (2)" (REQ-002). */
export function filterButtonLabel(count: number): string {
  return count === 0 ? 'Filter' : `Filter (${count})`;
}

/** "< 15 Min", "< 2 Std" (Zeit). */
export function timeLimitLabel(minutes: TimeLimit): string {
  return minutes === 120 ? '< 2 Std' : `< ${minutes} Min`;
}

/** "ab 4 ★", "ab 4,5 ★" (Bewertung). */
export function minRatingLabel(stars: MinRating): string {
  return `ab ${formatStars(stars)} ★`;
}

/** An active value without a quick chip, shown with ✕ in the filter row (AC-005). */
export type RecipeFilterChip =
  | { kind: 'kind'; value: RecipeKind; label: string }
  | { kind: 'course'; value: Course; label: string }
  | { kind: 'cuisine'; value: string; label: string }
  | { kind: 'tag'; value: string; label: string }
  | { kind: 'time'; value: TimeLimit; label: string }
  | { kind: 'rating'; value: MinRating; label: string };

/**
 * The active values that have no quick chip, in the order of the panel's sections: Art,
 * Gerichtart, Küche (with the shown spelling from the facets), Schlagworte, Zeit other than 30,
 * Bewertung.
 */
export function activeFilterChips(
  filter: RecipeListFilter,
  facets: readonly CuisineFacet[],
  tags: readonly CuisineFacet[] = [],
): RecipeFilterChip[] {
  const chips: RecipeFilterChip[] = [
    ...(filter.kind === undefined
      ? []
      : [{ kind: 'kind' as const, value: filter.kind, label: recipeKindLabel(filter.kind) }]),
    ...filter.courses.map((value): RecipeFilterChip => ({
      kind: 'course',
      value,
      label: courseLabel(value),
    })),
    ...filter.cuisines.map((value): RecipeFilterChip => ({
      kind: 'cuisine',
      value,
      label: cuisineLabel(value, facets),
    })),
    ...filter.tags.map((value): RecipeFilterChip => ({
      kind: 'tag',
      value,
      label: cuisineLabel(value, tags),
    })),
  ];
  if (filter.maxMinutes !== undefined && filter.maxMinutes !== 30) {
    chips.push({
      kind: 'time',
      value: filter.maxMinutes,
      label: timeLimitLabel(filter.maxMinutes),
    });
  }
  if (filter.minRating !== undefined) {
    chips.push({
      kind: 'rating',
      value: filter.minRating,
      label: minRatingLabel(filter.minRating),
    });
  }
  return chips;
}

/** ✕ on a chip: takes its value out. */
export function removeFilterChip(
  filter: RecipeListFilter,
  chip: RecipeFilterChip,
): RecipeListFilter {
  switch (chip.kind) {
    case 'kind':
      return { ...filter, kind: undefined };
    case 'course':
      return { ...filter, courses: filter.courses.filter((value) => value !== chip.value) };
    case 'cuisine':
      return { ...filter, cuisines: filter.cuisines.filter((value) => value !== chip.value) };
    case 'tag':
      return { ...filter, tags: filter.tags.filter((value) => value !== chip.value) };
    case 'time':
      return { ...filter, maxMinutes: undefined };
    case 'rating':
      return { ...filter, minRating: undefined };
  }
}

// ---------- Cuisines ----------

/**
 * The key a cuisine is grouped by: trimmed and lower case, nothing else (E13; the spec names only
 * case and outer spaces). "italienisch " → "italienisch".
 */
export function cuisineKey(cuisine: string): string {
  return cuisine.trim().toLowerCase();
}

export interface CuisineFacet {
  key: string;
  /** The most common spelling, on a tie the first from A to Z. */
  label: string;
  /** All items with this cuisine, not only the filtered ones (E13). */
  count: number;
}

/**
 * Distinct values with counts, most first, on a tie A to Z; blank values are left out. The shown
 * spelling is the most common trimmed one, on a tie the first from A to Z.
 */
export function spellingFacets(
  values: readonly string[],
  keyOf: (value: string) => string,
): CuisineFacet[] {
  const groups = new Map<string, Map<string, number>>();
  for (const value of values) {
    const spelling = value.trim();
    const key = keyOf(spelling);
    if (key === '') continue;
    const spellings = groups.get(key) ?? new Map<string, number>();
    spellings.set(spelling, (spellings.get(spelling) ?? 0) + 1);
    groups.set(key, spellings);
  }
  const facets: CuisineFacet[] = [];
  for (const [key, spellings] of groups) {
    let label = '';
    let best = 0;
    let count = 0;
    for (const [spelling, times] of spellings) {
      count += times;
      if (times > best || (times === best && compareText(spelling, label) < 0)) {
        label = spelling;
        best = times;
      }
    }
    facets.push({ key, label, count });
  }
  return facets.sort((a, b) => b.count - a.count || compareText(a.label, b.label));
}

/**
 * The section "Küche" of the filter panel (AC-005, AC-007, AC-009): the cuisines of the given
 * recipes or restaurants. Empty when none has one: then the section is left out.
 */
export function cuisineFacets(items: readonly { cuisine?: string }[]): CuisineFacet[] {
  return spellingFacets(
    items.flatMap((item) => (item.cuisine === undefined ? [] : [item.cuisine])),
    cuisineKey,
  );
}

/** The key a tag is grouped and filtered by (like cleanTags): "Ofen " and "ofen" are one. */
export function tagKey(tag: string): string {
  return normalizeText(tag);
}

/**
 * The section "Schlagworte" of the filter panel (spec 0037, REQ-006): the tags of the given
 * recipes or restaurants with counts, most first. Empty when none has one: then the section is
 * left out (AC-019).
 */
export function tagFacets(items: readonly { tags: readonly string[] }[]): CuisineFacet[] {
  return spellingFacets(
    items.flatMap((item) => item.tags),
    tagKey,
  );
}

/** Whether `tags` carry every chosen tag key (REQ-006). */
export function hasAllTags(tags: readonly string[], chosen: readonly string[]): boolean {
  if (chosen.length === 0) return true;
  const keys = new Set(tags.map(tagKey));
  return chosen.every((key) => keys.has(key));
}

function cuisineLabel(key: string, facets: readonly CuisineFacet[]): string {
  return facets.find((facet) => facet.key === key)?.label ?? key;
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, 'de');
}

// ---------- Filtering ----------

export interface RecipeListContext {
  me: Id;
  /** Current members, for "Passt für alle". */
  members: Member[];
  articlesById: Record<Id, Article>;
  today: ISODate;
  /** All recipes and what each collection contains, for the diet of collections (spec 0009). */
  recipesById: Readonly<Record<Id, Recipe>>;
  collectionRecipes: readonly CollectionRecipe[];
}

/**
 * The recipes that pass every section of the filter, in the given order (REQ-002): the Art; diet,
 * time, own favourites, fits every member and not cooked recently through filterRecipes; one of
 * the chosen courses and cuisines; every chosen tag (spec 0037, REQ-006); the average rating from
 * the threshold on (AC-042). A collection (spec 0037, REQ-004) has the course and cuisine of the
 * recipes it contains (one fitting is enough); an empty one (nothing contained, no own
 * ingredients) fits every course, cuisine and diet. It carries no tags.
 */
export function applyRecipeListFilter(
  recipes: readonly Recipe[],
  filter: RecipeListFilter,
  context: RecipeListContext,
): Recipe[] {
  const basic = filterRecipes(
    [...recipes],
    {
      diet: filter.diet,
      maxMinutes: filter.maxMinutes,
      favoriteOf: filter.favorites ? context.me : undefined,
      fitsAll: filter.fitsAll ? context.members : undefined,
      notCookedSinceDays: filter.rare ? RARELY_COOKED_DAYS : undefined,
    },
    context.articlesById,
    context.today,
    context,
  );
  const cuisines = new Set(filter.cuisines);
  const { minRating } = filter;
  return basic.filter((recipe) => {
    if (filter.kind !== undefined && recipe.kind !== filter.kind) return false;
    if (filter.unfinished && !isUnfinishedRecipe(recipe)) return false;
    const dishes = recipe.kind === 'collection' ? containedRecipes(recipe, context) : [recipe];
    const empty = dishes.length === 0 && recipe.ingredients.length === 0;
    if (filter.courses.length > 0 && !empty) {
      const fits = dishes.some(
        (dish) => dish.course !== undefined && filter.courses.includes(dish.course),
      );
      if (!fits) return false;
    }
    if (cuisines.size > 0 && !empty) {
      if (!dishes.some((dish) => cuisines.has(cuisineKey(dish.cuisine ?? '')))) return false;
    }
    if (!hasAllTags(recipe.tags, filter.tags)) return false;
    if (minRating !== undefined && (averageRating(recipe) ?? 0) < minRating) return false;
    return true;
  });
}

/** The recipes a collection contains, for its course and cuisine (REQ-004). */
function containedRecipes(collection: Recipe, context: RecipeListContext): Recipe[] {
  return contentsInBook(collection, context).map((content) => content.recipe);
}

// ---------- Sorting ----------

export type RecipeListSort = RecipeSort | 'random';

/** The sort menu in this order; "Zuletzt gekocht" is the default (AC-010). */
export const RECIPE_SORTS: readonly { value: RecipeListSort; label: string }[] = [
  { value: 'recent', label: 'Zuletzt gekocht' },
  { value: 'count', label: 'Am häufigsten' },
  { value: 'rating', label: 'Bewertung' },
  { value: 'new', label: 'Neu' },
  { value: 'title', label: 'A–Z' },
  { value: 'random', label: 'Zufall' },
];

export const DEFAULT_RECIPE_SORT: RecipeListSort = 'recent';

/** The text on the sort button, "↕ Zuletzt ▾": the menu label, "Zuletzt" for the default. */
export function recipeSortShortLabel(sort: RecipeListSort): string {
  if (sort === 'recent') return 'Zuletzt';
  return RECIPE_SORTS.find((entry) => entry.value === sort)?.label ?? '';
}

/**
 * A new random order of the ids (Fisher–Yates, E14). `random` returns a number in [0, 1) like
 * Math.random; it is passed in so a shuffle can be repeated in tests.
 */
export function shuffleOrder(ids: readonly Id[], random: () => number): Id[] {
  const order = [...ids];
  for (let index = order.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    const current = order[index];
    const swapped = order[other];
    if (current === undefined || swapped === undefined) continue;
    order[index] = swapped;
    order[other] = current;
  }
  return order;
}

/**
 * The items in the stored random order (AC-011, AC-012): ids that are gone drop out, items that
 * came later go to the end, among themselves A to Z by name.
 */
export function orderByShuffle<T extends { id: Id }>(
  items: readonly T[],
  order: readonly Id[],
  nameOf: (item: T) => string,
): T[] {
  const position = new Map(order.map((id, index) => [id, index]));
  const known = items.filter((item) => position.has(item.id));
  const added = items.filter((item) => !position.has(item.id));
  known.sort((a, b) => (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0));
  added.sort((a, b) => compareText(nameOf(a), nameOf(b)));
  return [...known, ...added];
}

/**
 * "⟳ Neu mischen" stands next to the list only with "Zufall" and no search: a search orders by
 * hit, so mixing would change nothing (spec 0036, AC-002).
 */
export function canReshuffle(sort: RecipeListSort, query: string): boolean {
  return sort === 'random' && query.trim() === '';
}

/** The recipes in the chosen sort; "Zufall" follows the stored order (`shuffle`). */
export function sortRecipeList(
  recipes: readonly Recipe[],
  sort: RecipeListSort,
  shuffle: readonly Id[],
): Recipe[] {
  if (sort === 'random') return orderByShuffle(recipes, shuffle, (recipe) => recipe.title);
  return sortRecipes([...recipes], sort);
}

// ---------- Texts ----------

/** "24 Rezepte", "1 Rezept" (AC-001). */
export function recipeCountLabel(count: number): string {
  return count === 1 ? '1 Rezept' : `${count} Rezepte`;
}

/**
 * The count above the list (spec 0009, Offene Frage 8 A): "24 Rezepte · 2 Sammlungen", only
 * collections "2 Sammlungen", without collections as before "24 Rezepte".
 */
export function recipeListCountLabel(recipes: readonly Pick<Recipe, 'kind'>[]): string {
  const collections = recipes.filter((recipe) => recipe.kind === 'collection').length;
  const plain = recipes.length - collections;
  if (collections === 0) return recipeCountLabel(plain);
  const collectionLabel = collections === 1 ? '1 Sammlung' : `${collections} Sammlungen`;
  return plain === 0 ? collectionLabel : `${recipeCountLabel(plain)} · ${collectionLabel}`;
}

/**
 * The button in the panel's foot, counted like the line over the list (spec 0023, AC-057):
 * "26 Rezepte · 2 Sammlungen zeigen", "13 Rezepte zeigen", "2 Sammlungen zeigen", "0 Rezepte zeigen".
 */
export function recipeShowLabel(recipes: readonly Pick<Recipe, 'kind'>[]): string {
  return `${recipeListCountLabel(recipes)} zeigen`;
}

/**
 * The empty list: "Keine Rezepte für „xyzzy““ for a search (AC-004), else "Keine Rezepte für diese
 * Filter" (AC-008), or with "Unfertig" on and none left "Alle Rezepte sind ausgearbeitet" (spec
 * 0061, AC-009).
 */
export function recipeEmptyLabel(query: string, options: { allWorkedOut?: boolean } = {}): string {
  const shown = query.trim();
  if (shown !== '') return `Keine Rezepte für „${shown}“`;
  return options.allWorkedOut
    ? 'Alle Rezepte sind ausgearbeitet'
    : 'Keine Rezepte für diese Filter';
}

/**
 * The course on a recipe tile ("Hauptgericht", "Dessert", …; spec 0038, AC-007, AC-008): only in
 * the tile view, never for a collection, nothing without a course.
 */
export function tileCourseLabel(recipe: Pick<Recipe, 'kind' | 'course'>): string | undefined {
  if (recipe.kind === 'collection' || recipe.course === undefined) return undefined;
  return courseLabel(recipe.course);
}

/** The average on a tile: one decimal with a comma, rounded half up; "4,8" for 4.75 (AC-040). */
export function formatAverage(value: number): string {
  // The small addend keeps averages like 4.45, stored as 4.4499…, from rounding down.
  return formatQty(Math.round(value * 10 + 1e-9) / 10);
}
