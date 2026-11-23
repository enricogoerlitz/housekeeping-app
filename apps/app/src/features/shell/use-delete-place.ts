import {
  deleteActivity,
  deleteRestaurant,
  discardPlacePhoto,
  OfflineError,
  snapshot,
} from '@housekeeping/api';
import { deletedNotice, type Id } from '@housekeeping/core';
import { toast } from '@housekeeping/ui';

import { undoAction, useOnlineOnly } from '@/features/shell/offline';

/**
 * ⋯ → "Löschen" at a restaurant or an activity (spec 0024, REQ-010): no question, back to the
 * grid or list and the notice "Trattoria Da Enzo gelöscht · 1 geplanter Eintrag entfällt" with
 * "Rückgängig" for 5 s. Only when it ends without "Rückgängig" and the server confirmed does the
 * own photo go; a refusal brings everything back with the general hint.
 */
export function useDeletePlace(
  kind: 'restaurant' | 'activity',
  place: { id: Id; name: string },
  onDeleted: () => void,
): () => void {
  const online = useOnlineOnly();
  return () => {
    if (online.disabled) return;
    const restore = snapshot();
    let deletion;
    try {
      deletion = kind === 'restaurant' ? deleteRestaurant(place.id) : deleteActivity(place.id);
    } catch (error) {
      if (!(error instanceof OfflineError)) throw error;
      return;
    }
    if (!deletion) return;
    const done = deletion;
    onDeleted();
    toast.show({
      message: deletedNotice(place.name, { entries: done.entries }),
      actionLabel: 'Rückgängig',
      onAction: undoAction(restore),
      onExpire: () => void discardPlacePhoto(done),
    });
  };
}
