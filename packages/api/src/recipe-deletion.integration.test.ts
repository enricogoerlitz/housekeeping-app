// Deleting a recipe and "Rückgängig" against the running local stack (spec 0008, AC-043, AC-044,
// E6): Enrico deletes, Nadja's device no longer sees the recipe after a pull, planning it fails
// its foreign key, and "Rückgängig" brings back Nadja's rating so that her device sees the recipe
// again. The test puts back what it changed. Skipped unless SUPABASE_LOCAL=1, e.g.
//
//   set -a; . ./.env; set +a; SUPABASE_LOCAL=1 \
//     pnpm --filter @housekeeping/api exec vitest run src/recipe-deletion.integration.test.ts
import { addDays } from '@housekeeping/core';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createEngine,
  onWriteRejected,
  startBackend,
  stopBackend,
  type Environment,
} from './backend';
import { addPlanEntry, removePlanEntry } from './commands-plan';
import { deleteRecipe } from './commands-recipes';
import { TEST_ACCOUNTS, TEST_PASSWORD } from './dev-accounts';
import { DEMO_HOUSEHOLD_ID } from './seed/demo';
import { seedHouseholdId } from './seed/seed-sql';
import { createMemoryStorage } from './storage';
import { getData, getState, snapshot } from './store';
import { createSupabaseTransport, fromSupabaseClient } from './transport-supabase';

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env;
const enabled = env?.SUPABASE_LOCAL === '1';
const url = env?.EXPO_PUBLIC_SUPABASE_URL ?? '';
const key = env?.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

const online: Environment = {
  isOnline: () => true,
  isVisible: () => true,
  subscribe: () => () => {},
};

async function signedIn(index: number): Promise<{ client: SupabaseClient; userId: string }> {
  const account = TEST_ACCOUNTS[index];
  if (!url || !key || !account) throw new Error('local stack configuration missing');
  const client = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({
    email: account.email,
    password: TEST_PASSWORD,
  });
  if (error || !data.user) throw new Error('sign-in failed');
  return { client, userId: data.user.id };
}

afterEach(async () => {
  await stopBackend();
});

describe.skipIf(!enabled)('spec 0008: deleting a recipe in the local stack', () => {
  it('AC-043, AC-044, E6: Nadja’s device loses the recipe, planning it fails, undo brings her rating back', async () => {
    const enrico = await signedIn(0);
    const nadja = await signedIn(1);
    const householdId = await seedHouseholdId(DEMO_HOUSEHOLD_ID);
    const rejected: string[] = [];
    const stop = onWriteRejected((message) => rejected.push(message));
    const transport = {
      ...createSupabaseTransport(fromSupabaseClient(enrico.client)),
      subscribe: () => () => {},
    };
    const engine = await startBackend({
      transport,
      storage: createMemoryStorage(),
      userId: enrico.userId,
      environment: online,
    });
    const settle = async () => {
      await engine.whenIdle();
      await engine.pull();
      await engine.whenIdle();
    };
    const other = createEngine({
      transport: createSupabaseTransport(fromSupabaseClient(nadja.client)),
      storage: createMemoryStorage(),
      userId: nadja.userId,
      environment: online,
    });
    const nadjaRecipe = async (id: string) => {
      await other.pull();
      return other.getState()?.households[householdId]?.recipes.find((recipe) => recipe.id === id);
    };
    const entryIds: string[] = [];
    try {
      await settle();
      await other.load();
      await other.pull();
      const recipe = getData().recipes.find((candidate) => candidate.title === 'Halloumi-Pfanne');
      const slot = getData().household.mealSlots.at(-1);
      if (!recipe || !slot) throw new Error('seed: Halloumi-Pfanne or a meal slot missing');
      const previousRating = recipe.ratings[nadja.userId] ?? null;
      const rated = await nadja.client.rpc('set_recipe_rating', { recipe_id: recipe.id, stars: 5 });
      expect(rated.error).toBeNull();
      const today = getState().today;
      const plan = (date: string) =>
        addPlanEntry({
          date,
          slotId: slot.id,
          kind: 'recipe',
          recipeId: recipe.id,
          eaterIds: [enrico.userId],
        });
      entryIds.push(plan(addDays(today, -4)), plan(addDays(today, 1)));
      await settle();
      const [past, future] = entryIds;

      const restore = snapshot();
      const deletion = deleteRecipe(recipe.id);
      await settle();
      await expect(deletion?.confirmed).resolves.toBeUndefined();
      expect(getData().recipes.some((candidate) => candidate.id === recipe.id)).toBe(false);
      expect(getData().planEntries.find((entry) => entry.id === past)).toMatchObject({
        kind: 'text',
        text: 'Halloumi-Pfanne',
      });
      expect(getData().planEntries.some((entry) => entry.id === future)).toBe(false);
      expect(await nadjaRecipe(recipe.id)).toBeUndefined();

      // E6: planning the deleted recipe fails its foreign key, with the constraint's name.
      const nadjaTransport = createSupabaseTransport(fromSupabaseClient(nadja.client));
      await expect(
        nadjaTransport.applyChanges(householdId, [
          {
            kind: 'insert',
            table: 'meal_plan_entries',
            row: {
              id: crypto.randomUUID(),
              date: today,
              slot_id: slot.id,
              kind: 'recipe',
              recipe_id: recipe.id,
              eater_ids: [nadja.userId],
              guests: 0,
              portions: 1,
              variants: [],
              sort: 0,
              not_cooked: false,
            },
          },
        ]),
      ).rejects.toMatchObject({ code: '23503', constraint: 'meal_plan_entries_recipe_fkey' });

      restore();
      await settle();
      expect(rejected).toEqual([]);
      expect(getData().recipes.find((candidate) => candidate.id === recipe.id)).toMatchObject({
        ratings: expect.objectContaining({ [nadja.userId]: 5 }),
      });
      for (const id of entryIds) {
        expect(getData().planEntries.find((entry) => entry.id === id)).toMatchObject({
          kind: 'recipe',
          recipeId: recipe.id,
        });
      }
      expect((await nadjaRecipe(recipe.id))?.ratings[nadja.userId]).toBe(5);

      const back = await nadja.client.rpc('set_recipe_rating', {
        recipe_id: recipe.id,
        stars: previousRating,
      });
      expect(back.error).toBeNull();
    } finally {
      for (const id of entryIds) {
        if (getData().planEntries.some((entry) => entry.id === id)) removePlanEntry(id);
      }
      await engine.whenIdle();
      other.stop();
      stop();
    }
  });
});
