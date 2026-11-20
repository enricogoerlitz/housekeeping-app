import { OfflineError, useOffline } from '@housekeeping/api';
import { toast } from '@housekeeping/ui';

export const OFFLINE_EDIT_HINT = 'Offline – zum Bearbeiten brauchst du Netz';

/**
 * For actions that need the network (everything except reading and the store-mode actions):
 * `disabled` greys the control out, `hint` explains why.
 */
export function useOnlineOnly(): { offline: boolean; disabled: boolean; hint: string | undefined } {
  const offline = useOffline();
  return { offline, disabled: offline, hint: offline ? OFFLINE_EDIT_HINT : undefined };
}

export const OFFLINE_UNDO_HINT = 'Offline – zum Rückgängigmachen brauchst du Netz';

/**
 * Wraps the "Rückgängig" of a toast: offline the undo is refused (it is a write) with a calm hint
 * instead of an error.
 */
export function undoAction(restore: () => void): () => void {
  return () => {
    try {
      restore();
    } catch (error) {
      if (!(error instanceof OfflineError)) throw error;
      toast.show({ message: OFFLINE_UNDO_HINT });
    }
  };
}
