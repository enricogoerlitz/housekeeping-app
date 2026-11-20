import {
  addIngredientToList,
  OfflineError,
  PHOTO_UPLOAD_FAILED_MESSAGE,
  preparePhoto,
  rateRecipe,
  removeRecipePhoto,
  setIngredientShoppingNote,
  setRecipePhoto,
  snapshot,
  toggleFavorite,
  useArticlesById,
  useCurrentMember,
  useRecipe,
  useRecipeImage,
  WRITE_REJECTED_MESSAGE,
} from '@housekeeping/api';
import {
  courseLabel,
  defaultVariantId,
  deriveRecipeDiet,
  dietLabel,
  ingredientsForVariant,
  scaleAmount,
  stepsForVariants,
  type Id,
  type Recipe,
  type RecipeIngredient,
} from '@housekeeping/core';
import {
  Badge,
  Button,
  EmptyState,
  Icon,
  IconButton,
  List,
  ListRow,
  Notice,
  Photo,
  Row,
  Section,
  Segmented,
  Sheet,
  Stack,
  Stars,
  Text,
  TextField,
  toast,
  useTheme,
} from '@housekeeping/ui';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { undoAction, useOnlineOnly } from '@/features/shell/offline';
import { useAssistant } from '@/lib/assistant';
import { features } from '@/lib/features';
import { CAN_PICK_PHOTO, pickPhotoFile } from '@/lib/pick-photo';

import { IngredientsPasteSheet } from './ingredients-paste-sheet';

const TWO_COLUMNS_FROM = 720;
const PHOTO_BESIDE_TITLE_FROM = 560;

export interface RecipeDetailProps {
  recipeId: Id;
  /** Shows a back arrow (own page). */
  onBack?: () => void;
  /** Shows a close button (split view on wide screens). */
  onClose?: () => void;
}

/** One recipe: header, portions, variants, ingredients with "Ist alle", steps and actions. */
export function RecipeDetail(props: RecipeDetailProps) {
  const recipe = useRecipe(props.recipeId);
  const router = useRouter();
  if (!recipe) {
    return (
      <EmptyState
        icon="book-open"
        title="Rezept nicht gefunden"
        text="Vielleicht wurde es in einem anderen Haushalt angelegt."
        testID="recipe-not-found"
      >
        <Button
          label="Zu den Rezepten"
          icon="arrow-left"
          onPress={() => router.replace('/rezepte')}
          testID="recipe-not-found-back"
        />
      </EmptyState>
    );
  }
  // A new recipe starts with fresh local state (portions, variant).
  return (
    <RecipeDetailBody
      key={recipe.id}
      recipe={recipe}
      onBack={props.onBack}
      onClose={props.onClose}
    />
  );
}

