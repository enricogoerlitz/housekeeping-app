// Spec 0061: unfinished recipes — what counts (REQ-001), the quick chip "Unfertig" (REQ-002), the
// counter over the list (REQ-003) and "Weiter zum nächsten" (REQ-005).
import { describe, expect, it } from 'vitest';

import {
  activeFilterCount,
  applyRecipeListFilter,
  EMPTY_RECIPE_LIST_FILTER,
  isQuickFilterActive,
  recipeEmptyLabel,
  shownQuickFilters,
  toggleQuickFilter,
  type RecipeListContext,
} from './recipe-list';
import { articlesById, enrico, makeCollection, makeRecipe, nadja } from './test-fixtures';
import type { Recipe, RecipeIngredient } from './types';
import {
  isUnfinishedRecipe,
  nextUnfinished,
  unfinishedCount,
  unfinishedListLabel,
  unfinishedOthersLabel,
  workedOutLabel,
} from './unfinished-recipes';
import { readPageParams, recipeListFromParams, recipeListToParams } from './url-params';

const flour: RecipeIngredient = { id: 'i-mehl', articleId: 'art-mehl', shoppingRule: 'count' };

const titleOnly = (id: string, title: string, rest: Partial<Recipe> = {}): Recipe =>
  makeRecipe({ id, title, ...rest });
const done = (id: string, title: string): Recipe => makeRecipe({ id, title, ingredients: [flour] });

const context: RecipeListContext = {
  me: enrico.id,
  members: [enrico, nadja],
  articlesById,
  today: '2026-11-27',
  recipesById: {},
  collectionRecipes: [],
};

describe('REQ-001: what is unfinished', () => {
  it('AC-001: a recipe without ingredients and without steps is unfinished', () => {
    expect(isUnfinishedRecipe(titleOnly('r-dal', 'Linsen-Dal'))).toBe(true);
  });

  it('AC-002: steps or ingredients make a recipe not unfinished', () => {
    const pancakes = makeRecipe({
      id: 'r-pfannkuchen',
      title: 'Pfannkuchen',
      steps: [
        { id: 's1', text: 'Teig rühren' },
        { id: 's2', text: 'Backen' },
        { id: 's3', text: 'Servieren' },
      ],
    });
    expect(isUnfinishedRecipe(pancakes)).toBe(false);
    expect(isUnfinishedRecipe(done('r-salat', 'Salat'))).toBe(false);
  });

  it('AC-003: a collection, even an empty one, is never unfinished', () => {
    expect(isUnfinishedRecipe(makeCollection({ id: 'c-sommerfest', title: 'Sommerfest' }))).toBe(
      false,
    );
  });

  it('AC-004: a photo, a link and a description do not finish a recipe', () => {
    const potatoes = titleOnly('r-lifts', 'Lifts Potatos', {
      photoPath: 'hh/r-lifts.jpg',
      description: 'Von TikTok',
      links: [{ url: 'https://www.tiktok.com/@koch/video/1' }],
    });
    expect(isUnfinishedRecipe(potatoes)).toBe(true);
  });

  it('counts the unfinished recipes of a list', () => {
    const recipes = [titleOnly('a', 'A'), done('b', 'B'), titleOnly('c', 'C')];
    expect(unfinishedCount(recipes)).toBe(2);
    expect(unfinishedCount([])).toBe(0);
  });
});

describe('REQ-002: the quick chip "Unfertig"', () => {
  const recipes = [
    titleOnly('r-apfel', 'Apfelstrudel'),
    done('r-lasagne', 'Lasagne'),
    titleOnly('r-bami', 'Bami Goreng'),
    makeCollection({ id: 'c-fest', title: 'Sommerfest' }),
  ];

  it('AC-005: the chip shows the number and filters on the unfinished recipes', () => {
    const chip = shownQuickFilters(EMPTY_RECIPE_LIST_FILTER, 3).at(-1);
    expect(chip).toEqual({ value: 'unfinished', label: 'Unfertig (3)' });
    const filter = toggleQuickFilter(EMPTY_RECIPE_LIST_FILTER, 'unfinished');
    expect(isQuickFilterActive(filter, 'unfinished')).toBe(true);
    expect(applyRecipeListFilter(recipes, filter, context).map((recipe) => recipe.id)).toEqual([
      'r-apfel',
      'r-bami',
    ]);
    expect(recipeListToParams({ query: '', filter, sort: 'recent' }).unfertig).toBe('1');
  });

  it('AC-006: without unfinished recipes the chip is left out while it is off', () => {
    const values = shownQuickFilters(EMPTY_RECIPE_LIST_FILTER, 0).map((chip) => chip.value);
    expect(values).not.toContain('unfinished');
    expect(values).toEqual(['favorites', 'fast', 'vegetarian', 'vegan', 'fitsAll', 'rare']);
  });

  it('AC-007: "Unfertig" and "Vegan" count as two filters', () => {
    const filter = toggleQuickFilter(
      toggleQuickFilter(EMPTY_RECIPE_LIST_FILTER, 'unfinished'),
      'vegan',
    );
    expect(activeFilterCount(filter)).toBe(2);
    expect(toggleQuickFilter(filter, 'unfinished').unfinished).toBe(false);
  });

  it('AC-008: "unfertig=1" in the address turns the filter on, and back', () => {
    const read = readPageParams('rezepte', { unfertig: '1' });
    expect(read.invalid).toEqual([]);
    const state = recipeListFromParams(read.values);
    expect(state.filter.unfinished).toBe(true);
    expect(recipeListToParams(state).unfertig).toBe('1');
    expect(recipeListFromParams({}).filter.unfinished).toBe(false);
    expect(recipeListToParams(recipeListFromParams({})).unfertig).toBeUndefined();
  });

  it('AC-009 (geändert 27.11.): with the filter on and nothing left, the chip stays with 0 and the list has no "all done" text', () => {
    const filter = toggleQuickFilter(EMPTY_RECIPE_LIST_FILTER, 'unfinished');
    expect(shownQuickFilters(filter, 0).at(-1)).toEqual({
      value: 'unfinished',
      label: 'Unfertig (0)',
    });
    expect(recipeEmptyLabel('')).toBe('Keine Rezepte für diese Filter');
    expect(recipeEmptyLabel('dal')).toBe('Keine Rezepte für „dal“');
  });
});

