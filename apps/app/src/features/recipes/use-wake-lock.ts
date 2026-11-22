import { useEffect } from 'react';
import { Platform } from 'react-native';

interface Sentinel {
  release: () => Promise<void>;
}
interface WakeLockApi {
  request: (type: 'screen') => Promise<Sentinel>;
}

/**
 * Keeps the screen awake while the cooking mode is shown (spec 0023, REQ-010, AC-042): the Screen
 * Wake Lock of the browser, released on leaving, asked again when the tab comes back (the browser
 * drops it while hidden). A browser without it, or one that refuses, changes nothing and says
 * nothing.
 */
export function useWakeLock(): void {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof navigator === 'undefined') return;
    const api = (navigator as Navigator & { wakeLock?: WakeLockApi }).wakeLock;
    if (!api) return;
    let sentinel: Sentinel | undefined;
    let active = true;
    const request = () => {
      if (document.visibilityState !== 'visible') return;
      api
        .request('screen')
        .then((lock) => {
          if (active) sentinel = lock;
          else void lock.release().catch(() => undefined);
        })
        .catch(() => undefined);
    };
    request();
    document.addEventListener('visibilitychange', request);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', request);
      void sentinel?.release().catch(() => undefined);
    };
  }, []);
}
