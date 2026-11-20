import { useOffline } from '@housekeeping/api';

export const OFFLINE_EDIT_HINT = 'Offline – zum Bearbeiten brauchst du Netz';

/**
 * For actions that need the network (everything except reading and the store-mode actions):
 * `disabled` greys the control out, `hint` explains why.
 */
export function useOnlineOnly(): { offline: boolean; disabled: boolean; hint: string | undefined } {
  const offline = useOffline();
  return { offline, disabled: offline, hint: offline ? OFFLINE_EDIT_HINT : undefined };
}
