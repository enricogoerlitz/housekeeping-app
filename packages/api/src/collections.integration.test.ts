// Collections against the running local stack (spec 0009, T4): Enrico puts a new recipe into a
// new collection, Nadja's device sees the contents after a pull, a signed-out client and other
// households see and change nothing (AC-011), a collection in a collection is refused (AC-009).
// Enrico deletes the recipe, Nadja's device sees it leave the collection, "Rückgängig" brings it
// back (AC-033). The local stack has only two test accounts, both in both households, so the
// foreign member ("WG") is covered by pgTAP (collections.test.sql); here it is a foreign
// household id and the other household. The test removes what it created. Skipped unless
// SUPABASE_LOCAL=1, e.g.
//
//   set -a; . ./.env; set +a; SUPABASE_LOCAL=1 \
//     pnpm --filter @housekeeping/api exec vitest run src/collections.integration.test.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createEngine,
  onWriteRejected,
  startBackend,
  stopBackend,
  type Environment,
} from './backend';
import { addRecipeToCollection } from './commands-collections';
import { createRecipe, deleteRecipe } from './commands-recipes';
import { TEST_ACCOUNTS, TEST_PASSWORD } from './dev-accounts';
import { DEMO_HOUSEHOLD_ID, TEST_HOUSEHOLD_ID } from './seed/demo';
import { seedHouseholdId, seedId } from './seed/seed-sql';
import { createMemoryStorage } from './storage';
import { getData, snapshot } from './store';
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

describe.skipIf(!enabled)('spec 0009: collections in the local stack', () => {
  it('AC-008, AC-009, AC-011, AC-033: shared with Nadja, closed to others, deleting and undo', async () => {
    const enrico = await signedIn(0);
    const nadja = await signedIn(1);
    const householdId = await seedHouseholdId(DEMO_HOUSEHOLD_ID);
    const testHouseholdId = await seedHouseholdId(TEST_HOUSEHOLD_ID);
    const grillabend = await seedId(DEMO_HOUSEHOLD_ID, 'rec-grillabend');
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
    const nadjaRows = async (collectionId: string) => {
      await other.pull();
      return (other.getState()?.households[householdId]?.collectionRecipes ?? []).filter(
        (row) => row.collectionId === collectionId,
      );
    };
    const suffix = crypto.randomUUID().slice(0, 8);
    let recipeId: string | undefined;
    let collectionId: string | undefined;
    try {
      await settle();
      await other.load();
      await other.pull();

      recipeId = createRecipe({ title: `Kartoffelsalat ${suffix}` });
      await settle();
      const added = addRecipeToCollection(recipeId, { newTitle: `Sommerbuffet ${suffix}` });
      collectionId = added.collectionId;
      await settle();
      expect(rejected).toEqual([]);
      const nadjaSees = await nadjaRows(collectionId);
      expect(nadjaSees.map((row) => row.recipeId)).toEqual([recipeId]);
      expect(
        other.getState()?.households[householdId]?.recipes.find((r) => r.id === collectionId),
      ).toMatchObject({ kind: 'collection', title: `Sommerbuffet ${suffix}` });
      const [row] = nadjaSees;
      if (!row) throw new Error('row missing');

      // AC-009: a collection never goes into a collection, also through the API.
      await expect(
        transport.applyChanges(householdId, [
          {
            kind: 'insert',
            table: 'collection_recipes',
            row: { id: crypto.randomUUID(), collection_id: collectionId, recipe_id: grillabend },
          },
        ]),
      ).rejects.toMatchObject({ code: 'collection_recipe_kind_invalid' });

      // AC-011: the other household cannot point at this collection, a foreign household id is
      // refused, and a signed-out client reads and changes nothing.
      await expect(
        transport.applyChanges(testHouseholdId, [
          {
            kind: 'insert',
            table: 'collection_recipes',
            row: { id: crypto.randomUUID(), collection_id: collectionId, recipe_id: recipeId },
          },
        ]),
      ).rejects.toMatchObject({ code: '23503' });
      await expect(
        transport.applyChanges(crypto.randomUUID(), [
          { kind: 'patch', table: 'collection_recipes', id: row.id, changes: { sort: 3 } },
        ]),
      ).rejects.toMatchObject({ kind: 'permanent' });
      const anonymous = createClient(url, key, { auth: { persistSession: false } });
      const read = await anonymous.from('collection_recipes').select('id');
      expect(read.data ?? []).toEqual([]);
      const write = await anonymous.from('collection_recipes').update({ sort: 9 }).eq('id', row.id);
      expect(write.error).not.toBeNull();

      // AC-033: deleting the recipe takes it out of the collection on Nadja's device too.
      const restore = snapshot();
      const deletion = deleteRecipe(recipeId);
      expect(deletion?.collections).toBe(1);
      await settle();
      await expect(deletion?.confirmed).resolves.toBeUndefined();
      expect(await nadjaRows(collectionId)).toEqual([]);
      restore();
      await settle();
      expect(rejected).toEqual([]);
      expect(getData().collectionRecipes.find((candidate) => candidate.id === row.id)).toEqual(row);
      expect(await nadjaRows(collectionId)).toEqual([row]);
    } finally {
      for (const id of [collectionId, recipeId]) {
        if (id && getData().recipes.some((recipe) => recipe.id === id)) {
          await deleteRecipe(id)?.confirmed.catch(() => {});
        }
      }
      await engine.whenIdle();
      other.stop();
      stop();
    }
  });
});
