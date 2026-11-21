// Verifies the local seed against the running local stack (spec 0003, AC-033): both test accounts
// sign in with their password, pull both seed households with sync_pull, and the mapping gives
// back the demo households of spec 0001. Skipped unless SUPABASE_LOCAL=1, e.g.
//
//   pnpm db:reset
//   set -a; . ./.env; set +a; SUPABASE_LOCAL=1 \
//     pnpm --filter @housekeeping/api exec vitest run src/seed/seed.integration.test.ts
import { weekDates, type Row, type TableRows } from '@housekeeping/core';
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import { rowsToHousehold, rowsToMembers } from '../db/mapping';
import { withCompositeIds } from '../db/tables';
import { TEST_ACCOUNTS, TEST_PASSWORD } from '../dev-accounts';
import type { HouseholdData } from '../store';
import type { RawPullResult } from '../transport';
import { createInitialState, DEMO_HOUSEHOLD_ID, TEST_HOUSEHOLD_ID } from './demo';
import { generateSeed, mapIds, seedHouseholdId } from './seed-sql';

// The package has no Node types (it runs in the app); vitest runs in Node.
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env;
const enabled = env?.SUPABASE_LOCAL === '1';
const url = env?.EXPO_PUBLIC_SUPABASE_URL ?? '';
const key = env?.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

/** Timestamps are relative to the reset; everything else must equal the demo. */
function withoutTimestamps(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutTimestamps);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        // ratedAt (spec 0011) is the server's updated_at of the rating row.
        .filter(([field]) => !['createdAt', 'checkedAt', 'ratedAt', 'packedAt'].includes(field))
        .map(([field, item]) => [field, withoutTimestamps(item)]),
    );
  }
  return value;
}

/** The mapping lists feedback newest first (db/mapping.ts); the demo array is unordered. */
function asMapped(data: HouseholdData | undefined): HouseholdData | undefined {
  return (
    data && {
      ...data,
      feedback: [...data.feedback].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    }
  );
}

const berlinDay = (time: number): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date(time));

describe.skipIf(!enabled)('AC-033 (spec 0003): local seed in the database', () => {
  for (const account of TEST_ACCOUNTS) {
    it(`AC-033: ${account.name} pulls the demo households of spec 0001`, async () => {
      if (!url || !key) throw new Error('EXPO_PUBLIC_SUPABASE_URL / _PUBLISHABLE_KEY missing');
      const client = createClient(url, key, { auth: { persistSession: false } });
      const signIn = await client.auth.signInWithPassword({
        email: account.email,
        password: TEST_PASSWORD,
      });
      expect(signIn.error).toBeNull();

      const demoId = await seedHouseholdId(DEMO_HOUSEHOLD_ID);
      const testId = await seedHouseholdId(TEST_HOUSEHOLD_ID);
      const { data, error } = await client.rpc('sync_pull', {
        p_request: { households: { [demoId]: { full: true }, [testId]: { full: true } } },
      });
      expect(error).toBeNull();
      const pull = withCompositeIds(data as unknown as RawPullResult);
      await client.auth.signOut();

      // The day of the reset: setup rows were created 120 days before it (seed-sql.ts).
      const householdRow = pull.small.households?.find((row) => row.id === demoId);
      const seedDay = berlinDay(Date.parse(String(householdRow?.created_at)) + 120 * 86_400_000);
      const state = createInitialState(seedDay);
      const { ids } = await generateSeed(seedDay);

      const household = (id: string, slug: string) => {
        const delta = pull.households[id];
        if (!delta) throw new Error(`Household ${slug} was not pulled`);
        const tables: TableRows = Object.fromEntries(
          Object.entries(delta.rows).map(([table, rows]) => [
            table,
            Object.fromEntries((rows as Row[]).map((row) => [row.id, row])),
          ]),
        );
        const slugs = Object.fromEntries(
          Object.entries(ids[slug] ?? {}).map(([slugId, uuid]) => [uuid, slugId]),
        );
        return mapIds(rowsToHousehold(tables, pull.small, id), slugs) as ReturnType<
          typeof rowsToHousehold
        >;
      };

      const demo = household(demoId, DEMO_HOUSEHOLD_ID);
      expect(demo.household.name).toBe('Enrico & Nadja');
      expect(demo.recipes.length).toBeGreaterThanOrEqual(20);
      expect(
        demo.recipes
          .find((recipe) => recipe.title === 'Mango-Curry')
          ?.variants.map((variant) => variant.name),
      ).toEqual(['mit Tofu', 'mit Hähnchen']);
      expect(demo.chores.length).toBeGreaterThanOrEqual(8);
      expect(demo.stores.map((store) => store.name)).toContain('Rewe Südstadt');
      expect(demo.items.filter((item) => !item.checked).length).toBeGreaterThan(0);
      const week = weekDates(seedDay);
      expect(
        demo.planEntries.filter((entry) => entry.date !== null && week.includes(entry.date)).length,
      ).toBeGreaterThanOrEqual(5);
      expect(demo.restaurants).toHaveLength(4);
      // Spec 0004: three activities, Vormittag first.
      expect(demo.activities.map((activity) => activity.name)).toEqual([
        'Bouldern',
        'Eislaufen',
        'Spieleabend',
      ]);
      expect(demo.household.mealSlots.map((slot) => slot.name)).toEqual([
        'Vormittag',
        'Mittag',
        'Abend',
      ]);

      expect(withoutTimestamps(demo)).toEqual(
        withoutTimestamps(asMapped(state.households[DEMO_HOUSEHOLD_ID])),
      );
      expect(withoutTimestamps(household(testId, TEST_HOUSEHOLD_ID))).toEqual(
        withoutTimestamps(asMapped(state.households[TEST_HOUSEHOLD_ID])),
      );

      const members = mapIds(rowsToMembers(pull.small), ids[DEMO_HOUSEHOLD_ID] ?? {});
      expect(members).toEqual(
        mapIds(
          state.members.map((member) => ({
            ...member,
            name: TEST_ACCOUNTS.find((other) => `m-${other.key}` === member.id)?.name,
          })),
          ids[DEMO_HOUSEHOLD_ID] ?? {},
        ),
      );
    });
  }
});
