import { addPackingItem, usePackingBags } from '@housekeeping/api';
import { sourceBag, type PackingListBag } from '@housekeeping/core';
import { Sheet, Stack, SwitchRow, TextField } from '@housekeeping/ui';
import { useState } from 'react';

import { useOnlineOnly } from '@/features/shell/offline';

import { messageOf } from './packing-labels';

/**
 * "+ Packstück" at a bag of the packing list (AC-031, AC-032): a name with an optional count
 * ("2 Badehose"), open at the end of the bag. While its Reisetasche exists, the switch also adds it
 * at the end of that template (decision 18); other packing lists stay as they are (D35).
 */
export function TripAddItemSheet(props: { listBag: PackingListBag; onClose: () => void }) {
  const online = useOnlineOnly();
  const bags = usePackingBags();
  const template = sourceBag(props.listBag, bags);
  const [text, setText] = useState('');
  const [alsoInBag, setAlsoInBag] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const save = () => {
    if (online.disabled) return;
    try {
      const id = addPackingItem(props.listBag.id, text, {
        alsoInBag: template !== undefined && alsoInBag,
      });
      if (id === undefined) {
        setError('Name fehlt');
        return;
      }
    } catch (failure) {
      setError(messageOf(failure));
      return;
    }
    props.onClose();
  };

  return (
    <Sheet
      visible
      size="s"
      title={`Packstück für „${props.listBag.name}“`}
      onClose={props.onClose}
      testID="trip-add-item-sheet"
      actions={{
        primary: {
          label: 'Hinzufügen',
          icon: 'plus',
          onPress: save,
          disabled: online.disabled,
          hint: online.hint,
          testID: 'trip-add-item-save',
        },
      }}
    >
      <Stack gap={12}>
        <TextField
          label="Packstück"
          value={text}
          onChangeText={(value) => {
            setText(value);
            setError(undefined);
          }}
          placeholder="z. B. 2 Badehose oder Socken 1 je Tag"
          error={error}
          hint={online.hint}
          editable={!online.disabled}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={save}
          testID="trip-add-item-name"
        />
        {template ? (
          <SwitchRow
            label={`Auch in der Reisetasche „${template.name}“ speichern`}
            value={alsoInBag}
            onValueChange={setAlsoInBag}
            disabled={online.disabled}
            testID="trip-add-item-also"
          />
        ) : null}
      </Stack>
    </Sheet>
  );
}
