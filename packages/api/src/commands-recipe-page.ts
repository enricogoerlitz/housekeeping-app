// The recipe page in one step (spec 0037, REQ-001, Entscheidung 1): the sections the edit mode
// changed go out as one save_recipe_page call, one transaction on the server. Only changed
// columns and rows are sent, so whatever another device changed in the other fields stays (last
// write wins per field); the answer says whether the recipe changed since the edit mode opened.
import {
  changedSections,
  compareTimestamps,
  validatePageDraft,
  type Id,
  type IngredientRow,
  type PageDraft,
} from '@housekeeping/core';

import { applyContents, removedContents } from './commands-collections';
import { applySection } from './commands-recipes';
import { commitConfirmed, getData, isOffline, OfflineError } from './store';

export interface PageSave {
  /**
   * Resolves once the server took the page: `changedMeanwhile` when the recipe was saved
   * elsewhere since the edit mode opened (AC-006). Rejects with the server's error when it refused
   * (nothing is saved, the page jumps back, AC-004).
   */
  confirmed: Promise<{ changedMeanwhile: boolean }>;
  /** Rows whose article was deleted meanwhile: not saved, the page stays open with them. */
  open: IngredientRow[];
}

/** `updated_at` of the recipe after this device's last page save, until a pull brings it. */
const savedAt = new Map<Id, string>();

function seenOf(page: PageDraft): string | undefined {
  const own = savedAt.get(page.recipeId);
  if (own === undefined) return page.seenUpdatedAt;
  if (page.seenUpdatedAt === undefined) return own;
  return compareTimestamps(own, page.seenUpdatedAt) > 0 ? own : page.seenUpdatedAt;
}

/**
 * "Speichern" of the edit mode: every changed section of `page` (core changedSections) with its
 * new and starter articles, remembered rules and the plan entries of a removed variant as one
 * call. Throws the first problem ("Titel fehlt") and OfflineError before anything changes; null
 * when the recipe is gone (nothing is sent).
 */
export function saveRecipePage(page: PageDraft): PageSave | null {
  const [problem] = validatePageDraft(page);
  if (problem) throw new Error(problem.message);
  const { recipeId } = page;
  if (!getData().recipes.some((recipe) => recipe.id === recipeId)) return null;
  if (isOffline()) throw new OfflineError();
  const sections = changedSections(page);
  if (sections.length === 0)
    return { confirmed: Promise.resolve({ changedMeanwhile: false }), open: [] };

  const seen = seenOf(page);
  let changedMeanwhile = false;
  let open: IngredientRow[] = [];
  let failure: unknown;
  const removed =
    page.contents && sections.includes(page.contents) ? removedContents(page.contents) : 0;
  const confirmed = commitConfirmed(
    {
      path: 'diff',
      maxDeletes: { collection_recipes: removed },
      send: async (transport, householdId, ops) => {
        const saved = await transport.saveRecipePage(householdId, recipeId, seen, ops);
        changedMeanwhile = saved.changedMeanwhile;
        if (saved.updatedAt) savedAt.set(recipeId, saved.updatedAt);
        return saved;
      },
    },
    () => {
      try {
        for (const draft of sections) {
          if (draft.section === 'contents') applyContents(recipeId, draft);
          else open = [...open, ...applySection(recipeId, draft)];
        }
      } catch (error) {
        failure = error;
        throw error;
      }
    },
  ).then(() => ({ changedMeanwhile }));
  // The caller may not wait for it; a refusal is reported through onWriteRejected anyway.
  confirmed.catch(() => {});
  if (failure !== undefined) throw failure;
  return { confirmed, open };
}