function RecipeDetailBody(props: { recipe: Recipe; onBack?: () => void; onClose?: () => void }) {
  const { recipe } = props;
  const router = useRouter();
  const assistant = useAssistant();
  const online = useOnlineOnly();
  const me = useCurrentMember();
  const articlesById = useArticlesById();
  const [width, setWidth] = useState(0);
  // Displayed portions are local; when the recipe's own portions change (assistant), they follow.
  const [portions, setPortions] = useState({ base: recipe.servings, shown: recipe.servings });
  const shownServings = portions.base === recipe.servings ? portions.shown : recipe.servings;
  const [variantId, setVariantId] = useState<Id | undefined>(() => defaultVariantId(recipe));
  const [pasteOpen, setPasteOpen] = useState(false);
  const [noteFor, setNoteFor] = useState<RecipeIngredient | undefined>();
  const image = useRecipeImage(recipe);

  const wide = width >= TWO_COLUMNS_FROM;
  const heroRow = width >= PHOTO_BESIDE_TITLE_FROM;
  const activeVariantId = recipe.variants.some((variant) => variant.id === variantId)
    ? variantId
    : defaultVariantId(recipe);
  const ingredients = ingredientsForVariant(recipe, activeVariantId);
  const steps = stepsForVariants(recipe, activeVariantId ? [activeVariantId] : undefined);
  const diet =
    recipe.ingredients.length > 0
      ? deriveRecipeDiet(recipe, activeVariantId, articlesById)
      : undefined;
  const factor = shownServings / recipe.servings;
  const isFavorite = recipe.favoriteOf.includes(me.id);

  const setServings = (value: number) =>
    setPortions({ base: recipe.servings, shown: Math.max(1, value) });

  const markEmpty = (ingredient: RecipeIngredient) => {
    const restore = snapshot();
    const added = addIngredientToList(recipe.id, ingredient.id);
    if (!added) return;
    toast.show({
      message: `${added.articleName} steht auf der Liste`,
      actionLabel: 'Rückgängig',
      onAction: undoAction(restore),
    });
  };

  const startCooking = () => {
    router.push({
      pathname: '/rezept/[id]/kochen',
      params: activeVariantId ? { id: recipe.id, variant: activeVariantId } : { id: recipe.id },
    });
  };

  const titleBlock = (
    <Stack gap={10} style={{ flex: 1, minWidth: 0 }}>
      <Text variant={wide ? 'display' : 'title'} heading testID="recipe-title">
        {recipe.title}
      </Text>
      {recipe.description ? <Text color="muted">{recipe.description}</Text> : null}
      <Row gap={12} wrap>
        {recipe.totalMinutes !== undefined ? (
          <Row gap={5}>
            <Icon name="clock" size={16} color="muted" />
            <Text variant="small" color="muted">
              {recipe.totalMinutes} Min
            </Text>
          </Row>
        ) : null}
        <Text variant="small" color="muted">
          {courseLabel(recipe.course)}
        </Text>
        {diet ? (
          <Badge
            label={dietLabel(diet)}
            icon={diet === 'vegan' || diet === 'vegetarian' ? 'leaf' : undefined}
            tone={diet === 'vegan' || diet === 'vegetarian' ? 'success' : 'neutral'}
            testID="recipe-diet"
          />
        ) : null}
      </Row>
      <Row gap={10}>
        <Stars
          value={recipe.ratings[me.id] ?? 0}
          onChange={online.disabled ? undefined : (stars) => rateRecipe(recipe.id, stars)}
          testID="recipe-rating"
        />
        <Text variant="caption" color="muted">
          {recipe.ratings[me.id] ? 'Deine Bewertung' : 'Noch nicht bewertet'}
        </Text>
      </Row>
      <Row gap={10} wrap style={{ marginTop: 4 }}>
        <Button
          label="Kochen"
          icon="chef-hat"
          onPress={startCooking}
          disabled={recipe.steps.length === 0}
          testID="start-cooking"
        />
        <Button
          label="Einplanen"
          icon="calendar-plus"
          variant="secondary"
          onPress={() => router.push('/plan')}
          testID="recipe-plan"
        />
        {features.ai ? (
          <Button
            label="Anpassen"
            icon="sparkles"
            variant="ghost"
            onPress={() => assistant.open({ recipeId: recipe.id })}
            testID="recipe-assistant"
          />
        ) : null}
      </Row>
    </Stack>
  );

  const ingredientsBlock = (
    <Section
      title="Zutaten"
      tone="essen"
      testID="recipe-ingredients"
      action={<ServingsStepper value={shownServings} onChange={setServings} />}
    >
      {recipe.variants.length > 0 && activeVariantId ? (
        <View testID="variant-select" style={{ marginBottom: 12 }}>
          <Segmented
            label="Variante"
            testID="variant"
            value={activeVariantId}
            onChange={setVariantId}
            options={recipe.variants.map((variant) => ({ value: variant.id, label: variant.name }))}
          />
        </View>
      ) : null}
      {ingredients.length === 0 ? (
        <Text color="muted">Noch keine Zutaten.</Text>
      ) : (
        <List>
          {ingredients.map((ingredient) => (
            <ListRow
              key={ingredient.id}
              testID={`ingredient-${ingredient.id}`}
              title={<IngredientTitle ingredient={ingredient} />}
              accessibilityLabel={[
                ingredient.amount ? scaleAmount(ingredient.amount, factor).text : '',
                ingredient.name,
                ingredient.shoppingNote ? `(${ingredient.shoppingNote})` : '',
              ]
                .filter(Boolean)
                .join(' ')}
              leading={
                <Text
                  variant="bodyStrong"
                  style={{ width: 76 }}
                  testID={`ingredient-amount-${ingredient.id}`}
                >
                  {ingredient.amount ? scaleAmount(ingredient.amount, factor).text : ''}
                </Text>
              }
              trailing={
                <Row gap={0}>
                  <IconButton
                    icon="pencil"
                    label={`Einkaufs-Zusatz für ${ingredient.name}`}
                    disabled={online.disabled}
                    hint={online.hint}
                    onPress={() => setNoteFor(ingredient)}
                    testID={`ingredient-note-${ingredient.id}`}
                  />
                  <IconButton
                    icon="shopping-basket"
                    label={`${ingredient.name} ist alle`}
                    onPress={() => markEmpty(ingredient)}
                    testID={`ingredient-empty-${ingredient.id}`}
                  />
                </Row>
              }
            />
          ))}
        </List>
      )}
      <View style={{ marginTop: 8 }}>
        <Button
          label="Zutaten einfügen"
          icon="plus"
          variant="link"
          onPress={() => setPasteOpen(true)}
          disabled={online.disabled}
          hint={online.hint}
          testID="recipe-paste-ingredients"
        />
      </View>
    </Section>
  );

  const stepsBlock = (
    <Section title="Zubereitung" tone="essen" testID="recipe-steps">
      {steps.length === 0 ? (
        <Text color="muted">Noch keine Schritte.</Text>
      ) : (
        <Stack gap={16}>
          {steps.map((step, index) => (
            <Row key={step.id} gap={12} align="flex-start">
              <StepNumber value={index + 1} />
              <Stack gap={4} style={{ flex: 1 }}>
                <Text testID={`recipe-step-${step.id}`}>{step.text}</Text>
                {step.timerMinutes ? (
                  <Row gap={5}>
                    <Icon name="timer" size={15} color="muted" />
                    <Text variant="caption" color="muted">
                      {step.timerMinutes} Min
                    </Text>
                  </Row>
                ) : null}
              </Stack>
            </Row>
          ))}
        </Stack>
      )}
    </Section>
  );

  return (
    <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)} testID="recipe-detail">
      <Row justify="space-between" style={{ marginBottom: 8, marginLeft: props.onBack ? -8 : 0 }}>
        {props.onBack ? (
          <IconButton icon="arrow-left" label="Zurück" onPress={props.onBack} testID="back" />
        ) : props.onClose ? (
          <IconButton
            icon="x"
            label="Rezept schließen"
            onPress={props.onClose}
            testID="recipe-close"
          />
        ) : (
          <View />
        )}
        <FavoriteButton
          active={isFavorite}
          disabled={online.disabled}
          onPress={() => toggleFavorite(recipe.id)}
        />
      </Row>

      {heroRow ? (
        <Row gap={24} align="flex-start" style={{ marginBottom: 28 }}>
          <Stack gap={4} style={{ width: wide ? 320 : 240 }}>
            <Photo source={image} aspectRatio={4 / 3} alt={recipe.title} />
            <PhotoActions recipe={recipe} />
          </Stack>
          {titleBlock}
        </Row>
      ) : (
        <Stack gap={16} style={{ marginBottom: 24 }}>
          <Stack gap={4}>
            <Photo source={image} aspectRatio={4 / 3} alt={recipe.title} />
            <PhotoActions recipe={recipe} />
          </Stack>
          {titleBlock}
        </Stack>
      )}

      {recipe.leadTime ? (
        <View style={{ marginBottom: 20 }}>
          <Notice
            icon="alarm-clock"
            text={`Vorlauf: ${recipe.leadTime.text}`}
            testID="recipe-lead-time"
          />
        </View>
      ) : null}

      {wide ? (
        <Row gap={32} align="flex-start">
          <View style={{ flex: 1 }}>{ingredientsBlock}</View>
          <View style={{ flex: 1.2 }}>{stepsBlock}</View>
        </Row>
      ) : (
        <>
          {ingredientsBlock}
          {stepsBlock}
        </>
      )}

      {recipe.notes ? (
        <Section title="Notizen" testID="recipe-notes">
          <Text>{recipe.notes}</Text>
        </Section>
      ) : null}

      <IngredientsPasteSheet
        recipeId={recipe.id}
        visible={pasteOpen}
        onClose={() => setPasteOpen(false)}
      />
      {noteFor ? (
        <IngredientNoteSheet
          recipeId={recipe.id}
          ingredient={noteFor}
          onClose={() => setNoteFor(undefined)}
        />
      ) : null}
    </View>
  );
}

