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
  recipeDietChip,
  recipeShareText,
  shownVariantId,
  type Id,
  type Recipe,
  type VariantChoice,
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
import { appLink, shareText, useShareFile } from '@/lib/share';
import { usePageParams } from '@/lib/url-state';
import { useBrowseSwipe } from '@/lib/browse-order';

import { AddToCollectionSheet } from './add-to-collection-sheet';
import { CollectionDetailBody } from './collection-detail';
import { RecipeActions, RecipeMoreMenu, useRecipePhoto } from './recipe-actions';
import { ClassificationSection } from './sections/classification-section';
import { HeadSection } from './sections/head-section';
import { IngredientsSection } from './sections/ingredients-section';
import { LinksSection } from './sections/links-section';
import { NotesSection } from './sections/notes-section';
import { EditControls, EditError } from './sections/edit-controls';
import { StepsSection } from './sections/steps-section';
import { usePageEditor } from './sections/use-page-editor';
import { RecipePhoto } from './recipe-cover';
import { useDeleteRecipe } from './use-delete-recipe';

export interface RecipeDetailProps {
  recipeId: Id;
  /** "‹ Essen": back to the list, at the same place (AC-015), or to the origin (spec 0019). */
  onBack: () => void;
  /** The origin's name on the back link, "Essen" without one. */
  backLabel: string;
}

/**
 * A recipe as a whole page in "Essen" (spec 0008, REQ-006, E12): the bar with "‹ Essen", the
 * title once scrolled (phones) and the actions; inside two columns from the desktop breakpoint.
 * The page reads without pens; the one pen at the top opens every block (Kopf, Einordnung, Zutaten,
 * Zubereitung, Notizen, Links) at once, "Speichern" saves them in one step (spec 0037, REQ-001,
 * `usePageEditor`).
 */
