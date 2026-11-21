// The sync engine (spec 0003) keeps a local cache of the user's households, pulls
// deltas (docs/architecture/sync.md), shows `server rows ⊕ store queue ⊕ pending changesets`
// (ADR-0011) and sends writes through one FIFO outbox. Merge and sync rules are core functions;
// this module only does the I/O and the bookkeeping around them.
import {
  applyMemberships,
  applyPull,
  applyQueue,
  createSyncCache,
  dropSettled,
  enqueue,
  needsFullLoad,
  parseStoredQueue,
  pullRequestFor,
  rejectFrom,
  remapQueue,
  visibleTables,
  type Changeset,
  type HouseholdCache,
  type Row,
  type RowOp,
  type SmallRow,
  type StoreQueueEntry,
  type SyncCache,
  type SyncRow,
  type TableRows,
} from '@housekeeping/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useSyncExternalStore } from 'react';

import { diffHousehold, isReflected, sendable } from './changes';
import { rowsToHousehold, rowsToMembers } from './db/mapping';
import { dropMediaOutside } from './media-cache';
import type { Storage } from './storage';
import {
  attachBackend,
  detachBackend,
  OfflineError,
  peekState,
  publishState,
  type AppState,
  type BackendHooks,
  type CommitOutcome,
  type CommitSpec,
  type HouseholdData,
  type StoreAction,
} from './store';
import {
  isNetworkFailure,
  isTransient,
  switchable,
  TransportError,
  type AddEntry,
  type Transport,
} from './transport';
import { createSupabaseTransport, fromSupabaseClient } from './transport-supabase';

/**
 * Bump when the cached shape changes: the device then drops its cache and loads again (AC-018).
 * What is not cache survives the bump: the store queue and the choices made on this device.
 */
export const CACHE_VERSION = 5;
/** Retention of `deleted_records` on the server (pg_cron). */
const RETENTION_DAYS = 30;
export const WRITE_REJECTED_MESSAGE = 'Hat nicht geklappt – bitte noch einmal versuchen';

const HISTORY_LIMIT = 100;

/** Signals from the platform: network and app visibility. */
export interface Environment {
  isOnline(): boolean;
  isVisible(): boolean;
  subscribe(listener: { online?(): void; offline?(): void; foreground?(): void }): () => void;
}

/** Browser events where they exist; elsewhere always online and visible. */
export function browserEnvironment(): Environment {
  const target = globalThis as {
    navigator?: { onLine?: boolean };
    document?: { visibilityState?: string };
    addEventListener?: (type: string, listener: () => void) => void;
    removeEventListener?: (type: string, listener: () => void) => void;
  };
  const visible = () => target.document?.visibilityState !== 'hidden';
  return {
    isOnline: () => target.navigator?.onLine !== false,
    isVisible: visible,
    subscribe(listener) {
      const online = () => listener.online?.();
      const offline = () => listener.offline?.();
      const visibility = () => {
        if (visible()) listener.foreground?.();
      };
      target.addEventListener?.('online', online);
      target.addEventListener?.('offline', offline);
      target.addEventListener?.('visibilitychange', visibility);
      return () => {
        target.removeEventListener?.('online', online);
        target.removeEventListener?.('offline', offline);
        target.removeEventListener?.('visibilitychange', visibility);
      };
    },
  };
}

const BERLIN_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Berlin',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * The calendar day in Berlin ("YYYY-MM-DD"): the household's "today", whatever the device's time
 * zone. The state is rebuilt at least with every pull (every 60 s), so it moves on after midnight.
 */
