// Collections (spec 0009, E12): each action is one apply_changes call, all or nothing. Creating,
// deleting, rating, planning and the sections head, own ingredients and notes use the recipe
// commands (a collection is a recipe of the kind "collection"); here is what only a collection
// has: the recipes it contains. The server refuses like the fake (transport-fake.ts): a collection
// as contained recipe or a recipe as container (collection_recipe_kind_invalid), a recipe twice
// (23505), a foreign or deleted recipe (23503), more than 50 (too_many_collection_recipes) and a
// row removed meanwhile (row_not_found). Each refusal jumps back with "Hat nicht geklappt – bitte
// noch einmal versuchen" (ADR-0011).
import {
  contentsChanges,
  newCollectionRecipes,
  validateContentsDraft,
  type CollectionRecipe,
  type ContentsDraft,
  type Id,
  type Recipe,
} from '@housekeeping/core';

import { createRecipe } from './commands-recipes';
import {
  commit,
  commitConfirmed,
  getData,
  isOffline,
  newId,
  OfflineError,
  updateData,
} from './store';

/**
 * "Sammlung" in the window "Neu" (AC-001, AC-002): a new collection, empty or with the recipes
 * chosen there in that order (spec 0037, AC-009), in one call. Throws like createRecipe and
 * addRecipesToCollection before anything changes.
 */
export function createCollection(input: {
  title: string;
  servings?: number;
  recipeIds?: readonly Id[];
}): Id {
  const { recipeIds = [], ...fields } = input;
  assertRecipes(recipeIds);
  return commit({ path: 'diff' }, () => {
    const collectionId = createRecipe({ ...fields, kind: 'collection' });
    putIn(collectionId, recipeIds);
    return collectionId;
  });
}

function collectionOf(collectionId: Id): Recipe {
  const collection = getData().recipes.find((recipe) => recipe.id === collectionId);
  if (collection?.kind !== 'collection') throw new Error('Sammlung nicht gefunden');
  return collection;
}

/** D15, AC-009: only recipes of the kind "Rezept" go into a collection. */
function assertRecipes(recipeIds: readonly Id[]): void {
  const recipes = getData().recipes;
  for (const id of recipeIds) {
    const recipe = recipes.find((candidate) => candidate.id === id);
    if (!recipe) throw new Error('Rezept nicht gefunden');
    if (recipe.kind !== 'recipe') throw new Error('Eine Sammlung enthält nur Rezepte');
  }
}

/** Inside a running command: the rows at the end of the collection (core newCollectionRecipes). */
function putIn(collectionId: Id, recipeIds: readonly Id[]): CollectionRecipe[] {
  const rows = newCollectionRecipes(collectionId, recipeIds, getData().collectionRecipes, newId);
  if (rows.length > 0) {
    updateData((data) => ({ ...data, collectionRecipes: [...data.collectionRecipes, ...rows] }));
  }
  return rows;
}

/**
 * "n Rezepte übernehmen" in the window "Rezepte zu …" (AC-006, AC-007): the recipes go in at the
 * end, in the given order, taking the portions of the collection and their default variant.
 * Already contained ones are left out (AC-010); returns how many were added (0 sends nothing).
 * Throws before anything changes: "Sammlung nicht gefunden", "Eine Sammlung enthält nur Rezepte"
 * (AC-009), "Höchstens 50 Rezepte je Sammlung" (E15), OfflineError.
 */
export function addRecipesToCollection(collectionId: Id, recipeIds: readonly Id[]): number {
  collectionOf(collectionId);
  assertRecipes(recipeIds);
  if (isOffline()) throw new OfflineError();
  const contained = new Set(
    getData()
      .collectionRecipes.filter((row) => row.collectionId === collectionId)
      .map((row) => row.recipeId),
  );
  if (recipeIds.every((id) => contained.has(id))) return 0;
  return commit({ path: 'diff' }, () => putIn(collectionId, recipeIds).length);
}

