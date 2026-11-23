// Contract of the fake server against the database (spec 0031, REQ-024, AC-059): the riskiest
// RPCs run the same steps against the fake (transport-fake.ts) and the local stack, and both must
// answer and leave the same rows. The command tests trust the fake; this test keeps it honest.
// Each run creates its own household and deletes it afterwards. Skipped unless SUPABASE_LOCAL=1,
// e.g.
//
//   set -a; . ./.env; set +a; SUPABASE_LOCAL=1 \
//     pnpm --filter @housekeeping/api exec vitest run src/contract.integration.test.ts
import { addDays, type Chore, type Row } from '@housekeeping/core';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import { choreToRow } from './db/mapping';
import { TEST_ACCOUNTS, TEST_PASSWORD } from './dev-accounts';
import { TransportError, type ChangeOp, type Transport } from './transport';
import { createFakeServer } from './transport-fake';
import { createSupabaseTransport, fromSupabaseClient } from './transport-supabase';

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env;
const enabled = env?.SUPABASE_LOCAL === '1';
const url = env?.EXPO_PUBLIC_SUPABASE_URL ?? '';
const key = env?.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

const EMPTY_STARTER = { areas: [], articles: [] };
/** The household's date, as the app sends it (delete_* accept at most one day off). */
const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());

/** One backend: a household of its own with "me" as the only member, and a stranger outside. */
interface Side {
  me: Transport;
  stranger: Transport;
  myId: string;
  householdId: string;
  slotIds: string[];
  close: () => Promise<void>;
}

async function slotIdsOf(transport: Transport, householdId: string): Promise<string[]> {
  const pulled = await transport.syncPull({ households: { [householdId]: { full: true } } });
  const household = (pulled.small.households ?? []).find((row) => row.id === householdId);
  const slots = (household?.meal_slots ?? []) as { id: string; sort: number }[];
  return [...slots].sort((a, b) => a.sort - b.sort).map((slot) => slot.id);
}

async function fakeSide(): Promise<Side> {
  const server = createFakeServer();
  const myId = crypto.randomUUID();
  const strangerId = crypto.randomUUID();
  server.addProfile({ id: myId, name: 'Enrico', email: 'enrico@example.com' });
  server.addProfile({ id: strangerId, name: 'Nadja', email: 'nadja@example.com' });
  const me = server.transport(myId);
  const householdId = await me.createHousehold('Vertrag', EMPTY_STARTER);
  return {
    me,
    stranger: server.transport(strangerId),
    myId,
    householdId,
    slotIds: await slotIdsOf(me, householdId),
    close: async () => undefined,
  };
}

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

async function databaseSide(): Promise<Side> {
  const enrico = await signedIn(0);
  const nadja = await signedIn(1);
  const me = createSupabaseTransport(fromSupabaseClient(enrico.client));
  const householdId = await me.createHousehold('Vertrag', EMPTY_STARTER);
  return {
    me,
    stranger: createSupabaseTransport(fromSupabaseClient(nadja.client)),
    myId: enrico.userId,
    householdId,
    slotIds: await slotIdsOf(me, householdId),
    close: async () => {
      await me.beginHouseholdDeletion(householdId);
      await me.deleteHousehold(householdId);
      await enrico.client.auth.signOut();
      await nadja.client.auth.signOut();
    },
  };
}

/** What a call did: its answer, or the error code it was refused with. */
type Outcome = { ok: unknown } | { error: string };

async function outcome(call: Promise<unknown>): Promise<Outcome> {
  try {
    return { ok: await call };
  } catch (error) {
    if (error instanceof TransportError) return { error: error.code };
    throw error;
  }
}

/** The columns the RPCs under test change, per table; the rest is not their contract. */
const COLUMNS: Record<string, string[]> = {
  recipes: ['id', 'title'],
  restaurants: ['id', 'name'],
  activities: ['id', 'name'],
  meal_plan_entries: [
    'id',
    'kind',
    'date',
    'slot_id',
    'recipe_id',
    'restaurant_id',
    'activity_id',
    'text',
  ],
  chores: ['id', 'title', 'next_due_on', 'last_done_on', 'next_assignee_id'],
  chore_events: ['id', 'chore_id', 'kind', 'done_on', 'done_by', 'title'],
};

/** The rows of the household, with its own ids (household, me, slots) named alike on both sides. */
async function rowsOf(side: Side): Promise<Record<string, Record<string, unknown>[]>> {
  const pulled = await side.me.syncPull({ households: { [side.householdId]: { full: true } } });
  const tables = pulled.households[side.householdId]?.rows ?? {};
  const names = new Map<unknown, string>([
    [side.householdId, 'HOUSEHOLD'],
    [side.myId, 'ME'],
    ...side.slotIds.map((id, index) => [id, `SLOT-${index}`] as [string, string]),
  ]);
  const shown: Record<string, Record<string, unknown>[]> = {};
  for (const [table, columns] of Object.entries(COLUMNS)) {
    shown[table] = (tables[table] ?? [])
      .map((row) =>
        Object.fromEntries(
          columns.map((column) => [column, names.get(row[column]) ?? row[column] ?? null]),
        ),
      )
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  }
  return shown;
}

