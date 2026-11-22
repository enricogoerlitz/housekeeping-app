// Packing without network against the running local stack (spec 0012, ADR-0013): two devices,
// Nadja packs offline and both see the result once she is online again (AC-022); "Abhaken gewinnt"
// against a re-pack by Enrico (AC-023); resetting offline keeps what was packed again meanwhile
// (AC-030); "Alles einpacken" offline reaches the other device (AC-027). The test writes only a trip it creates itself and deletes it again (the packing
// list goes with it), so the seed stays as it was. Skipped unless SUPABASE_LOCAL=1, e.g.
//
//   set -a; . ./.env; set +a; SUPABASE_LOCAL=1 \
//     pnpm --filter @housekeeping/api exec vitest run src/packing.integration.test.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it } from 'vitest';

import { createEngine, startBackend, stopBackend, type Environment } from './backend';
import { createTrip } from './commands-trips';
import { packAll, resetPackingList, setPacked } from './commands-packing';
import { TEST_ACCOUNTS, TEST_PASSWORD } from './dev-accounts';
import { DEMO_HOUSEHOLD_ID } from './seed/demo';
import { seedHouseholdId } from './seed/seed-sql';
import { createMemoryStorage, type Storage } from './storage';
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

describe.skipIf(!enabled)('spec 0012: packing without network in the local stack', () => {
  it('AC-022, AC-023, AC-027, AC-030: two devices, offline packing, checking wins', async () => {
    const enrico = await signedIn(0);
    const nadja = await signedIn(1);
    const householdId = await seedHouseholdId(DEMO_HOUSEHOLD_ID);
    const enricoWire = createSupabaseTransport(fromSupabaseClient(enrico.client));
    const nadjaStorage = createMemoryStorage();
    const start = async (client: SupabaseClient, userId: string, storage: Storage) => {
      const engine = await startBackend({ supabase: client, storage, userId, environment: online });
      await engine.pull();
      await engine.whenIdle();
      return engine;
    };
    const enricoDevice = createEngine({
      transport: enricoWire,
      storage: createMemoryStorage(),
      userId: enrico.userId,
      environment: online,
    });
    const enricoSees = async () => {
      await enricoDevice.pull();
      return enricoDevice.getState()?.households[householdId]?.packingItems ?? [];
    };
    const serverItems = async (ids: string[]) => {
      const { data } = await enrico.client
        .from('packing_items')
        .select('id, packed, pack_seq, packed_by')
        .in('id', ids);
      return (data ?? []) as { id: string; packed: boolean; pack_seq: number; packed_by: string }[];
    };
    const repackAsEnrico = async (itemId: string) => {
      const [row] = await serverItems([itemId]);
      if (!row) throw new Error('item missing');
      await enricoWire.setPackingItemsPacked(householdId, [
        { item_id: itemId, packed: false, seen_pack_seq: row.pack_seq },
      ]);
      await enricoWire.setPackingItemsPacked(householdId, [
        { item_id: itemId, packed: true, seen_pack_seq: row.pack_seq + 1 },
      ]);
    };

    let tripId: string | undefined;
    try {
      // Nadja enters a trip with "Strand" (12 Packstücke).
      let engine = await start(nadja.client, nadja.userId, nadjaStorage);
      const strand = getData().packingBags.find((bag) => bag.name === 'Strand');
      if (!strand) throw new Error('seed: Strand missing');
      tripId = createTrip({
        memberIds: [nadja.userId],
        from: '2030-07-01',
        to: '2030-07-07',
        note: 'Integrationstest Packen',
        bagIds: [strand.id],
      });
      await engine.whenIdle();
      await engine.pull();
      const listBag = getData().packingListBags.find((bag) => bag.tripId === tripId);
      const items = getData().packingItems.filter((item) => item.listBagId === listBag?.id);
      expect(items).toHaveLength(12);
      expect(items.find((item) => item.name === 'T-Shirts')?.quantity).toBe(7);
      const five = items.slice(0, 5).map((item) => item.id);

      // AC-022: five packed without network, shown at once, the app closed and opened again.
      engine.setSimulatedOffline(true);
      for (const id of five) setPacked(id, true);
      expect(
        getData().packingItems.filter((item) => five.includes(item.id) && item.packed),
      ).toHaveLength(5);
      expect((await serverItems(five)).filter((row) => row.packed)).toHaveLength(0);
      await stopBackend();
      engine = await start(nadja.client, nadja.userId, nadjaStorage);
      await engine.whenIdle();
      await engine.pull();
      expect(
        (await serverItems(five)).every((row) => row.packed && row.packed_by === nadja.userId),
      ).toBe(true);
      await enricoDevice.load();
      await enricoDevice.pull();
      expect(
        (await enricoSees()).filter((item) => five.includes(item.id) && item.packed),
      ).toHaveLength(5);

      // AC-023: Nadja unpacks offline, Enrico packs it again online: it stays packed.
      const [first, second] = five;
      if (!first || !second) throw new Error('fixture');
      engine.setSimulatedOffline(true);
      setPacked(first, false);
      await repackAsEnrico(first);
      engine.setSimulatedOffline(false);
      await engine.whenIdle();
      await engine.pull();
      expect((await serverItems([first]))[0]).toMatchObject({
        packed: true,
        packed_by: enrico.userId,
      });
      expect(getData().packingItems.find((item) => item.id === first)?.packed).toBe(true);

      // AC-030: Nadja resets offline, Enrico packs one again meanwhile: only that one stays packed.
      engine.setSimulatedOffline(true);
      expect(resetPackingList(tripId ?? '')).toBe(5);
      await repackAsEnrico(second);
      engine.setSimulatedOffline(false);
      await engine.whenIdle();
      await engine.pull();
      const after = await serverItems(items.map((item) => item.id));
      expect(after.filter((row) => row.packed).map((row) => row.id)).toEqual([second]);
      expect(
        (await enricoSees())
          .filter((item) => item.listBagId === listBag?.id && item.packed)
          .map((item) => item.id),
      ).toEqual([second]);

      // AC-027: Nadja packs everything offline at once; online again, Enrico sees all 12 packed.
      engine.setSimulatedOffline(true);
      packAll(listBag?.id ?? '');
      expect(
        (await serverItems(items.map((item) => item.id))).filter((row) => row.packed),
      ).toHaveLength(1);
      engine.setSimulatedOffline(false);
      await engine.whenIdle();
      await engine.pull();
      expect(
        (await enricoSees()).filter((item) => item.listBagId === listBag?.id && item.packed),
      ).toHaveLength(12);
    } finally {
      enricoDevice.stop();
      if (tripId) {
        await enricoWire.applyChanges(householdId, [
          { kind: 'delete', table: 'trips', id: tripId },
        ]);
      }
      await enrico.client.auth.signOut();
      await nadja.client.auth.signOut();
    }
  });
});
