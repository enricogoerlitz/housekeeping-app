import { describe, expect, it } from 'vitest';

import {
  averageRating,
  courseLabel,
  filterRecipes,
  ingredientLine,
  searchRecipes,
  sortRecipes,
  stepsForVariants,
} from './recipes';
import {
  articlesById,
  bolognese,
  enrico,
  halloumiPfanne,
  makeRecipe,
  mangoCurry,
  nadja,
} from './test-fixtures';
import type { RecipeBook } from './collections';
import type { Recipe, RecipeIngredient } from './types';

const recipes = [mangoCurry, bolognese, halloumiPfanne];
const titles = (list: Recipe[]): string[] => list.map((recipe) => recipe.title);
const today = '2026-11-20';
const noCollections: RecipeBook = { recipesById: {}, collectionRecipes: [] };

describe('searchRecipes', () => {
  it('AC-019: "halumi" finds Halloumi-Pfanne despite the typo', () => {
    expect(titles(searchRecipes('halumi', recipes, articlesById))).toEqual(['Halloumi-Pfanne']);
  });

  it('AC-019: "Karotten" finds recipes with the article Möhren', () => {
    expect(titles(searchRecipes('Karotten', recipes, articlesById))).toEqual([
      'Spaghetti Bolognese',
    ]);
  });

  it('requires every word to match and lists title hits first', () => {
    const withTofuInNotes = makeRecipe({ id: 'r', title: 'Bowl', notes: 'mit Tofu und Mango' });
    const tofuCurry = makeRecipe({ id: 't', title: 'Tofu-Curry' });
    const list = [withTofuInNotes, mangoCurry, tofuCurry];
    expect(titles(searchRecipes('tofu', list, articlesById))).toEqual([
      'Tofu-Curry',
      'Bowl',
      'Mango-Curry',
    ]);
    expect(titles(searchRecipes('tofu mango', list, articlesById))).toEqual([
      'Bowl',
      'Mango-Curry',
    ]);
    expect(searchRecipes('tofu lachs', list, articlesById)).toEqual([]);
  });

  it('searches tags and description too', () => {
    expect(titles(searchRecipes('klassiker', recipes, articlesById))).toEqual([
      'Spaghetti Bolognese',
    ]);
  });

  it('returns all recipes in the given order for an empty query', () => {
    expect(searchRecipes('  ', recipes, articlesById)).toEqual(recipes);
  });
});

describe('filterRecipes', () => {
  it('AC-018: the vegetarian filter keeps Mango-Curry and drops Spaghetti Bolognese', () => {
    const result = titles(
      filterRecipes(recipes, { diet: 'vegetarian' }, articlesById, today, noCollections),
    );
    expect(result).toContain('Mango-Curry');
    expect(result).not.toContain('Spaghetti Bolognese');
  });

  it('filters by maximum duration; recipes without duration do not pass', () => {
    const untimed = makeRecipe({ id: 'u', title: 'Ohne Zeit' });
    expect(
      titles(
        filterRecipes(
          [...recipes, untimed],
          { maxMinutes: 25 },
          articlesById,
          today,
          noCollections,
        ),
      ),
    ).toEqual(['Mango-Curry', 'Halloumi-Pfanne']);
  });

  it('filters by course and favourite', () => {
    const dessert = makeRecipe({ id: 'd', title: 'Pudding', course: 'dessert' });
    const fav = { ...bolognese, favoriteOf: [enrico.id] };
    expect(
      titles(
        filterRecipes([dessert, fav], { course: 'dessert' }, articlesById, today, noCollections),
      ),
    ).toEqual(['Pudding']);
    expect(
      titles(
        filterRecipes(
          [dessert, fav],
          { favoriteOf: enrico.id },
          articlesById,
          today,
          noCollections,
        ),
      ),
    ).toEqual(['Spaghetti Bolognese']);
  });

  it('keeps only recipes every listed member can eat', () => {
    expect(
      titles(
        filterRecipes(recipes, { fitsAll: [enrico, nadja] }, articlesById, today, noCollections),
      ),
    ).toEqual(['Mango-Curry', 'Halloumi-Pfanne']);
  });

  it('drops recipes cooked within the last n days and keeps never cooked ones', () => {
    const recent = { ...mangoCurry, lastCookedOn: '2026-11-10' };
    const old = { ...bolognese, lastCookedOn: '2026-10-01' };
    expect(
      titles(
        filterRecipes(
          [recent, old, halloumiPfanne],
          { notCookedSinceDays: 21 },
          articlesById,
          today,
          noCollections,
        ),
      ),
    ).toEqual(['Spaghetti Bolognese', 'Halloumi-Pfanne']);
  });

  it('returns everything for an empty filter', () => {
    expect(filterRecipes(recipes, {}, articlesById, today, noCollections)).toEqual(recipes);
  });
});

