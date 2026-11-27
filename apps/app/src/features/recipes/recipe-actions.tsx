import {
  OfflineError,
  PHOTO_UPLOAD_FAILED_MESSAGE,
  removeRecipePhoto,
  setRecipePhoto,
  WRITE_REJECTED_MESSAGE,
} from '@housekeeping/api';
import type { Recipe } from '@housekeeping/core';
import {
  Button,
  Menu,
  Row,
  Stack,
  Text,
  toast,
  useBreakpoint,
  useToastAvoid,
  type MenuOption,
} from '@housekeeping/ui';
import { useRef, useState } from 'react';
import { View, type HostInstance } from 'react-native';

import { useOnlineOnly } from '@/features/shell/offline';
import { useAssistant } from '@/lib/assistant';
import { features } from '@/lib/features';
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
 * on phones and tablets under the head. On phones "Kochen" comes first over the whole width, then
 * "Einplanen" and "Auf die Liste" side by side (spec 0031, AC-087). Offline only "Kochen" works
 * (AC-022).
 */
export function RecipeActions(props: RecipeActionsProps) {
  const { recipe } = props;
  const online = useOnlineOnly();
  const assistant = useAssistant();
  const { isPhone } = useBreakpoint();
  // A toast ("Foto gespeichert") stands above these buttons, not on them (spec 0033, AC-025).
  const buttons = useRef<HostInstance>(null);
  useToastAvoid(buttons);
  const size = props.compact ? 'sm' : 'md';
  const plan = (
    <Button
      label="Einplanen"
      icon="calendar-plus"
      variant="secondary"
      size={size}
      full={isPhone}
      onPress={props.onPlan}
      disabled={online.disabled}
      hint={online.hint}
      testID="recipe-plan"
    />
  );
  // REQ-010: straight into the pantry check with the portions and variant shown here.
  const toList = (
    <Button
      label="Auf die Liste"
      icon="shopping-basket"
      variant="secondary"
      size={size}
      full={isPhone}
      onPress={props.onList}
      disabled={online.disabled || !props.canGoOnList}
      hint={online.hint ?? (props.canGoOnList ? undefined : NO_INGREDIENTS_HINT)}
      testID="recipe-to-list"
    />
  );
  const noIngredients = props.canGoOnList ? null : (
    <Text variant="caption" color="muted" testID="recipe-to-list-hint">
      {NO_INGREDIENTS_HINT}
    </Text>
  );
  const cook = (
    <Button
      label="Kochen"
      icon="chef-hat"
      size={size}
      full={isPhone}
      onPress={props.onCook}
      disabled={recipe.steps.length === 0}
      testID="start-cooking"
    />
  );
  const adjust = features.ai ? (
    <Button
      label="Anpassen"
      icon="sparkles"
      variant="ghost"
      size={size}
      onPress={() => assistant.open({ recipeId: recipe.id })}
      testID="recipe-assistant"
    />
  ) : null;

  if (isPhone) {
    return (
      <Stack gap={10}>
        <View ref={buttons} style={{ gap: 10 }}>
          {cook}
          <Row gap={10} align="flex-start">
            <View style={{ flex: 1, minWidth: 0 }}>{plan}</View>
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              {toList}
              {noIngredients}
            </View>
          </Row>
        </View>
        {adjust}
      </Stack>
    );
  }
  return (
    <Row gap={props.compact ? 8 : 10} wrap>
      {plan}
      <Row gap={8}>
        {toList}
        {noIngredients}
      </Row>
      {cook}
      {adjust}
    </Row>
  );
}

export interface RecipePhotoState {
  /** "Foto ändern": opens the window "Foto" (spec 0039, REQ-001). */
  change: () => void;
  /** The window "Foto" is open. */
  windowOpen: boolean;
  closeWindow: () => void;
  /** "Übernehmen" in the window: saves the prepared JPEG. */
  apply: (photo: Blob) => void;
  /** "Foto entfernen" in the window, which asks first (spec 0004, AC-018; spec 0039). */
  removeConfirmed: () => void;
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
  const [windowOpen, setWindowOpen] = useState(false);

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

  const removeConfirmed = () =>
    void run('remove', () => removeRecipePhoto(recipe.id), 'Foto entfernt');

  return {
    busy,
    error,
    windowOpen,
    closeWindow: () => setWindowOpen(false),
    change: () => {
      if (online.disabled || busy) return;
      setWindowOpen(true);
    },
    apply: (photo) =>
      void run('change', () => setRecipePhoto(recipe.id, photo), 'Foto gespeichert'),
    removeConfirmed,
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

type MoreAction = 'collection' | 'delete';

/**
 * ⋯ of the recipe and collection page (AC-020): only what the page does not show (spec 0054,
 * REQ-003) — "Zu Sammlung hinzufügen" for a recipe only (spec 0009, AC-008, AC-009), then
 * "Löschen". "Teilen" and "Foto ändern" stand under the photo, "Foto entfernen" in its window.
 */
export function RecipeMoreMenu(props: {
  recipe: Recipe;
  onDelete: () => void;
  /** Offered for the kind "Rezept" only; a collection never goes into a collection (D15). */
  onAddToCollection?: () => void;
}) {
  const online = useOnlineOnly();
  const options: MenuOption<MoreAction>[] = [];
  if (props.recipe.kind === 'recipe' && props.onAddToCollection) {
    options.push({
      value: 'collection',
      label: 'Zu Sammlung hinzufügen',
      disabled: online.disabled,
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
        else props.onDelete();
      }}
      testID="recipe-more"
    />
  );
}
