import {
  deleteRecipe,
  discardRecipePhoto,
  OfflineError,
  recipeDeletionListShare,
} from '@housekeeping/api';
import { deletedNotice, deletionListQuestion, type Recipe } from '@housekeeping/core';
import { Button, Sheet, Stack, Text, toast } from '@housekeeping/ui';
import { useState, type ReactNode } from 'react';

import { confirmFirst } from '@/features/shell/confirm-dialog';
import { useOnlineOnly } from '@/features/shell/offline';

/**
 * ⋯ → "Löschen" on the page of a recipe or a collection (spec 0008, AC-043; spec 0009, AC-032)
 * asks first (spec 0036, Entscheidung 1): „„Lasagne“ löschen?“, or, when ingredients of the
 * entries that go stand on the list, "Zutaten auch von der Liste nehmen" (preselected), "Nur
 * löschen", "Abbrechen" (spec 0023, Decision 15; spec 0021, REQ-015). Then back to "Essen" and
 * the notice naming the planned entries that went (spec 0023, REQ-012); the own photo goes once
 * the server confirmed (E5); a refusal brings everything back (AC-045). `dialog` renders the
 * window with the list question.
 */
export function useDeleteRecipe(
  recipe: Recipe,
  onBack: () => void,
  /** true while this page deletes its recipe; false again when the deletion did not start. */
  onDeleting: (leaving: boolean) => void,
): { remove: () => void; dialog: ReactNode } {
  const online = useOnlineOnly();
  const [asking, setAsking] = useState<{ entries: number; ingredients: number }>();

  const run = (withList: boolean) => {
    setAsking(undefined);
    onDeleting(true);
    let deletion;
    try {
      deletion = deleteRecipe(recipe.id, { withList });
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
      // "Lasagne gelöscht · 2 geplante Einträge entfallen · 3 Zutaten von der Liste genommen · auch
      // aus 1 Sammlung entfernt" (spec 0023, REQ-012, Decision 15).
      message: deletedNotice(recipe.title, {
        entries: done.entries,
        ingredients: done.ingredients,
        collections: done.collections,
      }),
    });
    void discardRecipePhoto(done);
  };

  const remove = () => {
    if (online.disabled) return;
    const share = recipeDeletionListShare(recipe.id);
    if (share && share.ingredients > 0) setAsking(share);
    else {
      confirmFirst({
        title: `„${recipe.title}“ löschen?`,
        confirmLabel: 'Löschen',
        onConfirm: () => run(false),
        testID: 'confirm-delete-recipe',
      });
    }
  };

  const dialog = asking ? (
    <Sheet
      visible
      size="s"
      title={`${recipe.title} löschen?`}
      onClose={() => setAsking(undefined)}
      testID="recipe-delete-dialog"
      footer={
        <Stack gap={8}>
          <Button
            label="Zutaten auch von der Liste nehmen"
            full
            disabled={online.disabled}
            hint={online.hint}
            onPress={() => run(true)}
            testID="recipe-delete-with-list"
          />
          <Button
            label="Nur löschen"
            variant="secondary"
            full
            disabled={online.disabled}
            hint={online.hint}
            onPress={() => run(false)}
            testID="recipe-delete-only"
          />
          <Button
            label="Abbrechen"
            variant="ghost"
            full
            onPress={() => setAsking(undefined)}
            testID="recipe-delete-cancel"
          />
        </Stack>
      }
    >
      <Text testID="recipe-delete-message">{deletionListQuestion(asking)}</Text>
    </Sheet>
  ) : null;

  return { remove, dialog };
}