export function berlinToday(now: Date): string {
  const parts = Object.fromEntries(
    BERLIN_DATE.formatToParts(now).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export interface SyncState {
  status: 'idle' | 'syncing' | 'offline' | 'error';
  /** `serverTime` of the last pull applied. */
  lastSyncedAt?: string;
  /** At least one household is in the cache, so the screens can show data. */
  ready: boolean;
}

export interface EngineOptions {
  transport: Transport;
  storage: Storage;
  /** The signed-in user; the cache is bound to it (AC-003). */
  userId: string;
  environment?: Environment;
  cacheVersion?: number;
  retentionDays?: number;
  realtimeDebounceMs?: number;
  fallbackIntervalMs?: number;
  retryDelaysMs?: readonly number[];
  onStateChange?: (state: AppState) => void;
  onSyncStateChange?: (state: SyncState) => void;
  onWriteRejected?: (message: string) => void;
  /** The small tables (profiles, households, memberships, invitations) changed. */
  onSmallChange?: (small: SyncCache['small']) => void;
  /** Where the app keeps the household being shown (switchHousehold changes it in the store). */
  readActiveHouseholdId?: () => string | undefined;
  /** A pull came back without the user's own profile: the account no longer exists. */
  onAccountMissing?: () => void;
}

export interface Engine extends BackendHooks {
  /** Reads the cache from storage and builds the state; no network. */
  load(): Promise<void>;
  /** load(), then listens to the triggers and pulls. */
  start(): Promise<void>;
  stop(): void;
  pull(): Promise<void>;
  /** Resolves when no pull is running and the outbox has nothing it can send right now. */
  whenIdle(): Promise<void>;
  getState(): AppState | undefined;
  getSyncState(): SyncState;
  /** Sign-out or another user: empties cache, store queue and outbox on this device. */
  resetLocalData(): Promise<void>;
}

/** A changeset waiting in the outbox, and what is needed to undo it. */
interface OutboxCommit {
  seq: number;
  changeset: Changeset;
  send: (transport: Transport) => Promise<unknown>;
  inverse?: { ops: RowOp[]; send: (transport: Transport) => Promise<unknown> };
  response?: unknown;
  /** The answer got lost: the next pull shows whether it arrived. */
  unknownOutcome?: boolean;
  rejected?: boolean;
  /** Told once whether the server took the change (commitConfirmed). */
  onOutcome?: CommitOutcome;
  rejectedMessage?: (error: unknown) => string | undefined;
}

/** Tells the waiting caller once how its change ended. */
function report(entry: OutboxCommit, error?: unknown): void {
  const onOutcome = entry.onOutcome;
  entry.onOutcome = undefined;
  onOutcome?.(error);
}

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

const EMPTY_SMALL: SyncCache['small'] = {};

const householdKey = (householdId: string) => `household:${householdId}`;

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

/**
 * The household shown when none is chosen: the one the user joined first (ties: by name), so the
 * choice does not depend on the order the server lists them in.
 */
function firstJoined(
  small: SyncCache['small'] | undefined,
  userId: string,
  households: Record<string, HouseholdData>,
): string | undefined {
  const joined = new Map<string, string>();
  for (const row of small?.household_members ?? []) {
    if (row.profile_id === userId && typeof row.created_at === 'string') {
      joined.set(String(row.household_id), row.created_at);
    }
  }
  const at = (id: string) => joined.get(id) ?? '9999';
  return Object.keys(households).sort(
    (a, b) =>
      (at(a) === at(b) ? 0 : at(a) < at(b) ? -1 : 1) ||
      (households[a]?.household.name ?? '').localeCompare(
        households[b]?.household.name ?? '',
        'de',
      ),
  )[0];
}

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

function byId(rows: readonly SmallRow[]): Record<string, Row> {
  const result: Record<string, Row> = {};
  for (const row of rows) if (typeof row.id === 'string') result[row.id] = row as Row;
  return result;
}

function toAddEntry(entry: Extract<StoreQueueEntry, { kind: 'add' }>): AddEntry {
  const first = entry.contributions[0];
  return {
    client_item_id: entry.clientItemId,
    client_article_id: entry.clientArticleId,
    article_name: first?.articleName ?? '',
    name_key: first?.nameKey ?? '',
    contributions: entry.contributions.map((contribution) => ({
      id: contribution.clientContributionId,
      source: { kind: 'manual' },
      count: contribution.count ?? null,
      qty: contribution.qty ?? null,
      unit: contribution.unit ?? null,
      note: contribution.note ?? null,
    })),
  };
}

export function createEngine(options: EngineOptions): Engine {
  const { storage, userId } = options;
  const transport = switchable(options.transport);
  const environment = options.environment ?? browserEnvironment();
  const cacheVersion = options.cacheVersion ?? CACHE_VERSION;
  const retentionDays = options.retentionDays ?? RETENTION_DAYS;
  const debounceMs = options.realtimeDebounceMs ?? 300;
  const intervalMs = options.fallbackIntervalMs ?? 60_000;
  const retryDelays = options.retryDelaysMs ?? [1000, 2000, 5000, 10_000, 30_000];

  let cache: SyncCache | undefined;
  const persisted = new Map<string, HouseholdCache>();
  let loaded = false;
  /** The household last chosen on this device (stored with the cache, so bound to the user). */
  let chosenHouseholdId: string | undefined;
  /** The store last chosen in "Einkaufen" per household (spec 0006), stored like the household. */
  let storeChoices: Record<string, string | null> = {};

  // Store queue: waiting entries, the one being sent, and answered ones shown until the next pull.
  let queue: StoreQueueEntry[] = [];
  let inFlight: StoreQueueEntry | undefined;
  let settling: { entry: StoreQueueEntry; confirmedAt: number }[] = [];
  const entrySeq = new WeakMap<StoreQueueEntry, number>();
  const knownCheckSeq = new Map<string, number>();

  let commits: OutboxCommit[] = [];
  let history: OutboxCommit[] = [];
  let seq = 0;
  let startedGeneration = 0;
  let appliedGeneration = 0;

  let networkFailed = false;
  let lastPullFailed = false;
  let lastSyncedAt: string | undefined;
  let appState: AppState | undefined;
  let publishedSmall: SyncCache['small'] | undefined;
  let syncState: SyncState = { status: 'idle', ready: false };

  let pullPromise: Promise<void> | undefined;
  let pullAgain = false;
  let drainPromise: Promise<void> | undefined;
  let drainAgain = false;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let retryAttempt = 0;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let intervalTimer: ReturnType<typeof setInterval> | undefined;
  let unsubscribeEnvironment: (() => void) | undefined;
  const channels = new Map<string, () => void>();
  let running = false;
  /** Bumped by a reset; work started before it must not write its result. */
  let epoch = 0;
  /** A reset engine writes nothing to the device any more (the storage belongs to the next start). */
  let cleared = false;

  const unsent = () => (inFlight ? [inFlight, ...queue] : queue);
  const isOffline = () => transport.isBlocked() || !environment.isOnline() || networkFailed;
  const canReachServer = () => !transport.isBlocked() && environment.isOnline();

  // ---------- visible state ----------

  function withSeq(entry: StoreQueueEntry, from: StoreQueueEntry): StoreQueueEntry {
    const value = entrySeq.get(from);
    if (value !== undefined && !entrySeq.has(entry)) entrySeq.set(entry, value);
    return entry;
  }

  /** Items with a store action that has not been answered yet (the small dot). */
  function pendingItemIds(base: TableRows, householdId: string): Set<string> {
    const after = applyQueue(base, unsent(), householdId);
    const ids = new Set<string>();
    if (after === base) return ids;
    for (const [id, row] of Object.entries(after.shopping_items ?? {})) {
      if (base.shopping_items?.[id] !== row) ids.add(id);
    }
    for (const [id, row] of Object.entries(after.shopping_contributions ?? {})) {
      if (base.shopping_contributions?.[id] !== row) ids.add(String(row.item_id));
    }
    return ids;
  }

  function baseTables(householdId: string): TableRows | undefined {
    const household = cache?.households[householdId];
    if (!cache || !household?.pulledAt) return undefined;
    return { ...household.tables, households: byId(cache.small.households ?? []) };
  }

  function computeSyncState(): SyncState {
    const status = isOffline()
      ? 'offline'
      : pullPromise
        ? 'syncing'
        : lastPullFailed
          ? 'error'
          : 'idle';
    const ready = Object.keys(appState?.households ?? {}).length > 0;
    return { status, lastSyncedAt, ready };
  }

  function publishSyncState(): void {
    const next = computeSyncState();
    if (
      next.status === syncState.status &&
      next.lastSyncedAt === syncState.lastSyncedAt &&
      next.ready === syncState.ready
    ) {
      return;
    }
    syncState = next;
    options.onSyncStateChange?.(next);
  }

  function publishSmall(): void {
    const small = cache?.small ?? EMPTY_SMALL;
    if (small === publishedSmall) return;
    publishedSmall = small;
    options.onSmallChange?.(small);
  }

  function rebuild(): void {
    publishSmall();
    const previous = appState;
    const households: Record<string, HouseholdData> = {};
    if (cache) {
      const overlay = [...settling.map((settled) => settled.entry), ...unsent()];
      const changesets = commits.map((entry) => entry.changeset);
      for (const householdId of cache.householdIds) {
        const base = baseTables(householdId);
        if (!base?.households?.[householdId]) continue;
        const tables = visibleTables(base, householdId, overlay, changesets);
        const small =
          tables.households === base.households
            ? cache.small
            : { ...cache.small, households: Object.values(tables.households ?? {}) };
        const confirmed = applyQueue(
          base,
          settling.map((settled) => settled.entry),
          householdId,
        );
        households[householdId] = rowsToHousehold(tables, small, householdId, {
          previous: previous?.households[householdId],
          pendingItemIds: pendingItemIds(confirmed, householdId),
        });
      }
    }
    const ids = Object.keys(households);
    const wanted = [
      options.readActiveHouseholdId?.(),
      previous?.activeHouseholdId,
      chosenHouseholdId,
    ].find((id) => id !== undefined && households[id] !== undefined);
    const activeHouseholdId = wanted ?? firstJoined(cache?.small, userId, households) ?? '';
    const sameHouseholds =
      previous !== undefined &&
      ids.length === Object.keys(previous.households).length &&
      ids.every((id) => households[id] === previous.households[id]);
    const members = cache
      ? rowsToMembers(cache.small, previous?.members)
      : (previous?.members ?? []);
    const next: AppState = {
      today: berlinToday(new Date()),
      members,
      currentMemberId: userId,
      activeHouseholdId,
      households: sameHouseholds && previous ? previous.households : households,
      offline: isOffline(),
      storeChoices,
    };
    if (
      previous &&
      (Object.keys(next) as (keyof AppState)[]).every((key) => next[key] === previous[key])
    ) {
      publishSyncState();
      return;
    }
    appState = next;
    options.onStateChange?.(next);
    publishSyncState();
  }

  /** The store holds the command's own result; the engine's view (same rows) replaces it. */
  function republish(): void {
    rebuild();
    if (appState) options.onStateChange?.(appState);
  }

  // ---------- storage ----------

  function meta(): PersistedMeta {
    return { version: cacheVersion, userId, householdIds: cache?.householdIds ?? [] };
  }

  async function persistQueue(): Promise<void> {
    if (cleared) return;
    await storage.setMany([
      ['meta', meta()],
      ['queue', unsent()],
    ]);
  }

  /** One sync step is written in one transaction: meta, small tables, changed households, queue. */
  async function persistCache(next: SyncCache): Promise<void> {
    const entries: [string, unknown][] = [
      ['meta', meta()],
      ['small', next.small],
      ['queue', unsent()],
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
    const lostChoice = chosenHouseholdId !== undefined && !member(chosenHouseholdId);
    if (lostChoice) chosenHouseholdId = undefined;
    if (Object.keys(storeChoices).some((householdId) => !member(householdId))) {
      storeChoices = Object.fromEntries(
        Object.entries(storeChoices).filter(([householdId]) => member(householdId)),
      );
      entries.push(['store-choices', storeChoices]);
    }
    await storage.setMany(entries);
    const gone = removed.map(householdKey);
    if (lostChoice) gone.push('active');
    if (gone.length > 0) await storage.del(gone);
    // Its photos go with it (photos-remote.ts keeps them next to the cache).
    if (removed.length > 0) await dropMediaOutside(storage, new Set(Object.keys(next.households)));
  }

  async function load(): Promise<void> {
    if (loaded) return;
    loaded = true;
    const stored = await storage.get('meta');
    if (!isMeta(stored) || stored.userId !== userId) {
      // Another user or nothing yet: start empty (AC-003).
      await storage.clear();
    } else if (stored.version !== cacheVersion) {
      // Another cache version: the cache is loaded again (AC-018), but what waits to be sent and
      // what was chosen on this device is no cache and stays.
      await readDeviceState();
      await storage.clear();
      const kept: [string, unknown][] = [
        ['meta', meta()],
        ['queue', queue],
        ['store-choices', storeChoices],
      ];
      if (chosenHouseholdId !== undefined) kept.push(['active', chosenHouseholdId]);
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
          persisted.set(householdId, household);
        }
      }
      cache = {
        version: cacheVersion,
        householdIds: stored.householdIds,
        small: small ?? {},
        households,
      };
      await readDeviceState();
    }
    rebuild();
  }

  /** Reads store queue, household and store choices of this device into the engine. */
  async function readDeviceState(): Promise<void> {
    // Kept across cache versions and app updates, so an entry may no longer parse: it is dropped,
    // and the user is told that an action got lost.
    const { entries, dropped } = parseStoredQueue(await storage.get('queue'));
    queue = entries;
    if (dropped > 0) {
      await storage.setMany([['queue', queue]]);
      options.onWriteRejected?.(WRITE_REJECTED_MESSAGE);
    }
    const chosen = await storage.get('active');
    chosenHouseholdId = typeof chosen === 'string' ? chosen : undefined;
    storeChoices = storeChoicesFrom(await storage.get('store-choices'));
    for (const entry of queue) entrySeq.set(entry, ++seq);
  }

  // ---------- pull ----------

  function updateChannels(): void {
    const wanted = new Set(running ? (cache?.householdIds ?? []) : []);
    for (const [householdId, unsubscribe] of channels) {
      if (!wanted.has(householdId)) {
        unsubscribe();
        channels.delete(householdId);
      }
    }
    for (const householdId of wanted) {
      if (!channels.has(householdId)) {
        channels.set(householdId, transport.subscribe(householdId, onSignal));
      }
    }
  }

  function onSignal(): void {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = undefined;
      void requestPull();
    }, debounceMs);
  }

  /** Drops what the base now contains; a write whose answer got lost counts only if it arrived. */
  function settle(): void {
    const kept = new Set(
      dropSettled(
        commits.map((entry) => entry.changeset),
        appliedGeneration,
      ).map((changeset) => changeset.id),
    );
    let lost = false;
    for (const entry of commits) {
      if (kept.has(entry.changeset.id) || !entry.unknownOutcome) continue;
      const base = baseTables(entry.changeset.householdId);
      if (!base || !isReflected(base, entry.changeset.ops)) {
        entry.rejected = true;
        lost = true;
        report(entry, new TransportError('permanent', 'write_lost'));
      } else {
        report(entry);
      }
    }
    commits = commits.filter((entry) => kept.has(entry.changeset.id));
    settling = settling.filter((settled) => settled.confirmedAt >= appliedGeneration);
    if (lost) options.onWriteRejected?.(WRITE_REJECTED_MESSAGE);
  }

  async function pullOnce(): Promise<void> {
    if (!canReachServer()) return;
    const at = epoch;
    const generation = ++startedGeneration;
    const base = cache && cache.version === cacheVersion ? cache : createSyncCache(cacheVersion);
    let request = pullRequestFor(base);
    let result = await transport.syncPull(request);
    const stale = needsFullLoad(base, result.serverTime, {
      retentionDays,
      cacheVersion,
    }).householdIds.filter((householdId) => request.households[householdId]?.full === false);
    if (stale.length > 0) {
      // Longer offline than the deletion log is kept: load these households in full (AC-017).
      request = pullRequestFor(base, stale);
      result = await transport.syncPull(request);
    }
    if (at !== epoch) return;
    if (!(result.small.profiles ?? []).some((row) => row.id === userId)) {
      // Every pull carries the own profile; without it the account was deleted (e.g. db reset).
      options.onAccountMissing?.();
      return;
    }

    const memberOf = (result.small.household_members ?? [])
      .filter((row) => row.profile_id === userId)
      .map((row) => String(row.household_id));
    const next = keepIdentity(base, applyMemberships(applyPull(base, result), memberOf));
    cache = next;
    appliedGeneration = generation;
    lastSyncedAt = result.serverTime;
    networkFailed = false;
    lastPullFailed = false;
    settle();
    rebuild();
    updateChannels();
    await persistCache(next);
    // A household joined since the last pull is loaded in full right away (first start: 2 trips).
    if (memberOf.some((householdId) => !next.households[householdId]?.pulledAt)) pullAgain = true;
  }

  function requestPull(): Promise<void> {
    if (pullPromise) {
      pullAgain = true;
      return pullPromise;
    }
    pullPromise = (async () => {
      try {
        do {
          pullAgain = false;
          try {
            await pullOnce();
          } catch (error) {
            if (isNetworkFailure(error)) networkFailed = !transport.isBlocked();
            else lastPullFailed = !isTransient(error);
            if (!(error instanceof TransportError)) {
              console.warn(`Sync failed: ${error instanceof Error ? error.name : 'unknown'}`);
            }
            pullAgain = false;
          }
        } while (pullAgain && running);
      } finally {
        pullPromise = undefined;
        rebuild();
      }
    })();
    publishSyncState();
    return pullPromise;
  }

  // ---------- outbox ----------

  function scheduleRetry(): void {
    if (retryTimer) return;
    const delay = retryDelays[Math.min(retryAttempt, retryDelays.length - 1)] ?? 30_000;
    retryAttempt += 1;
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      void drain();
    }, delay);
  }

  function noteFailure(error: unknown): void {
    if (isNetworkFailure(error) && !transport.isBlocked()) networkFailed = true;
  }

  function noteSuccess(): void {
    if (networkFailed) {
      networkFailed = false;
      rebuild();
    }
  }

  async function sendCommit(entry: OutboxCommit): Promise<void> {
    entry.changeset = { ...entry.changeset, status: 'sent' };
    try {
      entry.response = await entry.send(transport);
      noteSuccess();
      entry.changeset = { ...entry.changeset, status: 'confirmed', confirmedAt: startedGeneration };
      report(entry);
    } catch (error) {
      if (isTransient(error)) {
        noteFailure(error);
        entry.unknownOutcome = true;
        entry.changeset = {
          ...entry.changeset,
          status: 'confirmed',
          confirmedAt: startedGeneration,
        };
      } else {
        const { dropped } = rejectFrom(
          commits.map((candidate) => candidate.changeset),
          entry.changeset.id,
        );
        const droppedIds = new Set(dropped.map((changeset) => changeset.id));
        for (const candidate of commits) {
          if (!droppedIds.has(candidate.changeset.id)) continue;
          candidate.rejected = true;
          report(candidate, error);
        }
        commits = commits.filter((candidate) => !droppedIds.has(candidate.changeset.id));
        rebuild();
        options.onWriteRejected?.(entry.rejectedMessage?.(error) ?? WRITE_REJECTED_MESSAGE);
        return;
      }
    }
    void requestPull();
  }

  function rewriteQueue(rewrite: (entries: StoreQueueEntry[]) => StoreQueueEntry[]): void {
    const before = queue;
    const after = rewrite(before);
    queue = after.map((entry, index) => {
      const from = before[index];
      return from ? withSeq(entry, from) : entry;
    });
  }

  /** Sends the first store-queue entry. False when it has to wait (transient failure). */
  async function sendEntry(entry: StoreQueueEntry): Promise<boolean> {
    queue = queue.slice(1);
    inFlight = entry;
    void persistQueue();
    try {
      const ids: Record<string, string> = {};
      if (entry.kind === 'check') {
        const answer = await transport.setItemChecked(
          entry.itemId,
          entry.checked,
          entry.seenCheckSeq,
        );
        if (answer) {
          knownCheckSeq.set(answer.item_id, answer.check_seq);
          if (answer.item_id !== entry.itemId) ids[entry.itemId] = answer.item_id;
          // Later toggles of the same item were queued against the seq before this one.
          rewriteQueue((entries) =>
            entries.map((candidate) =>
              candidate.kind === 'check' && candidate.itemId === entry.itemId
                ? { ...candidate, seenCheckSeq: answer.check_seq }
                : candidate,
            ),
          );
        }
      } else if (entry.kind === 'notAvailable') {
        await transport.setItemNotAvailable(entry.itemId, entry.value);
      } else if (entry.kind === 'assignArea') {
        await transport.assignArticleArea(entry.articleId, entry.areaId);
      } else if (entry.kind === 'pack') {
        throw new Error('Packing entries are not sent yet (spec 0012, task 5).');
      } else {
        const [answer] = await transport.addShoppingContributions(entry.householdId, [
          toAddEntry(entry),
        ]);
        if (answer && answer.item_id !== entry.clientItemId) {
          ids[entry.clientItemId] = answer.item_id;
        }
        if (answer && answer.article_id !== entry.clientArticleId) {
          ids[entry.clientArticleId] = answer.article_id;
        }
      }
      if (Object.keys(ids).length > 0) rewriteQueue((entries) => remapQueue(entries, ids));
      noteSuccess();
      retryAttempt = 0;
      settling.push({ entry, confirmedAt: startedGeneration });
      inFlight = undefined;
      void persistQueue();
      rebuild();
      void requestPull();
      return true;
    } catch (error) {
      inFlight = undefined;
      if (isTransient(error)) {
        noteFailure(error);
        queue = [entry, ...queue];
        void persistQueue();
        rebuild();
        scheduleRetry();
        return false;
      }
      // Permanent: dropped and logged, never blocking the queue (sync.md). No row data in logs.
      console.warn(
        `Store action dropped: ${error instanceof TransportError ? error.code : 'unknown'}`,
      );
      void persistQueue();
      rebuild();
      return true;
    }
  }

  async function step(): Promise<boolean> {
    if (!running || !canReachServer()) return false;
    const next = commits.find((entry) => entry.changeset.status === 'pending');
    const head = queue[0];
    if (!next && !head) return false;
    if (next && (!head || next.seq < (entrySeq.get(head) ?? Number.POSITIVE_INFINITY))) {
      await sendCommit(next);
      return true;
    }
    return head ? sendEntry(head) : false;
  }

  function drain(): Promise<void> {
    if (drainPromise) {
      drainAgain = true;
      return drainPromise;
    }
    drainPromise = (async () => {
      try {
        while (running) {
          drainAgain = false;
          if (!(await step()) && !drainAgain) break;
        }
      } finally {
        drainPromise = undefined;
      }
    })();
    return drainPromise;
  }

  // ---------- writes ----------

  function recordChange<T>(
    spec: CommitSpec<T>,
    before: AppState,
    after: AppState,
    result: T,
    onOutcome?: CommitOutcome,
  ): void {
    const householdId = before.activeHouseholdId;
    const old = before.households[householdId];
    const next = after.households[householdId];
    if (!old || !next) throw new Error(`Household ${householdId} is not loaded`);
    const change =
      old === next
        ? { ops: [], inverse: [] }
        : diffHousehold(old, next, {
            mode: spec.path === 'diff' ? 'send' : 'local',
            maxDeletes: spec.path === 'diff' ? spec.maxDeletes : undefined,
          });
    if (spec.path === 'diff' && change.ops.length === 0) {
      republish();
      onOutcome?.();
      return;
    }
    seq += 1;
    const context = { result, householdId, ops: change.ops };
    const entry: OutboxCommit = {
      seq,
      onOutcome,
      rejectedMessage: spec.rejectedMessage,
      changeset: { id: `changeset-${seq}`, householdId, ops: change.ops, status: 'pending' },
      send:
        spec.path === 'diff'
          ? (wire) => wire.applyChanges(householdId, sendable(change.ops))
          : (wire) => spec.send(wire, context),
    };
    if (spec.path === 'diff') {
      // Nothing to undo (e.g. only an article was created, which undo keeps): no empty call.
      if (change.inverse.length > 0) {
        entry.inverse = {
          ops: change.inverse,
          send: (wire) => wire.applyChanges(householdId, sendable(change.inverse)),
        };
      }
    } else if (spec.inverse) {
      const inverse = spec.inverse;
      entry.inverse = {
        ops: change.inverse,
        send: (wire) => inverse(wire, context, entry.response),
      };
    }
    commits.push(entry);
    history = [...history, entry].slice(-HISTORY_LIMIT);
    republish();
    void drain();
  }

  function expectedRow(table: string, id: string): { server?: Row; expected?: Row } {
    for (const householdId of cache?.householdIds ?? []) {
      const tables = cache?.households[householdId]?.tables;
      if (!tables) continue;
      const confirmed = applyQueue(
        tables,
        [...settling.map((settled) => settled.entry), ...(inFlight ? [inFlight] : [])],
        householdId,
      );
      const expected = confirmed[table]?.[id];
      if (expected) return { server: tables[table]?.[id], expected };
    }
    return {};
  }

  function enqueueStoreAction(action: StoreAction): void {
    let entry: StoreQueueEntry;
    let baseRow: Row | undefined;
    if (action.kind === 'check') {
      const { server, expected } = expectedRow('shopping_items', action.itemId);
      const seen = Math.max(Number(server?.check_seq ?? 0), knownCheckSeq.get(action.itemId) ?? 0);
      entry = { ...action, seenCheckSeq: seen };
      baseRow = expected;
    } else if (action.kind === 'notAvailable') {
      entry = action;
      baseRow = expectedRow('shopping_items', action.itemId).expected;
    } else if (action.kind === 'assignArea') {
      entry = action;
      baseRow = expectedRow('articles', action.articleId).expected;
    } else {
      entry = action;
    }
    const next = enqueue(queue, entry, baseRow);
    for (const candidate of next) if (!entrySeq.has(candidate)) entrySeq.set(candidate, ++seq);
    queue = next;
    void persistQueue();
    rebuild();
    void drain();
  }

  function undoable(): () => void {
    const mark = seq;
    return () => {
      if (isOffline()) throw new OfflineError();
      const own = history.filter((entry) => entry.seq > mark && !entry.rejected).reverse();
      for (const entry of own) {
        if (!entry.inverse) continue;
        seq += 1;
        commits.push({
          seq,
          changeset: {
            id: `changeset-${seq}`,
            householdId: entry.changeset.householdId,
            ops: entry.inverse.ops,
            status: 'pending',
          },
          send: entry.inverse.send,
        });
      }
      rebuild();
      void drain();
    };
  }

  // ---------- lifecycle ----------

  function stopTimers(): void {
    if (retryTimer) clearTimeout(retryTimer);
    if (debounceTimer) clearTimeout(debounceTimer);
    if (intervalTimer) clearInterval(intervalTimer);
    retryTimer = undefined;
    debounceTimer = undefined;
    intervalTimer = undefined;
  }

  function stop(): void {
    running = false;
    stopTimers();
    unsubscribeEnvironment?.();
    unsubscribeEnvironment = undefined;
    updateChannels();
  }

  async function start(): Promise<void> {
    await load();
    if (running) return;
    running = true;
    unsubscribeEnvironment = environment.subscribe({
      online: () => {
        rebuild();
        void requestPull();
        void drain();
      },
      offline: () => rebuild(),
      foreground: () => void requestPull(),
    });
    intervalTimer = setInterval(() => {
      if (environment.isVisible()) void requestPull();
    }, intervalMs);
    updateChannels();
    void drain();
    await requestPull();
  }

  async function whenIdle(): Promise<void> {
    for (;;) {
      const pending = pullPromise ?? drainPromise;
      if (!pending) return;
      await pending;
    }
  }

  async function resetLocalData(): Promise<void> {
    stop();
    epoch += 1;
    cleared = true;
    cache = undefined;
    persisted.clear();
    queue = [];
    inFlight = undefined;
    settling = [];
    for (const entry of commits) report(entry, new TransportError('permanent', 'reset'));
    commits = [];
    history = [];
    knownCheckSeq.clear();
    chosenHouseholdId = undefined;
    storeChoices = {};
    await storage.clear();
    rebuild();
  }

  function rememberActiveHousehold(householdId: string): void {
    if (cleared || chosenHouseholdId === householdId) return;
    chosenHouseholdId = householdId;
    // meta binds the choice to this user: another user's start clears the whole storage.
    void storage
      .setMany([
        ['meta', meta()],
        ['active', householdId],
      ])
      .catch((error: unknown) => {
        console.warn(
          `Storing the household failed: ${error instanceof Error ? error.name : 'unknown'}`,
        );
      });
  }

  function rememberShoppingStore(householdId: string, storeId: string | null): void {
    if (cleared || storeChoices[householdId] === storeId) return;
    storeChoices = { ...storeChoices, [householdId]: storeId };
    rebuild();
    // Only on this device (spec 0006): meta binds it to the user like the chosen household.
    void storage
      .setMany([
        ['meta', meta()],
        ['store-choices', storeChoices],
      ])
      .catch((error: unknown) => {
        console.warn(
          `Storing the store failed: ${error instanceof Error ? error.name : 'unknown'}`,
        );
      });
  }

  return {
    load,
    start,
    stop,
    pull: requestPull,
    whenIdle,
    getState: () => appState,
    getSyncState: () => syncState,
    resetLocalData,
    isOffline,
    recordChange,
    enqueueStoreAction,
    undoable,
    rememberActiveHousehold,
    rememberShoppingStore,
    setSimulatedOffline(offline) {
      transport.setBlocked(offline);
      if (!offline) networkFailed = false;
      rebuild();
      if (!offline) {
        void requestPull();
        void drain();
      }
    },
  };
}

