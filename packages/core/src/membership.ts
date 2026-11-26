// "Haushalt & Mitglieder" (spec 0018, REQ-004): removing a member and leaving a household ask
// first. Only the question; the server still decides who may remove whom (RLS).

import type { Id } from './types';

/** A row of household_members as the owner rule needs it: who, and when she joined. */
export interface Membership {
  profileId: Id;
  /** household_members.created_at, a Postgres timestamp with microseconds. */
  joinedAt: string;
}

/** Microseconds since the epoch; Date.parse alone stops at milliseconds. Unreadable: last. */
function joinedMicros(joinedAt: string): number {
  const ms = Date.parse(joinedAt);
  if (Number.isNaN(ms)) return Number.POSITIVE_INFINITY;
  const fraction = /\.(\d+)/.exec(joinedAt)?.[1] ?? '';
  return ms * 1000 + Number(fraction.padEnd(6, '0').slice(3, 6));
}

/**
 * The owner ("Eigentümer", spec 0042, REQ-005, Decision 1): the member who joined first, on the
 * same moment the smaller profile id — the rule of private.household_owner on the server, which
 * decides. Undefined without members.
 */
export function householdOwnerId(memberships: readonly Membership[]): Id | undefined {
  let owner: { id: Id; at: number } | undefined;
  for (const membership of memberships) {
    const at = joinedMicros(membership.joinedAt);
    if (!owner || at < owner.at || (at === owner.at && membership.profileId < owner.id)) {
      owner = { id: membership.profileId, at };
    }
  }
  return owner?.id;
}

export interface MemberRemovalPrompt {
  title: string;
  message?: string;
  confirmLabel: string;
}

/**
 * "Nadja aus „Enrico & Nadja“ entfernen?" (AC-010); for myself "„Enrico & Nadja“ verlassen?"
 * with the way back (AC-011), and a word when it is my only household (AC-012).
 */
export function memberRemovalPrompt(input: {
  memberName: string;
  householdName: string;
  self: boolean;
  householdCount: number;
}): MemberRemovalPrompt {
  if (!input.self) {
    return {
      title: `${input.memberName} aus „${input.householdName}“ entfernen?`,
      confirmLabel: 'Entfernen',
    };
  }
  const wayBack = 'Zurück kommst du nur mit einer neuen Einladung.';
  return {
    title: `„${input.householdName}“ verlassen?`,
    message: input.householdCount <= 1 ? `Das ist dein einziger Haushalt. ${wayBack}` : wayBack,
    confirmLabel: 'Verlassen',
  };
}
