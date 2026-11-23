import type { PhotoKey } from './types';

// Metro turns a require of an image into a numeric asset id; this package has no Node types.
declare const require: (path: string) => number;

/**
 * The sample photos of the seed recipes (see assets/photos/QUELLEN.md). Only photos.ts loads this
 * module, and only in dev and preview builds, so the production bundle and its precache carry
 * none of them (spec 0031, REQ-026).
 *
 * @public photos.ts reaches it through a conditional require that knip does not follow.
 */
export const SAMPLE_PHOTOS: Record<PhotoKey, number> = {
  lasagne: require('../../assets/photos/lasagne.jpg'),
  curry: require('../../assets/photos/curry.jpg'),
  'butter-chicken': require('../../assets/photos/butter-chicken.jpg'),
  'poke-bowl': require('../../assets/photos/poke-bowl.jpg'),
  'buddha-bowl': require('../../assets/photos/buddha-bowl.jpg'),
  pfannkuchen: require('../../assets/photos/pfannkuchen.jpg'),
  pizza: require('../../assets/photos/pizza.jpg'),
  salat: require('../../assets/photos/salat.jpg'),
  nudelsalat: require('../../assets/photos/nudelsalat.jpg'),
  penne: require('../../assets/photos/penne.jpg'),
  'avocado-brot': require('../../assets/photos/avocado-brot.jpg'),
  steak: require('../../assets/photos/steak.jpg'),
  'quinoa-bowl': require('../../assets/photos/quinoa-bowl.jpg'),
  shakshuka: require('../../assets/photos/shakshuka.jpg'),
  dal: require('../../assets/photos/dal.jpg'),
  beerensalat: require('../../assets/photos/beerensalat.jpg'),
};