/**
 * "Foto ändern" / "Foto entfernen": the household's own photo replaces the sample photo
 * (AC-017); removing it brings the sample back (AC-018). Online only; errors stay at the photo.
 */
function PhotoActions(props: { recipe: Recipe }) {
  const { recipe } = props;
  const online = useOnlineOnly();
  const [busy, setBusy] = useState<'change' | 'remove'>();
  const [error, setError] = useState<string>();
  if (!CAN_PICK_PHOTO && !recipe.photoPath) return null;

  const run = async (kind: 'change' | 'remove', action: () => Promise<void>, done: string) => {
    setBusy(kind);
    setError(undefined);
    try {
      await action();
      toast.show({ message: done });
    } catch (caught) {
      // A refused write already shows a toast; here it only stays as a hint at the photo.
      if (kind === 'remove' && !(caught instanceof OfflineError)) setError(WRITE_REJECTED_MESSAGE);
      else setError(caught instanceof Error ? caught.message : PHOTO_UPLOAD_FAILED_MESSAGE);
    } finally {
      setBusy(undefined);
    }
  };

  const change = () => {
    if (online.disabled || busy) return;
    pickPhotoFile((file) => {
      void run(
        'change',
        async () => setRecipePhoto(recipe.id, await preparePhoto(file)),
        'Foto gespeichert',
      );
    });
  };

  const remove = () => {
    if (online.disabled || busy) return;
    void run('remove', () => removeRecipePhoto(recipe.id), 'Foto entfernt');
  };

  return (
    <View>
      <Row gap={16} wrap>
        {CAN_PICK_PHOTO ? (
          <Button
            label={busy === 'change' ? 'Foto wird gespeichert …' : 'Foto ändern'}
            icon="camera"
            variant="link"
            size="sm"
            disabled={online.disabled || !!busy}
            hint={online.hint}
            onPress={change}
            testID="recipe-photo-change"
          />
        ) : null}
        {recipe.photoPath ? (
          <Button
            label={busy === 'remove' ? 'Foto wird entfernt …' : 'Foto entfernen'}
            icon="trash"
            variant="link"
            size="sm"
            disabled={online.disabled || !!busy}
            hint={online.hint}
            onPress={remove}
            testID="recipe-photo-remove"
          />
        ) : null}
      </Row>
      {error ? (
        <Text variant="small" color="warn" testID="recipe-photo-error">
          {error}
        </Text>
      ) : online.hint ? (
        <Text variant="small" color="muted" testID="recipe-photo-offline">
          {online.hint}
        </Text>
      ) : null}
    </View>
  );
}

