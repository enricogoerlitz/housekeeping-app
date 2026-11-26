import {
  rateRecipe,
  toggleFavorite,
  useArticlesById,
  useCollectionContents,
  useCurrentMember,
  useMembers,
} from '@housekeeping/api';
import {
  canPutCollectionOnList,
  collectionListHint,
  collectionShareText,
  collectionSummary,
  type Recipe,
} from '@housekeeping/core';
import { Badge, Button, Row, Stack, Text, useBreakpoint, useToastAvoid } from '@housekeeping/ui';
import { useRef, useState } from 'react';
import { View, type HostInstance } from 'react-native';

import { PlanRecipeSheet } from '@/features/meal-plan/plan-recipe-sheet';
import { FavoriteButton } from '@/features/shell/favorite-button';
import { MemberRatings } from '@/features/shell/member-ratings';
import { useOnlineOnly } from '@/features/shell/offline';
import { PantryCheckSheet } from '@/features/shopping/pantry-check-sheet';
import { useBrowseSwipe } from '@/lib/browse-order';

import { useOpenRecipe } from './navigation';
import { appLink, shareText, useShareFile } from '@/lib/share';

import { NO_INGREDIENTS_HINT, RecipeMoreMenu, useRecipePhoto } from './recipe-actions';
import { RecipePhoto } from './recipe-cover';
import { RecipeFrame } from './recipe-frame';
import { COLLECTION_BADGE } from './recipe-grid';
import { ContentsSection } from './sections/contents-section';
import { HeadSection } from './sections/head-section';
import { IngredientsSection } from './sections/ingredients-section';
import { LinksSection } from './sections/links-section';
import { EditControls, EditError } from './sections/edit-controls';
import { NotesSection } from './sections/notes-section';
import { usePageEditor } from './sections/use-page-editor';
import { useDeleteRecipe } from './use-delete-recipe';

/**
 * The page of a collection (spec 0009, REQ-002, E13), at the address of a recipe: the cover (own
 * photo, collage or stack placeholder), the head with the Kennzeichen "Sammlung" and "für 6 ·
 * 2 Rezepte · 4 eigene Zutaten", the ratings, "Einplanen" and "Auf die Liste"; then "Enthält",
 * "Eigene Zutaten" and "Notizen". No Einordnung, no Zubereitung, no "Kochen" and no assistant. One
 * pen at the top edits the whole page (spec 0037, REQ-001).
 * Two columns from the desktop breakpoint like the recipe page: "Enthält" on the left.
 */
