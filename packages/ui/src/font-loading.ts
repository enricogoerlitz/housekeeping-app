import { isLoaded, loadAsync } from 'expo-font';
import { useEffect, useState } from 'react';

// Spec 0058, REQ-006: a theme's font files load when the theme is shown (the app at start, a
// card of the theme picker), never all of them at once.

/** The files of these font keys; keys without a file are left out. */
export function fontsFor(
  keys: readonly string[],
  assets: Readonly<Record<string, number>>,
): Record<string, number> {
  const picked: Record<string, number> = {};
  for (const key of keys) {
    const asset = assets[key];
    if (asset !== undefined) picked[key] = asset;
  }
  return picked;
}

/**
 * Loads the files of these font keys that are not loaded yet. True once all are there, or once
 * loading failed: a missing font must not hold the app back, the system font takes over.
 */
export function useFontsLoaded(
  keys: readonly string[],
  assets: Readonly<Record<string, number>>,
): boolean {
  const signature = keys.join('|');
  const missing = keys.filter((key) => !isLoaded(key)).join('|');
  const [settled, setSettled] = useState<string | undefined>(undefined);
  const ready = missing === '' || settled === signature;
  useEffect(() => {
    if (ready) return;
    let mounted = true;
    const done = () => {
      if (mounted) setSettled(signature);
    };
    loadAsync(fontsFor(missing.split('|'), assets)).then(done, done);
    return () => {
      mounted = false;
    };
  }, [ready, signature, missing, assets]);
  return ready;
}