/** Name plus the default "Zusatz" that goes onto the shopping list, e.g. "Mozzarella (Fior di Latte)". */
function IngredientTitle(props: { ingredient: RecipeIngredient }) {
  const { ingredient } = props;
  return (
    <View>
      <Text variant="rowTitle">
        {ingredient.name}
        {ingredient.shoppingNote ? (
          <Text variant="body" color="muted" testID={`ingredient-shopping-note-${ingredient.id}`}>
            {' '}
            ({ingredient.shoppingNote})
          </Text>
        ) : null}
      </Text>
      {ingredient.shoppingNote ? (
        <Row gap={4}>
          <Icon name="shopping-basket" size={13} color="muted" />
          <Text variant="caption" color="muted">
            Zusatz für die Einkaufsliste
          </Text>
        </Row>
      ) : null}
    </View>
  );
}

/** Sets the default "Zusatz" of one ingredient; empty removes it (spec 0001 addition). */
function IngredientNoteSheet(props: {
  recipeId: Id;
  ingredient: RecipeIngredient;
  onClose: () => void;
}) {
  const online = useOnlineOnly();
  const [note, setNote] = useState(props.ingredient.shoppingNote ?? '');
  const save = () => {
    if (online.disabled) return;
    props.onClose();
    if (note.trim() === (props.ingredient.shoppingNote ?? '')) return;
    setIngredientShoppingNote(props.recipeId, props.ingredient.id, note);
    toast.show({ message: note.trim() ? 'Zusatz gespeichert' : 'Zusatz entfernt' });
  };
  return (
    <Sheet
      visible
      onClose={props.onClose}
      title="Einkaufs-Zusatz"
      testID="ingredient-note-sheet"
      footer={
        <Button
          label="Speichern"
          icon="check"
          full
          disabled={online.disabled}
          hint={online.hint}
          onPress={save}
          testID="ingredient-note-save"
        />
      }
    >
      <Stack gap={12}>
        <Text color="muted">
          Steht auf der Einkaufsliste in Klammern hinter {props.ingredient.name}, wenn die Zutat aus
          diesem Rezept auf die Liste kommt.
        </Text>
        <TextField
          label={`Zusatz für ${props.ingredient.name}`}
          value={note}
          onChangeText={setNote}
          placeholder="z. B. Fior di Latte, laktosefrei"
          autoFocus
          returnKeyType="done"
          onSubmitEditing={save}
          testID="ingredient-note-input"
        />
      </Stack>
    </Sheet>
  );
}

