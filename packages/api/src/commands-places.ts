// Deleting a restaurant or an activity with "Rückgängig" (spec 0024, REQ-010): one RPC each, shown
// at once as the server will do it (core placeDeletionEffect), undone with the restore RPC.
import { placeDeletionEffect, type Id, type PlaceKind } from '@housekeeping/core';

import { removeQuietly } from './photos-remote';
import {
  commitConfirmed,
  getData,
  getState,
  isOffline,
  OfflineError,
  peekState,
  updateData,
} from './store';
import { TransportError } from './transport';

export interface PlaceDeletion {
  kind: PlaceKind;
  id: Id;
  /** How many planned entries go (later days and noted ones): core deletedNotice. */
  entries: number;
  /** The own photo; discardPlacePhoto removes it once "Rückgängig" expired. */
  photoPath?: string;
  /** Resolves once the server deleted it; rejects when it refused (it is back). */
  confirmed: Promise<void>;
}

/**
 * "Löschen" (AC-034, AC-036): the restaurant or activity with its ratings and favourites is gone
 * at once, entries up to today are free text, later and noted ones are gone. `snapshot()` taken
 * before undoes it with the restore RPC (AC-035); a refusal jumps back with the general hint, also
 * when the restore answers false. Throws OfflineError; undefined when it is not there.
 */
function deletePlace(kind: PlaceKind, id: Id): PlaceDeletion | undefined {
  const data = getData();
  const place =
    kind === 'restaurant'
      ? data.restaurants.find((candidate) => candidate.id === id)
      : data.activities.find((candidate) => candidate.id === id);
  if (!place) return undefined;
  if (isOffline()) throw new OfflineError();
  const today = getState().today;
  const effect = placeDeletionEffect(data.planEntries, kind, place, today);
  const confirmed = commitConfirmed(
    {
      path: 'rpc',
      send: (transport) =>
        kind === 'restaurant'
          ? transport.deleteRestaurant(id, today)
          : transport.deleteActivity(id, today),
      // false: it is back by other means; nothing was restored, so it is refused like any refusal.
      inverse: async (transport) => {
        const restored =
          kind === 'restaurant'
            ? await transport.restoreRestaurant(id)
            : await transport.restoreActivity(id);
        if (!restored) throw new TransportError('permanent', `${kind}_not_restorable`);
      },
    },
    () =>
      updateData((current) => {
        const now = placeDeletionEffect(current.planEntries, kind, place, today);
        const converted = new Map(now.converted.map((entry) => [entry.id, entry]));
        const removed = new Set(now.removedIds);
        return {
          ...current,
          restaurants:
            kind === 'restaurant'
              ? current.restaurants.filter((candidate) => candidate.id !== id)
              : current.restaurants,
          activities:
            kind === 'activity'
              ? current.activities.filter((candidate) => candidate.id !== id)
              : current.activities,
          planEntries: current.planEntries.flatMap((entry) =>
            removed.has(entry.id) ? [] : [converted.get(entry.id) ?? entry],
          ),
        };
      }),
  );
  confirmed.catch(() => {});
  return { kind, id, entries: effect.removedIds.length, photoPath: place.photoPath, confirmed };
}

/** "Löschen" of a restaurant (AC-034); see deletePlace. */
export function deleteRestaurant(restaurantId: Id): PlaceDeletion | undefined {
  return deletePlace('restaurant', restaurantId);
}

/** "Löschen" of an activity (AC-036); see deletePlace. */
export function deleteActivity(activityId: Id): PlaceDeletion | undefined {
  return deletePlace('activity', activityId);
}

/**
 * Removes the own photo of a deleted restaurant or activity when the notice "… gelöscht ·
 * Rückgängig" runs out (toast onExpire): only after the server took the deletion and while it has
 * not come back (AC-036). Never throws; a file that cannot be removed stays in the household's
 * folder.
 */
export async function discardPlacePhoto(deletion: PlaceDeletion): Promise<void> {
  const path = deletion.photoPath;
  if (!path) return;
  try {
    await deletion.confirmed;
  } catch {
    return;
  }
  const state = peekState();
  if (!state) return;
  const inUse = Object.values(state.households).some((data) =>
    (deletion.kind === 'restaurant' ? data.restaurants : data.activities).some(
      (row) => row.id === deletion.id || row.photoPath === path,
    ),
  );
  if (!inUse) await removeQuietly(path);
}
