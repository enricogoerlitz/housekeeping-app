import {
  deleteRecipe,
  discardRecipePhoto,
  OfflineError,
  rateRecipe,
  snapshot,
  toggleFavorite,
  useArticlesById,
  useCurrentMember,
  useMembers,
  useRecipe,
  useRecipeImage,
} from '@housekeeping/api';
import {
  canPutRecipeOnList,
  defaultVariantId,
  deriveRecipeDiet,
  recipeDeletedLabel,
  type Id,
  type Recipe,
} from '@housekeeping/core';
import {
  Button,
  EmptyState,
  Photo,
  Row,
  Screen,
  ScreenHeader,
  Stack,
  toast,
  useBreakpoint,
} from '@housekeeping/ui';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { PlanRecipeSheet } from '@/features/meal-plan/plan-recipe-sheet';
import { FavoriteButton } from '@/features/shell/favorite-button';
import { MemberRatings } from '@/features/shell/member-ratings';
import { undoAction, useOnlineOnly } from '@/features/shell/offline';
import { PantryCheckSheet } from '@/features/shopping/pantry-check-sheet';

import {
  RecipeActions,
  RecipeMoreMenu,
  RecipePhotoStatus,
  useRecipePhoto,
  type RecipePhotoState,
} from './recipe-actions';
import { ClassificationSection } from './sections/classification-section';
import { HeadSection } from './sections/head-section';
import { IngredientsSection } from './sections/ingredients-section';
import { NotesSection } from './sections/notes-section';
import { StepsSection } from './sections/steps-section';
import { useSectionEditor } from './sections/use-section-editor';

export interface RecipeDetailProps {
  recipeId: Id;
  /** "‹ Essen": back to the list, at the same place (AC-015). */
  onBack: () => void;
}

/**
 * A recipe as a whole page in "Essen" (spec 0008, REQ-006, E12): the bar with "‹ Essen", the
 * title once scrolled (phones) and the actions; inside two columns from the desktop breakpoint.
 * Each block (Kopf, Einordnung, Zutaten, Zubereitung, Notizen) is a section with its own pen; at
 * most one is open (REQ-007, `useSectionEditor`).
 */
export function RecipeDetail(props: RecipeDetailProps) {
  const recipe = useRecipe(props.recipeId);
  // Set while this page deletes its own recipe: it leaves instead of showing "gibt es nicht mehr".
  const [leaving, setLeaving] = useState(false);
  if (!recipe) {
    if (leaving) return <Screen testID="recipe-screen" tone="essen" />;
    return <RecipeGone onBack={props.onBack} />;
  }
  // A new recipe starts with fresh local state (portions, variant).
  return (
    <RecipeDetailBody
      key={recipe.id}
      recipe={recipe}
      onBack={props.onBack}
      onDeleting={() => setLeaving(true)}
    />
  );
}

/** AC-021: deleted elsewhere, or an address from another household. */
function RecipeGone(props: { onBack: () => void }) {
  const router = useRouter();
  return (
    <Screen
      testID="recipe-screen"
      tone="essen"
      header={<ScreenHeader title="Rezept" titleOnScroll backLabel="Essen" onBack={props.onBack} />}
    >
      <EmptyState
        icon="book-open"
        title="Dieses Rezept gibt es nicht mehr"
        testID="recipe-not-found"
      >
        <Button
          label="Zu Essen"
          icon="arrow-left"
          onPress={() => (router.canGoBack() ? props.onBack() : router.replace('/rezepte'))}
          testID="recipe-not-found-back"
        />
      </EmptyState>
    </Screen>
  );
}

