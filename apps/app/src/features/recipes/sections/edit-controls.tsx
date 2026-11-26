import { Button, IconButton, Notice, Row } from '@housekeeping/ui';

import { useOnlineOnly } from '@/features/shell/offline';

import type { PageEditor } from './use-page-editor';

/**
 * The top right of the recipe and collection page (spec 0037, REQ-001): in the read view the one
 * pen (AC-001), greyed out offline with the hint (AC-007); in the edit mode "Abbrechen" and
 * "Speichern" (AC-003, AC-005).
 */
export function EditControls(props: { editor: PageEditor }) {
  const { editor } = props;
  const online = useOnlineOnly();
  if (!editor.draft) {
    return (
      <IconButton
        icon="pencil"
        size={44}
        label="Bearbeiten"
        disabled={online.disabled}
        hint={online.hint}
        onPress={() => editor.start()}
        testID="recipe-edit"
      />
    );
  }
  return (
    <Row gap={8}>
      <Button
        label="Abbrechen"
        variant="ghost"
        size="sm"
        disabled={editor.saving}
        onPress={editor.cancel}
        testID="recipe-edit-cancel"
      />
      <Button
        label={editor.saving ? 'Speichert …' : 'Speichern'}
        icon="check"
        size="sm"
        disabled={editor.saving || online.disabled}
        hint={online.hint}
        onPress={editor.save}
        testID="recipe-edit-save"
      />
    </Row>
  );
}

/** Why "Speichern" did not save, once at the top of the page (AC-004). */
export function EditError(props: { editor: PageEditor }) {
  const { error } = props.editor;
  if (!error) return null;
  return <Notice icon="circle-alert" text={error} testID="recipe-edit-error" />;
}
