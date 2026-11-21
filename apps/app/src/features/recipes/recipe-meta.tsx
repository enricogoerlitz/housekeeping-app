import {
  averageRating,
  collectionDiet,
  collectionRecipeCountLabel,
  deriveRecipeDiet,
  formatAverage,
  recipeFitsPreference,
  type Article,
  type CollectionContent,
  type Id,
  type Recipe,
} from '@housekeeping/core';
import { Badge, Icon, Row, Text } from '@housekeeping/ui';

/**
 * Short diet hint for a recipe card: the default variant's diet when it is plant-based,
 * otherwise whether another variant would fit ("vegetarisch möglich"). Undefined when neither.
 */
function dietHint(recipe: Recipe, articlesById: Record<Id, Article>): string | undefined {
  if (recipe.ingredients.length === 0) return undefined;
  const diet = deriveRecipeDiet(recipe, undefined, articlesById);
  if (diet === 'vegan') return 'vegan';
  if (diet === 'vegetarian') {
    return recipeFitsPreference(recipe, 'vegan', articlesById)
      ? 'vegetarisch · vegan möglich'
      : 'vegetarisch';
  }
  if (recipeFitsPreference(recipe, 'vegan', articlesById)) return 'vegan möglich';
  if (recipeFitsPreference(recipe, 'vegetarian', articlesById)) return 'vegetarisch möglich';
  return undefined;
}

/**
 * A collection's diet hint (spec 0009, AC-020): only when everything in it is plant-based; there
 * is no variant to choose, so no "möglich".
 */
function collectionDietHint(
  collection: Recipe,
  contents: readonly CollectionContent[],
  articlesById: Record<Id, Article>,
): string | undefined {
  const diet = collectionDiet(collection, contents, articlesById);
  if (diet === 'vegan') return 'vegan';
  if (diet === 'vegetarian') return 'vegetarisch';
  return undefined;
}

/**
 * The line under a recipe title: minutes, diet hint, average rating ("★ 4,8", AC-040). A
 * collection shows the number of its recipes instead of minutes ("2 Rezepte", none at 0;
 * spec 0009, AC-018, AC-024).
 */
export function RecipeCardMeta(props: {
  recipe: Recipe;
  articlesById: Record<Id, Article>;
  /** What a collection contains; only read for a collection. */
  contents?: readonly CollectionContent[];
}) {
  const { recipe } = props;
  const collection = recipe.kind === 'collection';
  const contents = props.contents ?? [];
  const hint = collection
    ? collectionDietHint(recipe, contents, props.articlesById)
    : dietHint(recipe, props.articlesById);
  const count = collection ? collectionRecipeCountLabel(contents.length) : '';
  const rating = averageRating(recipe);
  return (
    <Row gap={8} wrap>
      {count ? (
        <Text variant="caption" color="muted" testID={`recipe-card-count-${recipe.id}`}>
          {count}
        </Text>
      ) : null}
      {recipe.totalMinutes !== undefined ? (
        <Text variant="caption" color="muted">
          {recipe.totalMinutes} Min
        </Text>
      ) : null}
      {hint ? <Badge label={hint} icon="leaf" tone="success" /> : null}
      {rating !== undefined ? (
        <Row gap={3}>
          <Icon name="star" size={13} color="star" filled />
          <Text variant="caption" color="muted">
            {formatAverage(rating)}
          </Text>
        </Row>
      ) : null}
    </Row>
  );
}
