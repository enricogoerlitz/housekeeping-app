// Invitations (spec 0003, REQ-003) read from the small tables of the local cache. The household,
// invitation and membership commands live in commands-household.ts.
import type { Id, SmallRow } from '@housekeeping/core';
import { useSyncExternalStore } from 'react';

import { readSmallTables, subscribeSmall } from './backend';
import { useAppSelector } from './store';

export { readSmallTables };

/** The open invitation of an address to a household (glossary: Einladung). */
export interface Invitation {
  id: Id;
  householdId: Id;
  householdName: string;
  email: string;
  invitedBy?: Id;
  createdAt: string;
}

type Small = ReturnType<typeof readSmallTables>;
const NONE: Invitation[] = [];

function toInvitation(row: SmallRow, households: readonly SmallRow[]): Invitation {
  const household = households.find((candidate) => candidate.id === row.household_id);
  return {
    id: String(row.id),
    householdId: String(row.household_id),
    householdName: typeof household?.name === 'string' ? household.name : '',
    email: String(row.email),
    invitedBy: typeof row.invited_by === 'string' ? row.invited_by : undefined,
    createdAt: String(row.created_at),
  };
}

function openInvitations(small: Small): readonly SmallRow[] {
  return (small.household_invitations ?? []).filter((row) => !row.accepted_at);
}

/** Open invitations of a household (shown as „Eingeladen“, AC-008). */
export function invitationsOfHousehold(small: Small, householdId: Id): Invitation[] {
  const households = small.households ?? [];
  return openInvitations(small)
    .filter((row) => row.household_id === householdId)
    .map((row) => toInvitation(row, households));
}

/** Open invitations to my address for households I am not a member of yet. */
export function invitationsForMe(small: Small, userId: Id): Invitation[] {
  const me = (small.profiles ?? []).find((row) => row.id === userId);
  const email = typeof me?.email === 'string' ? me.email.toLowerCase() : undefined;
  if (!email) return NONE;
  const memberOf = new Set(
    (small.household_members ?? [])
      .filter((row) => row.profile_id === userId)
      .map((row) => String(row.household_id)),
  );
  const households = small.households ?? [];
  return openInvitations(small)
    .filter((row) => row.email === email && !memberOf.has(String(row.household_id)))
    .map((row) => toInvitation(row, households));
}

/** Derived lists are cached per small-tables object, so hooks return stable references. */
function memo(
  derive: (small: Small, id: Id) => Invitation[],
): (small: Small, id: Id) => Invitation[] {
  const cache = new WeakMap<Small, Map<Id, Invitation[]>>();
  return (small, id) => {
    let perId = cache.get(small);
    if (!perId) {
      perId = new Map();
      cache.set(small, perId);
    }
    let result = perId.get(id);
    if (!result) {
      result = derive(small, id);
      if (result.length === 0) result = NONE;
      perId.set(id, result);
    }
    return result;
  };
}

const memoOfHousehold = memo(invitationsOfHousehold);
const memoForMe = memo(invitationsForMe);

function useSmall(): Small {
  return useSyncExternalStore(subscribeSmall, readSmallTables, readSmallTables);
}

/** Open invitations of the active household. */
export function useHouseholdInvitations(): Invitation[] {
  const small = useSmall();
  const householdId = useAppSelector((state) => state.activeHouseholdId);
  return memoOfHousehold(small, householdId);
}

/** Open invitations to me (household settings and the screen without a household). */
export function useMyInvitations(): Invitation[] {
  const small = useSmall();
  const userId = useAppSelector((state) => state.currentMemberId);
  return memoForMe(small, userId);
}
