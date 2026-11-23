import {
  feedbackActions,
  householdRename,
  profileDraftErrors,
  type FeedbackEntry,
  type Id,
  type ProfileDraft,
} from '@housekeeping/core';

import { householdCall, onlineCall, WRITE_REJECTED_MESSAGE } from './backend';
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

/** The own entry, or an error: only the author edits (while new) or deletes (spec 0027, AC-027). */
function ownFeedback(feedbackId: Id, action: 'edit' | 'delete'): FeedbackEntry {
  const entry = getData().feedback.find((candidate) => candidate.id === feedbackId);
  if (!entry || !feedbackActions(entry, getState().currentMemberId).includes(action)) {
    throw new Error('Das geht nur bei deinem eigenen Feedback.');
  }
  return entry;
}

/** "Feedback bearbeiten" (spec 0027, AC-025): kind and text; votes, date and status stay. */
export function editFeedback(
  feedbackId: Id,
  input: { kind: FeedbackEntry['kind']; text: string },
): void {
  const text = input.text.trim();
  if (!text) throw new Error('Schreib zuerst, worum es geht');
  ownFeedback(feedbackId, 'edit');
  commit({ path: 'diff' }, () =>
    updateData((data) => ({
      ...data,
      feedback: data.feedback.map((entry) =>
        entry.id === feedbackId ? { ...entry, kind: input.kind, text } : entry,
      ),
    })),
  );
}

/** "Löschen" of the own entry (spec 0027, AC-026): its "+1" go with it (on delete cascade). */
export function deleteFeedback(feedbackId: Id): void {
  ownFeedback(feedbackId, 'delete');
  commit(
    {
      path: 'rpc',
      send: (transport, context) =>
        transport.applyChanges(context.householdId, [
          { kind: 'delete', table: 'feedback', id: feedbackId },
        ]),
    },
    () =>
      updateData((data) => ({
        ...data,
        feedback: data.feedback.filter((entry) => entry.id !== feedbackId),
      })),
  );
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

const INVALID_EMAIL_MESSAGE = 'Das ist keine E-Mail-Adresse';
const LAST_MEMBER_MESSAGE = 'Du bist das letzte Mitglied des Haushalts.';
const INVITATION_GONE_MESSAGE = 'Diese Einladung gibt es nicht mehr.';
export const NOT_LAST_MEMBER_MESSAGE =
  'Inzwischen ist noch jemand Mitglied. Löschen geht nur als letztes Mitglied.';
const PROFILE_NOT_SAVED_MESSAGE = 'Nicht gespeichert – bitte mit Netz noch einmal versuchen.';

const MESSAGES: Record<string, string> = {
  invalid_email: INVALID_EMAIL_MESSAGE,
  last_member: LAST_MEMBER_MESSAGE,
  invitation_not_found: INVITATION_GONE_MESSAGE,
  invalid_name: 'Der Name passt nicht – höchstens 80 Zeichen.',
  already_member: 'Diese Person ist schon Mitglied.',
  member_not_found: 'Diese Person ist kein Mitglied mehr.',
  not_last_member: NOT_LAST_MEMBER_MESSAGE,
};

/** Same rule as `private.is_valid_email` on the server. */
const EMAIL = /^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/;

/** One RPC, then a pull; a refusal becomes a German message (offline: OfflineError). */
async function householdRpc<T>(
  send: (transport: Transport) => Promise<T>,
  fallback = WRITE_REJECTED_MESSAGE,
): Promise<T> {
  try {
    return await householdCall(send);
  } catch (error) {
    if (!(error instanceof TransportError)) throw error;
    throw new Error((error.kind === 'permanent' ? MESSAGES[error.code] : undefined) ?? fallback);
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

/** "Zurückziehen" (spec 0027, REQ-001): the invitation is deleted, no question, no undo. */
export function withdrawInvitation(invitationId: Id): Promise<void> {
  return householdRpc((transport) => transport.withdrawInvitation(invitationId));
}

/**
 * "Profil bearbeiten" (spec 0027, REQ-003): the own profile through update_profile. A refusal or
 * a lost connection keeps the window open with "Nicht gespeichert …" (AC-013).
 */
export function updateProfile(draft: ProfileDraft): Promise<void> {
  const error = profileDraftErrors(draft).name;
  if (error) return Promise.reject(new Error(error));
  const profile = {
    name: draft.name.trim(),
    color: draft.color,
    dietPreference: draft.dietPreference,
    dislikes: [...draft.dislikes],
  };
  return householdRpc((transport) => transport.updateProfile(profile), PROFILE_NOT_SAVED_MESSAGE);
}

/**
 * "Haushalt umbenennen" (spec 0027, REQ-004): a patch of the active household; the last name to
 * arrive wins (AC-016). 'kept' when nothing changed (AC-015).
 */
export function renameHousehold(input: string): 'saved' | 'kept' {
  const decision = householdRename(getData().household.name, input);
  if (decision.action === 'invalid') throw new Error(decision.error);
  if (decision.action === 'keep') return 'kept';
  commit({ path: 'diff' }, () =>
    updateData((data) => ({ ...data, household: { ...data.household, name: decision.name } })),
  );
  return 'saved';
}

/**
 * "Endgültig löschen" (spec 0027, REQ-005, Decision 3): the household's photos first, then
 * delete_household, which refuses with media_remaining while photos are left. A failure on the
 * way leaves the household with its rows; trying again is safe (AC-023). The pull after it drops
 * the household and its photos from the device.
 */
export async function deleteHousehold(householdId: Id): Promise<void> {
  const name = getState().households[householdId]?.household.name ?? '';
  const notDone = `Löschen nicht abgeschlossen – „${name}“ ist noch da. Bitte mit Netz noch einmal löschen.`;
  try {
    const names = await onlineCall((transport) => transport.beginHouseholdDeletion(householdId));
    for (let start = 0; start < names.length; start += 100) {
      const batch = names.slice(start, start + 100);
      await onlineCall((transport) => transport.removeMedia(batch));
    }
    await householdCall((transport) => transport.deleteHousehold(householdId));
  } catch (error) {
    if (!(error instanceof TransportError)) throw error;
    if (error.kind === 'permanent' && error.code === 'not_last_member') {
      throw new Error(NOT_LAST_MEMBER_MESSAGE);
    }
    throw new Error(notDone);
  }
}

/** Removes a person (or oneself: leaving) from the active household (AC-012). */
export function removeMember(profileId: Id): Promise<void> {
  const householdId = getState().activeHouseholdId;
  return householdRpc((transport) => transport.removeMember(householdId, profileId));
}
