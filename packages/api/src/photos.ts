import type { Recipe } from '@housekeeping/core';
import { useMemo } from 'react';

import { usePhoto } from './photos-remote';
import type { PhotoKey } from './starter/types';

// Metro turns a require of an image into a numeric asset id; this package has no Node types.
declare const require: (path: string) => number;

// Bundled sample photos (see assets/photos/QUELLEN.md). Metro resolves each require to an asset.
const sources: Record<PhotoKey, number> = {
  lasagne: require('../assets/photos/lasagne.jpg'),
  curry: require('../assets/photos/curry.jpg'),
  'butter-chicken': require('../assets/photos/butter-chicken.jpg'),
  'poke-bowl': require('../assets/photos/poke-bowl.jpg'),
  'buddha-bowl': require('../assets/photos/buddha-bowl.jpg'),
  pfannkuchen: require('../assets/photos/pfannkuchen.jpg'),
  pizza: require('../assets/photos/pizza.jpg'),
  salat: require('../assets/photos/salat.jpg'),
  nudelsalat: require('../assets/photos/nudelsalat.jpg'),
  penne: require('../assets/photos/penne.jpg'),
  'avocado-brot': require('../assets/photos/avocado-brot.jpg'),
  steak: require('../assets/photos/steak.jpg'),
  'quinoa-bowl': require('../assets/photos/quinoa-bowl.jpg'),
  shakshuka: require('../assets/photos/shakshuka.jpg'),
  dal: require('../assets/photos/dal.jpg'),
  beerensalat: require('../assets/photos/beerensalat.jpg'),
};

/** Image source for a recipe's photo key; undefined when the recipe has no photo. */
export function photoSource(key: string | undefined): number | undefined {
  if (!key) return undefined;
  return (sources as Record<string, number | undefined>)[key];
}

/**
 * The image of a recipe for an Image source: its own photo when it has one (AC-017), else the
 * bundled sample photo (also again after "Foto entfernen", AC-018), else undefined (placeholder).
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
