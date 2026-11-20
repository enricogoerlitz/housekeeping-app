import { addIngredientsFromText, createRecipe } from '@housekeeping/api';
import type { Id } from '@housekeeping/core';
import { Button, Sheet, Stack, TextField } from '@housekeeping/ui';
import { useState } from 'react';

import { useOnlineOnly } from '@/features/shell/offline';

import { NewRecipeFields } from './recipe-form';

export interface NewRecipeSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Called with the new recipe's id after it was saved. */
  onCreated: (recipeId: Id) => void;
}

/** Quick creation: a title is enough; ingredients can be pasted right away (AC-021, AC-022). */
export function NewRecipeSheet(props: NewRecipeSheetProps) {
  const online = useOnlineOnly();
  const [title, setTitle] = useState('');
  const [ingredients, setIngredients] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);

  const close = () => {
    setTitle('');
    setIngredients('');
    setError(undefined);
    props.onClose();
  };

  const save = () => {
    if (!title.trim()) {
      setError('Titel fehlt');
      return;
    }
    let recipeId: Id;
    try {
      recipeId = createRecipe({ title });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Das hat nicht geklappt.');
      return;
    }
    if (ingredients.trim()) addIngredientsFromText(recipeId, ingredients);
    close();
    props.onCreated(recipeId);
  };

  return (
    <Sheet
      visible={props.visible}
      onClose={close}
      title="Neues Rezept"
      testID="new-recipe-sheet"
      footer={
        <Button
          label="Anlegen"
          icon="check"
          full
          onPress={save}
          disabled={online.disabled}
          hint={online.hint}
          testID="new-recipe-save"
        />
      }
    >
      <Stack gap={16}>
        <NewRecipeFields
          title={title}
          onChangeTitle={(text) => {
            setTitle(text);
            if (error) setError(undefined);
          }}
          error={error}
          onSubmit={save}
          autoFocus
        />
        <TextField
          label="Zutaten einfügen"
          placeholder={'200 ml Kokosmilch\n1 Mango'}
          hint="Eine Zutat pro Zeile, z. B. 200 ml Kokosmilch"
          value={ingredients}
          onChangeText={setIngredients}
          multiline
          testID="new-recipe-ingredients"
        />
      </Stack>
    </Sheet>
  );
}
