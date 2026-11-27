import { describe, expect, it } from 'vitest';

import { planEntryPhoto } from './plan-entry-photo';
import { makeCollection, makeRecipe } from './test-fixtures';
import type { Activity, MealPlanEntry, Restaurant } from './types';

const entry = (partial: Partial<MealPlanEntry>): MealPlanEntry => ({
  id: 'e1',
  date: '2026-11-27',
  slotId: 'abend',
  kind: 'recipe',
  eaterIds: [],
  guests: 0,
  portions: 2,
  variants: [],
  sort: 0,
  ...partial,
});

const amrit: Restaurant = {
  id: 'x1',
  name: 'AMRIT',
  photoPath: 'h1/restaurants/x1.jpg',
  tags: [],
  favoriteOf: [],
  ratings: {},
  createdAt: '2026-11-20T10:00:00Z',
};
const eislaufen: Activity = {
  id: 'a1',
  name: 'Eislaufen',
  photoPath: 'h1/activities/a1.jpg',
  favoriteOf: [],
  ratings: {},
  remembered: false,
  createdAt: '2026-11-20T10:00:00Z',
};
const mangoCurry = makeRecipe({ id: 'r1', title: 'Mango-Curry', photoPath: 'h1/recipes/r1.jpg' });
const sample = makeRecipe({ id: 'r2', title: 'Shakshuka', photo: 'shakshuka' });
const plain = makeRecipe({ id: 'r3', title: 'Lasagne' });
const grillabend = makeCollection({ id: 'c1', title: 'Grillabend' });

const lookups = {
  recipesById: { r1: mangoCurry, r2: sample, r3: plain, c1: grillabend },
  restaurantsById: { x1: amrit, x2: { ...amrit, id: 'x2', photoPath: undefined } },
  activitiesById: { a1: eislaufen, a2: { ...eislaufen, id: 'a2', photoPath: undefined } },
};

describe('planEntryPhoto (spec 0047, REQ-004)', () => {
  it('AC-014: a restaurant with its own photo shows that photo (16:9)', () => {
    expect(planEntryPhoto(entry({ kind: 'restaurant', restaurantId: 'x1' }), lookups)).toEqual({
      kind: 'place',
      photoPath: 'h1/restaurants/x1.jpg',
      name: 'AMRIT',
    });
  });

  it('AC-014: an activity with its own photo shows that photo', () => {
    expect(planEntryPhoto(entry({ kind: 'activity', activityId: 'a1' }), lookups)).toEqual({
      kind: 'place',
      photoPath: 'h1/activities/a1.jpg',
      name: 'Eislaufen',
    });
  });

  it('AC-015: a recipe with its own or a sample photo and a collection show their cover', () => {
    expect(planEntryPhoto(entry({ recipeId: 'r1' }), lookups)).toEqual({
      kind: 'recipe',
      recipe: mangoCurry,
    });
    expect(planEntryPhoto(entry({ recipeId: 'r2' }), lookups)).toEqual({
      kind: 'recipe',
      recipe: sample,
    });
    // The collage of its recipes is decided where the contents are known.
    expect(planEntryPhoto(entry({ recipeId: 'c1' }), lookups)).toEqual({
      kind: 'recipe',
      recipe: grillabend,
    });
  });

  it('AC-016: no photo, a text entry, leftovers or a missing item give nothing', () => {
    expect(planEntryPhoto(entry({ recipeId: 'r3' }), lookups)).toBeUndefined();
    expect(
      planEntryPhoto(entry({ kind: 'restaurant', restaurantId: 'x2' }), lookups),
    ).toBeUndefined();
    expect(planEntryPhoto(entry({ kind: 'activity', activityId: 'a2' }), lookups)).toBeUndefined();
    expect(planEntryPhoto(entry({ kind: 'text', text: 'Essen bei Oma' }), lookups)).toBeUndefined();
    expect(
      planEntryPhoto(entry({ kind: 'leftovers', leftoversOfEntryId: 'e0' }), lookups),
    ).toBeUndefined();
    expect(planEntryPhoto(entry({ recipeId: 'gone' }), lookups)).toBeUndefined();
    expect(
      planEntryPhoto(entry({ kind: 'restaurant', restaurantId: 'gone' }), lookups),
    ).toBeUndefined();
  });
});
