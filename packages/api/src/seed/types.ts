import type { Course, ShoppingRule } from '@housekeeping/core';

// The authoring format of the sample recipes and their photos: only the seed (dev and preview)
// uses them (spec 0031, REQ-026).

/** Keys of the sample photos (packages/api/assets/photos/<key>.jpg, seed/photos.ts). */
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
