import { describe, expect, it } from 'vitest';

import { cookingHistory, withCookingHistory } from './cooking-history';
import { applyRecipeListFilter, EMPTY_RECIPE_LIST_FILTER, toggleQuickFilter } from './recipe-list';
import {
  enrico,
  grillabend,
  grillabendRecipes,
  grillArticlesById,
  grillgemuese,
  grillRecipesById,
  kartoffelsalat,
  tzatziki,
} from './test-fixtures';
import type { MealPlanEntry } from './types';

// Spec 0009, E10 (Offene Frage 2 A and 3 A): what the calendar says was cooked.

function entry(partial: Partial<MealPlanEntry> & Pick<MealPlanEntry, 'id'>): MealPlanEntry {
  return {
    date: '2026-11-21',
    slotId: 'slot-abend',
    kind: 'recipe',
    recipeId: grillabend.id,
    eaterIds: [],
    guests: 0,
    portions: 3,
    variants: [],
    sort: 0,
    ...partial,
  };
}

const salatOktober = { ...kartoffelsalat, lastCookedOn: '2026-10-01', cookedCount: 4 };
const saturday = entry({ id: 'plan-grill' });

describe('E10: cooked according to the calendar', () => {
  it('AC-031: the Grillabend of Saturday counts for Kartoffelsalat from 21.11. on', () => {
    const history = cookingHistory([saturday], grillabendRecipes, '2026-11-21');
    expect(history[kartoffelsalat.id]).toEqual({ lastCookedOn: '2026-11-21', count: 1 });
    expect(history[grillgemuese.id]).toEqual({ lastCookedOn: '2026-11-21', count: 1 });
    expect(history[grillabend.id]).toEqual({ lastCookedOn: '2026-11-21', count: 1 });
    expect(history[tzatziki.id]).toBeUndefined();

    const [salat] = withCookingHistory([salatOktober], history);
    expect(salat).toMatchObject({ lastCookedOn: '2026-11-21', cookedCount: 5 });
  });

  it('AC-031: then "Lange nicht gekocht" no longer shows Kartoffelsalat', () => {
    const recipes = withCookingHistory(
      [salatOktober, tzatziki],
      cookingHistory([saturday], grillabendRecipes, '2026-11-21'),
    );
    const rare = applyRecipeListFilter(
      recipes,
      toggleQuickFilter(EMPTY_RECIPE_LIST_FILTER, 'rare'),
      {
        me: enrico.id,
        members: [enrico],
        articlesById: grillArticlesById,
        today: '2026-11-21',
        recipesById: grillRecipesById,
        collectionRecipes: grillabendRecipes,
      },
    );
    expect(rare.map((recipe) => recipe.title)).toEqual(['Tzatziki']);
  });

  it('AC-031: "Nicht gemacht" takes the entry back out', () => {
    const history = cookingHistory(
      [{ ...saturday, notCooked: true }],
      grillabendRecipes,
      '2026-11-21',
    );
    expect(history).toEqual({});
    expect(withCookingHistory([salatOktober], history)).toEqual([salatOktober]);
  });

  it('entries after today and those without a day do not count', () => {
    expect(cookingHistory([saturday], grillabendRecipes, '2026-11-20')).toEqual({});
    expect(
      cookingHistory([entry({ id: 'parked', date: null })], grillabendRecipes, '2026-11-21'),
    ).toEqual({});
  });

  it('free text, leftovers, restaurants and activities count for no recipe', () => {
    const others = [
      entry({ id: 'text', kind: 'text', recipeId: undefined, text: 'Pizza' }),
      entry({ id: 'rest', kind: 'leftovers', leftoversOfEntryId: 'plan-grill' }),
      entry({ id: 'enzo', kind: 'restaurant', recipeId: undefined, restaurantId: 'enzo' }),
    ];
    expect(cookingHistory(others, grillabendRecipes, '2026-11-21')).toEqual({});
  });

  it('counts every entry and keeps the latest day; a stored later day stays', () => {
    const entries = [
      entry({ id: 'a', date: '2026-11-14', recipeId: kartoffelsalat.id }),
      entry({ id: 'b', date: '2026-11-07', recipeId: kartoffelsalat.id }),
      saturday,
    ];
    const history = cookingHistory(entries, grillabendRecipes, '2026-11-21');
    expect(history[kartoffelsalat.id]).toEqual({ lastCookedOn: '2026-11-21', count: 3 });

    const stored = { ...kartoffelsalat, lastCookedOn: '2026-12-01', cookedCount: 1 };
    expect(withCookingHistory([stored], history)[0]).toMatchObject({
      lastCookedOn: '2026-12-01',
      cookedCount: 4,
    });
  });

  it('a collection counts for the recipes it contains today', () => {
    const history = cookingHistory([saturday], grillabendRecipes.slice(0, 1), '2026-11-21');
    expect(history[kartoffelsalat.id]?.count).toBe(1);
    expect(history[grillgemuese.id]).toBeUndefined();
  });
});
