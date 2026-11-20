import { addIngredientsFromText } from '@housekeeping/api';
import type { Id } from '@housekeeping/core';
import { Button, Sheet, TextField, toast } from '@housekeeping/ui';
import { useState } from 'react';

import { useOnlineOnly } from '@/features/shell/offline';

/** Pastes a block of ingredients, one per line, into a recipe (AC-022). */
export function IngredientsPasteSheet(props: {
  recipeId: Id;
  visible: boolean;
  onClose: () => void;
}) {
  const online = useOnlineOnly();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);

  const close = () => {
    setText('');
    setError(undefined);
    props.onClose();
  };

  const save = () => {
    if (!text.trim()) {
      setError('Füge mindestens eine Zutat ein.');
      return;
    }
    const count = addIngredientsFromText(props.recipeId, text);
    if (count === 0) {
      setError('Darin war keine Zutat zu erkennen.');
      return;
    }
    toast.show({ message: count === 1 ? '1 Zutat eingefügt' : `${count} Zutaten eingefügt` });
    close();
  };

  return (
    <Sheet
      visible={props.visible}
      onClose={close}
      title="Zutaten einfügen"
      testID="ingredients-paste-sheet"
      footer={
        <Button
          label="Einfügen"
          icon="check"
          full
          onPress={save}
          disabled={online.disabled}
          hint={online.hint}
          testID="ingredients-paste-save"
        />
      }
    >
      <TextField
        label="Zutaten"
        placeholder={'200 ml Kokosmilch\n1 Mango\n1 Prise Salz'}
        hint="Eine Zutat pro Zeile, z. B. 200 ml Kokosmilch"
        value={text}
        onChangeText={(value) => {
          setText(value);
          if (error) setError(undefined);
        }}
        multiline
        autoFocus
        error={error}
        testID="ingredients-paste"
      />
    </Sheet>
  );
}