function RecipeDetailBody(props: { recipe: Recipe; onBack: () => void; onDeleting: () => void }) {
  const { recipe } = props;
  const router = useRouter();
  const online = useOnlineOnly();
  const me = useCurrentMember();
  const members = useMembers();
  const articlesById = useArticlesById();
  const { bp, isPhone } = useBreakpoint();
  const desktop = bp === 'desktop';
  // Displayed portions are local; when the recipe's own portions change (assistant), they follow.
  const [portions, setPortions] = useState({ base: recipe.servings, shown: recipe.servings });
  const shownServings = portions.base === recipe.servings ? portions.shown : recipe.servings;
  const [variantId, setVariantId] = useState<Id | undefined>(() => defaultVariantId(recipe));
  const [pantryCheck, setPantryCheck] = useState(false);
  const [planning, setPlanning] = useState(false);
  const photo = useRecipePhoto(recipe);
  const editor = useSectionEditor(recipe);

  const activeVariantId = recipe.variants.some((variant) => variant.id === variantId)
    ? variantId
    : defaultVariantId(recipe);
  const diet =
    recipe.ingredients.length > 0
      ? deriveRecipeDiet(recipe, activeVariantId, articlesById)
      : undefined;
  const shownVariants = activeVariantId
    ? [{ variantId: activeVariantId, portions: shownServings }]
    : [];
  // AC-060: the same rule as the calendar picker (AC-061) — something to buy, or nothing to do.
  const canGoOnList = canPutRecipeOnList(recipe, shownServings, shownVariants);

  const startCooking = () => {
    router.push({
      pathname: '/rezept/[id]/kochen',
      params: activeVariantId ? { id: recipe.id, variant: activeVariantId } : { id: recipe.id },
    });
  };

  /**
   * AC-043: back to "Essen" and the notice "… gelöscht · Rückgängig" for 5 s. Only when it ends
   * without "Rückgängig" does the own photo go (E5); a refusal brings everything back (AC-045).
   */
  const remove = () => {
    if (online.disabled) return;
    const restore = snapshot();
    props.onDeleting();
    let deletion;
    try {
      deletion = deleteRecipe(recipe.id);
    } catch (error) {
      if (!(error instanceof OfflineError)) throw error;
      return;
    }
    if (!deletion) return;
    const done = deletion;
    props.onBack();
    toast.show({
      message: recipeDeletedLabel(recipe.title),
      actionLabel: 'Rückgängig',
      onAction: undoAction(restore),
      onExpire: () => void discardRecipePhoto(done),
    });
  };

  const actions = (
    <RecipeActions
      recipe={recipe}
      canGoOnList={canGoOnList}
      onPlan={() => setPlanning(true)}
      onList={() => setPantryCheck(true)}
      onCook={startCooking}
      compact={desktop}
    />
  );

  const headerRight = (
    <>
      <FavoriteButton
        testID="recipe-favorite"
        active={recipe.favoriteOf.includes(me.id)}
        disabled={online.disabled}
        hint={online.hint}
        onPress={() => toggleFavorite(recipe.id)}
      />
      {desktop ? actions : null}
      <RecipeMoreMenu recipe={recipe} photo={photo} onDelete={remove} />
    </>
  );

  const head = (
    <Stack gap={16} style={{ flex: 1, minWidth: 0 }}>
      <HeadSection recipe={recipe} desktop={desktop} editor={editor} />
      <ClassificationSection recipe={recipe} diet={diet} editor={editor} />
      <MemberRatings
        ratings={recipe.ratings}
        members={members}
        me={me.id}
        onRate={(stars) => rateRecipe(recipe.id, stars)}
        disabled={online.disabled}
        hint={online.hint}
        testID="recipe-rating"
      />
      {desktop ? null : <View style={{ marginTop: 4 }}>{actions}</View>}
    </Stack>
  );

  const ingredients = (
    <IngredientsSection
      recipe={recipe}
      variantId={activeVariantId}
      onVariant={setVariantId}
      servings={shownServings}
      onServings={(value) => setPortions({ base: recipe.servings, shown: Math.max(1, value) })}
      editor={editor}
    />
  );
  const steps = <StepsSection recipe={recipe} variantId={activeVariantId} editor={editor} />;
  const notes = <NotesSection recipe={recipe} editor={editor} />;

  return (
    <Screen
      testID="recipe-screen"
      tone="essen"
      header={
        <ScreenHeader
          title={recipe.title}
          titleOnScroll
          backLabel="Essen"
          onBack={props.onBack}
          right={headerRight}
          testID="recipe-bar-title"
        />
      }
    >
      <View testID="recipe-detail" style={{ gap: isPhone ? 24 : 32, paddingTop: 8 }}>
        {desktop ? (
          <>
            <Row gap={32} align="flex-start">
              <RecipePhoto recipe={recipe} photo={photo} style={{ flex: 1 }} />
              {head}
            </Row>
            <Row gap={32} align="flex-start">
              <View style={{ flex: 1, minWidth: 0 }}>{ingredients}</View>
              <Stack gap={32} style={{ flex: 1, minWidth: 0 }}>
                {steps}
                {notes}
              </Stack>
            </Row>
          </>
        ) : (
          <>
            <RecipePhoto recipe={recipe} photo={photo} />
            {head}
            {ingredients}
            {steps}
            {notes}
          </>
        )}

        {planning ? <PlanRecipeSheet recipe={recipe} onClose={() => setPlanning(false)} /> : null}
        {pantryCheck ? (
          <PantryCheckSheet
            recipes={[{ recipeId: recipe.id, portions: shownServings, variants: shownVariants }]}
            onClose={() => setPantryCheck(false)}
          />
        ) : null}
      </View>
    </Screen>
  );
}

function RecipePhoto(props: { recipe: Recipe; photo: RecipePhotoState; style?: { flex: number } }) {
  const image = useRecipeImage(props.recipe);
  return (
    <Stack gap={4} style={props.style}>
      <Photo source={image} aspectRatio={4 / 3} alt={props.recipe.title} />
      <RecipePhotoStatus photo={props.photo} />
    </Stack>
  );
}
