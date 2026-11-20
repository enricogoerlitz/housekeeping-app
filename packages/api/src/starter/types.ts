import type { Course, Diet, ShoppingRule } from '@housekeeping/core';

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

/** Keys of the bundled sample photos (packages/api/assets/photos/<key>.jpg). */
export type PhotoKey =
  | 'lasagne'
  | 'curry'
  | 'butter-chicken'
  | 'poke-bowl'
  | 'buddha-bowl'
  | 'pfannkuchen'
  | 'pizza'
  | 'salat'
  | 'nudelsalat'
  | 'penne'
  | 'avocado-brot'
  | 'steak'
  | 'quinoa-bowl'
  | 'shakshuka'
  | 'dal'
  | 'beerensalat';

export interface SeedIngredient {
  /** Amount as written in a recipe: "400 ml", "1", "2 EL", "1 Prise". Omit for "Salz". */
  amount?: string;
  /** Must be the exact `name` of a starter catalog article. */
  article: string;
  /** Default "count". Use "recipeAmount" where the recipe amount is what you buy, "skip" for salt/water. */
  rule?: ShoppingRule;
  /** Default shopping note for this recipe, e.g. "Philadelphia". */
  note?: string;
  /** Name of the variant this ingredient belongs to; omit for base ingredients. */
  variant?: string;
  group?: string;
}

export interface SeedStep {
  text: string;
  variant?: string;
  timerMinutes?: number;
}

/** Compact authoring format for the sample recipes. */
export interface SeedRecipe {
  /** Stable slug, e.g. "mango-curry". */
  key: string;
  title: string;
  photo?: PhotoKey;
  description: string;
  servings: number;
  totalMinutes: number;
  course: Course;
  cuisine?: string;
  tags: string[];
  /** Variant names; the first one is the default. Omit for recipes without variants. */
  variants?: string[];
  ingredients: SeedIngredient[];
  steps: SeedStep[];
  leadTime?: { text: string; hoursBefore: number };
}
