import {
  deleteActivity,
  deleteRestaurant,
  discardPlacePhoto,
  OfflineError,
} from '@housekeeping/api';
import { deletedNotice, type Id } from '@housekeeping/core';
import { toast } from '@housekeeping/ui';

import { confirmFirst } from '@/features/shell/confirm-dialog';
import { useOnlineOnly } from '@/features/shell/offline';

/**
 * ⋯ → "Löschen" at a restaurant or an activity asks first: „„Bless“ löschen?“ (spec 0036, AC-020;
 * before spec 0024, REQ-010 deleted at once with "Rückgängig"). Only "Löschen" deletes: back to
 * the grid or list and the notice "Trattoria Da Enzo gelöscht · 1 geplanter Eintrag entfällt".
 * Once the server confirmed, the own photo goes; a refusal brings everything back.
 */
export function useDeletePlace(
  kind: 'restaurant' | 'activity',
  place: { id: Id; name: string },
  onDeleted: () => void,
): () => void {
  const online = useOnlineOnly();
  const run = () => {
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
    toast.show({ message: deletedNotice(place.name, { entries: done.entries }) });
    void discardPlacePhoto(done);
  };
  return () => {
    if (online.disabled) return;
    confirmFirst({
      title: `„${place.name}“ löschen?`,
      confirmLabel: 'Löschen',
      onConfirm: run,
      testID: `confirm-delete-${kind}`,
    });
  };
}
