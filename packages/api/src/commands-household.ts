import {
  absenceDays,
  packingSaveProblem,
  planAbsenceWrite,
  planPackingLists,
  recalcPerDay,
  validateAbsenceDraft,
  type Absence,
  type PackingListBag,
  type FeedbackEntry,
  type Id,
  type ISODate,
} from '@housekeeping/core';

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

/**
 * Saves the absence window (spec 0010, REQ-010; D23) as one change: all members chosen → one
 * absence of the whole household, otherwise one per person. `replaceIds` are the absences of the
 * stripe being edited; they are reused (also for another person, so a packing list stays, spec
 * 0012, AC-039) or removed. `bagIds` (spec 0012, AC-011): the Reisetaschen copied into the
 * packing list of each new absence, "je Tag" with its duration. Bags of a removed row move to the
 * row that takes its place before the removal; a moved bag whose Reisetasche the target already
 * has keeps its Packstücke but no longer counts as that Reisetasche. A changed duration shows the
 * open "je Tag" Packstücke recalculated at once (AC-037; the server computes the same). Returns
 * the ids of the absences written.
 */
export function saveAbsences(input: {
  replaceIds: Id[];
  memberIds: Id[];
  from: ISODate;
  to: ISODate;
  note?: string;
  bagIds?: Id[];
}): Id[] {
  const problems = validateAbsenceDraft(input);
  if (problems.noOne) throw new Error('Wähle, wer weg ist.');
  if (problems.toBeforeFrom) throw new Error('Das Ende liegt vor dem Anfang.');
  const data = getData();
  const existing = data.absences.filter((absence) => input.replaceIds.includes(absence.id));
  const existingIds = new Set(existing.map((absence) => absence.id));
  const listBags = data.packingListBags.filter((bag) => existingIds.has(bag.absenceId));
  const plan = planAbsenceWrite({
    existing,
    memberIds: input.memberIds,
    allMemberIds: data.household.memberIds,
    from: input.from,
    to: input.to,
    note: input.note?.trim() || undefined,
    packingList: { listBags, items: data.packingItems },
  });
  const created: Absence[] = plan.create.map((row) => ({ id: newId(), ...row }));
  const written = [...plan.update, ...created];
  const targetOf = (memberId: Id | undefined) =>
    written.find((absence) => absence.memberId === memberId);

  // Bags of the packing lists after the save: moved ones point to their new absence.
  const movedTo = new Map<Id, Id>();
  for (const move of plan.moveListBags) {
    const target = targetOf(move.toMemberId);
    if (target) movedTo.set(move.listBagId, target.id);
  }
  const movedIds = new Set(movedTo.keys());
  const taken = new Map<Id, Set<Id>>();
  for (const bag of listBags) {
    if (movedIds.has(bag.id) || bag.bagId === undefined) continue;
    taken.set(bag.absenceId, (taken.get(bag.absenceId) ?? new Set()).add(bag.bagId));
  }
  const nextListBag = new Map<Id, PackingListBag>();
  for (const bag of listBags) {
    const absenceId = movedTo.get(bag.id);
    if (absenceId === undefined) continue;
    const present = taken.get(absenceId) ?? new Set<Id>();
    const clash = bag.bagId !== undefined && present.has(bag.bagId);
    if (bag.bagId !== undefined && !clash) present.add(bag.bagId);
    taken.set(absenceId, present);
    nextListBag.set(bag.id, { ...bag, absenceId, bagId: clash ? undefined : bag.bagId });
  }

  const packing = planPackingLists({
    absences: created,
    bagIds: input.bagIds ?? [],
    bags: data.packingBags,
    bagItems: data.packingBagItems,
    newId,
  });
  const rows =
    written.length +
    plan.removeIds.length +
    nextListBag.size +
    packing.listBags.length +
    packing.items.length;
  const tooMany = packingSaveProblem(rows);
  if (tooMany) throw new Error(tooMany);

  // "Je Tag" of the bags whose absence changed its duration or that moved to another absence.
  const before = new Map(existing.map((absence) => [absence.id, absence]));
  const durationChanged = new Set(
    plan.update
      .filter((absence) => {
        const old = before.get(absence.id);
        return old !== undefined && (old.from !== absence.from || old.to !== absence.to);
      })
      .map((absence) => absence.id),
  );
  const daysOf = new Map(
    written.map((absence) => [absence.id, absenceDays(absence.from, absence.to)]),
  );
  const recalcDays = new Map<Id, number>();
  for (const bag of listBags) {
    const absenceId = nextListBag.get(bag.id)?.absenceId ?? bag.absenceId;
    const days = daysOf.get(absenceId);
    if (days !== undefined && (nextListBag.has(bag.id) || durationChanged.has(absenceId))) {
      recalcDays.set(bag.id, days);
    }
  }

  commit({ path: 'diff', maxDeletes: { absences: plan.removeIds.length } }, () =>
    updateData((current) => {
      const updated = new Map(plan.update.map((absence) => [absence.id, absence]));
      const kept = current.absences
        .filter((absence) => !plan.removeIds.includes(absence.id))
        .map((absence) => updated.get(absence.id) ?? absence);
      // Bags of removed rows that did not move go with their absence (cascade).
      const removed = new Set(plan.removeIds);
      const keptListBags = current.packingListBags
        .map((bag) => nextListBag.get(bag.id) ?? bag)
        .filter((bag) => !removed.has(bag.absenceId));
      const keptListBagIds = new Set(keptListBags.map((bag) => bag.id));
      const items = current.packingItems
        .filter((item) => keptListBagIds.has(item.listBagId))
        .map((item) => {
          const days = recalcDays.get(item.listBagId);
          return days === undefined ? item : (recalcPerDay([item], days)[0] ?? item);
        });
      return {
        ...current,
        absences: [...kept, ...created],
        packingListBags: [...keptListBags, ...packing.listBags],
        packingItems: [...items, ...packing.items],
      };
    }),
  );
  return written.map((absence) => absence.id);
}

/**
 * Removes the absences of one stripe or row together (spec 0010, AC-037). Their packing lists go
 * with them (spec 0012, AC-038): shown gone at once, sent as the deletes of the absences only.
 */
export function removeAbsences(absenceIds: Id[]): void {
  commit({ path: 'diff', maxDeletes: { absences: absenceIds.length } }, () =>
    updateData((data) => {
      const listBagIds = new Set(
        data.packingListBags
          .filter((bag) => absenceIds.includes(bag.absenceId))
          .map((bag) => bag.id),
      );
      return {
        ...data,
        absences: data.absences.filter((absence) => !absenceIds.includes(absence.id)),
        packingListBags: data.packingListBags.filter((bag) => !listBagIds.has(bag.id)),
        packingItems: data.packingItems.filter((item) => !listBagIds.has(item.listBagId)),
      };
    }),
  );
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
