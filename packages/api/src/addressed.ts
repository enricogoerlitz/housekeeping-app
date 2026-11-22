import { resolveAddressedId, type Id } from '@housekeeping/core';
import { useMemo } from 'react';

import { useAppSelector, type AppState, type HouseholdData } from './store';

// Spec 0019, REQ-017: an id from the address is looked up only in the local data of the own
// households, so an address never shows a foreign household's data.

/** The tables an address can point into. */
export type AddressedKind = {
  [K in keyof HouseholdData]-?: HouseholdData[K] extends readonly { id: Id }[] ? K : never;
}[keyof HouseholdData];

export type AddressedObject =
  | { status: 'shown' }
  | { status: 'switch'; householdId: Id; householdName: string }
  | { status: 'missing' };

/** Where the object `id` of `kind` lives among the own households (AC-050, AC-051). */
export function addressedIn(state: AppState, kind: AddressedKind, id: Id): AddressedObject {
  const owners = Object.entries(state.households)
    .filter(([, data]) => (data[kind] as readonly { id: Id }[]).some((row) => row.id === id))
    .map(([householdId]) => householdId);
  const resolved = resolveAddressedId(state.activeHouseholdId, owners);
  if (resolved.status !== 'switch') return resolved;
  const name = state.households[resolved.householdId]?.household.name ?? '';
  return { ...resolved, householdName: name };
}

/** `addressedIn` for the current state; undefined without an id. */
export function useAddressedObject(
  kind: AddressedKind,
  id: Id | undefined,
): AddressedObject | undefined {
  // The selector must return a stable value: the answer as one string, parsed back below.
  const key = useAppSelector((state) =>
    id === undefined ? '' : JSON.stringify(addressedIn(state, kind, id)),
  );
  return useMemo(() => (key === '' ? undefined : (JSON.parse(key) as AddressedObject)), [key]);
}
