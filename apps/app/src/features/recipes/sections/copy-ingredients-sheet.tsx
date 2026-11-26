import { useArticlesById, useRecipes } from '@housekeeping/api';
import {
  copyIngredientsFrom,
  searchRecipes,
  servingsLabel,
  sortRecipes,
  type IngredientsDraft,
  type Recipe,
} from '@housekeeping/core';
import { List, ListRow, Sheet, Stack, Text, TextField } from '@housekeeping/ui';
import { useState } from 'react';

import { newRowKey } from './ingredient-handover';

/**
 * "Aus Rezept übernehmen" in the edit mode (spec 0037, REQ-003): a recipe chosen here gives its
 * ingredients as copies into a group named like it, scaled to the portions of this page
 * (AC-010, AC-011); a recipe without ingredients says so (AC-012). Nothing is saved before
 * "Speichern" of the page.
 */
export function CopyIngredientsSheet(props: {
  draft: IngredientsDraft;
  /** The portions of the page as edited. */
  servings: number;
  onApply: (draft: IngredientsDraft) => void;
  onClose: () => void;
}) {
  const recipes = useRecipes();
  const articlesById = useArticlesById();
  const [query, setQuery] = useState('');
  const [problem, setProblem] = useState<string | undefined>();
  const own = recipes.filter((recipe) => recipe.kind === 'recipe');
  const hits = query.trim() ? searchRecipes(query, own, articlesById) : sortRecipes(own, 'title');

  const choose = (recipe: Recipe) => {
    const copied = copyIngredientsFrom(props.draft, recipe, props.servings, newRowKey);
    if ('problem' in copied) {
      setProblem(copied.problem);
      return;
    }
    props.onApply(copied.draft);
  };

  return (
    <Sheet
      visible
      size="m"
      title="Aus Rezept übernehmen"
      onClose={props.onClose}
      testID="copy-ingredients-sheet"
    >
      <Stack gap={12}>
        <Text variant="small" color="muted">
          {`Die Zutaten kommen als Kopie in eine eigene Gruppe, umgerechnet auf ${servingsLabel(props.servings)}.`}
        </Text>
        <TextField
          accessibilityLabel="Rezept suchen"
          placeholder="Rezept suchen"
          value={query}
          onChangeText={(text) => {
            setQuery(text);
            setProblem(undefined);
          }}
          autoFocus
          round
          testID="copy-ingredients-search"
        />
        {problem ? (
          <Text variant="small" color="warn" testID="copy-ingredients-problem">
            {problem}
          </Text>
        ) : null}
        {hits.length === 0 ? (
          <Text color="muted">Kein Rezept gefunden.</Text>
        ) : (
          <List>
            {hits.map((recipe) => (
              <ListRow
                key={recipe.id}
                title={recipe.title}
                subtitle={`${recipe.ingredients.length} Zutaten · ${servingsLabel(recipe.servings)}`}
                onPress={() => choose(recipe)}
                testID={`copy-ingredients-hit-${recipe.id}`}
              />
            ))}
          </List>
        )}
      </Stack>
    </Sheet>
  );
}
