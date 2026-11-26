// Spec 0037: collections in the filter (REQ-004), the time of a collection (REQ-005) and the
// filter by tags (REQ-006).
import { describe, expect, it } from 'vitest';

import {
  activeFilterChips,
  activeFilterCount,
  applyRecipeListFilter,
  EMPTY_RECIPE_LIST_FILTER,
  removeFilterChip,
  tagFacets,
  tagKey,
  timeLimitLabel,
  TIME_LIMITS,
  toggleQuickFilter,
  type RecipeListContext,
  type RecipeListFilter,
} from './recipe-list';
import {
  applyRestaurantListFilter,
  EMPTY_RESTAURANT_LIST_FILTER,
  restaurantFilterChips,
  restaurantFilterCount,
  removeRestaurantFilterChip,
} from './restaurant-list';
import { enrico, grillArticlesById, makeCollection, makeRecipe, nadja } from './test-fixtures';
import type { Article, CollectionRecipe, Recipe, Restaurant } from './types';
import {
  recipeListFromParams,
  recipeListToParams,
  restaurantListFromParams,
  restaurantListToParams,
} from './url-params';

const steakArticle: Article = {
  id: 'art-steak',
  name: 'Rindersteak',
  synonyms: [],
  diet: 'meat',
  isPantry: false,
  defaultShoppingRule: 'count',
  needsReview: false,
  createdAt: '2026-11-01T00:00:00Z',
};
const steak = makeRecipe({
  id: 'rec-steak',
  title: 'Steak',
  course: 'main',
  cuisine: 'Amerikanisch',
  totalMinutes: 20,
  tags: ['Grill'],
  ingredients: [{ id: 's-steak', articleId: 'art-steak', shoppingRule: 'count' }],
});
const salat = makeRecipe({
  id: 'rec-salat',
  title: 'Salat',
  course: 'side',
  tags: ['Ofen', 'Familie'],
  ingredients: [{ id: 's-gurke', articleId: 'art-gurke', shoppingRule: 'count' }],
});
const auflauf = makeRecipe({ id: 'rec-auflauf', title: 'Auflauf', tags: ['ofen '] });
const brot = makeRecipe({ id: 'rec-brot', title: 'Brot', course: 'side', tags: ['Ofen'] });
const leer = makeCollection({ id: 'col-leer', title: 'Grillabend leer' });
const grillabend = makeCollection({ id: 'col-grill', title: 'Grillabend', totalMinutes: 90 });
const rows: CollectionRecipe[] = [
  { id: 'cr-steak', collectionId: grillabend.id, recipeId: steak.id, sort: 0 },
  { id: 'cr-salat', collectionId: grillabend.id, recipeId: salat.id, sort: 1 },
];
const all: Recipe[] = [steak, salat, auflauf, brot, leer, grillabend];
const context: RecipeListContext = {
  me: enrico.id,
  members: [enrico, nadja],
  articlesById: { ...grillArticlesById, [steakArticle.id]: steakArticle },
  today: '2026-11-26',
  recipesById: Object.fromEntries(all.map((recipe) => [recipe.id, recipe])),
  collectionRecipes: rows,
};
const shown = (filter: Partial<RecipeListFilter>) =>
  applyRecipeListFilter(all, { ...EMPTY_RECIPE_LIST_FILTER, ...filter }, context).map(
    (recipe) => recipe.title,
  );

describe('collections in the filter (REQ-004)', () => {
  it('AC-013: an empty collection passes "vegetarisch" and every other diet', () => {
    expect(shown(toggleQuickFilter(EMPTY_RECIPE_LIST_FILTER, 'vegetarian'))).toContain(
      'Grillabend leer',
    );
    expect(shown({ diet: 'vegan' })).toContain('Grillabend leer');
    expect(shown({ fitsAll: true })).toContain('Grillabend leer');
  });

  it('AC-014: with „Steak“ and „Salat“ it is not vegetarian', () => {
    expect(shown({ diet: 'vegetarian' })).not.toContain('Grillabend');
  });

  it('AC-015: „Steak“ is a Hauptgericht, so „Grillabend“ is one', () => {
    expect(shown({ courses: ['main'] })).toEqual([
      'Steak',
      'Auflauf',
      'Grillabend leer',
      'Grillabend',
    ]);
    expect(shown({ courses: ['dessert'] })).toEqual(['Grillabend leer']);
  });

  it('REQ-004: a cuisine of a contained recipe fits the collection; an empty one fits any', () => {
    expect(shown({ cuisines: ['amerikanisch'] })).toEqual([
      'Steak',
      'Grillabend leer',
      'Grillabend',
    ]);
    expect(shown({ cuisines: ['italienisch'] })).toEqual(['Grillabend leer']);
  });
});

