import type {
  Absence,
  Activity,
  Area,
  Article,
  Chore,
  ChoreEvent,
  FeedbackEntry,
  Household,
  Id,
  ISODate,
  MealPlanEntry,
  Member,
  Recipe,
  Restaurant,
  RowOp,
  ShoppingItem,
  Store,
  StoreQueueEntry,
} from '@housekeeping/core';
import { useSyncExternalStore } from 'react';

import type { Transport } from './transport';

/** Everything that belongs to one household (one tenant). */
export interface HouseholdData {
  household: Household;
  areas: Area[];
  articles: Article[];
  stores: Store[];
  recipes: Recipe[];
  restaurants: Restaurant[];
  activities: Activity[];
  planEntries: MealPlanEntry[];
  items: ShoppingItem[];
  chores: Chore[];
  choreEvents: ChoreEvent[];
  absences: Absence[];
  feedback: FeedbackEntry[];
}

export interface AppState {
  today: ISODate;
  /** Members are people; they can belong to several households. */
  members: Member[];
  currentMemberId: Id;
  activeHouseholdId: Id;
  households: Record<Id, HouseholdData>;
  /** No connection right now (also the simulated one of the offline switch): only store actions. */
  offline: boolean;
  /**
   * The store last chosen in "Einkaufen" on this device, per household (spec 0006, REQ-007);
   * null = "Ohne Markt – nach Bereichen". Never sent to the server; cleared at sign-out.
   */
  storeChoices?: Readonly<Record<Id, Id | null>>;
}

// The sync engine (spec 0003) owns the state and publishes it here; commands change it only
// through `commit`, which hands the change to the engine. Without a signed-in user there is no
// state: the app shows nothing that reads it (AuthGate).
let state: AppState | undefined;
const listeners = new Set<() => void>();

export function getState(): AppState {
  if (!state) throw new Error('No state: nobody is signed in or the backend has not loaded yet.');
  return state;
}

export function setState(update: (current: AppState) => AppState): void {
  const next = update(getState());
  if (next === state) return;
  state = next;
  notify();
}

function notify(): void {
  for (const listener of listeners) listener();
}

/** Replaces the active household's data immutably. */
export function updateData(update: (data: HouseholdData) => HouseholdData): void {
  if (!committing) throw new Error('Data changes go through commit().');
  setState((current) => {
    const data = current.households[current.activeHouseholdId];
    if (!data) return current;
    const next = update(data);
    if (next === data) return current;
    return { ...current, households: { ...current.households, [current.activeHouseholdId]: next } };
  });
}

// ---------- The engine ----------

/** Thrown by an online-only command while offline (the UI disables them). */
export class OfflineError extends Error {
  constructor() {
    super('Offline – zum Bearbeiten brauchst du Netz');
    this.name = 'OfflineError';
  }
}

export interface RpcContext<T> {
  /** What the command returned. */
  result: T;
  householdId: string;
  /** The local effect as row operations (shown until the server confirmed and a pull applied). */
  ops: RowOp[];
}

/** One of the four store-mode actions; `seenCheckSeq` is filled in by the engine. */
export type StoreAction =
  { kind: 'check'; itemId: string; checked: boolean } | Exclude<StoreQueueEntry, { kind: 'check' }>;

/**
 * How a command's change reaches the server (ADR-0011):
 * - diff: the rows before and after become one `apply_changes` call, limited to the writable
 *   columns; every delete per table must be declared in `maxDeletes` (default 0).
 * - rpc: a dedicated RPC; the local effect is shown until it is confirmed. `inverse` makes it
 *   undoable.
 * The four store actions do not go through commit but through `queueStoreAction`.
 */
export type CommitSpec<T> = (
  | { path: 'diff'; maxDeletes?: Partial<Record<string, number>> }
  | {
      path: 'rpc';
      send: (transport: Transport, context: RpcContext<T>) => Promise<unknown>;
      inverse?: (
        transport: Transport,
        context: RpcContext<T>,
        response: unknown,
      ) => Promise<unknown>;
    }
) & {
  /**
   * The hint when the server refuses this change, for refusals with a known cause (e.g. the
   * article was deleted meanwhile); undefined = "Hat nicht geklappt – bitte noch einmal versuchen".
   */
  rejectedMessage?: (error: unknown) => string | undefined;
};

/** How the server took a change: no error = applied; otherwise refused (or lost) with the error. */
export type CommitOutcome = (error?: unknown) => void;