/** Where "Zu Sammlung hinzufügen" puts the recipe: a collection or a new one by this title. */
export type CollectionTarget = { collectionId: Id } | { newTitle: string };

/**
 * ⋯ → "Zu Sammlung hinzufügen" on a recipe page (AC-008): into an existing collection at the end,
 * or "+ Neue Sammlung" with a title, collection and row in one call. Returns the collection for
 * the hint core addedToCollectionLabel(title). Throws "Titel fehlt", "Sammlung nicht gefunden",
 * "Eine Sammlung enthält nur Rezepte" (AC-009), "Höchstens 50 Rezepte je Sammlung", OfflineError.
 */
export function addRecipeToCollection(
  recipeId: Id,
  target: CollectionTarget,
): { collectionId: Id; title: string } {
  assertRecipes([recipeId]);
  if ('collectionId' in target) {
    const collection = collectionOf(target.collectionId);
    addRecipesToCollection(collection.id, [recipeId]);
    return { collectionId: collection.id, title: collection.title };
  }
  return commit({ path: 'diff' }, () => {
    const collectionId = createCollection({ title: target.newTitle });
    putIn(collectionId, [recipeId]);
    return { collectionId, title: collectionOf(collectionId).title };
  });
}

export interface ContentsSave {
  /**
   * Resolves once the server took the change (at once when nothing changed); rejects with the
   * server's error when it refused it (the rows jump back, the general hint appears), so the
   * section can reopen with its draft.
   */
  confirmed: Promise<void>;
}

/**
 * "Fertig" at "Enthält" (AC-015, AC-016, E12): one apply_changes with, per row, only the columns
 * changed since the section was opened (portions, variant, order) and the removed rows (at most
 * 20). The recipes themselves stay. Throws the first problem of the draft ("1 bis 100
 * Portionen", AC-017; "Höchstens 20 Rezepte auf einmal entfernen") and OfflineError before
 * anything changes; null when the collection is gone.
 */
export function saveCollectionContents(
  collectionId: Id,
  draft: ContentsDraft,
): ContentsSave | null {
  const [problem] = validateContentsDraft(draft);
  if (problem) throw new Error(problem.message);
  if (!getData().recipes.some((recipe) => recipe.id === collectionId)) return null;
  collectionOf(collectionId);
  if (isOffline()) throw new OfflineError();
  if (contentsChanges(draft).length === 0) return { confirmed: Promise.resolve() };
  const confirmed = commitConfirmed(
    { path: 'diff', maxDeletes: { collection_recipes: removedContents(draft) } },
    () => applyContents(collectionId, draft),
  );
  // The caller may not wait for it; a refusal is reported through onWriteRejected anyway.
  confirmed.catch(() => {});
  return { confirmed };
}

/** The rows "Enthält" removes: as many deletes as the diff may send. */
export function removedContents(draft: ContentsDraft): number {
  return contentsChanges(draft).filter((change) => change.type === 'delete').length;
}

/**
 * Inside a running command: "Enthält" as drafted on the stored rows (core contentsChanges): order,
 * portions and variant per row, removed rows go. Shared with the page (spec 0037).
 */
export function applyContents(collectionId: Id, draft: ContentsDraft): void {
  const changes = contentsChanges(draft);
  const removed = new Set(
    changes.flatMap((change) => (change.type === 'delete' ? [change.id] : [])),
  );
  const patches = new Map(
    changes.flatMap((change) => (change.type === 'patch' ? [[change.id, change.values]] : [])),
  );
  updateData((data) => ({
    ...data,
    collectionRecipes: data.collectionRecipes.flatMap((row) => {
      if (row.collectionId !== collectionId) return [row];
      if (removed.has(row.id)) return [];
      const values = patches.get(row.id);
      if (!values) return [row];
      const next: CollectionRecipe = { ...row, ...values };
      // A key holding undefined clears the column ("übernimmt", the default variant).
      if ('servings' in values && values.servings === undefined) delete next.servings;
      if ('variantId' in values && values.variantId === undefined) delete next.variantId;
      return [next];
    }),
  }));
}
