import { IconButton, Notice } from '@housekeeping/ui';
import { Platform } from 'react-native';

import { useSettings } from '@/lib/settings';

const INSTALL_HINT =
  'Tipp: Über Teilen → Zum Home-Bildschirm bleibt die App auch offline verlässlich.';

/**
 * iOS Safari may evict the storage of a website that is not on the home screen (spec 0003,
 * platforms). True on iPhone and iPad in the browser, false once installed as a web app.
 */
function isIosBrowserTab(): boolean {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return false;
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS reports itself as a Mac with touch.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!ios) return false;
  const standalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    (typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches);
  return !standalone;
}

export function useInstallHintVisible(): boolean {
  const settings = useSettings();
  return !settings.installHintDismissed && isIosBrowserTab();
}

/** The one-time tip to add the app to the home screen; closing it is remembered on the device. */
export function InstallHint() {
  const settings = useSettings();
  const visible = useInstallHintVisible();
  if (!visible) return null;
  return (
    <Notice
      icon="info"
      text={INSTALL_HINT}
      testID="install-hint"
      action={
        <IconButton
          icon="x"
          label="Tipp schließen"
          size={32}
          onPress={() => settings.update({ installHintDismissed: true })}
          testID="install-hint-close"
        />
      }
    />
  );
}
