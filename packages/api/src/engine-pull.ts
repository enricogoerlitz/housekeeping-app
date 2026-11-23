// The delta pull of the sync engine (docs/architecture/sync.md): realtime only signals, a pull
// applies what changed, and changes the base now contains leave the outbox.
import {
  applyMemberships,
  applyPull,
  createSyncCache,
  dropSettled,
  needsFullLoad,
  pullRequestFor,
  type HouseholdCache,
  type SmallRow,
  type SyncCache,
  type SyncRow,
} from '@housekeeping/core';

import { isReflected } from './changes';
import {
  canReachServer,
  report,
  WRITE_REJECTED_MESSAGE,
  type EngineContext,
} from './engine-context';
import { persistCache } from './engine-persistence';
import { isNetworkFailure, isTransient, TransportError } from './transport';

const smallKey = (row: SmallRow) =>
  typeof row.id === 'string' ? row.id : `${String(row.household_id)}:${String(row.profile_id)}`;

/**
 * Rows the safety window delivers again are new objects with the same content. Keeping the cached
 * object for the same version (`updated_at`) keeps domain objects identical, so screens only
 * re-render for real changes.
 */
function keepIdentity(previous: SyncCache, next: SyncCache): SyncCache {
  const small: SyncCache['small'] = {};
  for (const [table, rows] of Object.entries(next.small)) {
    const old = new Map((previous.small[table] ?? []).map((row) => [smallKey(row), row]));
    const kept = rows.map((row) => {
      const cached = old.get(smallKey(row));
      return cached && cached.updated_at === row.updated_at ? cached : row;
    });
    const before = previous.small[table];
    small[table] =
      before && before.length === kept.length && kept.every((row, index) => row === before[index])
        ? before
        : kept;
  }
  const households: SyncCache['households'] = {};
  for (const [householdId, household] of Object.entries(next.households)) {
    const old = previous.households[householdId];
    if (!old || old === household) {
      households[householdId] = household;
      continue;
    }
    const tables: HouseholdCache['tables'] = {};
    for (const [table, rows] of Object.entries(household.tables)) {
      const cachedRows = old.tables[table] ?? {};
      let changed = Object.keys(cachedRows).length !== Object.keys(rows).length;
      const kept: Record<string, SyncRow> = {};
      for (const [id, row] of Object.entries(rows)) {
        const cached = cachedRows[id];
        kept[id] = cached && cached.updated_at === row.updated_at ? cached : row;
        if (kept[id] !== cached) changed = true;
      }
      tables[table] = changed ? kept : cachedRows;
    }
    households[householdId] = { ...household, tables };
  }
  return { ...next, small, households };
}

/** One realtime channel per household while the engine runs. */
export function updateChannels(ctx: EngineContext): void {
  const { channels } = ctx;
  const wanted = new Set(ctx.running ? (ctx.cache?.householdIds ?? []) : []);
  for (const [householdId, unsubscribe] of channels) {
    if (!wanted.has(householdId)) {
      unsubscribe();
      channels.delete(householdId);
    }
  }
  for (const householdId of wanted) {
    if (!channels.has(householdId)) {
      channels.set(
        householdId,
        ctx.transport.subscribe(householdId, () => onSignal(ctx)),
      );
    }
  }
}

function onSignal(ctx: EngineContext): void {
  if (ctx.debounceTimer) clearTimeout(ctx.debounceTimer);
  ctx.debounceTimer = setTimeout(() => {
    ctx.debounceTimer = undefined;
    void requestPull(ctx);
  }, ctx.debounceMs);
}

/** Drops what the base now contains; a write whose answer got lost counts only if it arrived. */
function settle(ctx: EngineContext): void {
  const kept = new Set(
    dropSettled(
      ctx.commits.map((entry) => entry.changeset),
      ctx.appliedGeneration,
    ).map((changeset) => changeset.id),
  );
  let lost = false;
  for (const entry of ctx.commits) {
    if (kept.has(entry.changeset.id) || !entry.unknownOutcome) continue;
    const base = ctx.baseTables(entry.changeset.householdId);
    if (!base || !isReflected(base, entry.changeset.ops)) {
      entry.rejected = true;
      lost = true;
      report(entry, new TransportError('permanent', 'write_lost'));
    } else {
      report(entry);
    }
  }
  ctx.commits = ctx.commits.filter((entry) => kept.has(entry.changeset.id));
  ctx.settling = ctx.settling.filter((settled) => settled.confirmedAt >= ctx.appliedGeneration);
  if (lost) ctx.options.onWriteRejected?.(WRITE_REJECTED_MESSAGE);
}

async function pullOnce(ctx: EngineContext): Promise<void> {
  if (!canReachServer(ctx)) return;
  const { cacheVersion, transport, userId } = ctx;
  const at = ctx.epoch;
  const generation = ++ctx.startedGeneration;
  const base =
    ctx.cache && ctx.cache.version === cacheVersion ? ctx.cache : createSyncCache(cacheVersion);
  let request = pullRequestFor(base);
  let result = await transport.syncPull(request);
  const stale = needsFullLoad(base, result.serverTime, {
    retentionDays: ctx.retentionDays,
    cacheVersion,
  }).householdIds.filter((householdId) => request.households[householdId]?.full === false);
  if (stale.length > 0) {
    // Longer offline than the deletion log is kept: load these households in full (AC-017).
    request = pullRequestFor(base, stale);
    result = await transport.syncPull(request);
  }
  if (at !== ctx.epoch) return;
  if (!(result.small.profiles ?? []).some((row) => row.id === userId)) {
    // Every pull carries the own profile; without it the account was deleted (e.g. db reset).
    ctx.options.onAccountMissing?.();
    return;
  }

  const memberOf = (result.small.household_members ?? [])
    .filter((row) => row.profile_id === userId)
    .map((row) => String(row.household_id));
  const next = keepIdentity(base, applyMemberships(applyPull(base, result), memberOf));
  ctx.cache = next;
  ctx.appliedGeneration = generation;
  ctx.lastSyncedAt = result.serverTime;
  ctx.networkFailed = false;
  ctx.lastPullFailed = false;
  settle(ctx);
  ctx.rebuild();
  updateChannels(ctx);
  await persistCache(ctx, next);
  // A household joined since the last pull is loaded in full right away (first start: 2 trips).
  if (memberOf.some((householdId) => !next.households[householdId]?.pulledAt)) {
    ctx.pullAgain = true;
  }
}

/** Pulls now, or once more after the pull that is running. */
export function requestPull(ctx: EngineContext): Promise<void> {
  if (ctx.pullPromise) {
    ctx.pullAgain = true;
    return ctx.pullPromise;
  }
  ctx.pullPromise = (async () => {
    try {
      do {
        ctx.pullAgain = false;
        try {
          await pullOnce(ctx);
        } catch (error) {
          if (isNetworkFailure(error)) ctx.networkFailed = !ctx.transport.isBlocked();
          else ctx.lastPullFailed = !isTransient(error);
          if (!(error instanceof TransportError)) {
            console.warn(`Sync failed: ${error instanceof Error ? error.name : 'unknown'}`);
          }
          ctx.pullAgain = false;
        }
      } while (ctx.pullAgain && ctx.running);
    } finally {
      ctx.pullPromise = undefined;
      ctx.rebuild();
    }
  })();
  ctx.publishSyncState();
  return ctx.pullPromise;
}
