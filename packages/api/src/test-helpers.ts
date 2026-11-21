// Reads of the active household for the command tests (with backend-test-helpers.ts). Not exported
// from index.ts.
import type { Id, Recipe } from '@housekeeping/core';

import { getData } from './store';

/** The items of the active household's shopping list. */
export function itemsOf() {
  return getData().items;
}

export function articleName(articleId: Id): string | undefined {
  return getData().articles.find((article) => article.id === articleId)?.name;
}

export function recipeById(id: Id): Recipe {
  const found = getData().recipes.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`recipe ${id} missing`);
  return found;
}
