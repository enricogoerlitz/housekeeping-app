import { APP_VERSION_DEV } from '@housekeeping/core';
import { Platform } from 'react-native';

// Expo inlines EXPO_PUBLIC_* values only for static `process.env.NAME` reads. The release pipeline
// sets the version (`JJJJ.M.N`, `vorschau` in the preview); unset it is `dev` (spec 0014).
export const ownAppVersion = process.env.EXPO_PUBLIC_APP_VERSION?.trim() || APP_VERSION_DEV;

/** Only the web app can load another version by itself (native apps come with their own spec). */
export const canReloadToNewVersion = Platform.OS === 'web';

const ACTIVATION_TIMEOUT_MS = 10_000;

function activated(worker: ServiceWorker): Promise<void> {
  if (worker.state === 'activated') return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ACTIVATION_TIMEOUT_MS);
    worker.addEventListener('statechange', () => {
      if (worker.state !== 'activated' && worker.state !== 'redundant') return;
      clearTimeout(timer);
      resolve();
    });
  });
}

/**
 * "Neu laden": asks the service worker for the new build, waits until it took over (it skips
 * waiting, see sw-template.js), then reloads. Without a service worker it just reloads; the page
 * itself always comes from the network first.
 */
export async function reloadToNewVersion(): Promise<void> {
  if (!canReloadToNewVersion) return;
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration) {
      await registration.update();
      const worker = registration.installing ?? registration.waiting;
      if (worker) await activated(worker);
    }
  } catch {
    // An update that fails (e.g. the network dropped) must not keep the page from reloading.
  }
  window.location.reload();
}
