import { starterCatalogEntries } from '@housekeeping/api';
import {
  ingredientDrafts,
  rowsFromIngredientDrafts,
  type Article,
  type Id,
  type IngredientRow,
} from '@housekeeping/core';

// Rows of "Mehrere einfügen" (spec 0007, REQ-002) live only in the draft of the section "Zutaten"
// (spec 0008, E9). "Neues Rezept" saves the pasted rows with an article together with the recipe
// and hands the orange ones over to its page, which opens the section with them. The page takes
// them once its first render is committed, never while rendering: a navigation renders in a
// transition, and a render React throws away must not use them up (spec 0018, E-01).

const handedOver = new Map<Id, IngredientRow[]>();
let rowSeq = 0;

/** A key for a row that is not stored yet; unique while the app runs. */
export const newRowKey = (): string => `row-${++rowSeq}`;

/** The rows of a pasted block: sure lines with their article, the others orange (AC-008). */
export function rowsFromText(text: string, articles: readonly Article[]): IngredientRow[] {
  return rowsFromIngredientDrafts(
    ingredientDrafts(text, articles, starterCatalogEntries, newRowKey),
  );
}

/** "Neues Rezept": the rows without an article, for the recipe page to open them. */
export function handOverIngredientRows(recipeId: Id, rows: IngredientRow[]): void {
  if (rows.length > 0) handedOver.set(recipeId, rows);
}

/** The rows handed over for this recipe, once; call it from an effect, not while rendering. */
export function takeHandedOverRows(recipeId: Id): IngredientRow[] | undefined {
  const rows = handedOver.get(recipeId);
  handedOver.delete(recipeId);
  return rows;
}