// ---------- the app's backend (one at a time) ----------

export interface StartBackendOptions {
  /** The signed-in Supabase client; or a ready transport (tests). */
  supabase?: SupabaseClient;
  transport?: Transport;
  storage: Storage;
  userId: string;
  environment?: Environment;
  cacheVersion?: number;
  /** See EngineOptions.onAccountMissing. */
  onAccountMissing?: () => void;
}

let current: Engine | undefined;
/** The transport of the current engine, for the household RPCs (households.ts). */
let currentWire: Transport | undefined;

/**
 * The signed-in user's session on this device, for work that outlives a call (photo downloads,
 * photos-remote.ts). The app keeps one device storage for every user, so the storage object does
 * not tell sessions apart: the epoch does, and the signal aborts when the session ends.
 */
export interface DeviceSession {
  /** Counts the starts (one per user signed in): what one began must not write into the next. */
  readonly epoch: number;
  /** Where the cache lives; photos are kept next to it. */
  readonly storage: Storage;
  /** Aborts at sign-out, at the next user's start and when the backend stops. */
  readonly signal: AbortSignal;
}
let session: { current: DeviceSession; controller: AbortController } | undefined;
let sessionEpoch = 0;
const rejectedListeners = new Set<(message: string) => void>();
const syncListeners = new Set<() => void>();
/** Without an engine nothing is loaded. */
const NO_ENGINE_SYNC_STATE: SyncState = { status: 'idle', ready: false };
let currentSyncState: SyncState = NO_ENGINE_SYNC_STATE;
const smallListeners = new Set<() => void>();
let currentSmall: SyncCache['small'] = EMPTY_SMALL;

