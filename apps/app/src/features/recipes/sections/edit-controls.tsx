import { Button, IconButton, Notice, Row } from '@housekeeping/ui';
import { View } from 'react-native';

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

/**
 * A kept draft from before (spec 0056, REQ-006): "Ungespeicherte Änderungen von 17:42" with
 * "Weitermachen" (opens the edit mode with it) and "Verwerfen".
 */
export function DraftBackupNotice(props: { editor: PageEditor }) {
  const { backup } = props.editor;
  if (!backup) return null;
  // The actions under the notice: beside it the time would wrap on a phone.
  return (
    <View style={{ gap: 2 }} testID="recipe-draft-backup">
      <Notice icon="history" text={backup.notice} />
      <Row gap={16}>
        <Button
          label="Weitermachen"
          variant="link"
          size="sm"
          onPress={backup.resume}
          testID="recipe-draft-resume"
        />
        <Button
          label="Verwerfen"
          variant="link"
          size="sm"
          onPress={backup.discard}
          testID="recipe-draft-discard"
        />
      </Row>
    </View>
  );
}
