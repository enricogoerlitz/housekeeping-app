import { OfflineError, snapshot, updateActivity } from '@housekeeping/api';
import type { Activity } from '@housekeeping/core';
import { announce, toast } from '@housekeeping/ui';

import { OFFLINE_EDIT_HINT, undoAction } from '@/features/shell/offline';

/**
 * "Merken" in one tap, without the edit window (spec 0041, AC-015): the household's bookmark.
 * A short toast says what happened and offers "Rückgängig"; offline the write is refused with
 * the usual hint.
 */
export function toggleRemembered(activity: Pick<Activity, 'id' | 'remembered'>): void {
  const remembered = !activity.remembered;
  const restore = snapshot();
  try {
    updateActivity(activity.id, { remembered });
  } catch (error) {
    if (!(error instanceof OfflineError)) throw error;
    toast.show({ message: OFFLINE_EDIT_HINT });
    return;
  }
  const message = remembered ? 'Gemerkt' : 'Nicht mehr gemerkt';
  toast.show({ message, actionLabel: 'Rückgängig', onAction: undoAction(restore) });
  announce(message);
}
