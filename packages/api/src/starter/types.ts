import type { Diet } from '@housekeeping/core';

/** Stable keys of the predefined supermarket areas (see areas.ts). */
export type AreaKey =
  | 'obst-gemuese'
  | 'brot'
  | 'kuehlregal'
  | 'kaese'
  | 'fleisch'
  | 'fisch'
  | 'tiefkuehl'
  | 'nudeln-reis'
  | 'konserven'
  | 'backen'
  | 'gewuerze-oel'
  | 'fruehstueck'
  | 'suesses'
  | 'getraenke'
  | 'kaffee-tee'
  | 'drogerie'
  | 'haushalt'
  | 'tierbedarf'
  | 'sonstiges';

/** One entry of the starter catalog. */
export interface StarterArticle {
  /** Name as shown on the list, in the form people write it ("Möhren", "Milch", "Eier"). */
  name: string;
  /** Other words for the same thing ("Karotten", "Mohrrüben"). */
  synonyms?: string[];
  area: AreaKey;
  diet: Diet;
  /** "Vorrat": usually at home (spices, oil, flour, rice …). */
  pantry?: boolean;
}
