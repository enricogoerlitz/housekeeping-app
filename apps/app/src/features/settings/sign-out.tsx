import { signOut, unsentStoreChangeCount } from '@housekeeping/api';
import { signOutWarning } from '@housekeeping/core';
import { useState, type ReactNode } from 'react';

import { ConfirmDialog } from '@/features/shell/confirm-dialog';

/**
 * „Abmelden“ (spec 0018, REQ-005): with changes still waiting in the store queue it asks first;
 * otherwise it signs out at once, as before. Asking changes nothing; only „Trotzdem abmelden“
 * runs the unchanged sign-out (session, local data, store queue and kept recipe drafts cleared).
 * Works offline.
 */
export function useSignOut(): { request: () => void; dialog: ReactNode } {
  const [warning, setWarning] = useState<string | undefined>();
  // Kept recipe drafts (spec 0056, REQ-006) and the KI-Agent's recent places (spec 0066, AC-013)
  // go with the session: startAuth clears them on every sign-out (clearDeviceStores).
  const leave = () => {
    void signOut();
  };
  const request = () => {
    const message = signOutWarning(unsentStoreChangeCount());
    if (message) setWarning(message);
    else leave();
  };
  const dialog = warning ? (
    <ConfirmDialog
      title="Abmelden?"
      message={warning}
      confirmLabel="Trotzdem abmelden"
      needsNetwork={false}
      onConfirm={() => {
        setWarning(undefined);
        leave();
      }}
      onCancel={() => setWarning(undefined)}
      testID="sign-out-dialog"
    />
  ) : null;
  return { request, dialog };
}
