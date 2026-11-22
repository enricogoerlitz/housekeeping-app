import { deleteRecipe, discardRecipePhoto, OfflineError, snapshot } from '@housekeeping/api';
import { deletedNotice, type Recipe } from '@housekeeping/core';
import { toast } from '@housekeeping/ui';

import { undoAction, useOnlineOnly } from '@/features/shell/offline';

/**
 * ⋯ → "Löschen" on the page of a recipe or a collection (spec 0008, AC-043; spec 0009, AC-032):
 * back to "Essen" and the notice "… gelöscht · Rückgängig" for 5 s, naming the planned entries that
 * go (spec 0023, REQ-012). Only when it ends without
 * "Rückgängig" does the own photo go (E5); a refusal brings everything back (AC-045).
 */
export function useDeleteRecipe(
  recipe: Recipe,
  onBack: () => void,
  /** true while this page deletes its recipe; false again when the deletion did not start. */
  onDeleting: (leaving: boolean) => void,
): () => void {
  const online = useOnlineOnly();
  return () => {
    if (online.disabled) return;
    const restore = snapshot();
    onDeleting(true);
    let deletion;
    try {
      deletion = deleteRecipe(recipe.id);
    } catch (error) {
      onDeleting(false);
      if (!(error instanceof OfflineError)) throw error;
      return;
    }
    if (!deletion) {
      onDeleting(false);
      return;
    }
    const done = deletion;
    onBack();
    toast.show({
      // "Lasagne gelöscht · 2 geplante Einträge entfallen · auch aus 1 Sammlung entfernt" (spec 0023,
      // REQ-012).
      message: deletedNotice(recipe.title, {
        entries: done.entries,
        collections: done.collections,
      }),
      actionLabel: 'Rückgängig',
      onAction: undoAction(restore),
      onExpire: () => void discardRecipePhoto(done),
    });
  };
}
