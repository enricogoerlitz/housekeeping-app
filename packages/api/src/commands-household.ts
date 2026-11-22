import { type FeedbackEntry, type Id } from '@housekeeping/core';

import { householdCall, WRITE_REJECTED_MESSAGE } from './backend';
import { starterPayload } from './starter/payload';
import {
  commit,
  getData,
  getState,
  newId,
  nowISO,
  queueStoreAction,
  rememberActiveHousehold,
  setState,
  simulateOffline,
  updateData,
} from './store';
import { TransportError, type Transport } from './transport';

// Write side: every change to the data goes through a command. The assistant uses the same
// commands as the screens (see assistant.ts), so there is exactly one implementation per action.
// Each command is one change sent to the server (ADR-0011): `commit` with the diff path, an own
// RPC, or the store queue.

/** Shows another household; the choice is kept on the device for the next start. */
export function switchHousehold(householdId: Id): void {
  setState((state) =>
    state.households[householdId] ? { ...state, activeHouseholdId: householdId } : state,
  );
  if (getState().activeHouseholdId === householdId) rememberActiveHousehold(householdId);
}

/** The offline switch (dev and e2e): blocks the transport, so the app behaves as without network. */
export function setOffline(offline: boolean): void {
  simulateOffline(offline);
}

/** Assigning an area applies to the article from now on, on every list. A store action. */
export function assignArticleArea(articleId: Id, areaId: Id | undefined): void {
  queueStoreAction({ kind: 'assignArea', articleId, areaId: areaId ?? null });
}

export function addFeedback(input: {
  kind: FeedbackEntry['kind'];
  text: string;
  screen?: string;
}): Id {
  const text = input.text.trim();
  if (!text) throw new Error('Der Text fehlt.');
  return commit({ path: 'diff' }, () => {
    const entry: FeedbackEntry = {
      id: newId(),
      kind: input.kind,
      text,
      status: 'new',
      authorId: getState().currentMemberId,
      createdAt: nowISO(),
      votes: [],
      screen: input.screen,
    };
    updateData((data) => ({ ...data, feedback: [entry, ...data.feedback] }));
    return entry.id;
  });
}

/** "+1": supports someone else's feedback; a second call takes the vote back. */
export function toggleFeedbackVote(feedbackId: Id): void {
  const me = getState().currentMemberId;
  const entry = getData().feedback.find((candidate) => candidate.id === feedbackId);
  if (!entry) return;
  const voted = !entry.votes.includes(me);
  commit(
    {
      path: 'rpc',
      send: (transport) => transport.setFeedbackVote(feedbackId, voted),
      inverse: (transport) => transport.setFeedbackVote(feedbackId, !voted),
    },
    () =>
      updateData((data) => ({
        ...data,
        feedback: data.feedback.map((candidate) =>
          candidate.id === feedbackId
            ? {
                ...candidate,
                votes: voted ? [...candidate.votes, me] : candidate.votes.filter((id) => id !== me),
              }
            : candidate,
        ),
      })),
  );
}

// ---------- Household, invitations, membership (backend only; wait for the server) ----------

export const INVALID_EMAIL_MESSAGE = 'Das ist keine E-Mail-Adresse';
export const LAST_MEMBER_MESSAGE = 'Du bist das letzte Mitglied des Haushalts.';
export const INVITATION_GONE_MESSAGE = 'Die Einladung gibt es nicht mehr.';

const MESSAGES: Record<string, string> = {
  invalid_email: INVALID_EMAIL_MESSAGE,
  last_member: LAST_MEMBER_MESSAGE,
  invitation_not_found: INVITATION_GONE_MESSAGE,
  invalid_name: 'Der Name passt nicht – höchstens 80 Zeichen.',
  already_member: 'Diese Person ist schon Mitglied.',
  member_not_found: 'Diese Person ist kein Mitglied mehr.',
};

/** Same rule as `private.is_valid_email` on the server. */
const EMAIL = /^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/;

/** One RPC, then a pull; a refusal becomes a German message (offline: OfflineError). */
async function householdRpc<T>(send: (transport: Transport) => Promise<T>): Promise<T> {
  try {
    return await householdCall(send);
  } catch (error) {
    if (!(error instanceof TransportError)) throw error;
    throw new Error(
      (error.kind === 'permanent' ? MESSAGES[error.code] : undefined) ?? WRITE_REJECTED_MESSAGE,
    );
  }
}

/** A new household with the starter areas, the starter catalog and a default list (AC-010). */
export function createHousehold(name: string): Promise<Id> {
  const trimmed = name.trim();
  if (!trimmed) return Promise.reject(new Error('Der Name fehlt.'));
  return householdRpc((transport) => transport.createHousehold(trimmed, starterPayload()));
}

/** Invites a Google address into the active household (AC-008, AC-009). */
export function inviteMember(email: string): Promise<Id> {
  const address = email.trim().toLowerCase();
  if (!EMAIL.test(address)) return Promise.reject(new Error(INVALID_EMAIL_MESSAGE));
  const householdId = getState().activeHouseholdId;
  return householdRpc((transport) => transport.inviteMember(householdId, address));
}

/** Joins the household of an invitation; resolves with its id. */
export function acceptInvitation(invitationId: Id): Promise<Id> {
  return householdRpc((transport) => transport.acceptInvitation(invitationId));
}

export function declineInvitation(invitationId: Id): Promise<void> {
  return householdRpc((transport) => transport.declineInvitation(invitationId));
}

/** Removes a person (or oneself: leaving) from the active household (AC-012). */
export function removeMember(profileId: Id): Promise<void> {
  const householdId = getState().activeHouseholdId;
  return householdRpc((transport) => transport.removeMember(householdId, profileId));
}
