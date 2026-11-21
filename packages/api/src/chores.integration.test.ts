// Chores and half-star ratings against the running local stack (spec 0011): checking off a chore
// goes through complete_chore and reaches a second device; a booking someone else was faster with
// is refused with who and when; removing the entry restores the chore; ratings take half steps
// and refuse anything else. Every test puts back what it changed. Skipped unless SUPABASE_LOCAL=1,
// e.g.
//
//   set -a; . ./.env; set +a; SUPABASE_LOCAL=1 \
//     pnpm --filter @housekeeping/api exec vitest run src/chores.integration.test.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createEngine,
  onWriteRejected,
  startBackend,
  stopBackend,
  type Environment,
} from './backend';
import { seenState } from './chore-booking';
import { completeChore, removeChoreEvent } from './commands-chores';
import { rateRecipe } from './commands-recipes';
import { TEST_ACCOUNTS, TEST_PASSWORD } from './dev-accounts';
import { DEMO_HOUSEHOLD_ID } from './seed/demo';
import { seedHouseholdId } from './seed/seed-sql';
import { createMemoryStorage } from './storage';
import { getData, getState } from './store';
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

/** Without realtime: the device sees another person's booking only when the test pulls. */
async function startAs(user: { client: SupabaseClient; userId: string }) {
  const transport = {
    ...createSupabaseTransport(fromSupabaseClient(user.client)),
    subscribe: () => () => {},
  };
  const engine = await startBackend({
    transport,
    storage: createMemoryStorage(),
    userId: user.userId,
    environment: online,
  });
  await engine.pull();
  await engine.whenIdle();
  return engine;
}

const choreNamed = (title: string) => {
  const chore = getData().chores.find((candidate) => candidate.title === title);
  if (!chore) throw new Error(`no chore ${title}`);
  return chore;
};

afterEach(async () => {
  await stopBackend();
});

