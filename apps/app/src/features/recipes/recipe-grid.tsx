import { useArticlesById, useRecipeImage } from '@housekeeping/api';
import type { Article, Id, Recipe } from '@housekeeping/core';
import { MediaCard, useBreakpoint, useTheme } from '@housekeeping/ui';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { RecipeCardMeta } from './recipe-meta';

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
  const image = useRecipeImage(recipe);
  return (
    <MediaCard
      testID={`recipe-card-${recipe.id}`}
      title={recipe.title}
      image={image}
      layout="photoTop"
      photoAspectRatio={4 / 3}
      size={isPhone ? 'm' : 'l'}
      meta={<RecipeCardMeta recipe={recipe} articlesById={props.articlesById} />}
      onPress={() => props.onOpen(recipe.id)}
    />
  );
}

/** One card; its own photo wins over the sample photo (spec 0004, AC-017). */
function RecipeCard(props: {
  recipe: Recipe;
  articlesById: Record<Id, Article>;
  compact?: boolean;
  meta?: (recipe: Recipe) => ReactNode;
  testID: string;
  onOpen: (recipeId: Id) => void;
}) {
  const { recipe } = props;
  const image = useRecipeImage(recipe);
  return (
    <MediaCard
      testID={props.testID}
      title={recipe.title}
      image={image}
      layout={props.compact ? 'thumbRow' : 'auto'}
      meta={
        props.meta ? (
          props.meta(recipe)
        ) : (
          <RecipeCardMeta recipe={recipe} articlesById={props.articlesById} />
        )
      }
      onPress={() => props.onOpen(recipe.id)}
    />
  );
}
