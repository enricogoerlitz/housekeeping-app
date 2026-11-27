// The sync engine (spec 0003) keeps a local cache of the user's households, pulls
// deltas (docs/architecture/sync.md), shows `server rows ⊕ store queue ⊕ pending changesets`
// (ADR-0011) and sends writes through one FIFO outbox. Merge and sync rules are core functions;
// this module builds the visible state and runs the engine, its parts live in engine-pull.ts,
// engine-queue.ts (the outbox), engine-store-queue.ts and engine-persistence.ts.
import {
  applyQueue,
  householdClock,
  unsentChangeCount,
  visibleTables,
  type Row,
  type SmallRow,
  type SyncCache,
  type TableRows,
} from '@housekeeping/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useSyncExternalStore } from 'react';

import { appVersionGate } from './app-version';
import { HOUSEHOLD_TIME_ZONE_DEFAULT, rowsToHousehold, rowsToMembers } from './db/mapping';
import {
  isOffline,
  report,
  unsent,
  writesDisabled,
  type EngineContext,
  type EngineOptions,
  type Environment,
  type SyncState,
} from './engine-context';
import { load, rememberActiveHousehold, rememberShoppingStore } from './engine-persistence';
import { requestPull, updateChannels } from './engine-pull';
import { drain, recordChange, undoable } from './engine-queue';
import { enqueueStoreAction, pendingItemIds } from './engine-store-queue';
import type { Storage } from './storage';
import {
  attachBackend,
  detachBackend,
  OfflineError,
  peekState,
  publishState,
  type AppState,
  type BackendHooks,
  type HouseholdData,
} from './store';
import { switchable, TransportError, type Transport } from './transport';
import { createSupabaseTransport, fromSupabaseClient } from './transport-supabase';

export {
  WRITE_REJECTED_MESSAGE,
  type EngineOptions,
  type Environment,
  type SyncState,
} from './engine-context';

/**
 * Bump when the cached shape changes: the device then drops its cache and loads again (AC-018).
 * What is not cache survives the bump: the store queue and the choices made on this device.
 */
export const CACHE_VERSION = 26;
/** Retention of `deleted_records` on the server (pg_cron). */
const RETENTION_DAYS = 30;

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

export interface Engine extends BackendHooks {
  /** No connection (or the simulated one); unlike `isOffline`, not the version lock. */
  isNetworkOffline(): boolean;
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
  /** Store-queue entries the server has not confirmed yet, also the ones being sent. */
  unsentStoreChanges(): number;
  /**
   * "Jetzt abgleichen" (spec 0027, REQ-010): sends what waits in the queues, then pulls. True
   * when a pull was applied.
   */
  syncNow(): Promise<boolean>;
}

const EMPTY_SMALL: SyncCache['small'] = {};

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

function byId(rows: readonly SmallRow[]): Record<string, Row> {
  const result: Record<string, Row> = {};
  for (const row of rows) if (typeof row.id === 'string') result[row.id] = row as Row;
  return result;
}

