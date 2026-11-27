// Acknowledging in-app notices (spec 0051, REQ-004, REQ-005). The notices themselves are derived
// on the device (core dueNotices); only what was acknowledged is stored, in the member's own row
// of notification_settings, and only through acknowledge_notices: an online write, one RPC per
// tap, shown at once (ADR-0011) and synced to her other devices like the row.
import { acknowledgedAfter, isNoticeKey, MAX_ACKNOWLEDGE_AT_ONCE } from '@housekeeping/core';

import { commit, getState, updateData } from './store';

/**
 * "Bestätigen" of one notice or "Alle bestätigen" (AC-018, AC-019) in the active household.
 * Throws before sending for an invalid key or more than 100 at once; refused offline.
 */
export function acknowledgeNotices(keys: readonly string[]): void {
  if (keys.length === 0) return;
  if (keys.length > MAX_ACKNOWLEDGE_AT_ONCE || keys.some((key) => !isNoticeKey(key))) {
    throw new Error('Diese Mitteilung lässt sich nicht bestätigen');
  }
  const sent = [...keys];
  commit(
    {
      path: 'rpc',
      send: (transport, context) => transport.acknowledgeNotices(context.householdId, sent),
    },
    () =>
      updateData((data) =>
        data.notificationSettings
          ? {
              ...data,
              notificationSettings: {
                ...data.notificationSettings,
                acknowledgedNotices: acknowledgedAfter(
                  data.notificationSettings.acknowledgedNotices,
                  sent,
                  getState().today,
                ),
              },
            }
          : data,
      ),
  );
}
