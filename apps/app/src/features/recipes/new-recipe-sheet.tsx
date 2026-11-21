import { createRecipe, useArticles } from '@housekeeping/api';
import {
  NEW_ENTRY_KINDS,
  newEntryTakesIngredients,
  newEntryTitleProblem,
  type Id,
  type RecipeKind,
} from '@housekeeping/core';
import { Button, ChoiceChips, Sheet, Stack, TextField } from '@housekeeping/ui';
import { useState } from 'react';

import { useOnlineOnly } from '@/features/shell/offline';

import { NewRecipeFields } from './recipe-form';
import { handOverIngredientRows, rowsFromText } from './sections/ingredient-handover';

export interface NewRecipeSheetProps {
  visible: boolean;
  /** The kind chosen in "+", preselected each time the window opens (spec 0009, AC-001). */
  kind?: RecipeKind;
  onClose: () => void;
  /** Called with the new recipe's or collection's id after it was saved. */
  onCreated: (recipeId: Id) => void;
}

/**
 * The window "Neu" (spec 0009, E16): the choice chips "Rezept · Sammlung" and a title are enough
 * (AC-001 to AC-003). For a recipe, ingredients can be pasted right away (spec 0008, AC-021,
 * AC-022): the pasted lines go to the new recipe's page, which saves those with an article and
 * opens the section "Zutaten" with the rest orange, "Artikel wählen" (spec 0007, AC-010; spec
 * 0008, E9). A new collection opens on its page, empty.
 */
export function NewRecipeSheet(props: NewRecipeSheetProps) {
  const online = useOnlineOnly();
  const articles = useArticles();
  const preset = props.kind ?? 'recipe';
  const [kind, setKind] = useState<RecipeKind>(preset);
  const [title, setTitle] = useState('');
  const [ingredients, setIngredients] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  // Every opening starts with the kind chosen in "+" (state adjusted while rendering).
  const [shown, setShown] = useState(props.visible);
  if (props.visible !== shown) {
    setShown(props.visible);
    if (props.visible) setKind(preset);
  }

  const close = () => {
    setTitle('');
    setIngredients('');
    setError(undefined);
    props.onClose();
  };

  const takesIngredients = newEntryTakesIngredients(kind);
  const save = () => {
    const problem = newEntryTitleProblem(title);
    if (problem) {
      setError(problem);
      return;
    }
    let recipeId: Id;
    try {
      recipeId = createRecipe({ title, kind });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Das hat nicht geklappt.');
      return;
    }
    if (takesIngredients) handOverIngredientRows(recipeId, rowsFromText(ingredients, articles));
    close();
    props.onCreated(recipeId);
  };

  return (
    <Sheet
      visible={props.visible}
      onClose={close}
      title="Neu"
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
        <ChoiceChips
          label="Art"
          options={[...NEW_ENTRY_KINDS]}
          value={kind}
          onChange={setKind}
          disabled={online.disabled}
          hint={online.hint}
          testID="new-recipe-kind"
        />
        <NewRecipeFields
          title={title}
          kind={kind}
          onChangeTitle={(text) => {
            setTitle(text);
            if (error) setError(undefined);
          }}
          error={error}
          onSubmit={save}
          autoFocus
        />
        {takesIngredients ? (
          <TextField
            label="Zutaten einfügen"
            placeholder={'200 ml Kokosmilch\n1 Mango'}
            hint="Eine Zutat pro Zeile, z. B. 200 ml Kokosmilch"
            value={ingredients}
            onChangeText={setIngredients}
            multiline
            testID="new-recipe-ingredients"
          />
        ) : null}
      </Stack>
    </Sheet>
  );
}
