import type { Recipe } from '@housekeeping/core';
import { EditableSection, Stack, Text, TextField } from '@housekeeping/ui';

import { SectionError, useSectionFrame } from './common';
import type { SectionEditor } from './use-section-editor';

/** Notizen (REQ-007): always there, so it can be written into (AC-023). */
export function NotesSection(props: { recipe: Recipe; editor: SectionEditor }) {
  const { recipe, editor } = props;
  const frame = useSectionFrame(editor, 'notes', 'Notizen');
  const draft = editor.draft?.section === 'notes' ? editor.draft : undefined;
  return (
    <EditableSection {...frame} testID="recipe-notes">
      {draft ? (
        <Stack gap={10}>
          <TextField
            accessibilityLabel="Notizen"
            placeholder="z. B. Mit doppelt Béchamel noch besser."
            value={draft.notes}
            onChangeText={(notes) => editor.change({ ...draft, notes })}
            error={editor.problem('notes')}
            multiline
            autoFocus
            testID="recipe-notes-input"
          />
          <SectionError editor={editor} testID="recipe-notes-error" />
        </Stack>
      ) : recipe.notes ? (
        <Text testID="recipe-notes-text">{recipe.notes}</Text>
      ) : (
        <Text color="muted">Noch keine Notizen.</Text>
      )}
    </EditableSection>
  );
}
