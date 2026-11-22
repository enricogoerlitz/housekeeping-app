import { safeReturnPath } from '@housekeeping/core';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

// Spec 0019, REQ-016 (Decision 8): the address someone opened while signed out is kept in this
// tab's session storage before Google takes over, and opened again once signed in. Only a path of
// this app counts (core `safeReturnPath`); `redirectTo` stays the root.

const KEY = 'housekeeping.return-path';

function storage(): Storage | undefined {
  if (Platform.OS !== 'web') return undefined;
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
}

/** Before the sign-in leaves the page: the current address, unless it is the overview. */
export function rememberReturnPath(): void {
  const path = safeReturnPath(globalThis.location?.pathname + (globalThis.location?.search ?? ''));
  // A retry after a failed attempt starts on the overview; the address from before stays (AC-049).
  if (!path) return;
  try {
    storage()?.setItem(KEY, path);
  } catch {
    // Storage can be unavailable (private mode); the app then opens the overview.
  }
}

function takeReturnPath(): string | undefined {
  try {
    const store = storage();
    const path = safeReturnPath(store?.getItem(KEY));
    store?.removeItem(KEY);
    return path;
  } catch {
    return undefined;
  }
}

/** Mount once inside the signed-in app: opens the remembered address (AC-047, AC-048). */
export function ReturnAfterSignIn(): null {
  const router = useRouter();
  useEffect(() => {
    const path = takeReturnPath();
    if (path) router.replace(path as never);
  }, [router]);
  return null;
}