function setSmall(small: SyncCache['small']): void {
  if (small === currentSmall) return;
  currentSmall = small;
  for (const listener of smallListeners) listener();
}

function setSyncState(state: SyncState): void {
  currentSyncState = state;
  for (const listener of syncListeners) listener();
}

/**
 * Starts the engine of the signed-in user: commands go through it, hooks read its state. Resolves
 * once the cache is loaded from storage (the first pull continues in the background).
 */
export async function startBackend(options: StartBackendOptions): Promise<Engine> {
  await stopBackend();
  const wire =
    options.transport ??
    (options.supabase ? createSupabaseTransport(fromSupabaseClient(options.supabase)) : undefined);
  if (!wire) throw new Error('startBackend needs a Supabase client or a transport');
  const engine: Engine = createEngine({
    transport: wire,
    storage: options.storage,
    userId: options.userId,
    environment: options.environment,
    cacheVersion: options.cacheVersion,
    onStateChange: (state) => publishState(engine, state),
    onSyncStateChange: (state) => {
      if (current === engine) setSyncState(state);
    },
    onWriteRejected: (message) => {
      if (current !== engine) return;
      for (const listener of rejectedListeners) listener(message);
    },
    onSmallChange: (small) => {
      if (current === engine) setSmall(small);
    },
    readActiveHouseholdId: () => (current === engine ? peekState()?.activeHouseholdId : undefined),
    onAccountMissing: () => {
      if (current === engine) options.onAccountMissing?.();
    },
  });
  current = engine;
  currentWire = wire;
  const controller = new AbortController();
  sessionEpoch += 1;
  session = {
    current: { epoch: sessionEpoch, storage: options.storage, signal: controller.signal },
    controller,
  };
  await engine.load();
  const initial = engine.getState();
  if (!initial) throw new Error('The engine built no state');
  attachBackend(engine, initial);
  setSyncState(engine.getSyncState());
  void engine.start();
  return engine;
}

