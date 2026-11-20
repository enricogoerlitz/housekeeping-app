import { photoSource, useArticlesById } from '@housekeeping/api';
import type { Id, Recipe } from '@housekeeping/core';
import { MediaCard, useTheme } from '@housekeeping/ui';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { RecipeCardMeta } from './recipe-meta';

const GAP = 12;

export interface RecipeGridProps {
  recipes: Recipe[];
  onOpen: (recipeId: Id) => void;
  /** Forces one card per row with a thumbnail, e.g. in the narrow list column of the split view. */
  compact?: boolean;
  /** Replaces the default meta line, e.g. with the reason of an AI search hit. */
  meta?: (recipe: Recipe) => ReactNode;
  /** testID per card; default `recipe-card-${id}`. */
  cardTestID?: (recipe: Recipe) => string;
}

/** Recipe cards in as many columns as the measured width allows. */
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
          <MediaCard
            testID={props.cardTestID ? props.cardTestID(recipe) : `recipe-card-${recipe.id}`}
            title={recipe.title}
            image={photoSource(recipe.photo)}
            layout={props.compact ? 'thumbRow' : 'auto'}
            meta={
              props.meta ? (
                props.meta(recipe)
              ) : (
                <RecipeCardMeta recipe={recipe} articlesById={articlesById} />
              )
            }
            onPress={() => props.onOpen(recipe.id)}
          />
        </View>
      ))}
    </View>
  );
}
