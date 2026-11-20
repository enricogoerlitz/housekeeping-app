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
  ShoppingItem,
  ShoppingList,
  Store,
} from '@housekeeping/core';
import { useSyncExternalStore } from 'react';

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

// In-memory only: a reload starts from the seed again (spec 0001, AC-014).
let state: AppState | undefined;
let initialise: (() => AppState) | undefined;
const listeners = new Set<() => void>();

/** Registers how the initial state is built. Called once by the seed module. */
export function registerInitialState(factory: () => AppState): void {
  initialise = factory;
}

export function getState(): AppState {
  if (!state) {
    if (!initialise) throw new Error('No initial state registered');
    state = initialise();
  }
  return state;
}

export function setState(update: (current: AppState) => AppState): void {
  const next = update(getState());
  if (next === state) return;
  state = next;
  for (const listener of listeners) listener();
}

/** Replaces the active household's data immutably. */
export function updateData(update: (data: HouseholdData) => HouseholdData): void {
  setState((current) => {
    const data = current.households[current.activeHouseholdId];
    if (!data) return current;
    const next = update(data);
    if (next === data) return current;
    return { ...current, households: { ...current.households, [current.activeHouseholdId]: next } };
  });
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
 */
export function snapshot(): () => void {
  const saved = getState();
  return () => {
    state = saved;
    for (const listener of listeners) listener();
  };
}

/** Back to the seed data (used by tests and by "Demo zurücksetzen"). */
export function resetState(): void {
  state = undefined;
  for (const listener of listeners) listener();
}

let idCounter = 0;
/** Ids are created on the client, as they will be with the real backend. */
export function newId(prefix: string): Id {
  idCounter += 1;
  return `${prefix}-${idCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function nowISO(): string {
  return new Date().toISOString();
}