describe('REQ-003, REQ-005: the texts', () => {
  it('AC-010: the counter over the list', () => {
    expect(unfinishedListLabel(3)).toBe('Noch 3 unfertig');
    expect(unfinishedListLabel(1)).toBe('Noch 1 unfertig');
  });

  it('AC-017: after saving, the ones left', () => {
    expect(workedOutLabel(2)).toBe('Ausgearbeitet · noch 2 unfertig');
    expect(workedOutLabel(1)).toBe('Ausgearbeitet · noch 1 unfertig');
  });

  it('AC-020 (geändert 27.11.): after saving the last one there is no text, the card goes away', () => {
    expect(workedOutLabel(0)).toBeUndefined();
  });

  it('AC-018: on an unfinished recipe, the others', () => {
    expect(unfinishedOthersLabel(2)).toBe('Noch 2 weitere unfertig');
    expect(unfinishedOthersLabel(1)).toBe('Noch 1 weiteres unfertig');
    expect(unfinishedOthersLabel(0)).toBeUndefined();
  });
});

describe('REQ-005: the next unfinished recipe', () => {
  const apfel = titleOnly('r-apfel', 'Apfelstrudel');
  const bami = titleOnly('r-bami', 'Bami Goreng');
  const chili = titleOnly('r-chili', 'Chili');
  const order = ['r-apfel', 'r-bami', 'r-chili'];

  it('AC-017: after the saved one comes the next of the list', () => {
    const recipes = [done('r-apfel', 'Apfelstrudel'), bami, chili];
    expect(nextUnfinished(recipes, order, 'r-apfel')).toEqual({ next: 'r-bami', remaining: 2 });
  });

  it('AC-018: skipping keeps the skipped one unfinished and counts it', () => {
    expect(nextUnfinished([apfel, bami, chili], order, 'r-bami')).toEqual({
      next: 'r-chili',
      remaining: 2,
    });
  });

  it('AC-019: after the last of the order it starts from the front', () => {
    const recipes = [done('r-apfel', 'Apfelstrudel'), bami, done('r-chili', 'Chili')];
    expect(nextUnfinished(recipes, order, 'r-chili')).toEqual({ next: 'r-bami', remaining: 1 });
  });

  it('AC-020: nothing left after the last one', () => {
    const recipes = [done('r-apfel', 'Apfelstrudel'), done('r-chili', 'Chili')];
    expect(nextUnfinished(recipes, order, 'r-chili')).toEqual({ next: undefined, remaining: 0 });
    // The only unfinished one is the open page itself: nothing to go on to.
    expect(nextUnfinished([chili], order, 'r-chili')).toEqual({ next: undefined, remaining: 0 });
  });

  it('AC-021: without a list A–Z', () => {
    const recipes = [chili, bami, apfel];
    expect(nextUnfinished(recipes, undefined, 'r-chili')).toEqual({
      next: 'r-apfel',
      remaining: 2,
    });
    expect(nextUnfinished(recipes, undefined, 'r-apfel')).toEqual({
      next: 'r-bami',
      remaining: 2,
    });
  });

  it('AC-022: a recipe finished elsewhere is skipped and not counted', () => {
    const recipes = [apfel, done('r-bami', 'Bami Goreng'), chili];
    expect(nextUnfinished(recipes, order, 'r-apfel')).toEqual({ next: 'r-chili', remaining: 1 });
  });

  it('unfinished recipes outside the order follow it A–Z; gone ids drop out', () => {
    const dal = titleOnly('r-dal', 'Dal');
    const auflauf = titleOnly('r-auflauf', 'Auflauf');
    const recipes = [apfel, dal, auflauf];
    expect(nextUnfinished(recipes, ['r-gone', 'r-apfel'], 'r-apfel')).toEqual({
      next: 'r-auflauf',
      remaining: 2,
    });
    expect(nextUnfinished(recipes, ['r-apfel'], 'r-auflauf')).toEqual({
      next: 'r-dal',
      remaining: 2,
    });
  });

  it('collections are never next', () => {
    const recipes = [apfel, makeCollection({ id: 'c-fest', title: 'Fest' })];
    expect(nextUnfinished(recipes, ['r-apfel', 'c-fest'], 'r-apfel')).toEqual({
      next: undefined,
      remaining: 0,
    });
  });
});