function ServingsStepper(props: { value: number; onChange: (value: number) => void }) {
  return (
    <Row gap={4}>
      <IconButton
        icon="minus"
        label="Eine Portion weniger"
        variant="soft"
        size={36}
        disabled={props.value <= 1}
        onPress={() => props.onChange(props.value - 1)}
        testID="servings-minus"
      />
      <Text variant="bodyStrong" align="center" style={{ minWidth: 28 }} testID="servings-value">
        {props.value}
      </Text>
      <IconButton
        icon="plus"
        label="Eine Portion mehr"
        variant="soft"
        size={36}
        onPress={() => props.onChange(props.value + 1)}
        testID="servings-plus"
      />
      <Text variant="small" color="muted">
        {props.value === 1 ? 'Portion' : 'Portionen'}
      </Text>
    </Row>
  );
}

function StepNumber(props: { value: number }) {
  const theme = useTheme();
  return (
    <View
      style={{
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.surfaceSunken,
      }}
    >
      <Text variant="smallStrong">{props.value}</Text>
    </View>
  );
}

function FavoriteButton(props: { active: boolean; disabled: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      testID="recipe-favorite"
      accessibilityRole="button"
      accessibilityLabel="Favorit"
      accessibilityState={{ selected: props.active, disabled: props.disabled }}
      disabled={props.disabled}
      onPress={props.onPress}
      style={(state) => ({
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.surfaceSunken,
        opacity: props.disabled ? 0.45 : state.pressed ? 0.6 : 1,
      })}
    >
      <Icon
        name="heart"
        size={22}
        color={props.active ? 'accent' : 'muted'}
        filled={props.active}
      />
    </Pressable>
  );
}
