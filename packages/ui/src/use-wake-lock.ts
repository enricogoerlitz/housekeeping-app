import { useEffect } from 'react';
import { Platform } from 'react-native';

import { holdWakeLock, type WakeLockEnvironment } from './wake-lock';

function browserEnvironment(): WakeLockEnvironment | undefined {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined' || typeof document === 'undefined')
    return undefined;
  return {
    wakeLock: (navigator as Navigator & Pick<WakeLockEnvironment, 'wakeLock'>).wakeLock,
    isVisible: () => document.visibilityState === 'visible',
    addVisibilityListener: (listener) => document.addEventListener('visibilitychange', listener),
    removeVisibilityListener: (listener) =>
      document.removeEventListener('visibilitychange', listener),
  };
}

/**
 * The screen stays on while `active`, e.g. while the cooking or the store mode is the shown page
 * (spec 0023, AC-042; spec 0034, AC-022, AC-023).
 */
export function useWakeLock(active = true): void {
  useEffect(() => {
    if (!active) return;
    const env = browserEnvironment();
    return env ? holdWakeLock(env) : undefined;
  }, [active]);
}
