import {
  addRecipesToCollection,
  createRecipe,
  OfflineError,
  useArticlesById,
  useCollectionRecipes,
  useRecipes,
} from '@housekeeping/api';
import {
  COLLECTION_FULL,
  matchSearchOrCreate,
  recipePickerRows,
  sortRecipes,
  takeOverLabel,
  type Id,
  type Recipe,
} from '@housekeeping/core';
import { Button, List, SearchOrCreate, SelectRow, Sheet, Stack, Text } from '@housekeeping/ui';
import { useMemo, useState } from 'react';

import { OFFLINE_EDIT_HINT, useOnlineOnly } from '@/features/shell/offline';

/**
 * The window "Rezepte zu „Grillabend“" (spec 0009, E16, AC-006, AC-007, AC-010): a search over the
 * recipes (no collections, AC-009), ticked with a tap or the space bar; contained ones say "schon
 * enthalten" and cannot be ticked. "„…“ als neues Rezept" creates the recipe at once and ticks it.
 * "n Rezepte übernehmen" puts the ticked ones in at the end, in the order they were ticked, as one
 * write. At most 50 recipes per collection (E15).
 */
export function CollectionRecipesSheet(props: { collection: Recipe; onClose: () => void }) {
  const { collection } = props;
  const online = useOnlineOnly();
  const recipes = useRecipes();
  const collectionRecipes = useCollectionRecipes();
  const articlesById = useArticlesById();
  const [query, setQuery] = useState('');
  // Insertion order is the order they go in.
  const [selected, setSelected] = useState<ReadonlySet<Id>>(() => new Set());
  const [error, setError] = useState<string | undefined>();

  const byTitle = useMemo(() => sortRecipes([...recipes], 'title'), [recipes]);
  const picker = recipePickerRows(
    collection,
    byTitle,
    collectionRecipes,
    query,
    articlesById,
    selected,
  );
  const plainItems = useMemo(
    () =>
      recipes
        .filter((recipe) => recipe.kind === 'recipe')
        .map((recipe) => ({ id: recipe.id, name: recipe.title })),
    [recipes],
  );
  const canCreate = matchSearchOrCreate(query, plainItems).canCreate;
  // A ticked recipe another device put in meanwhile shows "schon enthalten" and is not counted.
  const contained = new Set(
    collectionRecipes
      .filter((row) => row.collectionId === collection.id)
      .map((row) => row.recipeId),
  );
  const chosen = [...selected].filter((id) => !contained.has(id));
  const count = chosen.length;

  const toggle = (id: Id) => {
    setError(undefined);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const failure = (cause: unknown) =>
    cause instanceof OfflineError
      ? OFFLINE_EDIT_HINT
      : cause instanceof Error
        ? cause.message
        : 'Das hat nicht geklappt.';

  // AC-007: the recipe exists before anything is taken over, and is ticked in the window.
  const createAndTick = () => {
    try {
      const id = createRecipe({ title: query, kind: 'recipe' });
      setSelected((current) => new Set(current).add(id));
      setError(undefined);
    } catch (cause) {
      setError(failure(cause));
    }
  };

  const takeOver = () => {
    try {
      addRecipesToCollection(collection.id, chosen);
      props.onClose();
    } catch (cause) {
      setError(failure(cause));
    }
  };

  return (
    <Sheet
      visible
      size="l"
      title={`Rezepte zu „${collection.title}“`}
      onClose={props.onClose}
      testID="collection-recipes-sheet"
      header={
        <SearchOrCreate
          query={query}
          onQueryChange={setQuery}
          label="Rezept suchen"
          placeholder="Rezept suchen"
          clearLabel="Suche leeren"
          hits={[]}
          onSelect={() => undefined}
          createOptions={
            canCreate ? [{ key: 'recipe', label: `„${query.trim()}“ als neues Rezept` }] : []
          }
          onCreate={createAndTick}
          createDisabledHint={online.hint ?? (picker.limitReached ? COLLECTION_FULL : undefined)}
          autoFocus
          testID="collection-recipes-search"
        />
      }
      footer={
        <Stack gap={8}>
          {error ? (
            <Text variant="small" color="warn" testID="collection-recipes-error">
              {error}
            </Text>
          ) : picker.limitReached ? (
            <Text variant="small" color="muted" testID="collection-recipes-full">
              {COLLECTION_FULL}
            </Text>
          ) : null}
          <Button
            label={takeOverLabel(count)}
            icon="check"
            full
            onPress={takeOver}
            disabled={online.disabled || count === 0}
            hint={online.hint}
            testID="collection-recipes-save"
          />
        </Stack>
      }
    >
      {picker.rows.length > 0 ? (
        <List testID="collection-recipes-list">
          {picker.rows.map((row) => (
            <SelectRow
              key={row.recipe.id}
              title={row.recipe.title}
              selected={selected.has(row.recipe.id)}
              onToggle={() => toggle(row.recipe.id)}
              disabled={!row.selectable}
              hint={row.note}
              testID={`collection-recipes-row-${row.recipe.id}`}
            />
          ))}
        </List>
      ) : query.trim() ? null : (
        <Text color="muted" testID="collection-recipes-none">
          Noch keine Rezepte.
        </Text>
      )}
    </Sheet>
  );
}