describe('sortRecipes', () => {
  const a = makeRecipe({
    id: 'a',
    title: 'Apfelkuchen',
    lastCookedOn: '2026-11-01',
    createdAt: '2026-09-01T12:00:00.000Z',
    ratings: { x: 3 },
    cookedCount: 2,
  });
  const b = makeRecipe({
    id: 'b',
    title: 'Bratkartoffeln',
    lastCookedOn: '2026-11-15',
    createdAt: '2026-10-01T12:00:00.000Z',
    ratings: { x: 5, y: 4 },
    cookedCount: 7,
  });
  const c = makeRecipe({ id: 'c', title: 'Couscous', createdAt: 'kaputt' });

  it('sorts by last cooked first, never cooked last', () => {
    expect(titles(sortRecipes([c, a, b], 'recent'))).toEqual([
      'Bratkartoffeln',
      'Apfelkuchen',
      'Couscous',
    ]);
  });

  it('sorts by newest; an unreadable creation date counts as oldest', () => {
    expect(titles(sortRecipes([a, c, b], 'new'))).toEqual([
      'Bratkartoffeln',
      'Apfelkuchen',
      'Couscous',
    ]);
  });

  it('sorts by average rating (unrated last), by count and by title', () => {
    expect(titles(sortRecipes([c, a, b], 'rating'))).toEqual([
      'Bratkartoffeln',
      'Apfelkuchen',
      'Couscous',
    ]);
    expect(titles(sortRecipes([a, c, b], 'count'))).toEqual([
      'Bratkartoffeln',
      'Apfelkuchen',
      'Couscous',
    ]);
    expect(titles(sortRecipes([c, b, a], 'title'))).toEqual([
      'Apfelkuchen',
      'Bratkartoffeln',
      'Couscous',
    ]);
  });

  it('breaks ties by title and does not change the input', () => {
    const z = makeRecipe({ id: 'z', title: 'Zucchini', cookedCount: 7 });
    const input = [z, b];
    expect(titles(sortRecipes(input, 'count'))).toEqual(['Bratkartoffeln', 'Zucchini']);
    expect(input[0]).toBe(z);
  });
});

describe('recipe helpers', () => {
  it('averages the members’ ratings, undefined when unrated', () => {
    expect(averageRating({ ...mangoCurry, ratings: { a: 5, b: 4 } })).toBe(4.5);
    expect(averageRating(mangoCurry)).toBeUndefined();
  });

  it('returns shared steps plus those of the chosen variants', () => {
    expect(stepsForVariants(mangoCurry, ['v-tofu']).map((step) => step.id)).toEqual([
      's-1',
      's-tofu',
      's-2',
    ]);
    expect(stepsForVariants(mangoCurry)).toHaveLength(4);
    expect(stepsForVariants(mangoCurry, []).map((step) => step.id)).toEqual(['s-1', 's-2']);
  });

  it('has German course labels', () => {
    expect(courseLabel('main')).toBe('Hauptgericht');
    expect(courseLabel('breakfast')).toBe('Frühstück');
  });
});

describe('ingredientLine', () => {
  it('AC-011: shows the Hinweis after the article name', () => {
    expect(
      ingredientLine({ amount: { text: '2', qty: 2 }, prepNote: 'fein gehackt' }, 'Zwiebeln'),
    ).toBe('2 Zwiebeln · fein gehackt');
  });

  it('AC-013: 4 → 8 portions scales the amount and keeps the Hinweis', () => {
    const zwiebeln = { amount: { text: '2', qty: 2 }, prepNote: 'fein gehackt' };
    const linsen = { amount: { text: '150 g', qty: 150, unit: 'g' } };
    expect(ingredientLine(zwiebeln, 'Zwiebeln', 2)).toBe('4 Zwiebeln · fein gehackt');
    expect(ingredientLine(linsen, 'Rote Linsen', 2)).toBe('300 g Rote Linsen');
  });

  it('AC-013: an empty or blank Hinweis adds no "·"', () => {
    expect(ingredientLine({ amount: { text: '1', qty: 1 }, prepNote: '  ' }, 'Mango')).toBe(
      '1 Mango',
    );
    expect(ingredientLine({ prepNote: '' }, 'Salz')).toBe('Salz');
  });

  it('AC-012: the Einkaufs-Zusatz is not part of the line, the Hinweis is', () => {
    const frischkaese: RecipeIngredient = {
      id: 'i-frischkaese',
      articleId: 'art-frischkaese',
      amount: { text: '200 g', qty: 200, unit: 'g' },
      shoppingRule: 'count',
      shoppingNote: 'Philadelphia',
      prepNote: 'zimmerwarm',
    };
    expect(ingredientLine(frischkaese, 'Frischkäse')).toBe('200 g Frischkäse · zimmerwarm');
  });
});