export function createEngine(options: EngineOptions): Engine {
  const { storage, userId } = options;
  const environment = options.environment ?? browserEnvironment();
  const versionGate = options.versionGate ?? appVersionGate;

  let publishedSmall: SyncCache['small'] | undefined;
  let syncState: SyncState = { status: 'idle', ready: false };
  let unsubscribeEnvironment: (() => void) | undefined;
  let unsubscribeVersionGate: (() => void) | undefined;

  const ctx: EngineContext = {
    options,
    storage,
    userId,
    transport: switchable(options.transport),
    environment,
    versionGate,
    cacheVersion: options.cacheVersion ?? CACHE_VERSION,
    retentionDays: options.retentionDays ?? RETENTION_DAYS,
    debounceMs: options.realtimeDebounceMs ?? 300,
    intervalMs: options.fallbackIntervalMs ?? 60_000,
    retryDelays: options.retryDelaysMs ?? [1000, 2000, 5000, 10_000, 30_000],
    cache: undefined,
    persisted: new Map(),
    loaded: false,
    chosenHouseholdId: undefined,
    storeChoices: {},
    queue: [],
    inFlight: [],
    settling: [],
    entrySeq: new WeakMap(),
    knownCheckSeq: new Map(),
    knownPackSeq: new Map(),
    commits: [],
    history: [],
    seq: 0,
    startedGeneration: 0,
    appliedGeneration: 0,
    networkFailed: false,
    lastPullFailed: false,
    lastSyncedAt: undefined,
    appState: undefined,
    pullPromise: undefined,
    pullAgain: false,
    drainPromise: undefined,
    drainAgain: false,
    drainScheduled: false,
    retryTimer: undefined,
    retryAttempt: 0,
    debounceTimer: undefined,
    intervalTimer: undefined,
    channels: new Map(),
    running: false,
    epoch: 0,
    cleared: false,
    rebuild,
    baseTables,
    publishSyncState,
    requestPull: () => requestPull(ctx),
    drain: () => drain(ctx),
  };

  // ---------- visible state ----------

  function baseTables(householdId: string): TableRows | undefined {
    const household = ctx.cache?.households[householdId];
    if (!ctx.cache || !household?.pulledAt) return undefined;
    return { ...household.tables, households: byId(ctx.cache.small.households ?? []) };
  }

  function computeSyncState(): SyncState {
    const status = isOffline(ctx)
      ? 'offline'
      : ctx.pullPromise
        ? 'syncing'
        : ctx.lastPullFailed
          ? 'error'
          : 'idle';
    const ready = Object.keys(ctx.appState?.households ?? {}).length > 0;
    return { status, lastSyncedAt: ctx.lastSyncedAt, ready };
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
    const small = ctx.cache?.small ?? EMPTY_SMALL;
    if (small === publishedSmall) return;
    publishedSmall = small;
    options.onSmallChange?.(small);
  }

  function rebuild(): void {
    publishSmall();
    const { cache } = ctx;
    const previous = ctx.appState;
    const households: Record<string, HouseholdData> = {};
    if (cache) {
      const overlay = [...ctx.settling.map((settled) => settled.entry), ...unsent(ctx)];
      const changesets = ctx.commits.map((entry) => entry.changeset);
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
          ctx.settling.map((settled) => settled.entry),
          householdId,
        );
        households[householdId] = rowsToHousehold(tables, small, householdId, {
          previous: previous?.households[householdId],
          pendingItemIds: pendingItemIds(ctx, confirmed, householdId),
          memberId: userId,
        });
      }
    }
    const ids = Object.keys(households);
    const wanted = [
      options.readActiveHouseholdId?.(),
      previous?.activeHouseholdId,
      ctx.chosenHouseholdId,
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
      // Spec 0031, REQ-020: the household's wall clock, whatever the device's time zone. The state
      // is rebuilt at least with every pull (every 60 s), so it moves on after midnight.
      today: householdClock(
        new Date(),
        households[activeHouseholdId]?.household.timeZone ?? HOUSEHOLD_TIME_ZONE_DEFAULT,
      ).date,
      members,
      currentMemberId: userId,
      activeHouseholdId,
      households: sameHouseholds && previous ? previous.households : households,
      offline: writesDisabled(ctx),
      storeChoices: ctx.storeChoices,
    };
    if (
      previous &&
      (Object.keys(next) as (keyof AppState)[]).every((key) => next[key] === previous[key])
    ) {
      publishSyncState();
      return;
    }
    ctx.appState = next;
    options.onStateChange?.(next);
    publishSyncState();
  }

  // ---------- lifecycle ----------

  function stopTimers(): void {
    if (ctx.retryTimer) clearTimeout(ctx.retryTimer);
    if (ctx.debounceTimer) clearTimeout(ctx.debounceTimer);
    if (ctx.intervalTimer) clearInterval(ctx.intervalTimer);
    ctx.retryTimer = undefined;
    ctx.debounceTimer = undefined;
    ctx.intervalTimer = undefined;
  }

  function stop(): void {
    ctx.running = false;
    stopTimers();
    unsubscribeEnvironment?.();
    unsubscribeEnvironment = undefined;
    unsubscribeVersionGate?.();
    unsubscribeVersionGate = undefined;
    updateChannels(ctx);
  }

  async function start(): Promise<void> {
    await load(ctx);
    if (ctx.running) return;
    ctx.running = true;
    unsubscribeEnvironment = environment.subscribe({
      online: () => {
        rebuild();
        void ctx.requestPull();
        void ctx.drain();
      },
      offline: () => rebuild(),
      foreground: () => void ctx.requestPull(),
    });
    unsubscribeVersionGate = versionGate.subscribe(() => {
      rebuild();
      void ctx.drain();
    });
    ctx.intervalTimer = setInterval(() => {
      if (environment.isVisible()) void ctx.requestPull();
    }, ctx.intervalMs);
    updateChannels(ctx);
    void ctx.drain();
    await ctx.requestPull();
  }

  async function whenIdle(): Promise<void> {
    for (;;) {
      const pending = ctx.pullPromise ?? ctx.drainPromise;
      if (!pending) return;
      await pending;
    }
  }

  async function resetLocalData(): Promise<void> {
    stop();
    ctx.epoch += 1;
    ctx.cleared = true;
    ctx.cache = undefined;
    ctx.persisted.clear();
    ctx.queue = [];
    ctx.inFlight = [];
    ctx.settling = [];
    for (const entry of ctx.commits) report(entry, new TransportError('permanent', 'reset'));
    ctx.commits = [];
    ctx.history = [];
    ctx.knownCheckSeq.clear();
    ctx.knownPackSeq.clear();
    ctx.chosenHouseholdId = undefined;
    ctx.storeChoices = {};
    await storage.clear();
    rebuild();
  }

  return {
    load: () => load(ctx),
    start,
    stop,
    pull: ctx.requestPull,
    whenIdle,
    getState: () => ctx.appState,
    getSyncState: () => syncState,
    resetLocalData,
    unsentStoreChanges: () => unsentChangeCount(unsent(ctx)),
    async syncNow() {
      const before = ctx.lastSyncedAt;
      await ctx.drain();
      await ctx.requestPull();
      return ctx.lastSyncedAt !== before;
    },
    isOffline: () => writesDisabled(ctx),
    isNetworkOffline: () => isOffline(ctx),
    recordChange: (spec, before, after, result, onOutcome) =>
      recordChange(ctx, spec, before, after, result, onOutcome),
    enqueueStoreAction: (action) => enqueueStoreAction(ctx, action),
    undoable: () => undoable(ctx),
    rememberActiveHousehold: (householdId) => rememberActiveHousehold(ctx, householdId),
    rememberShoppingStore: (householdId, storeId) =>
      rememberShoppingStore(ctx, householdId, storeId),
    setSimulatedOffline(offline) {
      ctx.transport.setBlocked(offline);
      if (!offline) ctx.networkFailed = false;
      rebuild();
      if (!offline) {
        void ctx.requestPull();
        void ctx.drain();
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

/**
 * What sign-out would lose (spec 0018, REQ-005): the store actions and packing on this device the
 * server has not confirmed. Read only; 0 while nobody is signed in.
 */
export function unsentStoreChangeCount(): number {
  return current?.unsentStoreChanges() ?? 0;
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
  if (!engine || !wire) throw new Error('Du bist nicht angemeldet.');
  if (engine.isOffline()) throw new OfflineError();
  const result = await send(wire);
  await engine.pull();
  return result;
}

/**
 * A request that needs the server's answer (edge functions, storage); refused
 * offline. Not refused below the minimum app version: the UI disables its edit actions there,
 * and reads such as photo downloads go on (spec 0014, AC-025).
 */
export async function onlineCall<T>(send: (transport: Transport) => Promise<T>): Promise<T> {
  const engine = current;
  const wire = currentWire;
  if (!engine || !wire) throw new Error('Du bist nicht angemeldet.');
  if (engine.isNetworkOffline()) throw new OfflineError();
  return send(wire);
}

export const SYNC_FAILED_MESSAGE =
  'Abgleich hat nicht geklappt – bitte später noch einmal versuchen.';

/**
 * "Jetzt abgleichen" (spec 0027, REQ-010): the store queue first (AC-040), then the newest state.
 * Offline: OfflineError; a failed pull: SYNC_FAILED_MESSAGE, the old time stays (AC-041).
 */
export async function syncNow(): Promise<void> {
  const engine = current;
  if (!engine) throw new Error('Du bist nicht angemeldet.');
  if (engine.isNetworkOffline()) throw new OfflineError();
  if (!(await engine.syncNow())) throw new Error(SYNC_FAILED_MESSAGE);
}

/** No connection right now; unlike `isOffline` of the store, not the version lock. */
export function isNetworkOffline(): boolean {
  return current?.isNetworkOffline() ?? false;
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
