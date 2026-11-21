// Ratings in half steps (spec 0011, REQ-004) for recipes, restaurants and activities: the value
// goes unrounded to the per-member RPC, an invalid one is refused before anything is sent, and
// the time of the own rating (ratedAt) shows at once and comes from the server afterwards.
import { describe, expect, it } from 'vitest';

import { H, TODAY, withBackend } from './backend-test-helpers';
import { rateActivity } from './commands-activities';
import { updatePlanEntry } from './commands-plan';
import { rateRecipe } from './commands-recipes';
import { rateRestaurant } from './commands-restaurants';
import { ENRICO, NADJA } from './seed/demo';
import { getData, OfflineError } from './store';

const fx = withBackend();

const unratedRecipe = () => {
  const recipe = getData().recipes.find((candidate) => candidate.ratings[ENRICO] === undefined);
  if (!recipe) throw new Error('fixture');
  return recipe;
};

describe('spec 0011: ratings in half steps', () => {
  it('AC-017: 4,5 stars go to the server as 4.5 and Nadja sees 4,5', async () => {
    await fx.startEnrico();
    const nadja = await fx.startNadja();
    const recipe = unratedRecipe();
    rateRecipe(recipe.id, 4.5);
    rateRestaurant('rest-enzo', 0.5);
    rateActivity('act-bouldern', 3.5);
    await fx.settle(nadja);
    expect(fx.calls).toEqual([
      { fn: 'setRecipeRating', args: [recipe.id, 4.5] },
      { fn: 'setRestaurantRating', args: ['rest-enzo', 0.5] },
      { fn: 'setActivityRating', args: ['act-bouldern', 3.5] },
    ]);
    const seen = fx.nadjaData(nadja);
    expect(seen.recipes.find((r) => r.id === recipe.id)?.ratings[ENRICO]).toBe(4.5);
    expect(seen.restaurants.find((r) => r.id === 'rest-enzo')?.ratings[ENRICO]).toBe(0.5);
    expect(seen.activities.find((a) => a.id === 'act-bouldern')?.ratings[ENRICO]).toBe(3.5);
  });

  it('AC-026: 4,3 · 4,25 · 0 · 5,5 · −1 · NaN are refused without sending; the old value stays', async () => {
    await fx.startEnrico();
    const recipe = unratedRecipe();
    for (const stars of [4.3, 4.25, 0, 5.5, -1, Number.NaN]) {
      expect(() => rateRecipe(recipe.id, stars)).toThrow();
      expect(() => rateRestaurant('rest-enzo', stars)).toThrow();
      expect(() => rateActivity('act-bouldern', stars)).toThrow();
    }
    await fx.settle();
    expect(fx.calls).toEqual([]);
    expect(getData().recipes.find((r) => r.id === recipe.id)?.ratings[ENRICO]).toBeUndefined();
  });

  it('AC-020: the time of the own rating shows at once and is the server time afterwards; the same value counts again', async () => {
    await fx.startEnrico();
    const recipe = unratedRecipe();
    rateRecipe(recipe.id, 5);
    const local = getData().recipes.find((r) => r.id === recipe.id)?.ratedAt?.[ENRICO];
    expect(local?.slice(0, 10)).toBe(TODAY);
    await fx.settle();
    const first = fx.server.row(H, 'recipe_ratings', `${recipe.id}:${ENRICO}`)?.updated_at;
    expect(getData().recipes.find((r) => r.id === recipe.id)?.ratedAt?.[ENRICO]).toBe(first);

    rateRecipe(recipe.id, 5);
    await fx.settle();
    const second = fx.server.row(H, 'recipe_ratings', `${recipe.id}:${ENRICO}`)?.updated_at;
    expect(fx.calls).toHaveLength(2);
    expect(String(second) > String(first)).toBe(true);
    expect(getData().recipes.find((r) => r.id === recipe.id)?.ratedAt?.[ENRICO]).toBe(second);
  });

  it('AC-021: "Nicht gemacht" marks the plan entry, also for Nadja', async () => {
    await fx.startEnrico();
    const nadja = await fx.startNadja();
    const entry = getData().planEntries.find(
      (candidate) => candidate.kind === 'activity' && candidate.date !== null,
    );
    if (!entry) throw new Error('fixture');
    updatePlanEntry(entry.id, { notCooked: true });
    await fx.settle(nadja);
    expect(fx.nadjaData(nadja).planEntries.find((e) => e.id === entry.id)?.notCooked).toBe(true);
  });

  it('AC-023: rating is refused offline', async () => {
    await fx.startEnrico();
    const recipe = unratedRecipe();
    fx.environment.setOnline(false);
    expect(() => rateRecipe(recipe.id, 4.5)).toThrow(OfflineError);
    expect(() => rateRestaurant('rest-enzo', 4.5)).toThrow(OfflineError);
    expect(() => rateActivity('act-bouldern', 4.5)).toThrow(OfflineError);
  });

  it('AC-027: a rating is per member: Nadja keeps hers when Enrico rates', async () => {
    await fx.startEnrico();
    const nadja = await fx.startNadja();
    rateRestaurant('rest-enzo', 2.5);
    await fx.settle(nadja);
    const enzo = fx.nadjaData(nadja).restaurants.find((r) => r.id === 'rest-enzo');
    expect(enzo?.ratings[ENRICO]).toBe(2.5);
    expect(enzo?.ratings[NADJA]).toBe(
      getData().restaurants.find((r) => r.id === 'rest-enzo')?.ratings[NADJA],
    );
  });
});