/**
 * Runs the same steps against the fake and the database and expects the same record: answers,
 * refusals and rows. Returns the database's record for further checks.
 */
async function sameOnBoth<T>(steps: (side: Side) => Promise<T>): Promise<T> {
  const fake = await fakeSide();
  const database = await databaseSide();
  try {
    const [fromFake, fromDatabase] = [await steps(fake), await steps(database)];
    expect(fromFake).toEqual(fromDatabase);
    return fromDatabase;
  } finally {
    await fake.close();
    await database.close();
  }
}

const insert = (table: string, row: Row): ChangeOp => ({
  kind: 'insert',
  table,
  row,
});

/** A recipe, restaurant and activity, each planned yesterday (stays as text) and in 2 days (goes). */
function plannedPlaces(side: Side, ids: PlaceIds): ChangeOp[] {
  const h = side.householdId;
  const slot = side.slotIds[2] ?? '';
  const entry = (id: string, date: string, link: Record<string, string>) =>
    insert('meal_plan_entries', { id, household_id: h, date, slot_id: slot, ...link });
  return [
    insert('recipes', { id: ids.recipe, household_id: h, title: 'Lasagne' }),
    insert('restaurants', { id: ids.restaurant, household_id: h, name: 'Trattoria' }),
    insert('activities', {
      id: ids.activity,
      household_id: h,
      name: 'Kletterhalle',
      name_key: 'kletterhalle',
    }),
    entry(ids.recipePast, addDays(TODAY, -1), { kind: 'recipe', recipe_id: ids.recipe }),
    entry(ids.recipeLater, addDays(TODAY, 2), { kind: 'recipe', recipe_id: ids.recipe }),
    entry(ids.restaurantPast, addDays(TODAY, -1), {
      kind: 'restaurant',
      restaurant_id: ids.restaurant,
    }),
    entry(ids.restaurantLater, addDays(TODAY, 2), {
      kind: 'restaurant',
      restaurant_id: ids.restaurant,
    }),
    entry(ids.activityPast, addDays(TODAY, -1), { kind: 'activity', activity_id: ids.activity }),
    entry(ids.activityLater, addDays(TODAY, 2), { kind: 'activity', activity_id: ids.activity }),
  ];
}

const PLACE_IDS = [
  'recipe',
  'restaurant',
  'activity',
  'recipePast',
  'recipeLater',
  'restaurantPast',
  'restaurantLater',
  'activityPast',
  'activityLater',
] as const;
type PlaceIds = Record<(typeof PLACE_IDS)[number], string>;

const newPlaceIds = (): PlaceIds =>
  Object.fromEntries(PLACE_IDS.map((name) => [name, crypto.randomUUID()])) as PlaceIds;

function weeklyChore(side: Side, id: string): Row {
  const chore: Chore = {
    id,
    title: 'Bad putzen',
    recurrence: { type: 'weekly', every: 1, weekdays: [1] },
    assignment: { type: 'fixed', memberId: side.myId },
    effort: 2,
    nextDueOn: TODAY,
    nextAssigneeId: side.myId,
  };
  return choreToRow(side.householdId, chore);
}

