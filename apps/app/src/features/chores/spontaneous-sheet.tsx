import { logSpontaneous } from '@housekeeping/api';
import { Button, Sheet, Stack, Text, TextField, toast } from '@housekeeping/ui';
import { useState } from 'react';

import { useOnlineOnly } from '@/features/shell/offline';

/** "Was anderes erledigt?": something done without a matching chore goes to the history. */
export function SpontaneousSheet(props: { visible: boolean; onClose: () => void }) {
  const online = useOnlineOnly();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);

  const close = () => {
    setText('');
    setError(undefined);
    props.onClose();
  };

  const save = () => {
    if (online.disabled) return;
    if (text.trim() === '') {
      setError('Was hast du erledigt?');
      return;
    }
    try {
      logSpontaneous(text);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Das hat nicht geklappt.');
      return;
    }
    toast.show({ message: 'Im Verlauf eingetragen' });
    close();
  };

  return (
    <Sheet
      visible={props.visible}
      onClose={close}
      title="Was anderes erledigt?"
      testID="chores-spontaneous-sheet"
      footer={
        <Button
          label="Eintragen"
          icon="check"
          full
          onPress={save}
          disabled={online.disabled}
          hint={online.hint}
          testID="chores-spontaneous-save"
        />
      }
    >
      <Stack gap={12}>
        <Text color="muted">Erscheint als „spontan“ im Verlauf.</Text>
        <TextField
          accessibilityLabel="Was hast du erledigt?"
          placeholder="z. B. Fenster geputzt"
          value={text}
          onChangeText={(value) => {
            setText(value);
            if (error) setError(undefined);
          }}
          error={error}
          hint={online.hint}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={save}
          testID="chores-spontaneous-input"
        />
      </Stack>
    </Sheet>
  );
}
