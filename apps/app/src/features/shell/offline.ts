import { OfflineError, useAppVersionState, useOffline, useSyncState } from '@housekeeping/api';
import { editLockReason } from '@housekeeping/core';
import { toast } from '@housekeeping/ui';

export const OFFLINE_EDIT_HINT = 'Offline – zum Bearbeiten brauchst du Netz';
/** The banner above every page without network (spec 0019, REQ-010, AC-029). */
export const OFFLINE_BANNER_TEXT = 'Offline – Lesen, Einkaufen und Packen gehen';
/** Below the minimum app version with network (spec 0018, AC-023; ADR-0015). */
const VERSION_EDIT_HINT = 'Bitte neu laden, um zu bearbeiten';

/**
 * For actions that need the network (everything except reading and the store-mode actions):
 * `disabled` greys the control out, `hint` explains why — offline, or a version the server no
 * longer supports.
 */
export function useOnlineOnly(): { offline: boolean; disabled: boolean; hint: string | undefined } {
  const offline = useOffline();
  const networkOffline = useSyncState().status === 'offline';
  const version = useAppVersionState();
  const reason = editLockReason({ writesLocked: offline, networkOffline, version });
  return {
    offline,
    disabled: offline,
    hint:
      reason === 'version'
        ? VERSION_EDIT_HINT
        : reason === 'offline'
          ? OFFLINE_EDIT_HINT
          : undefined,
  };
}

const OFFLINE_UNDO_HINT = 'Offline – zum Rückgängigmachen brauchst du Netz';

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
