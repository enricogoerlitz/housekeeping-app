import type {
  Absence,
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
  ShoppingList,
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
  planEntries: MealPlanEntry[];
  lists: ShoppingList[];
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
  /** Demo switch: shows the offline state. There is no network in this build. */
  offline: boolean;
}

// Two modes. Demo (default): an in-memory seed, a reload starts from it again (spec 0001,
// AC-014). Backend (spec 0003): the sync engine owns the state and publishes it here; commands
// change it only through `commit`, which hands the change to the engine.
let state: AppState | undefined;
let initialise: (() => AppState) | undefined;
const listeners = new Set<() => void>();

/** Registers how the initial state is built. Called once by the seed module. */
export function registerInitialState(factory: () => AppState): void {
  initialise = factory;
}

export function getState(): AppState {
  if (!state) {
    if (backend) throw new Error('The backend has not published a state yet.');
    if (!initialise) throw new Error('No initial state registered');
    state = initialise();
  }
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
  if (backend && !committing) {
    throw new Error('In backend mode, data changes go through commit().');
  }
  setState((current) => {
    const data = current.households[current.activeHouseholdId];
    if (!data) return current;
    const next = update(data);
    if (next === data) return current;
    return { ...current, households: { ...current.households, [current.activeHouseholdId]: next } };
  });
}

// ---------- Backend mode ----------

/** Thrown by an online-only command while offline in backend mode (the UI disables them). */
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
 * - queue: one of the four store actions; works offline, applied locally by the store queue.
 */
export type CommitSpec<T> =
  | { path: 'diff'; maxDeletes?: Partial<Record<string, number>> }
  | {
      path: 'rpc';
      send: (transport: Transport, context: RpcContext<T>) => Promise<unknown>;
      inverse?: (
        transport: Transport,
        context: RpcContext<T>,
        response: unknown,
      ) => Promise<unknown>;
    };

export interface QueueSpec {
  path: 'queue';
  action: StoreAction;
}

/** What the store needs from the sync engine. */
export interface BackendHooks {
  isOffline(): boolean;
  recordChange<T>(spec: CommitSpec<T>, before: AppState, after: AppState, result: T): void;
  enqueueStoreAction(action: StoreAction): void;
  undoable(): () => void;
  setSimulatedOffline(offline: boolean): void;
  /** Keeps the household chosen on this device for the next start. */
  rememberActiveHousehold(householdId: string): void;
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

export function isBackendMode(): boolean {
  return backend !== undefined;
}

/** Backend mode without a connection right now: only the store actions work. */
export function isBackendOffline(): boolean {
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

export function simulateOffline(offline: boolean): void {
  backend?.setSimulatedOffline(offline);
}

/**
 * Runs a command. In demo mode it just runs. In backend mode the change is computed from the
 * state before and after and handed to the engine; a store action is queued instead of run.
 */
export function commit<T>(spec: CommitSpec<T>, run: () => T): T;
export function commit(spec: QueueSpec, run: () => void): void;
export function commit<T>(spec: CommitSpec<T> | QueueSpec, run: () => T): T | void {
  if (!backend) return run();
  // A command that uses another command (the assistant, a proposal) is still one change: the
  // inner one runs as part of the outer commit.
  if (committing) {
    if (spec.path === 'queue') throw new Error('A store action cannot run inside a command.');
    return run();
  }
  if (spec.path === 'queue') {
    backend.enqueueStoreAction(spec.action);
    return;
  }
  if (backend.isOffline()) throw new OfflineError();
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
    backend.recordChange(spec, before, after, result);
  } catch (error) {
    state = before;
    notify();
    throw error;
  }
  return result;
}

/** The current state without building the demo seed (undefined before anything was published). */
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
 * Remembers the current state and returns a function that restores it.
 * Used for "Rückgängig": take a snapshot, run the command, offer the restore in a toast.
 * In backend mode the restore sends the inverse of the changes made since (`undoable`).
 */
export function snapshot(): () => void {
  if (backend) return backend.undoable();
  const saved = getState();
  return () => {
    state = saved;
    notify();
  };
}

/** Back to the seed data (used by tests and by "Demo zurücksetzen"). Demo mode only. */
export function resetState(): void {
  if (backend) throw new Error('resetState is only available in demo mode.');
  state = undefined;
  notify();
}

let idCounter = 0;
/** Ids are created on the client; the backend needs UUIDs, the demo keeps readable ones. */
export function newId(prefix: string): Id {
  if (backend) return crypto.randomUUID();
  idCounter += 1;
  return `${prefix}-${idCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function nowISO(): string {
  return new Date().toISOString();
}