describe.skipIf(!enabled)(
  'spec 0031, AC-059: the fake server keeps the contract of the database',
  () => {
    it('apply_changes: columns outside the allowlist are refused, all or nothing', async () => {
      const recipeId = crypto.randomUUID();
      const record = await sameOnBoth(async (side) => {
        const h = side.householdId;
        const photo = await outcome(
          side.me.applyChanges(h, [
            insert('recipes', { id: recipeId, household_id: h, title: 'Lasagne', photo: 'x.jpg' }),
          ]),
        );
        const mealSlots = await outcome(
          side.me.applyChanges(h, [
            { kind: 'patch', table: 'households', id: h, changes: { meal_slots: [] } },
          ]),
        );
        const choreLink = await outcome(
          side.me.applyChanges(h, [
            insert('chore_events', {
              id: crypto.randomUUID(),
              household_id: h,
              chore_id: crypto.randomUUID(),
              title: 'Bad putzen',
              kind: 'done',
              done_on: TODAY,
            }),
          ]),
        );
        const allowed = await outcome(
          side.me
            .applyChanges(h, [
              insert('recipes', { id: recipeId, household_id: h, title: 'Lasagne' }),
            ])
            .then((result) => result.applied),
        );
        const stranger = await outcome(
          side.stranger.applyChanges(h, [
            { kind: 'patch', table: 'recipes', id: recipeId, changes: { title: 'Fremd' } },
          ]),
        );
        return {
          photo,
          mealSlots,
          choreLink,
          allowed,
          stranger,
          rows: (await rowsOf(side)).recipes,
        };
      });
      expect(record.allowed).toEqual({ ok: 1 });
      expect(record.photo).toHaveProperty('error');
      expect(record.rows).toEqual([{ id: recipeId, title: 'Lasagne' }]);
    });

    it('delete_recipe and restore_recipe: entries become text or go, undo brings all back', async () => {
      const ids = newPlaceIds();
      const record = await sameOnBoth(async (side) => {
        await side.me.applyChanges(side.householdId, plannedPlaces(side, ids));
        const before = await rowsOf(side);
        const stranger = await outcome(side.stranger.deleteRecipe(ids.recipe, TODAY));
        const deleted = await outcome(side.me.deleteRecipe(ids.recipe, TODAY));
        const afterDelete = await rowsOf(side);
        const strangerRestore = await outcome(side.stranger.restoreRecipe(ids.recipe));
        const restored = await outcome(side.me.restoreRecipe(ids.recipe));
        const again = await outcome(side.me.restoreRecipe(ids.recipe));
        const afterRestore = await rowsOf(side);
        return {
          before,
          stranger,
          deleted,
          afterDelete,
          strangerRestore,
          restored,
          again,
          afterRestore,
        };
      });
      expect(record.deleted).toEqual({ ok: { converted: 1, removed: 1, collections: 0 } });
      expect(record.restored).toEqual({ ok: true });
      expect(record.afterRestore).toEqual(record.before);
    });

    it('delete_restaurant, delete_activity and their restore', async () => {
      const ids = newPlaceIds();
      const record = await sameOnBoth(async (side) => {
        await side.me.applyChanges(side.householdId, plannedPlaces(side, ids));
        const restaurant = ids.restaurant;
        const activity = ids.activity;
        return {
          strangerRestaurant: await outcome(side.stranger.deleteRestaurant(restaurant, TODAY)),
          strangerActivity: await outcome(side.stranger.deleteActivity(activity, TODAY)),
          restaurant: await outcome(side.me.deleteRestaurant(restaurant, TODAY)),
          activity: await outcome(side.me.deleteActivity(activity, TODAY)),
          afterDelete: await rowsOf(side),
          restoredRestaurant: await outcome(side.me.restoreRestaurant(restaurant)),
          restoredActivity: await outcome(side.me.restoreActivity(activity)),
          again: await outcome(side.me.restoreActivity(activity)),
          afterRestore: await rowsOf(side),
        };
      });
      expect(record.restaurant).toEqual({ ok: { converted: 1, removed: 1 } });
      expect(record.afterRestore.meal_plan_entries).toHaveLength(6);
    });

    it('complete_chore: books once; a second booking with the old state is refused', async () => {
      const choreId = crypto.randomUUID();
      const record = await sameOnBoth(async (side) => {
        const h = side.householdId;
        await side.me.applyChanges(h, [insert('chores', weeklyChore(side, choreId))]);
        const completion = (eventId: string) =>
          side.me.applyChanges(h, [
            {
              kind: 'complete_chore',
              completion: {
                chore_id: choreId,
                event_id: eventId,
                kind: 'done',
                done_on: TODAY,
                done_by: side.myId,
                seen: {
                  next_due_on: TODAY,
                  last_done_on: null,
                  next_assignee_id: side.myId,
                  latest_event_id: null,
                },
                next_due_on: addDays(TODAY, 7),
                next_assignee_id: side.myId,
              },
            },
          ]);
        const first = await outcome(
          completion(crypto.randomUUID()).then((result) => result.applied),
        );
        const second = await outcome(
          completion(crypto.randomUUID()).then((result) => result.applied),
        );
        const rows = await rowsOf(side);
        return {
          first,
          second,
          chores: rows.chores,
          events: (rows.chore_events ?? []).map(({ id: _id, ...event }) => event),
        };
      });
      expect(record.first).toEqual({ ok: 1 });
      expect(record.second).toHaveProperty('error');
      expect(record.events).toHaveLength(1);
    });

    it('delete_chore and restore_chore: the entries stay without the link and get it back', async () => {
      const choreId = crypto.randomUUID();
      const eventId = crypto.randomUUID();
      const record = await sameOnBoth(async (side) => {
        const h = side.householdId;
        await side.me.applyChanges(h, [insert('chores', weeklyChore(side, choreId))]);
        await side.me.applyChanges(h, [
          {
            kind: 'complete_chore',
            completion: {
              chore_id: choreId,
              event_id: eventId,
              kind: 'done',
              done_on: TODAY,
              done_by: side.myId,
              seen: {
                next_due_on: TODAY,
                last_done_on: null,
                next_assignee_id: side.myId,
                latest_event_id: null,
              },
              next_due_on: addDays(TODAY, 7),
              next_assignee_id: side.myId,
            },
          },
        ]);
        return {
          stranger: await outcome(side.stranger.deleteChore(choreId)),
          deleted: await outcome(side.me.deleteChore(choreId)),
          afterDelete: await rowsOf(side),
          strangerRestore: await outcome(side.stranger.restoreChore(choreId)),
          restored: await outcome(side.me.restoreChore(choreId)),
          again: await outcome(side.me.restoreChore(choreId)),
          afterRestore: await rowsOf(side),
        };
      });
      expect(record.afterDelete.chores).toEqual([]);
      expect(record.afterDelete.chore_events).toMatchObject([{ id: eventId, chore_id: null }]);
      expect(record.restored).toEqual({ ok: true });
      expect(record.afterRestore.chore_events).toMatchObject([{ id: eventId, chore_id: choreId }]);
    });
  },
);
