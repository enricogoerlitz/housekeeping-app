import type { Recipe } from '@housekeeping/core';
import { Stack, Text, TextField } from '@housekeeping/ui';

import { RecipeSection } from './common';
import type { PageEditor } from './use-page-editor';

/** Notizen (REQ-007): always there, so it can be written into (AC-023). */
export function NotesSection(props: { recipe: Recipe; editor: PageEditor }) {
  const { recipe, editor } = props;
  const draft = editor.draft?.notes;
  return (
    <RecipeSection title="Notizen" testID="recipe-notes">
      {draft ? (
        <Stack gap={10}>
          <TextField
            accessibilityLabel="Notizen"
            placeholder="z. B. Mit doppelt Béchamel noch besser."
            value={draft.notes}
            onChangeText={(notes) => editor.change({ ...draft, notes })}
            error={editor.problem('notes')}
            multiline
            testID="recipe-notes-input"
          />
        </Stack>
      ) : recipe.notes ? (
        <Text selectable testID="recipe-notes-text">
          {recipe.notes}
        </Text>
      ) : (
        <Text color="muted">Noch keine Notizen.</Text>
      )}
    </RecipeSection>
  );
}
