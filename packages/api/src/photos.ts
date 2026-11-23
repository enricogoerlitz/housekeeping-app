import type { Recipe } from '@housekeeping/core';
import { useMemo } from 'react';

import { usePhoto } from './photos-remote';

// Globals of the app bundle: Metro inlines __DEV__, Expo inlines EXPO_PUBLIC_* values. A production
// export folds the condition below to false and leaves the seed's photos out (spec 0031, REQ-026).
declare const __DEV__: boolean;
declare const process: {
  env: { EXPO_PUBLIC_APP_VERSION?: string; EXPO_PUBLIC_DEV_LOGIN?: string };
};
declare const require: (path: string) => unknown;

/**
 * The seed's sample photos where the seed runs: the dev server, the preview and a local export
 * with the test accounts (EXPO_PUBLIC_DEV_LOGIN=1 needs a local Supabase, so never production).
 */
const sources: Partial<Record<string, number>> =
  __DEV__ ||
  process.env.EXPO_PUBLIC_APP_VERSION === 'vorschau' ||
  process.env.EXPO_PUBLIC_DEV_LOGIN === '1'
    ? (require('./seed/photos') as typeof import('./seed/photos')).SAMPLE_PHOTOS
    : {};

/** Image source for a recipe's photo key; undefined when the recipe has no photo. */
export function photoSource(key: string | undefined): number | undefined {
  if (!key) return undefined;
  return sources[key];
}

/**
 * The image of a recipe for an Image source: its own photo when it has one (AC-017), else the
 * sample photo of the seed (also again after "Foto entfernen", AC-018), else undefined (placeholder).
 * While the own photo loads: undefined; when it cannot be loaded (offline, never seen): the sample.
 */
export function useRecipeImage(
  recipe: Pick<Recipe, 'photo' | 'photoPath'> | undefined,
): number | { uri: string } | undefined {
  const own = usePhoto(recipe?.photoPath);
  const uri = own.uri;
  const ownSource = useMemo(() => (uri ? { uri } : undefined), [uri]);
  if (recipe?.photoPath && (ownSource || own.loading)) return ownSource;
  return photoSource(recipe?.photo);
}
