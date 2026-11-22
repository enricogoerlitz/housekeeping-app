import { signOut, unsentStoreChangeCount } from '@housekeeping/api';
import { signOutWarning } from '@housekeeping/core';
import { useState, type ReactNode } from 'react';

import { TripConfirmDialog } from '@/features/packing/trip-dialogs';

/**
 * „Abmelden“ (spec 0018, REQ-005): with changes still waiting in the store queue it asks first;
 * otherwise it signs out at once, as before. Asking changes nothing; only „Trotzdem abmelden“
 * runs the unchanged sign-out (session, local data and store queue cleared). Works offline.
 */
export function useSignOut(): { request: () => void; dialog: ReactNode } {
  const [warning, setWarning] = useState<string | undefined>();
  const request = () => {
    const message = signOutWarning(unsentStoreChangeCount());
    if (message) setWarning(message);
    else void signOut();
  };
  const dialog = warning ? (
    <TripConfirmDialog
      title="Abmelden?"
      message={warning}
      confirmLabel="Trotzdem abmelden"
      needsNetwork={false}
      onConfirm={() => {
        setWarning(undefined);
        void signOut();
      }}
      onCancel={() => setWarning(undefined)}
      testID="sign-out-dialog"
    />
  ) : null;
  return { request, dialog };
}