/** What the store needs from the sync engine. */
export interface BackendHooks {
  isOffline(): boolean;
  recordChange<T>(
    spec: CommitSpec<T>,
    before: AppState,
    after: AppState,
    result: T,
    onOutcome?: CommitOutcome,
  ): void;
  enqueueStoreAction(action: StoreAction): void;
  undoable(): () => void;
  setSimulatedOffline(offline: boolean): void;
  /** Keeps the household chosen on this device for the next start. */
  rememberActiveHousehold(householdId: string): void;
  /** Keeps the store chosen in "Einkaufen" on this device (spec 0006, AC-042). */
  rememberShoppingStore(householdId: string, storeId: string | null): void;
}

let backend: BackendHooks | undefined;
let committing = false;

export function attachBackend(hooks: BackendHooks, initial: AppState): void {
  backend = hooks;
  state = initial;
  notify();
}

export function detachBackend(hooks: BackendHooks): void {
  if (backend !== hooks) return;
  backend = undefined;
  state = undefined;
  notify();
}

function requireBackend(): BackendHooks {
  if (!backend) throw new Error('Not signed in');
  return backend;
}

/** No connection right now: only the store actions work. */
export function isOffline(): boolean {
  return backend?.isOffline() ?? false;
}

/** The engine publishes the visible state. */
export function publishState(hooks: BackendHooks, next: AppState): void {
  if (backend !== hooks || next === state) return;
  state = next;
  notify();
}

export function rememberActiveHousehold(householdId: string): void {
  backend?.rememberActiveHousehold(householdId);
}

/** Kept on the device, bound to the user. */
export function rememberShoppingStore(storeId: Id | null): void {
  requireBackend().rememberShoppingStore(getState().activeHouseholdId, storeId);
}

export function simulateOffline(offline: boolean): void {
  requireBackend().setSimulatedOffline(offline);
}

/**
 * Runs a command: the change is computed from the state before and after and handed to the
 * engine.
 */
export function commit<T>(spec: CommitSpec<T>, run: () => T): T {
  // A command that uses another command (the assistant, a proposal) is still one change: the
  // inner one runs as part of the outer commit.
  if (committing) return run();
  return record(requireBackend(), spec, run);
}

/** One of the four store actions (ADR-0008 addendum): queued, shown at once, works offline. */
export function queueStoreAction(action: StoreAction): void {
  if (committing) throw new Error('A store action cannot run inside a command.');
  requireBackend().enqueueStoreAction(action);
}

/**
 * Like commit, for a caller that must know whether the server took the change (a photo upload
 * deletes its file when the path was refused). Resolves with the command's result once the server
 * applied it, rejects with the server's error when it refused it or the change got lost. The
 * local effect shows at once, as with commit. Inside another command: right away.
 */
export async function commitConfirmed<T>(spec: CommitSpec<T>, run: () => T): Promise<T> {
  if (committing) return commit(spec, run);
  let report: CommitOutcome = () => {};
  const outcome = new Promise<void>((resolve, reject) => {
    report = (error) => (error === undefined ? resolve() : reject(error));
  });
  const result = record(requireBackend(), spec, run, report);
  await outcome;
  return result;
}

function record<T>(
  hooks: BackendHooks,
  spec: CommitSpec<T>,
  run: () => T,
  onOutcome?: CommitOutcome,
): T {
  if (hooks.isOffline()) throw new OfflineError();
  const before = getState();
  committing = true;
  let result: T;
  try {
    result = run();
  } catch (error) {
    state = before;
    notify();
    throw error;
  } finally {
    committing = false;
  }
  const after = getState();
  try {
    hooks.recordChange(spec, before, after, result, onOutcome);
  } catch (error) {
    state = before;
    notify();
    throw error;
  }
  return result;
}

/** The current state, undefined before anything was published (no throw, unlike getState). */
export function peekState(): AppState | undefined {
  return state;
}

export function getData(): HouseholdData {
  const current = getState();
  const data = current.households[current.activeHouseholdId];
  if (!data) throw new Error(`Unknown household ${current.activeHouseholdId}`);
  return data;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Subscribes a component to a slice of the state. The selector must return a stored reference. */
export function useAppSelector<T>(select: (state: AppState) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => select(getState()),
    () => select(getState()),
  );
}

export function useDataSelector<T>(select: (data: HouseholdData) => T): T {
  return useAppSelector((current) => {
    const data = current.households[current.activeHouseholdId];
    if (!data) throw new Error(`Unknown household ${current.activeHouseholdId}`);
    return select(data);
  });
}

/**
 * "Rückgängig": take a snapshot, run the command, offer the returned restore in a toast. The
 * restore sends the inverse of the changes made since (`undoable`).
 */
export function snapshot(): () => void {
  return requireBackend().undoable();
}

/** Ids are created on the client (optimistic UI) as UUIDs, like the database's. */
export function newId(): Id {
  return crypto.randomUUID();
}

export function nowISO(): string {
  return new Date().toISOString();
}