describe('the time of a collection (REQ-005)', () => {
  it('AC-016: 90 minutes pass "< 2 Std", not "< 30 Min"', () => {
    expect(TIME_LIMITS).toEqual([15, 30, 60, 120]);
    expect(timeLimitLabel(120)).toBe('< 2 Std');
    expect(shown({ maxMinutes: 120 })).toContain('Grillabend');
    expect(shown({ maxMinutes: 30 })).not.toContain('Grillabend');
  });

  it('AC-016: without a time a collection passes no time filter, also an empty one', () => {
    expect(shown({ maxMinutes: 120 })).not.toContain('Grillabend leer');
  });

  it('AC-016: "< 2 Std" stands in the address as dauer=120', () => {
    const params = recipeListToParams({
      query: '',
      sort: 'recent',
      filter: { ...EMPTY_RECIPE_LIST_FILTER, maxMinutes: 120 },
    });
    expect(params.dauer).toBe('120');
    expect(recipeListFromParams(params).filter.maxMinutes).toBe(120);
  });
});

describe('tags in the filter (REQ-006)', () => {
  it('AC-018: "Ofen" shows only the recipes with "Ofen", any spelling; the button counts 1', () => {
    const facets = tagFacets(all);
    expect(facets.map((facet) => [facet.label, facet.count])).toEqual([
      ['Ofen', 3],
      ['Familie', 1],
      ['Grill', 1],
    ]);
    const filter = { ...EMPTY_RECIPE_LIST_FILTER, tags: [tagKey('Ofen')] };
    expect(shown(filter)).toEqual(['Salat', 'Auflauf', 'Brot']);
    expect(activeFilterCount(filter)).toBe(1);
    const chips = activeFilterChips(filter, [], facets);
    expect(chips).toEqual([{ kind: 'tag', value: 'ofen', label: 'Ofen' }]);
    const [chip] = chips;
    expect(chip && removeFilterChip(filter, chip).tags).toEqual([]);
  });

  it('REQ-006: several tags: a recipe passes only with all of them', () => {
    expect(shown({ tags: ['ofen', 'familie'] })).toEqual(['Salat']);
  });

  it('AC-019: without any tag the section has nothing to show', () => {
    expect(tagFacets([makeRecipe({ id: 'r', title: 'Dal' })])).toEqual([]);
  });

  it('REQ-006: the tags stand in the address like the other filters', () => {
    const params = recipeListToParams({
      query: '',
      sort: 'recent',
      filter: { ...EMPTY_RECIPE_LIST_FILTER, tags: ['ofen', 'familie'] },
    });
    expect(params.schlagwort).toEqual(['ofen', 'familie']);
    expect(recipeListFromParams(params).filter.tags).toEqual(['ofen', 'familie']);
  });

  it('REQ-006: restaurants too', () => {
    const restaurant = (id: string, tags: string[]): Restaurant => ({
      id,
      name: id,
      tags,
      favoriteOf: [],
      ratings: {},
      createdAt: '2026-11-01T00:00:00Z',
    });
    const list = [restaurant('Enzo', ['Terrasse', 'Familie']), restaurant('Sushi', ['Familie'])];
    const filter = { ...EMPTY_RESTAURANT_LIST_FILTER, tags: ['familie', 'terrasse'] };
    expect(applyRestaurantListFilter(list, filter, enrico.id).map((entry) => entry.name)).toEqual([
      'Enzo',
    ]);
    expect(restaurantFilterCount(filter)).toBe(2);
    const facets = tagFacets(list);
    const chips = restaurantFilterChips(filter, [], facets);
    expect(chips.map((chip) => chip.label)).toEqual(['Familie', 'Terrasse']);
    const [chip] = chips;
    expect(chip && removeRestaurantFilterChip(filter, chip).tags).toEqual(['terrasse']);
    const params = restaurantListToParams({ query: '', sort: 'title', filter });
    expect(params.schlagwort).toEqual(['familie', 'terrasse']);
    expect(restaurantListFromParams(params).filter.tags).toEqual(['familie', 'terrasse']);
  });
});
