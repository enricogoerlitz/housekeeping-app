import { signOut, unsentStoreChangeCount } from '@housekeeping/api';
import { signOutWarning } from '@housekeeping/core';
import { useState, type ReactNode } from 'react';

import { ConfirmDialog } from '@/features/shell/confirm-dialog';
import { clearPageDraftBackups } from '@/lib/page-draft-backup';

/**
 * „Abmelden“ (spec 0018, REQ-005): with changes still waiting in the store queue it asks first;
 * otherwise it signs out at once, as before. Asking changes nothing; only „Trotzdem abmelden“
 * runs the unchanged sign-out (session, local data, store queue and kept recipe drafts cleared).
 * Works offline.
 */
export function useSignOut(): { request: () => void; dialog: ReactNode } {
  const [warning, setWarning] = useState<string | undefined>();
  // Kept recipe drafts go with the session (spec 0056, REQ-006).
  const leave = () => {
    clearPageDraftBackups();
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