/** Stops the engine; the cache stays on the device (the next start of the same user reads it). */
export async function stopBackend(): Promise<void> {
  const engine = current;
  if (!engine) return;
  current = undefined;
  currentWire = undefined;
  session?.controller.abort();
  session = undefined;
  engine.stop();
  detachBackend(engine);
  setSyncState(NO_ENGINE_SYNC_STATE);
  setSmall(EMPTY_SMALL);
}

/** Sign-out or a change of user: clears cache, store queue and outbox, and stops the engine. */
export async function resetLocalData(): Promise<void> {
  const engine = current;
  if (!engine) return;
  await stopBackend();
  await engine.resetLocalData();
}

/** "Hat nicht geklappt – bitte noch einmal versuchen" (AC-019): the app shows it as a toast. */
export function onWriteRejected(listener: (message: string) => void): () => void {
  rejectedListeners.add(listener);
  return () => {
    rejectedListeners.delete(listener);
  };
}

function subscribeSync(listener: () => void): () => void {
  syncListeners.add(listener);
  return () => {
    syncListeners.delete(listener);
  };
}

/** Sync status for a small indicator; without an engine idle and not ready. */
export function useSyncState(): SyncState {
  return useSyncExternalStore(
    subscribeSync,
    () => currentSyncState,
    () => currentSyncState,
  );
}

