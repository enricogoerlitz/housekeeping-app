import { createRecipe, useArticles } from '@housekeeping/api';
import type { Id } from '@housekeeping/core';
import { Button, Sheet, Stack, TextField } from '@housekeeping/ui';
import { useState } from 'react';

import { useOnlineOnly } from '@/features/shell/offline';

import { NewRecipeFields } from './recipe-form';
import { handOverIngredientRows, rowsFromText } from './sections/ingredient-handover';

export interface NewRecipeSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Called with the new recipe's id after it was saved. */
  onCreated: (recipeId: Id) => void;
}

/**
 * Quick creation: a title is enough; ingredients can be pasted right away (AC-021, AC-022). The
 * pasted lines go to the new recipe's page, which saves those with an article and opens the
 * section "Zutaten" with the rest orange, "Artikel wählen" (spec 0007, AC-010; spec 0008, E9).
 */
export function NewRecipeSheet(props: NewRecipeSheetProps) {
  const online = useOnlineOnly();
  const articles = useArticles();
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
    handOverIngredientRows(recipeId, rowsFromText(ingredients, articles));
    close();
    props.onCreated(recipeId);
  };

  return (
    <Sheet
      visible={props.visible}
      onClose={close}
      title="Neues Rezept"
      testID="new-recipe-sheet"
      size="m"
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