describe.skipIf(!enabled)('spec 0011: chores and ratings in the local stack', () => {
  it('AC-028 / AC-060: checking off "Bad putzen" is booked, reaches Nadja, and removing restores it', async () => {
    const enrico = await signedIn(0);
    const nadja = await signedIn(1);
    const householdId = await seedHouseholdId(DEMO_HOUSEHOLD_ID);
    const rejected: string[] = [];
    const stop = onWriteRejected((message) => rejected.push(message));
    try {
      const engine = await startAs(enrico);
      const before = choreNamed('Bad putzen');
      const eventId = completeChore(before.id);
      if (!eventId) throw new Error('no event');
      await engine.whenIdle();
      await engine.pull();
      expect(rejected).toEqual([]);
      const booked = getData().choreEvents.find((event) => event.id === eventId);
      expect(booked).toMatchObject({
        choreId: before.id,
        kind: 'done',
        doneOn: getState().today,
        doneBy: enrico.userId,
        createdAt: expect.any(String),
        previous: { nextDueOn: before.nextDueOn, lastDoneOn: before.lastDoneOn },
      });
      expect(choreNamed('Bad putzen').lastDoneOn).toBe(getState().today);

      const other = createEngine({
        transport: createSupabaseTransport(fromSupabaseClient(nadja.client)),
        storage: createMemoryStorage(),
        userId: nadja.userId,
        environment: online,
      });
      await other.load();
      await other.pull();
      await other.pull();
      expect(
        other.getState()?.households[householdId]?.choreEvents.some((e) => e.id === eventId),
      ).toBe(true);
      other.stop();

      expect(removeChoreEvent(eventId)).toEqual({ restoresChore: true, undoable: true });
      await engine.whenIdle();
      await engine.pull();
      expect(rejected).toEqual([]);
      expect(getData().choreEvents.some((event) => event.id === eventId)).toBe(false);
      expect(choreNamed('Bad putzen')).toMatchObject({
        nextDueOn: before.nextDueOn,
        lastDoneOn: before.lastDoneOn,
        nextAssigneeId: before.nextAssigneeId,
      });
    } finally {
      stop();
      await enrico.client.auth.signOut();
      await nadja.client.auth.signOut();
    }
  });

  it('AC-031: Nadja was faster: one entry, and Enrico sees "<Nadja> war schneller (hh:mm)"', async () => {
    const enrico = await signedIn(0);
    const nadja = await signedIn(1);
    const householdId = await seedHouseholdId(DEMO_HOUSEHOLD_ID);
    const nadjaWire = createSupabaseTransport(fromSupabaseClient(nadja.client));
    const rejected: string[] = [];
    const stop = onWriteRejected((message) => rejected.push(message));
    const nadjaEvent = crypto.randomUUID();
    let booked = false;
    try {
      const engine = await startAs(enrico);
      const chore = choreNamed('Küche wischen');
      await nadjaWire.applyChanges(householdId, [
        {
          kind: 'complete_chore',
          completion: {
            chore_id: chore.id,
            event_id: nadjaEvent,
            kind: 'done',
            done_on: getState().today,
            done_by: nadja.userId,
            seen: seenState(chore, getData().choreEvents),
            next_due_on: '2099-01-01',
            next_assignee_id: chore.nextAssigneeId ?? null,
          },
        },
      ]);
      booked = true;
      const mine = completeChore(chore.id);
      await engine.whenIdle();
      await engine.pull();

      const name = getState().members.find((member) => member.id === nadja.userId)?.name;
      expect(rejected).toHaveLength(1);
      expect(rejected[0]?.startsWith(`${name ?? '?'} war schneller (`)).toBe(true);
      expect(rejected[0]).toMatch(/ war schneller \(\d\d:\d\d\)$/);
      const today = getData().choreEvents.filter(
        (event) => event.choreId === chore.id && event.doneOn === getState().today,
      );
      expect(today.map((event) => event.id)).toEqual([nadjaEvent]);
      expect(today.some((event) => event.id === mine)).toBe(false);
      expect(choreNamed('Küche wischen').nextDueOn).toBe('2099-01-01');
    } finally {
      if (booked) {
        await nadjaWire.applyChanges(householdId, [{ kind: 'remove_chore_event', id: nadjaEvent }]);
      }
      stop();
      await enrico.client.auth.signOut();
      await nadja.client.auth.signOut();
    }
  });

  it('AC-017 / AC-026 / AC-055: 4,5 stars reach Nadja; 4,3 and row inserts of entries are refused', async () => {
    const enrico = await signedIn(0);
    const nadja = await signedIn(1);
    const householdId = await seedHouseholdId(DEMO_HOUSEHOLD_ID);
    const wire = createSupabaseTransport(fromSupabaseClient(enrico.client));
    let recipeId: string | undefined;
    let previous: number | null = null;
    try {
      const engine = await startAs(enrico);
      const recipe = getData().recipes[0];
      if (!recipe) throw new Error('no recipe');
      recipeId = recipe.id;
      previous = recipe.ratings[enrico.userId] ?? null;
      rateRecipe(recipe.id, 4.5);
      await engine.whenIdle();
      await engine.pull();
      expect(getData().recipes.find((r) => r.id === recipe.id)).toMatchObject({
        ratings: expect.objectContaining({ [enrico.userId]: 4.5 }),
        ratedAt: expect.objectContaining({ [enrico.userId]: expect.any(String) }),
      });

      const other = createEngine({
        transport: createSupabaseTransport(fromSupabaseClient(nadja.client)),
        storage: createMemoryStorage(),
        userId: nadja.userId,
        environment: online,
      });
      await other.load();
      await other.pull();
      await other.pull();
      const seen = other
        .getState()
        ?.households[householdId]?.recipes.find((r) => r.id === recipeId);
      expect(seen?.ratings[enrico.userId]).toBe(4.5);
      other.stop();

      await expect(wire.setRecipeRating(recipe.id, 4.3)).rejects.toMatchObject({
        kind: 'permanent',
        code: 'invalid_stars',
      });
      await expect(
        wire.applyChanges(householdId, [
          {
            kind: 'insert',
            table: 'chore_events',
            row: { id: crypto.randomUUID(), title: 'Am Weg vorbei', kind: 'done' },
          },
        ]),
      ).rejects.toMatchObject({ kind: 'permanent', code: 'invalid_change' });
      await expect(
        wire.applyChanges(crypto.randomUUID(), [
          { kind: 'remove_chore_event', id: crypto.randomUUID() },
        ]),
      ).rejects.toMatchObject({ kind: 'permanent', code: 'not_member' });
    } finally {
      if (recipeId) await wire.setRecipeRating(recipeId, previous);
      await enrico.client.auth.signOut();
      await nadja.client.auth.signOut();
    }
  });
});
