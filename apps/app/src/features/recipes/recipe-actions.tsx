import {
  OfflineError,
  PHOTO_UPLOAD_FAILED_MESSAGE,
  preparePhoto,
  removeRecipePhoto,
  setRecipePhoto,
  WRITE_REJECTED_MESSAGE,
} from '@housekeeping/api';
import type { Recipe } from '@housekeeping/core';
import { Button, Menu, Row, Text, toast, type MenuOption } from '@housekeeping/ui';
import { useState } from 'react';
import { View } from 'react-native';

import { useOnlineOnly } from '@/features/shell/offline';
import { useAssistant } from '@/lib/assistant';
import { features } from '@/lib/features';
import { CAN_PICK_PHOTO, pickPhotoFile } from '@/lib/pick-photo';
import { errorMessage } from '@/features/shell/error-message';

/** Why "Auf die Liste" is greyed out when there is nothing to buy (spec 0008, AC-060). */
export const NO_INGREDIENTS_HINT = 'Noch keine Zutaten';

export interface RecipeActionsProps {
  recipe: Recipe;
  /** AC-060: something to buy at the portions and variant shown. */
  canGoOnList: boolean;
  onPlan: () => void;
  onList: () => void;
  onCook: () => void;
  /** Smaller buttons for the header bar on the desktop (AC-019). */
  compact?: boolean;
}

/**
 * "Einplanen", "Auf die Liste" and "Kochen" (AC-019, AC-020): on the desktop in the header bar,
 * on phones and tablets under the head. Offline only "Kochen" works (AC-022).
 */
export function RecipeActions(props: RecipeActionsProps) {
  const { recipe } = props;
  const online = useOnlineOnly();
  const assistant = useAssistant();
  const size = props.compact ? 'sm' : 'md';
  return (
    <Row gap={props.compact ? 8 : 10} wrap>
      <Button
        label="Einplanen"
        icon="calendar-plus"
        variant="secondary"
        size={size}
        onPress={props.onPlan}
        disabled={online.disabled}
        hint={online.hint}
        testID="recipe-plan"
      />
      {/* REQ-010: straight into the pantry check with the portions and variant shown here. */}
      <Row gap={8}>
        <Button
          label="Auf die Liste"
          icon="shopping-basket"
          variant="secondary"
          size={size}
          onPress={props.onList}
          disabled={online.disabled || !props.canGoOnList}
          hint={online.hint ?? (props.canGoOnList ? undefined : NO_INGREDIENTS_HINT)}
          testID="recipe-to-list"
        />
        {props.canGoOnList ? null : (
          <Text variant="caption" color="muted" testID="recipe-to-list-hint">
            {NO_INGREDIENTS_HINT}
          </Text>
        )}
      </Row>
      <Button
        label="Kochen"
        icon="chef-hat"
        size={size}
        onPress={props.onCook}
        disabled={recipe.steps.length === 0}
        testID="start-cooking"
      />
      {features.ai ? (
        <Button
          label="Anpassen"
          icon="sparkles"
          variant="ghost"
          size={size}
          onPress={() => assistant.open({ recipeId: recipe.id })}
          testID="recipe-assistant"
        />
      ) : null}
    </Row>
  );
}

export interface RecipePhotoState {
  /** "Foto ändern": opens the picker; call it right inside the press (browsers ask for that). */
  change: () => void;
  /** "Foto entfernen": back to the sample photo (spec 0004, AC-018). */
  remove: () => void;
  busy?: 'change' | 'remove';
  error?: string;
}

/**
 * The household's own photo (spec 0004, AC-017, AC-018): online only; errors stay at the photo,
 * a refused write already shows its toast.
 */
export function useRecipePhoto(recipe: Recipe): RecipePhotoState {
  const online = useOnlineOnly();
  const [busy, setBusy] = useState<'change' | 'remove'>();
  const [error, setError] = useState<string>();

  const run = async (kind: 'change' | 'remove', action: () => Promise<void>, done: string) => {
    setBusy(kind);
    setError(undefined);
    try {
      await action();
      toast.show({ message: done });
    } catch (caught) {
      if (kind === 'remove' && !(caught instanceof OfflineError)) setError(WRITE_REJECTED_MESSAGE);
      else setError(errorMessage(caught, PHOTO_UPLOAD_FAILED_MESSAGE));
    } finally {
      setBusy(undefined);
    }
  };

  return {
    busy,
    error,
    change: () => {
      if (online.disabled || busy) return;
      pickPhotoFile((file) => {
        void run(
          'change',
          async () => setRecipePhoto(recipe.id, await preparePhoto(file)),
          'Foto gespeichert',
        );
      });
    },
    remove: () => {
      if (online.disabled || busy) return;
      void run('remove', () => removeRecipePhoto(recipe.id), 'Foto entfernt');
    },
  };
}

/** The line under the photo while it is saved or removed, or why that failed. */
export function RecipePhotoStatus(props: { photo: RecipePhotoState }) {
  const { busy, error } = props.photo;
  if (error) {
    return (
      <Text variant="small" color="warn" testID="recipe-photo-error">
        {error}
      </Text>
    );
  }
  if (!busy) return null;
  return (
    <View testID="recipe-photo-busy">
      <Text variant="small" color="muted">
        {busy === 'change' ? 'Foto wird gespeichert …' : 'Foto wird entfernt …'}
      </Text>
    </View>
  );
}

type MoreAction = 'collection' | 'photo' | 'photo-remove' | 'delete';

/**
 * ⋯ of the recipe page (AC-020): "Zu Sammlung hinzufügen" for a recipe only (spec 0009, AC-008,
 * AC-009), "Foto ändern", "Foto entfernen" with an own photo, "Löschen".
 */
export function RecipeMoreMenu(props: {
  recipe: Recipe;
  photo: RecipePhotoState;
  onDelete: () => void;
  /** Offered for the kind "Rezept" only; a collection never goes into a collection (D15). */
  onAddToCollection?: () => void;
}) {
  const online = useOnlineOnly();
  const busy = props.photo.busy !== undefined;
  const options: MenuOption<MoreAction>[] = [];
  if (props.recipe.kind === 'recipe' && props.onAddToCollection) {
    options.push({
      value: 'collection',
      label: 'Zu Sammlung hinzufügen',
      disabled: online.disabled,
      hint: online.hint,
    });
  }
  if (CAN_PICK_PHOTO) {
    options.push({
      value: 'photo',
      label: 'Foto ändern',
      disabled: online.disabled || busy,
      hint: online.hint,
    });
  }
  if (props.recipe.photoPath) {
    options.push({
      value: 'photo-remove',
      label: 'Foto entfernen',
      disabled: online.disabled || busy,
      hint: online.hint,
    });
  }
  options.push({ value: 'delete', label: 'Löschen', disabled: online.disabled, hint: online.hint });
  return (
    <Menu<MoreAction>
      trigger="icon"
      icon="ellipsis"
      label="Mehr"
      accessibilityLabel={`Mehr zu ${props.recipe.title}`}
      options={options}
      onChange={(action) => {
        if (action === 'collection') props.onAddToCollection?.();
        else if (action === 'photo') props.photo.change();
        else if (action === 'photo-remove') props.photo.remove();
        else props.onDelete();
      }}
      testID="recipe-more"
    />
  );
}
