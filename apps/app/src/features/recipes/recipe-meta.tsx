import {
  averageRating,
  deriveRecipeDiet,
  formatQty,
  recipeFitsPreference,
  type Article,
  type Id,
  type Recipe,
} from '@housekeeping/core';
import { Badge, Icon, Row, Text } from '@housekeeping/ui';

/** "1,5" → shown with one decimal at most. */
export function formatRating(value: number): string {
  return formatQty(Math.round(value * 10) / 10);
}

/**
 * Short diet hint for a recipe card: the default variant's diet when it is plant-based,
 * otherwise whether another variant would fit ("vegetarisch möglich"). Undefined when neither.
 */
export function dietHint(recipe: Recipe, articlesById: Record<Id, Article>): string | undefined {
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

/** The line under a recipe title: minutes, diet hint, average rating. */
export function RecipeCardMeta(props: { recipe: Recipe; articlesById: Record<Id, Article> }) {
  const { recipe } = props;
  const hint = dietHint(recipe, props.articlesById);
  const rating = averageRating(recipe);
  return (
    <Row gap={8} wrap>
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
            {formatRating(rating)}
          </Text>
        </Row>
      ) : null}
    </Row>
  );
}
