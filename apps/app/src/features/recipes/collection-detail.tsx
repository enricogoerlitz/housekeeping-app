import {
  rateRecipe,
  toggleFavorite,
  useCollectionContents,
  useCurrentMember,
  useMembers,
} from '@housekeeping/api';
import {
  canPutCollectionOnList,
  collectionListHint,
  collectionSummary,
  type Recipe,
} from '@housekeeping/core';
import {
  Badge,
  Button,
  Row,
  Screen,
  ScreenHeader,
  Stack,
  Text,
  useBreakpoint,
} from '@housekeeping/ui';
import { useState } from 'react';
import { View } from 'react-native';

import { PlanRecipeSheet } from '@/features/meal-plan/plan-recipe-sheet';
import { FavoriteButton } from '@/features/shell/favorite-button';
import { MemberRatings } from '@/features/shell/member-ratings';
import { useOnlineOnly } from '@/features/shell/offline';
import { PantryCheckSheet } from '@/features/shopping/pantry-check-sheet';

import { useOpenRecipe } from './navigation';
import { NO_INGREDIENTS_HINT, RecipeMoreMenu, useRecipePhoto } from './recipe-actions';
import { RecipePhoto } from './recipe-cover';
import { COLLECTION_BADGE } from './recipe-grid';
import { ContentsSection } from './sections/contents-section';
import { HeadSection } from './sections/head-section';
import { IngredientsSection } from './sections/ingredients-section';
import { LinksSection } from './sections/links-section';
import { NotesSection } from './sections/notes-section';
import { useSectionEditor } from './sections/use-section-editor';
import { useDeleteRecipe } from './use-delete-recipe';

/**
 * The page of a collection (spec 0009, REQ-002, E13), at the address of a recipe: the cover (own
 * photo, collage or stack placeholder), the head with the Kennzeichen "Sammlung" and "für 6 ·
 * 2 Rezepte · 4 eigene Zutaten", the ratings, "Einplanen" and "Auf die Liste"; then "Enthält",
 * "Eigene Zutaten" and "Notizen". No Einordnung, no Zubereitung, no "Kochen" and no assistant.
 * Two columns from the desktop breakpoint like the recipe page: "Enthält" on the left.
 */
export function CollectionDetailBody(props: {
  collection: Recipe;
  onBack: () => void;
  backLabel: string;
  /** true while this page deletes its collection; false again when the deletion did not start. */
  onDeleting: (leaving: boolean) => void;
}) {
  const { collection } = props;
  const online = useOnlineOnly();
  const me = useCurrentMember();
  const members = useMembers();
  const contents = useCollectionContents(collection.id);
  const openRecipe = useOpenRecipe();
  const { bp, isPhone } = useBreakpoint();
  const desktop = bp === 'desktop';
  const [pantryCheck, setPantryCheck] = useState(false);
  const [planning, setPlanning] = useState(false);
  const photo = useRecipePhoto(collection);
  const editor = useSectionEditor(collection);
  const remove = useDeleteRecipe(collection, props.onBack, props.onDeleting);

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

  const headerRight = (
    <>
      <FavoriteButton
        testID="recipe-favorite"
        active={collection.favoriteOf.includes(me.id)}
        disabled={online.disabled}
        hint={online.hint}
        onPress={() => toggleFavorite(collection.id)}
      />
      {desktop ? actions : null}
      <RecipeMoreMenu recipe={collection} photo={photo} onDelete={remove} />
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
      <MemberRatings
        ratings={collection.ratings}
        members={members}
        me={me.id}
        onRate={(stars) => rateRecipe(collection.id, stars)}
        disabled={online.disabled}
        hint={online.hint}
        testID="recipe-rating"
      />
      {desktop ? null : <View style={{ marginTop: 4 }}>{actions}</View>}
    </Stack>
  );

  const contained = (
    <ContentsSection
      collection={collection}
      contents={contents}
      onOpen={openRecipe}
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
    <Screen
      testID="recipe-screen"
      tone="essen"
      header={
        <ScreenHeader
          title={collection.title}
          titleOnScroll
          backLabel={props.backLabel}
          onBack={props.onBack}
          right={headerRight}
          testID="recipe-bar-title"
        />
      }
    >
      <View testID="collection-detail" style={{ gap: isPhone ? 24 : 32, paddingTop: 8 }}>
        {desktop ? (
          <>
            <Row gap={32} align="flex-start">
              <RecipePhoto recipe={collection} photo={photo} style={{ flex: 1 }} />
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
            <RecipePhoto recipe={collection} photo={photo} />
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
    </Screen>
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
  );
}
