// The article catalog against the running local stack (spec 0007): a check queued offline on an
// article that is merged meanwhile reaches the target (AC-040), the old name finds the target
// (AC-037), and the server refuses ingredients without an article of the household (AC-006).
// Skipped unless SUPABASE_LOCAL=1, e.g.
//
//   set -a; . ./.env; set +a; SUPABASE_LOCAL=1 \
//     pnpm --filter @housekeeping/api exec vitest run src/master-data.integration.test.ts
import { normalizeText } from '@housekeeping/core';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it } from 'vitest';

import { onWriteRejected, startBackend, stopBackend } from './backend';
import { fakeEnvironment } from './backend-test-helpers';
import { createArticle } from './commands-articles';
import { addShoppingItemFromText, setItemChecked } from './commands-shopping';
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

describe.skipIf(!enabled)('spec 0007: the article catalog in the local stack', () => {
  it('AC-040, AC-037: an offline check on "Milchkokos" lands on "Kokosmilch" after the merge', async () => {
    const enrico = await signedIn(0);
    const nadja = await signedIn(1);
    const householdId = await seedHouseholdId(DEMO_HOUSEHOLD_ID);
    const environment = fakeEnvironment();
    const messages: string[] = [];
    const stop = onWriteRejected((message) => messages.push(message));
    const engine = await startBackend({
      supabase: enrico.client,
      storage: createMemoryStorage(),
      userId: enrico.userId,
      environment,
    });
    const settle = async () => {
      await engine.whenIdle();
      await engine.pull();
      await engine.whenIdle();
    };
    await settle();
    expect(getData().household.id).toBe(householdId);
    const coconut = getData().articles.find((article) => article.name === 'Kokosmilch');
    if (!coconut) throw new Error('seed: Kokosmilch missing');
    const openOf = (articleId: string) =>
      getData().items.find((item) => item.articleId === articleId && !item.checked);

    const sourceId = createArticle({ name: 'Milchkokos', synonyms: ['Kokosdrink'] });
    addShoppingItemFromText('Milchkokos');
    addShoppingItemFromText('Kokosmilch');
    await settle();
    const sourceItem = openOf(sourceId);
    const targetItem = openOf(coconut.id);
    if (!sourceItem || !targetItem) throw new Error('items missing');

    try {
      environment.setOnline(false);
      setItemChecked(sourceItem.id, true);
      const result = await createSupabaseTransport(fromSupabaseClient(nadja.client)).mergeArticles(
        sourceId,
        coconut.id,
      );
      expect(result).toEqual({ recipes: 0, items: 1 });
      environment.setOnline(true);
      await settle();

      const { data: rows } = await enrico.client
        .from('shopping_items')
        .select('id, checked')
        .eq('id', targetItem.id);
      expect(rows).toEqual([{ id: targetItem.id, checked: true }]);
      expect(getData().items.find((item) => item.id === targetItem.id)?.checked).toBe(true);
      expect(messages).toEqual([]);

      expect(addShoppingItemFromText('Milchkokos')).toMatchObject({
        articleName: 'Kokosmilch',
        createdArticle: false,
      });
      await settle();
      const { data: articles } = await enrico.client
        .from('articles')
        .select('id, synonyms')
        .eq('household_id', householdId)
        .in('name', ['Milchkokos', 'Kokosmilch']);
      expect(articles).toEqual([
        { id: coconut.id, synonyms: [...coconut.synonyms, 'Milchkokos', 'Kokosdrink'] },
      ]);
    } finally {
      stop();
      environment.setOnline(true);
      const { data: contributions } = await enrico.client
        .from('shopping_contributions')
        .select('id')
        .eq('item_id', targetItem.id);
      const ids = (contributions as { id: string }[] | null)?.map((row) => row.id) ?? [];
      const transport = createSupabaseTransport(fromSupabaseClient(enrico.client));
      if (ids.length > 0) await transport.removeContributions(ids);
      await transport.applyChanges(householdId, [
        {
          kind: 'patch',
          table: 'articles',
          id: coconut.id,
          changes: {
            synonyms: coconut.synonyms,
            synonym_keys: coconut.synonyms.map(normalizeText),
          },
        },
      ]);
      await enrico.client.auth.signOut();
      await nadja.client.auth.signOut();
    }
  });

  it('AC-006: the server refuses an ingredient without an article of the household', async () => {
    const enrico = await signedIn(0);
    const householdId = await seedHouseholdId(DEMO_HOUSEHOLD_ID);
    const transport = createSupabaseTransport(fromSupabaseClient(enrico.client));
    try {
      const { data } = await enrico.client
        .from('recipes')
        .select('id, ingredients')
        .eq('household_id', householdId)
        .limit(1);
      const recipe = (data as { id: string; ingredients: unknown[] }[] | null)?.[0];
      if (!recipe) throw new Error('seed: no recipe');
      for (const ingredients of [
        [{ id: crypto.randomUUID(), shoppingRule: 'count' }],
        [{ id: crypto.randomUUID(), articleId: crypto.randomUUID(), shoppingRule: 'count' }],
      ]) {
        await expect(
          transport.applyChanges(householdId, [
            { kind: 'patch', table: 'recipes', id: recipe.id, changes: { ingredients } },
          ]),
        ).rejects.toMatchObject({ kind: 'permanent', code: 'ingredient_article_invalid' });
      }
      const { data: after } = await enrico.client
        .from('recipes')
        .select('ingredients')
        .eq('id', recipe.id);
      expect(after).toEqual([{ ingredients: recipe.ingredients }]);
    } finally {
      await enrico.client.auth.signOut();
    }
  });
});
