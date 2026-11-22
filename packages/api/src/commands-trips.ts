import {
  packingSaveProblem,
  planPackingList,
  recalcPerDay,
  followEntryOnList,
  tripDays,
  validateTripDraft,
  withoutTravellers,
  type Id,
  type EntryAddition,
  type ISODate,
  type MealPlanEntry,
  type Trip,
} from '@housekeeping/core';

import { commitEntriesWithList } from './list-additions';
import { commit, getData, getState, newId, nowISO, updateData } from './store';

// Trips (spec 0022, REQ-003 to REQ-005, REQ-015): one trip with its people and one packing list.
// Every command is one change (ADR-0011), sent as one apply_changes call.

function validate(input: { memberIds: readonly Id[]; from: ISODate; to: ISODate }): void {
  const problems = validateTripDraft(input);
  if (problems.noOne) throw new Error('Wähle, wer unterwegs ist.');
  if (problems.toBeforeFrom) throw new Error('„Bis“ liegt vor „Von“.');
}

function cleanNote(note: string | undefined): string | undefined {
  return note?.trim() || undefined;
}

/**
 * "Reise eintragen" (AC-008, AC-009): the trip, every chosen person and a packing list of the
 * chosen Reisetaschen ("je Tag" with the trip's days) in one change. Returns the trip's id.
 */
export function createTrip(input: {
  memberIds: Id[];
  from: ISODate;
  to: ISODate;
  note?: string;
  bagIds?: Id[];
}): Id {
  validate(input);
  const data = getData();
  const memberIds = [...new Set(input.memberIds)];
  const trip: Trip = {
    id: newId(),
    from: input.from,
    to: input.to,
    note: cleanNote(input.note),
    members: memberIds.map((memberId) => ({ id: newId(), memberId })),
  };
  const packing = planPackingList({
    trip,
    bagIds: input.bagIds ?? [],
    bags: data.packingBags,
    bagItems: data.packingBagItems,
    newId,
  });
  const tooMany = packingSaveProblem(
    1 + trip.members.length + packing.listBags.length + packing.items.length,
  );
  if (tooMany) throw new Error(tooMany);
  commit({ path: 'diff' }, () =>
    updateData((current) => ({
      ...current,
      trips: [...current.trips, trip],
      packingListBags: [...current.packingListBags, ...packing.listBags],
      packingItems: [...current.packingItems, ...packing.items],
    })),
  );
  return trip.id;
}

export interface TripChanges {
  memberIds?: Id[];
  from?: ISODate;
  to?: ISODate;
  note?: string;
}

/**
 * Saves the changed fields of a trip (AC-011, AC-012, AC-014): only what is given is written, so
 * a field somebody else changed meanwhile stays. People keep their rows; the packing list stays
 * with the trip whoever is on it. A changed period shows the open "je Tag" Packstücke
 * recalculated at once (the server computes the same).
 */
export function updateTrip(tripId: Id, changes: TripChanges): void {
  const data = getData();
  const trip = data.trips.find((candidate) => candidate.id === tripId);
  if (!trip) throw new Error('Diese Reise gibt es nicht mehr.');
  const memberIds = changes.memberIds ? [...new Set(changes.memberIds)] : undefined;
  const next: Trip = {
    ...trip,
    from: changes.from ?? trip.from,
    to: changes.to ?? trip.to,
    note: changes.note === undefined ? trip.note : cleanNote(changes.note),
    members: memberIds
      ? memberIds.map(
          (memberId) =>
            trip.members.find((member) => member.memberId === memberId) ?? {
              id: newId(),
              memberId,
            },
        )
      : trip.members,
  };
  validate({ memberIds: next.members.map((member) => member.memberId), ...next });
  const removed = trip.members.filter((member) => !next.members.includes(member)).length;
  const periodChanged = next.from !== trip.from || next.to !== trip.to;
  const listBagIds = new Set(
    data.packingListBags.filter((bag) => bag.tripId === tripId).map((bag) => bag.id),
  );
  const days = tripDays(next.from, next.to);
  commit({ path: 'diff', maxDeletes: { trip_members: removed } }, () =>
    updateData((current) => ({
      ...current,
      trips: current.trips.map((candidate) => (candidate.id === tripId ? next : candidate)),
      packingItems: periodChanged
        ? current.packingItems.map((item) =>
            listBagIds.has(item.listBagId) ? (recalcPerDay([item], days)[0] ?? item) : item,
          )
        : current.packingItems,
    })),
  );
}

/**
 * "Reise löschen" (AC-016, AC-017): the trip with its people and packing list, shown gone at
 * once, sent as the delete of the trip only (cascade); "Rückgängig" brings everything back.
 */
export function removeTrip(tripId: Id): void {
  commit({ path: 'diff', maxDeletes: { trips: 1 } }, () =>
    updateData((data) => {
      const listBagIds = new Set(
        data.packingListBags.filter((bag) => bag.tripId === tripId).map((bag) => bag.id),
      );
      return {
        ...data,
        trips: data.trips.filter((trip) => trip.id !== tripId),
        packingListBags: data.packingListBags.filter((bag) => !listBagIds.has(bag.id)),
        packingItems: data.packingItems.filter((item) => !listBagIds.has(item.listBagId)),
      };
    }),
  );
}

/**
 * "Rausnehmen (n)" (REQ-007, AC-021 to AC-025): takes the chosen travellers out of these dishes
 * and lets the open items of the shopping list follow, in one call (all or nothing). An entry
 * that is gone meanwhile is left out. Returns how many dishes were changed.
 */
export function takeTravellersOut(offers: readonly { entryId: Id; memberIds: Id[] }[]): number {
  const data = getData();
  const members = getState().members;
  const recipesById = new Map(data.recipes.map((recipe) => [recipe.id, recipe]));
  const articlesById = Object.fromEntries(data.articles.map((article) => [article.id, article]));
  const found = offers.flatMap((offer) => {
    const entry = data.planEntries.find((candidate) => candidate.id === offer.entryId);
    return entry ? [{ entry, memberIds: offer.memberIds }] : [];
  });
  if (found.length === 0) return 0;
  const now = nowISO();
  let items = data.items;
  const additions: EntryAddition[] = [];
  let listChanged = false;
  const changed = new Map<Id, MealPlanEntry>();
  for (const { entry, memberIds } of found) {
    const recipe = entry.recipeId ? recipesById.get(entry.recipeId) : undefined;
    const next = withoutTravellers({ entry, memberIds, recipe, members, articlesById });
    changed.set(entry.id, next);
    const followed = followEntryOnList({ items, entry: next, recipe, articlesById, newId, now });
    items = followed.items;
    listChanged ||= followed.changed;
    additions.push(...followed.additions);
  }
  const changeEntries = () =>
    updateData((current) => ({
      ...current,
      planEntries: current.planEntries.map((entry) => changed.get(entry.id) ?? entry),
    }));
  if (!listChanged) {
    commit({ path: 'diff' }, changeEntries);
  } else {
    // The list follows in the same call, however many ingredients (replace_entry_contributions).
    commitEntriesWithList({ entryIds: [...changed.keys()] }, changeEntries, () => ({
      items,
      additions,
    }));
  }
  return found.length;
}