export function CollectionDetailBody(props: {
  collection: Recipe;
  onBack: () => void;
  backLabel: string;
  /** Beside the recipe list on wide screens (spec 0038). */
  quick?: boolean;
  /** true while this page deletes its collection; false again when the deletion did not start. */
  onDeleting: (leaving: boolean) => void;
}) {
  // Phones: swipe to the neighbour in the list it was opened from (spec 0034, REQ-008).
  const browse = useBrowseSwipe();
  const { collection } = props;
  const online = useOnlineOnly();
  const me = useCurrentMember();
  const members = useMembers();
  const contents = useCollectionContents(collection.id);
  const openRecipe = useOpenRecipe();
  const { bp, isPhone } = useBreakpoint();
  // Beside the list the column is too narrow for two (spec 0038).
  const desktop = bp === 'desktop' && !props.quick;
  const [pantryCheck, setPantryCheck] = useState(false);
  const [planning, setPlanning] = useState(false);
  const photo = useRecipePhoto(collection);
  const editor = usePageEditor(collection);
  const editing = editor.draft !== undefined;
  // While the page is edited nothing leads away without asking (spec 0037, AC-005).
  const swipe = editing ? undefined : browse;
  const back = () => editor.guard(props.onBack);
  const { remove, dialog: deleteDialog } = useDeleteRecipe(
    collection,
    props.onBack,
    props.onDeleting,
  );

  // "Teilen" (spec 0042, REQ-004): what it contains and its own ingredients, with the own photo.
  const articlesById = useArticlesById();
  const shareFile = useShareFile(collection.photoPath, collection.title);
  const share = () =>
    void shareText({
      title: collection.title,
      text: collectionShareText({
        collection,
        contents,
        articleName: (articleId) => articlesById[articleId]?.name ?? '',
        appUrl: appLink(`/rezept/${collection.id}`),
      }),
      file: shareFile,
    });

  // AC-025, AC-028: for the collection's own portions; nothing in it reads "Noch nichts enthalten".
  const canGoOnList = canPutCollectionOnList(collection, contents);
  const listHint = canGoOnList
    ? undefined
    : (collectionListHint(collection, contents) ?? NO_INGREDIENTS_HINT);

  const actions = (
    <CollectionActions
      listHint={listHint}
      onPlan={() => setPlanning(true)}
      onList={() => setPantryCheck(true)}
      compact={desktop}
    />
  );

  const headerRight = editing ? (
    <EditControls editor={editor} />
  ) : (
    <>
      <FavoriteButton
        testID="recipe-favorite"
        active={collection.favoriteOf.includes(me.id)}
        disabled={online.disabled}
        hint={online.hint}
        onPress={() => toggleFavorite(collection.id)}
      />
      {desktop ? actions : null}
      <EditControls editor={editor} />
      <RecipeMoreMenu recipe={collection} photo={photo} onDelete={remove} onShare={share} />
      {deleteDialog}
    </>
  );

  const head = (
    <Stack gap={16} style={{ flex: 1, minWidth: 0 }}>
      <HeadSection
        recipe={collection}
        desktop={desktop}
        editor={editor}
        badge={<Badge {...COLLECTION_BADGE} testID="collection-badge" />}
        meta={
          <Text variant="small" color="muted" testID="collection-summary">
            {collectionSummary(collection, contents)}
          </Text>
        }
      />
      {editing ? null : (
        <MemberRatings
          ratings={collection.ratings}
          members={members}
          me={me.id}
          onRate={(stars) => rateRecipe(collection.id, stars)}
          disabled={online.disabled}
          hint={online.hint}
          testID="recipe-rating"
        />
      )}
      {desktop || editing ? null : <View style={{ marginTop: 4 }}>{actions}</View>}
    </Stack>
  );

  const contained = (
    <ContentsSection
      collection={collection}
      contents={contents}
      // A recipe of the collection swipes through its contents (spec 0034, REQ-008).
      onOpen={(recipeId) =>
        openRecipe(
          recipeId,
          contents.map((content) => content.recipe.id),
        )
      }
      editor={editor}
    />
  );
  const ingredients = (
    <IngredientsSection
      recipe={collection}
      variantId={undefined}
      onVariant={() => undefined}
      servings={collection.servings}
      editor={editor}
      title="Eigene Zutaten"
    />
  );
  // "Links" stand under "Notizen" (spec 0023, REQ-009).
  const notes = (
    <>
      <NotesSection recipe={collection} editor={editor} />
      <LinksSection recipe={collection} editor={editor} />
    </>
  );

  return (
    <RecipeFrame
      quick={props.quick}
      title={collection.title}
      backLabel={props.backLabel}
      onBack={back}
      right={headerRight}
      swipe={swipe}
    >
      <View testID="collection-detail" style={{ gap: isPhone ? 24 : 32, paddingTop: 8 }}>
        <EditError editor={editor} />
        {desktop ? (
          <>
            <Row gap={32} align="flex-start">
              <RecipePhoto recipe={collection} photo={photo} style={{ flex: 1 }} onShare={share} />
              {head}
            </Row>
            <Row gap={32} align="flex-start">
              <View style={{ flex: 1, minWidth: 0 }}>{contained}</View>
              <Stack gap={32} style={{ flex: 1, minWidth: 0 }}>
                {ingredients}
                {notes}
              </Stack>
            </Row>
          </>
        ) : (
          <>
            <RecipePhoto recipe={collection} photo={photo} onShare={share} />
            {head}
            {contained}
            {ingredients}
            {notes}
          </>
        )}

        {planning ? (
          <PlanRecipeSheet recipe={collection} onClose={() => setPlanning(false)} />
        ) : null}
        {pantryCheck ? (
          <PantryCheckSheet
            recipes={[{ recipeId: collection.id, portions: collection.servings }]}
            onClose={() => setPantryCheck(false)}
          />
        ) : null}
      </View>
    </RecipeFrame>
  );
}

/**
 * "Einplanen" and "Auf die Liste" (E13): on the desktop in the header bar, on phones and tablets
 * under the head. There is no "Kochen" and no "Anpassen"; offline both are greyed out.
 */
function CollectionActions(props: {
  /** Why "Auf die Liste" is greyed out; undefined when there is something to buy. */
  listHint: string | undefined;
  onPlan: () => void;
  onList: () => void;
  compact?: boolean;
}) {
  const online = useOnlineOnly();
  const size = props.compact ? 'sm' : 'md';
  // A toast stands above these buttons, not on them (spec 0033, AC-025).
  const buttons = useRef<HostInstance>(null);
  useToastAvoid(buttons);
  return (
    <View ref={buttons}>
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
        <Row gap={8}>
          <Button
            label="Auf die Liste"
            icon="shopping-basket"
            variant="secondary"
            size={size}
            onPress={props.onList}
            disabled={online.disabled || props.listHint !== undefined}
            hint={online.hint ?? props.listHint}
            testID="recipe-to-list"
          />
          {props.listHint ? (
            <Text variant="caption" color="muted" testID="recipe-to-list-hint">
              {props.listHint}
            </Text>
          ) : null}
        </Row>
      </Row>
    </View>
  );
}