export function RecipeDetail(props: RecipeDetailProps) {
  const recipe = useRecipe(props.recipeId);
  // Set while this page deletes its own recipe: it leaves instead of showing "gibt es nicht mehr".
  const [leaving, setLeaving] = useState(false);
  if (!recipe) {
    if (leaving) return <Screen testID="recipe-screen" tone="essen" />;
    return <RecipeGone onBack={props.onBack} backLabel={props.backLabel} />;
  }
  // A collection has its own page at the same address (spec 0009, E13).
  if (recipe.kind === 'collection') {
    return (
      <CollectionDetailBody
        key={recipe.id}
        collection={recipe}
        onBack={props.onBack}
        backLabel={props.backLabel}
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
      backLabel={props.backLabel}
      onDeleting={setLeaving}
    />
  );
}

/** AC-021: deleted elsewhere, or an address from another household. */
function RecipeGone(props: { onBack: () => void; backLabel: string }) {
  return (
    <Screen
      testID="recipe-screen"
      tone="essen"
      header={
        <ScreenHeader
          title="Rezept"
          titleOnScroll
          backLabel={props.backLabel}
          onBack={props.onBack}
        />
      }
    >
      <EmptyState
        icon="book-open"
        title="Dieses Rezept gibt es nicht mehr"
        testID="recipe-not-found"
      >
        <Button
          label={`Zu ${props.backLabel}`}
          icon="arrow-left"
          onPress={props.onBack}
          testID="recipe-not-found-back"
        />
      </EmptyState>
    </Screen>
  );
}

function RecipeDetailBody(props: {
  recipe: Recipe;
  onBack: () => void;
  backLabel: string;
  /** true while this page deletes its recipe; false again when the deletion did not start. */
  onDeleting: (leaving: boolean) => void;
}) {
  // Phones: swipe to the neighbour in the list it was opened from (spec 0034, REQ-008).
  const browse = useBrowseSwipe();
  const { recipe } = props;
  const router = useRouter();
  const online = useOnlineOnly();
  const me = useCurrentMember();
  const members = useMembers();
  const articlesById = useArticlesById();
  const { bp, isPhone } = useBreakpoint();
  const desktop = bp === 'desktop';
  // Portions, variant and the windows "Einplanen", "Zur Sammlung" and "Vorratscheck" stand in the
  // address (spec 0019, REQ-013): `/rezept/<id>?portionen=6&fenster=einplanen`. The recipe's own
  // portions are the default and stay out of it.
  const address = usePageParams('rezept');
  const { params } = address;
  const shownServings = params.portionen ?? recipe.servings;
  const setPortions = (value: number) =>
    address.replace({ portionen: value === recipe.servings ? undefined : value });
  // AC-033: a new default after "Fertig" is preselected; a removed variant falls back to it.
  const variantChoice = chooseVariant(recipe, params.variante);
  const setVariantChoice = (choice: VariantChoice) =>
    address.replace({
      variante: choice.variantId === choice.defaultId ? undefined : choice.variantId,
    });
  const windowOf = (fenster: 'einplanen' | 'sammlung' | 'vorratscheck') => ({
    open: params.fenster === fenster,
    set: (open: boolean) =>
      open ? address.open({ fenster }) : address.close({ fenster: undefined }),
  });
  const { open: planning, set: setPlanning } = windowOf('einplanen');
  const { open: addingToCollection, set: setAddingToCollection } = windowOf('sammlung');
  const { open: pantryCheck, set: setPantryCheck } = windowOf('vorratscheck');
  const photo = useRecipePhoto(recipe);
  const editor = usePageEditor(recipe);
  const editing = editor.draft !== undefined;
  // While the page is edited nothing leads away without asking (AC-005).
  const swipe = editing ? undefined : browse;
  const back = () => editor.guard(props.onBack);

  const activeVariantId = shownVariantId(recipe, variantChoice);
  // No chip without food (spec 0023, AC-029: only "kein Lebensmittel").
  const diet = recipeDietChip(recipe, activeVariantId, articlesById);
  const shownVariants = activeVariantId
    ? [{ variantId: activeVariantId, portions: shownServings }]
    : [];
  // AC-060: the same rule as the calendar picker (AC-061) — something to buy, or nothing to do.
  const canGoOnList = canPutRecipeOnList(recipe, shownServings, shownVariants);

  // The cooking mode cooks the portions shown here (spec 0018, AC-004).
  const startCooking = () => {
    const params = { id: recipe.id, portionen: String(shownServings) };
    router.push({
      pathname: '/rezept/[id]/kochen',
      params: activeVariantId ? { ...params, variante: activeVariantId } : params,
    });
  };

  const { remove, dialog: deleteDialog } = useDeleteRecipe(recipe, props.onBack, props.onDeleting);

  // "Teilen" (spec 0042, AC-008): the portions and the variant shown here, with the own photo.
  const shareFile = useShareFile(recipe.photoPath, recipe.title);
  const share = () =>
    void shareText({
      title: recipe.title,
      text: recipeShareText({
        recipe,
        articleName: (articleId) => articlesById[articleId]?.name ?? '',
        servings: shownServings,
        variantId: activeVariantId,
        appUrl: appLink(`/rezept/${recipe.id}`),
      }),
      file: shareFile,
    });

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

  const headerRight = editing ? (
    <EditControls editor={editor} />
  ) : (
    <>
      <FavoriteButton
        testID="recipe-favorite"
        active={recipe.favoriteOf.includes(me.id)}
        disabled={online.disabled}
        hint={online.hint}
        onPress={() => toggleFavorite(recipe.id)}
      />
      {desktop ? actions : null}
      <EditControls editor={editor} />
      <RecipeMoreMenu
        recipe={recipe}
        photo={photo}
        onDelete={remove}
        onAddToCollection={() => setAddingToCollection(true)}
        onShare={share}
      />
      {deleteDialog}
    </>
  );

  const head = (
    <Stack gap={16} style={{ flex: 1, minWidth: 0 }}>
      <HeadSection recipe={recipe} desktop={desktop} editor={editor} />
      <ClassificationSection
        recipe={recipe}
        diet={diet}
        variantId={activeVariantId}
        editor={editor}
      />
      {editing ? null : (
        <MemberRatings
          ratings={recipe.ratings}
          members={members}
          me={me.id}
          onRate={(stars) => rateRecipe(recipe.id, stars)}
          disabled={online.disabled}
          hint={online.hint}
          testID="recipe-rating"
        />
      )}
      {desktop || editing ? null : <View style={{ marginTop: 4 }}>{actions}</View>}
    </Stack>
  );

  const ingredients = (
    <IngredientsSection
      recipe={recipe}
      variantId={activeVariantId}
      onVariant={(id: Id) => setVariantChoice(chooseVariant(recipe, id))}
      servings={shownServings}
      onServings={(value) => setPortions(Math.max(1, value))}
      editor={editor}
    />
  );
  const steps = <StepsSection recipe={recipe} variantId={activeVariantId} editor={editor} />;
  // "Links" stand under "Notizen" (spec 0023, REQ-009).
  const notes = (
    <>
      <NotesSection recipe={recipe} editor={editor} />
      <LinksSection recipe={recipe} editor={editor} />
    </>
  );

  return (
    <Screen
      testID="recipe-screen"
      tone="essen"
      tabSwipe={swipe}
      header={
        <ScreenHeader
          title={recipe.title}
          titleOnScroll
          backLabel={props.backLabel}
          onBack={back}
          right={headerRight}
          testID="recipe-bar-title"
        />
      }
    >
      <View testID="recipe-detail" style={{ gap: isPhone ? 24 : 32, paddingTop: 8 }}>
        <EditError editor={editor} />
        {desktop ? (
          <>
            <Row gap={32} align="flex-start">
              <RecipePhoto recipe={recipe} photo={photo} style={{ flex: 1 }} onShare={share} />
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
            <RecipePhoto recipe={recipe} photo={photo} onShare={share} />
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
