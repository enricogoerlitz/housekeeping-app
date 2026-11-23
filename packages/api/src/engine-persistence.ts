// What the sync engine keeps on the device (spec 0003, AC-003, AC-018): the cache under its
// version and user, the store queue, and the household and store chosen on this device.
import { parseStoredQueue, type HouseholdCache, type SyncCache } from '@housekeeping/core';

import { unsent, WRITE_REJECTED_MESSAGE, type EngineContext } from './engine-context';
import { dropMediaOutside } from './media-cache';

interface PersistedMeta {
  version: number;
  userId: string;
  householdIds: string[];
}

function isMeta(value: unknown): value is PersistedMeta {
  if (typeof value !== 'object' || value === null) return false;
  const meta = value as Record<string, unknown>;
  return (
    typeof meta.version === 'number' &&
    typeof meta.userId === 'string' &&
    Array.isArray(meta.householdIds)
  );
}

const householdKey = (householdId: string) => `household:${householdId}`;

/** The stored store choices: household id → store id or null; anything else is dropped. */
function storeChoicesFrom(value: unknown): Record<string, string | null> {
  if (typeof value !== 'object' || value === null) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string | null] =>
        entry[1] === null || typeof entry[1] === 'string',
    ),
  );
}

function meta(ctx: EngineContext): PersistedMeta {
  return {
    version: ctx.cacheVersion,
    userId: ctx.userId,
    householdIds: ctx.cache?.householdIds ?? [],
  };
}

export async function persistQueue(ctx: EngineContext): Promise<void> {
  if (ctx.cleared) return;
  await ctx.storage.setMany([
    ['meta', meta(ctx)],
    ['queue', unsent(ctx)],
  ]);
}

/** One sync step is written in one transaction: meta, small tables, changed households, queue. */
export async function persistCache(ctx: EngineContext, next: SyncCache): Promise<void> {
  const { persisted, storage } = ctx;
  const entries: [string, unknown][] = [
    ['meta', meta(ctx)],
    ['small', next.small],
    ['queue', unsent(ctx)],
  ];
  for (const householdId of next.householdIds) {
    const household = next.households[householdId];
    if (household && persisted.get(householdId) !== household) {
      entries.push([householdKey(householdId), household]);
      persisted.set(householdId, household);
    }
  }
  const removed = [...persisted.keys()].filter((householdId) => !next.households[householdId]);
  for (const householdId of removed) persisted.delete(householdId);
  // A household the user lost leaves nothing on the device, also not as the stored choice.
  // Lost means no longer a member: a household not loaded yet (first pull) is not lost.
  const member = (householdId: string) => next.householdIds.includes(householdId);
  const lostChoice = ctx.chosenHouseholdId !== undefined && !member(ctx.chosenHouseholdId);
  if (lostChoice) ctx.chosenHouseholdId = undefined;
  if (Object.keys(ctx.storeChoices).some((householdId) => !member(householdId))) {
    ctx.storeChoices = Object.fromEntries(
      Object.entries(ctx.storeChoices).filter(([householdId]) => member(householdId)),
    );
    entries.push(['store-choices', ctx.storeChoices]);
  }
  await storage.setMany(entries);
  const gone = removed.map(householdKey);
  if (lostChoice) gone.push('active');
  if (gone.length > 0) await storage.del(gone);
  // Its photos go with it (photos-remote.ts keeps them next to the cache).
  if (removed.length > 0) await dropMediaOutside(storage, new Set(Object.keys(next.households)));
}

/** Reads store queue, household and store choices of this device into the engine. */
async function readDeviceState(ctx: EngineContext): Promise<void> {
  const { storage } = ctx;
  // Kept across cache versions and app updates, so an entry may no longer parse: it is dropped,
  // and the user is told that an action got lost.
  const { entries, dropped } = parseStoredQueue(await storage.get('queue'));
  ctx.queue = entries;
  if (dropped > 0) {
    await storage.setMany([['queue', ctx.queue]]);
    ctx.options.onWriteRejected?.(WRITE_REJECTED_MESSAGE);
  }
  const chosen = await storage.get('active');
  ctx.chosenHouseholdId = typeof chosen === 'string' ? chosen : undefined;
  ctx.storeChoices = storeChoicesFrom(await storage.get('store-choices'));
  for (const entry of ctx.queue) ctx.entrySeq.set(entry, ++ctx.seq);
}

/** Reads the cache from storage and builds the state; no network. */
export async function load(ctx: EngineContext): Promise<void> {
  if (ctx.loaded) return;
  ctx.loaded = true;
  const { storage, cacheVersion } = ctx;
  const stored = await storage.get('meta');
  if (!isMeta(stored) || stored.userId !== ctx.userId) {
    // Another user or nothing yet: start empty (AC-003).
    await storage.clear();
  } else if (stored.version !== cacheVersion) {
    // Another cache version: the cache is loaded again (AC-018), but what waits to be sent and
    // what was chosen on this device is no cache and stays.
    await readDeviceState(ctx);
    await storage.clear();
    const kept: [string, unknown][] = [
      ['meta', meta(ctx)],
      ['queue', ctx.queue],
      ['store-choices', ctx.storeChoices],
    ];
    if (ctx.chosenHouseholdId !== undefined) kept.push(['active', ctx.chosenHouseholdId]);
    await storage.setMany(kept);
  } else {
    const small = (await storage.get('small')) as SyncCache['small'] | undefined;
    const households: SyncCache['households'] = {};
    for (const householdId of stored.householdIds) {
      // Written by this module under the same cache version.
      const household = (await storage.get(householdKey(householdId))) as
        HouseholdCache | undefined;
      if (household) {
        households[householdId] = household;
        ctx.persisted.set(householdId, household);
      }
    }
    ctx.cache = {
      version: cacheVersion,
      householdIds: stored.householdIds,
      small: small ?? {},
      households,
    };
    await readDeviceState(ctx);
  }
  ctx.rebuild();
}

export function rememberActiveHousehold(ctx: EngineContext, householdId: string): void {
  if (ctx.cleared || ctx.chosenHouseholdId === householdId) return;
  ctx.chosenHouseholdId = householdId;
  // meta binds the choice to this user: another user's start clears the whole storage.
  void ctx.storage
    .setMany([
      ['meta', meta(ctx)],
      ['active', householdId],
    ])
    .catch((error: unknown) => {
      console.warn(
        `Storing the household failed: ${error instanceof Error ? error.name : 'unknown'}`,
      );
    });
}

export function rememberShoppingStore(
  ctx: EngineContext,
  householdId: string,
  storeId: string | null,
): void {
  if (ctx.cleared || ctx.storeChoices[householdId] === storeId) return;
  ctx.storeChoices = { ...ctx.storeChoices, [householdId]: storeId };
  ctx.rebuild();
  // Only on this device (spec 0006): meta binds it to the user like the chosen household.
  void ctx.storage
    .setMany([
      ['meta', meta(ctx)],
      ['store-choices', ctx.storeChoices],
    ])
    .catch((error: unknown) => {
      console.warn(`Storing the store failed: ${error instanceof Error ? error.name : 'unknown'}`);
    });
}
