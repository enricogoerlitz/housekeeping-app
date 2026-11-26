import { useArticlesById, useCollectionContents, useRecipeImage } from '@housekeeping/api';
import type { Article, Id, Recipe } from '@housekeeping/core';
import {
  KIND_ICONS,
  MediaCard,
  Photo,
  PhotoCollage,
  Surface,
  Text,
  useBreakpoint,
  useTheme,
} from '@housekeeping/ui';
import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { useCoverSources } from './recipe-cover';
import { RecipeCardMeta } from './recipe-meta';

/** The Kennzeichen of a collection on its tile, over the photo's bottom left (spec 0009, AC-018). */
export const COLLECTION_BADGE = { label: 'Sammlung', icon: KIND_ICONS.collection };

/**
 * What a card shows of a recipe or a collection: a collection gets its cover (own photo, collage
 * or stack placeholder, E14), the Kennzeichen "Sammlung" and its contents for the meta line.
 */
function useCardMedia(recipe: Recipe) {
  const collection = recipe.kind === 'collection';
  const contents = useCollectionContents(collection ? recipe.id : undefined);
  const image = useRecipeImage(recipe);
  const images = useCoverSources(recipe);
  return collection
    ? {
        images,
        contents,
        badge: { ...COLLECTION_BADGE, testID: `recipe-card-badge-${recipe.id}` },
      }
    : { image, contents };
}

const GAP = 12;

export interface RecipeGridProps {
  recipes: Recipe[];
  onOpen: (recipeId: Id) => void;
  /** Forces one card per row with a thumbnail, e.g. in a narrow column. */
  compact?: boolean;
  /** Replaces the default meta line, e.g. with the reason of an AI search hit. */
  meta?: (recipe: Recipe) => ReactNode;
  /** testID per card; default `recipe-card-${id}`. */
  cardTestID?: (recipe: Recipe) => string;
}

/** Recipe cards in as many columns as the measured width allows (the AI search hits). */
export function RecipeGrid(props: RecipeGridProps) {
  const theme = useTheme();
  const articlesById = useArticlesById();
  const [width, setWidth] = useState(0);
  const thumb = props.compact || theme.shape.media === 'thumbRow';
  const minCard = thumb ? 300 : 168;
  const columns = width > 0 ? Math.max(1, Math.floor((width + GAP) / (minCard + GAP))) : 1;
  const cardWidth = columns > 1 ? (width - GAP * (columns - 1)) / columns : undefined;
  return (
    <View
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}
    >
      {props.recipes.map((recipe) => (
        <View
          key={recipe.id}
          style={cardWidth !== undefined ? { width: cardWidth } : { width: '100%' }}
        >
          <RecipeCard
            recipe={recipe}
            articlesById={articlesById}
            compact={props.compact}
            meta={props.meta}
            testID={props.cardTestID ? props.cardTestID(recipe) : `recipe-card-${recipe.id}`}
            onOpen={props.onOpen}
          />
        </View>
      ))}
    </View>
  );
}

/**
 * One tile of the recipe grid on "Essen" (spec 0008, AC-014): photo on top in 4:3 in every theme,
 * so two tiles fit side by side on phones; the title grows on wider screens. The meta line shows
 * minutes, the diet and the average rating ("★ 4,8", AC-040).
 */
export function RecipeTile(props: {
  recipe: Recipe;
  articlesById: Record<Id, Article>;
  onOpen: (recipeId: Id) => void;
}) {
  const { recipe } = props;
  const { isPhone } = useBreakpoint();
  const { contents, ...media } = useCardMedia(recipe);
  return (
    <MediaCard
      testID={`recipe-card-${recipe.id}`}
      title={recipe.title}
      {...media}
      layout="photoTop"
      photoAspectRatio={4 / 3}
      size={isPhone ? 'm' : 'l'}
      meta={
        <RecipeCardMeta recipe={recipe} articlesById={props.articlesById} contents={contents} />
      }
      onPress={() => props.onOpen(recipe.id)}
    />
  );
}

/** One card; its own photo wins over the sample photo (spec 0004, AC-017), a collection as above. */
function RecipeCard(props: {
  recipe: Recipe;
  articlesById: Record<Id, Article>;
  compact?: boolean;
  meta?: (recipe: Recipe) => ReactNode;
  testID: string;
  onOpen: (recipeId: Id) => void;
}) {
  const { recipe } = props;
  const { contents, ...media } = useCardMedia(recipe);
  return (
    <MediaCard
      testID={props.testID}
      title={recipe.title}
      {...media}
      layout={props.compact ? 'thumbRow' : 'auto'}
      meta={
        props.meta ? (
          props.meta(recipe)
        ) : (
          <RecipeCardMeta recipe={recipe} articlesById={props.articlesById} contents={contents} />
        )
      }
      onPress={() => props.onOpen(recipe.id)}
    />
  );
}

/** Side of the photo of a list entry, as for activities (spec 0038, decision 2). */
const ROW_PHOTO = 56;

/**
 * One entry of the recipe list (spec 0038, REQ-001, decision 2): the photo small on the left,
 * the title and one line of details, like a restaurant in its list; `selected` marks the recipe
 * shown beside the list.
 */
export function RecipeRow(props: {
  recipe: Recipe;
  articlesById: Record<Id, Article>;
  selected: boolean;
  onOpen: (recipeId: Id) => void;
}) {
  const theme = useTheme();
  const { recipe } = props;
  const { contents, ...media } = useCardMedia(recipe);
  const frame = { width: ROW_PHOTO, height: ROW_PHOTO, radius: theme.shape.radius.photo };
  const label = 'badge' in media ? `${recipe.title}, ${COLLECTION_BADGE.label}` : recipe.title;
  return (
    <Pressable
      testID={`recipe-card-${recipe.id}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      aria-selected={props.selected}
      onPress={() => props.onOpen(recipe.id)}
      style={(state) => ({
        opacity: state.pressed ? 0.75 : 1,
        borderRadius: theme.shape.radius.card,
        // Entries of one grid row share its height.
        flexGrow: 1,
      })}
    >
      <Surface
        padding={12}
        style={[
          { flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
          props.selected ? { borderWidth: 1.5, borderColor: theme.colors.accent } : null,
        ]}
      >
        {media.images ? (
          <PhotoCollage {...frame} sources={media.images} />
        ) : (
          <Photo {...frame} source={media.image} />
        )}
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <Text variant="rowTitle" numberOfLines={1}>
            {recipe.title}
          </Text>
          <RecipeCardMeta recipe={recipe} articlesById={props.articlesById} contents={contents} />
        </View>
      </Surface>
    </Pressable>
  );
}