/**
 * A household, invitation or membership change (rpc only, never undoable): refused offline, sent
 * directly, then a pull so the result is in the cache when the promise resolves.
 */
export async function householdCall<T>(send: (transport: Transport) => Promise<T>): Promise<T> {
  const engine = current;
  const wire = currentWire;
  if (!engine || !wire) throw new Error('Not signed in');
  if (engine.isOffline()) throw new OfflineError();
  const result = await send(wire);
  await engine.pull();
  return result;
}

/** A request that needs the server's answer and changes nothing (edge functions); refused offline. */
export async function onlineCall<T>(send: (transport: Transport) => Promise<T>): Promise<T> {
  const engine = current;
  const wire = currentWire;
  if (!engine || !wire) throw new Error('Not signed in');
  if (engine.isOffline()) throw new OfflineError();
  return send(wire);
}

/**
 * The signed-in user's session (undefined while nobody is signed in). Whatever is kept in its storage is bound
 * to the user: another user's start and the sign-out clear it as a whole.
 */
export function deviceSession(): DeviceSession | undefined {
  return session?.current;
}

/** The small tables of the cache (empty without an engine); changes notify `subscribeSmall`. */
export function readSmallTables(): SyncCache['small'] {
  return currentSmall;
}

export function subscribeSmall(listener: () => void): () => void {
  smallListeners.add(listener);
  return () => {
    smallListeners.delete(listener);
  };
}
