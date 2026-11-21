import {
  rateRecipe,
  toggleFavorite,
  useArticlesById,
  useCurrentMember,
  useMembers,
  useRecipe,
} from '@housekeeping/api';
import {
  canPutRecipeOnList,
  chooseVariant,
  deriveRecipeDiet,
  shownVariantId,
  type Id,
  type Recipe,
} from '@housekeeping/core';
import {
  Button,
  EmptyState,
  Row,
  Screen,
  ScreenHeader,
  Stack,
  useBreakpoint,
} from '@housekeeping/ui';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { PlanRecipeSheet } from '@/features/meal-plan/plan-recipe-sheet';
import { FavoriteButton } from '@/features/shell/favorite-button';
import { MemberRatings } from '@/features/shell/member-ratings';
import { useOnlineOnly } from '@/features/shell/offline';
import { PantryCheckSheet } from '@/features/shopping/pantry-check-sheet';

import { AddToCollectionSheet } from './add-to-collection-sheet';
import { CollectionDetailBody } from './collection-detail';
import { RecipeActions, RecipeMoreMenu, useRecipePhoto } from './recipe-actions';
import { ClassificationSection } from './sections/classification-section';
import { HeadSection } from './sections/head-section';
import { IngredientsSection } from './sections/ingredients-section';
import { NotesSection } from './sections/notes-section';
import { StepsSection } from './sections/steps-section';
import { useSectionEditor } from './sections/use-section-editor';
import { RecipePhoto } from './recipe-cover';
import { useDeleteRecipe } from './use-delete-recipe';

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
  // A collection has its own page at the same address (spec 0009, E13).
  if (recipe.kind === 'collection') {
    return (
      <CollectionDetailBody
        key={recipe.id}
        collection={recipe}
        onBack={props.onBack}
        onDeleting={setLeaving}
      />
    );
  }
  // A new recipe starts with fresh local state (portions, variant).
  return (
    <RecipeDetailBody
      key={recipe.id}
      recipe={recipe}
      onBack={props.onBack}
      onDeleting={setLeaving}
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

function RecipeDetailBody(props: {
  recipe: Recipe;
  onBack: () => void;
  /** true while this page deletes its recipe; false again when the deletion did not start. */
  onDeleting: (leaving: boolean) => void;
}) {
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
  // AC-033: a new default after "Fertig" is preselected; a removed variant falls back to it.
  const [variantChoice, setVariantChoice] = useState(() => chooseVariant(recipe));
  const [pantryCheck, setPantryCheck] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [addingToCollection, setAddingToCollection] = useState(false);
  const photo = useRecipePhoto(recipe);
  const editor = useSectionEditor(recipe);

  const activeVariantId = shownVariantId(recipe, variantChoice);
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

  const remove = useDeleteRecipe(recipe, props.onBack, props.onDeleting);

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
      <RecipeMoreMenu
        recipe={recipe}
        photo={photo}
        onDelete={remove}
        onAddToCollection={() => setAddingToCollection(true)}
      />
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
      onVariant={(id: Id) => setVariantChoice(chooseVariant(recipe, id))}
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
        {addingToCollection ? (
          <AddToCollectionSheet recipe={recipe} onClose={() => setAddingToCollection(false)} />
        ) : null}
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
