import { useAppVersionState, useSyncState } from '@housekeeping/api';
import { Button, StatusBanner } from '@housekeeping/ui';
import { useState } from 'react';

import { canReloadToNewVersion, reloadToNewVersion } from '@/lib/app-version';

const NEW_VERSION_TEXT = 'Neue Version verfügbar';
const UNSUPPORTED_TEXT = 'Diese Version wird nicht mehr unterstützt';

/**
 * Shown when the version check (spec 0014, REQ-004) finds a newer version (AC-022) or the server
 * no longer supports this one (AC-025, it stays until the reload). Offline nothing is shown: the
 * offline hint takes its place (AC-023).
 */
export function useUpdateBannerVisible(): boolean {
  const state = useAppVersionState();
  const offline = useSyncState().status === 'offline';
  return state !== 'aktuell' && !offline;
}

export function UpdateBanner() {
  const state = useAppVersionState();
  const visible = useUpdateBannerVisible();
  const [reloading, setReloading] = useState(false);
  if (!visible) return null;
  const unsupported = state === 'nicht-unterstuetzt';
  return (
    <StatusBanner
      icon={unsupported ? 'circle-alert' : 'refresh-cw'}
      text={unsupported ? UNSUPPORTED_TEXT : NEW_VERSION_TEXT}
      testID={unsupported ? 'version-unsupported' : 'version-update'}
      action={
        canReloadToNewVersion ? (
          <Button
            label="Neu laden"
            variant="ghost"
            disabled={reloading}
            hint={
              unsupported
                ? 'Lädt die neue Version. Bis dahin gehen nur Lesen und Abhaken.'
                : 'Lädt die neue Version der App'
            }
            onPress={() => {
              setReloading(true);
              void reloadToNewVersion();
            }}
            testID="version-reload"
          />
        ) : undefined
      }
    />
  );
}
