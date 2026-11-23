// The state the sync engine's modules share (spec 0031, REQ-023): backend.ts builds it once per
// engine and wires the functions the modules call on each other; engine-pull.ts,
// engine-queue.ts (the outbox), engine-store-queue.ts and engine-persistence.ts work on it.
import type {
  Changeset,
  HouseholdCache,
  RowOp,
  StoreQueueEntry,
  SyncCache,
  TableRows,
} from '@housekeeping/core';

import type { VersionGate } from './app-version';
import type { Storage } from './storage';
import type { AppState, CommitOutcome } from './store';
import type { switchable, Transport } from './transport';

export const WRITE_REJECTED_MESSAGE = 'Hat nicht geklappt – bitte noch einmal versuchen';

/** Signals from the platform: network and app visibility. */
export interface Environment {
  isOnline(): boolean;
  isVisible(): boolean;
  subscribe(listener: { online?(): void; offline?(): void; foreground?(): void }): () => void;
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
  /** Below the minimum app version: no writes, the store queue waits (spec 0014, AC-025). */
  versionGate?: VersionGate;
}

/** A changeset waiting in the outbox, and what is needed to undo it. */
export interface OutboxCommit {
  seq: number;
  changeset: Changeset;
  send: (transport: Transport) => Promise<unknown>;
  inverse?: {
    ops: RowOp[];
    send: (transport: Transport) => Promise<unknown>;
    /** Diff path: the operations `send` sends, so undo can drop passed reminders (spec 0017). */
    sendOps?: RowOp[];
  };
  response?: unknown;
  /** The answer got lost: the next pull shows whether it arrived. */
  unknownOutcome?: boolean;
  rejected?: boolean;
  /** Told once whether the server took the change (commitConfirmed). */
  onOutcome?: CommitOutcome;
  rejectedMessage?: (error: unknown) => string | undefined;
}

/** Tells the waiting caller once how its change ended. */
export function report(entry: OutboxCommit, error?: unknown): void {
  const onOutcome = entry.onOutcome;
  entry.onOutcome = undefined;
  onOutcome?.(error);
}

export interface EngineContext {
  readonly options: EngineOptions;
  readonly storage: Storage;
  readonly userId: string;
  readonly transport: ReturnType<typeof switchable>;
  readonly environment: Environment;
  readonly versionGate: VersionGate;
  readonly cacheVersion: number;
  readonly retentionDays: number;
  readonly debounceMs: number;
  readonly intervalMs: number;
  readonly retryDelays: readonly number[];

  cache: SyncCache | undefined;
  readonly persisted: Map<string, HouseholdCache>;
  loaded: boolean;
  /** The household last chosen on this device (stored with the cache, so bound to the user). */
  chosenHouseholdId: string | undefined;
  /** The store last chosen in "Einkaufen" per household (spec 0006), stored like the household. */
  storeChoices: Record<string, string | null>;

  // Store queue: waiting entries, the ones being sent (one, or a run of pack entries), and
  // answered ones shown until the next pull.
  queue: StoreQueueEntry[];
  inFlight: StoreQueueEntry[];
  settling: { entry: StoreQueueEntry; confirmedAt: number }[];
  readonly entrySeq: WeakMap<StoreQueueEntry, number>;
  readonly knownCheckSeq: Map<string, number>;
  /** pack_seq of Packstücke as the server answered, newer than the cache until the next pull. */
  readonly knownPackSeq: Map<string, number>;

  commits: OutboxCommit[];
  history: OutboxCommit[];
  seq: number;
  startedGeneration: number;
  appliedGeneration: number;

  networkFailed: boolean;
  lastPullFailed: boolean;
  lastSyncedAt: string | undefined;
  appState: AppState | undefined;

  pullPromise: Promise<void> | undefined;
  pullAgain: boolean;
  drainPromise: Promise<void> | undefined;
  drainAgain: boolean;
  drainScheduled: boolean;
  retryTimer: ReturnType<typeof setTimeout> | undefined;
  retryAttempt: number;
  debounceTimer: ReturnType<typeof setTimeout> | undefined;
  intervalTimer: ReturnType<typeof setInterval> | undefined;
  readonly channels: Map<string, () => void>;
  running: boolean;
  /** Bumped by a reset; work started before it must not write its result. */
  epoch: number;
  /** A reset engine writes nothing to the device any more (the storage belongs to the next start). */
  cleared: boolean;

  /** Builds the visible state again and publishes it when it changed. */
  rebuild(): void;
  /** The cache tables of a household plus the households row, once it was pulled. */
  baseTables(householdId: string): TableRows | undefined;
  publishSyncState(): void;
  requestPull(): Promise<void>;
  drain(): Promise<void>;
}

/** Store-queue entries not answered yet: the ones being sent, then the waiting ones. */
export const unsent = (ctx: EngineContext): StoreQueueEntry[] =>
  ctx.inFlight.length > 0 ? [...ctx.inFlight, ...ctx.queue] : ctx.queue;

export const isOffline = (ctx: EngineContext): boolean =>
  ctx.transport.isBlocked() || !ctx.environment.isOnline() || ctx.networkFailed;

export const canReachServer = (ctx: EngineContext): boolean =>
  !ctx.transport.isBlocked() && ctx.environment.isOnline();

/** Commands are refused offline and below the minimum app version (spec 0014, AC-025). */
export const writesDisabled = (ctx: EngineContext): boolean =>
  isOffline(ctx) || ctx.versionGate.writesLocked();
