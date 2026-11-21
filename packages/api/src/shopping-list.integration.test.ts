// The household's shopping list against the running local stack (spec 0006, ADR-0012): adding with "Was fehlt?"
// reaches the database, survives a reload and arrives on a second device (F1, AC-029); + and −
// and the Zusatz use the new RPCs; the server refuses what the spec forbids. The test only
// changes an item it creates itself and removes it again, so the seed stays as it was. Skipped
// unless SUPABASE_LOCAL=1, e.g.
//
//   set -a; . ./.env; set +a; SUPABASE_LOCAL=1 \
//     pnpm --filter @housekeeping/api exec vitest run src/shopping-list.integration.test.ts
import { summarizeItem } from '@housekeeping/core';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it } from 'vitest';

import { createEngine, startBackend, stopBackend, type Environment } from './backend';
import { addShoppingItemFromText, adjustItemCount, setItemNote } from './commands-shopping';
import { TEST_ACCOUNTS, TEST_PASSWORD } from './dev-accounts';
import { DEMO_HOUSEHOLD_ID } from './seed/demo';
import { seedHouseholdId } from './seed/seed-sql';
import { createMemoryStorage } from './storage';
import { getData } from './store';
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

describe.skipIf(!enabled)("spec 0006: the household's shopping list in the local stack", () => {
  it('AC-029 (F1): "2 Spülmittel (Zitrone)" is saved, survives a reload and reaches Nadja', async () => {
    const enrico = await signedIn(0);
    const nadja = await signedIn(1);
    const householdId = await seedHouseholdId(DEMO_HOUSEHOLD_ID);
    const transport = createSupabaseTransport(fromSupabaseClient(enrico.client));
    const storage = createMemoryStorage();
    const start = async () => {
      const engine = await startBackend({
        supabase: enrico.client,
        storage,
        userId: enrico.userId,
        environment: online,
      });
      await engine.pull();
      await engine.whenIdle();
      return engine;
    };
    const dishSoap = () =>
      getData().items.find(
        (item) =>
          !item.checked &&
          getData().articles.find((article) => article.id === item.articleId)?.name ===
            'Spülmittel',
      );

    let engine = await start();
    expect(getData().household.id).toBe(householdId);
    expect(dishSoap()).toBeUndefined();

    let itemId: string | undefined;
    try {
      const added = addShoppingItemFromText('2 Spülmittel (Zitrone)');
      expect(added).toMatchObject({ articleName: 'Spülmittel', createdArticle: false });
      await engine.whenIdle();
      await engine.pull();
      const saved = dishSoap();
      itemId = saved?.id;
      expect(saved && summarizeItem(saved)).toMatchObject({ amount: '2×', notes: ['Zitrone'] });
      expect(saved?.pendingSync).toBeUndefined();

      // A reload: the device starts again from its cache and pulls.
      await stopBackend();
      engine = await start();
      const reloaded = dishSoap();
      expect(reloaded?.id).toBe(itemId);
      expect(reloaded && summarizeItem(reloaded).amount).toBe('2×');

      const other = createEngine({
        transport: createSupabaseTransport(fromSupabaseClient(nadja.client)),
        storage: createMemoryStorage(),
        userId: nadja.userId,
        environment: online,
      });
      await other.load();
      await other.pull();
      await other.pull();
      const onNadja = other
        .getState()
        ?.households[householdId]?.items.find((item) => item.id === itemId);
      expect(onNadja && summarizeItem(onNadja).amount).toBe('2×');
      other.stop();

      // AC-014 / AC-021 with the real RPCs.
      expect(adjustItemCount(itemId ?? '', 1)).toEqual({ count: 3, removed: false });
      setItemNote(itemId ?? '', 'Zitrone, groß');
      await engine.whenIdle();
      await engine.pull();
      const edited = dishSoap();
      expect(edited && summarizeItem(edited)).toMatchObject({
        amount: '3×',
        notes: ['Zitrone, groß'],
      });
    } finally {
      const ids = (
        await enrico.client
          .from('shopping_contributions')
          .select('id')
          .eq('item_id', itemId ?? crypto.randomUUID())
      ).data?.map((row: { id: string }) => row.id);
      if (ids && ids.length > 0) await transport.removeContributions(ids);
      await enrico.client.auth.signOut();
      await nadja.client.auth.signOut();
    }
  });

  it('AC-038 / AC-022: the server refuses foreign households, bad steps and long notes', async () => {
    const enrico = await signedIn(0);
    const householdId = await seedHouseholdId(DEMO_HOUSEHOLD_ID);
    const transport = createSupabaseTransport(fromSupabaseClient(enrico.client));
    try {
      await expect(transport.clearShoppingList(crypto.randomUUID())).rejects.toMatchObject({
        kind: 'permanent',
        code: 'not_member',
      });
      const { data: items } = await enrico.client.from('shopping_items').select('id').limit(1);
      const itemId = (items as { id: string }[] | null)?.[0]?.id ?? '';
      await expect(transport.adjustItemCount(itemId, 0)).rejects.toMatchObject({
        kind: 'permanent',
        code: 'invalid_value',
      });
      expect(await transport.adjustItemCount(crypto.randomUUID(), 1)).toBeNull();
      const { data: contributions } = await enrico.client
        .from('shopping_contributions')
        .select('id')
        .limit(1);
      const contributionId = (contributions as { id: string }[] | null)?.[0]?.id ?? '';
      await expect(
        transport.applyChanges(householdId, [
          {
            kind: 'patch',
            table: 'shopping_contributions',
            id: contributionId,
            changes: { note: 'x'.repeat(201) },
          },
        ]),
      ).rejects.toMatchObject({ kind: 'permanent', code: '23514' });

      const anonymous = createSupabaseTransport(
        fromSupabaseClient(createClient(url, key, { auth: { persistSession: false } })),
      );
      await expect(anonymous.clearShoppingList(crypto.randomUUID())).rejects.toMatchObject({
        kind: 'permanent',
      });
      await expect(anonymous.adjustItemCount(itemId, 1)).rejects.toMatchObject({
        kind: 'permanent',
      });
    } finally {
      await enrico.client.auth.signOut();
    }
  });
});
