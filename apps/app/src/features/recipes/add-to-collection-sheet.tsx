import {
  addRecipeToCollection,
  OfflineError,
  useCollectionRecipes,
  useRecipes,
  type CollectionTarget,
} from '@housekeeping/api';
import {
  addedToCollectionLabel,
  collectionChoices,
  newEntryTitleProblem,
  type Recipe,
} from '@housekeeping/core';
import {
  Button,
  Icon,
  KIND_ICONS,
  List,
  ListRow,
  Sheet,
  Stack,
  Text,
  TextField,
  toast,
} from '@housekeeping/ui';
import { useState } from 'react';

import { OFFLINE_EDIT_HINT, useOnlineOnly } from '@/features/shell/offline';
import { errorMessage, FAILED_MESSAGE } from '@/features/shell/error-message';

/**
 * ⋯ → "Zu Sammlung hinzufügen" on a recipe page (spec 0009, E16, AC-008, AC-010): all collections
 * A to Z; one that contains the recipe already says "enthält es schon" and cannot be chosen.
 * "+ Neue Sammlung" asks for a title here and creates collection and row as one write. Afterwards
 * the notice "Zu „Grillabend“ hinzugefügt".
 */
export function AddToCollectionSheet(props: { recipe: Recipe; onClose: () => void }) {
  const { recipe } = props;
  const online = useOnlineOnly();
  const recipes = useRecipes();
  const collectionRecipes = useCollectionRecipes();
  const choices = collectionChoices(recipe.id, recipes, collectionRecipes);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | undefined>();

  const add = (target: CollectionTarget) => {
    try {
      const added = addRecipeToCollection(recipe.id, target);
      props.onClose();
      toast.show({ message: addedToCollectionLabel(added.title) });
    } catch (cause) {
      setError(
        cause instanceof OfflineError ? OFFLINE_EDIT_HINT : errorMessage(cause, FAILED_MESSAGE),
      );
    }
  };

  const createNew = () => {
    const problem = newEntryTitleProblem(title);
    if (problem) {
      setError(problem);
      return;
    }
    add({ newTitle: title });
  };

  return (
    <Sheet
      visible
      size="s"
      title="Zu Sammlung hinzufügen"
      onClose={props.onClose}
      testID="add-to-collection-sheet"
      footer={
        creating ? (
          <Button
            label="Anlegen und hinzufügen"
            icon="check"
            full
            onPress={createNew}
            disabled={online.disabled}
            hint={online.hint}
            testID="add-to-collection-create"
          />
        ) : undefined
      }
    >
      <Stack gap={12}>
        {online.hint ? (
          <Text variant="small" color="warn">
            {online.hint}
          </Text>
        ) : null}
        {choices.length === 0 && !creating ? (
          <Text color="muted" testID="add-to-collection-none">
            Noch keine Sammlungen.
          </Text>
        ) : null}
        {choices.length > 0 ? (
          <List testID="add-to-collection-list">
            {choices.map((choice) => (
              <ListRow
                key={choice.collection.id}
                title={choice.collection.title}
                subtitle={choice.note}
                hint={choice.note}
                leading={<Icon name={KIND_ICONS.collection} size={18} color="muted" />}
                disabled={online.disabled || !choice.selectable}
                onPress={() => add({ collectionId: choice.collection.id })}
                testID={`add-to-collection-${choice.collection.id}`}
              />
            ))}
          </List>
        ) : null}
        {creating ? (
          <TextField
            label="Neue Sammlung"
            placeholder="z. B. Grillabend"
            value={title}
            onChangeText={(text) => {
              setTitle(text);
              setError(undefined);
            }}
            onSubmitEditing={createNew}
            error={error}
            autoFocus
            testID="add-to-collection-title"
          />
        ) : (
          <ListRow
            title="Neue Sammlung"
            leading={<Icon name="plus" size={18} color="accent" />}
            disabled={online.disabled}
            onPress={() => {
              setCreating(true);
              setError(undefined);
            }}
            testID="add-to-collection-new"
          />
        )}
        {error && !creating ? (
          <Text variant="small" color="warn" testID="add-to-collection-error">
            {error}
          </Text>
        ) : null}
      </Stack>
    </Sheet>
  );
}
