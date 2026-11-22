import { useActivitiesById, usePhoto, useRecipesById } from '@housekeeping/api';
import type { Activity, MealPlanEntry, Recipe } from '@housekeeping/core';
import { KIND_ICONS, Photo, PhotoCollage } from '@housekeeping/ui';

import { useCoverSources } from '@/features/recipes/recipe-cover';

interface Frame {
  aspectRatio?: number;
  width?: number;
  height?: number;
  radius?: number;
}

/**
 * The picture of a planned entry (spec 0020, REQ-004), the same on the card under "Geplant", the
 * desktop tile and "Wie war's?": a collection its own photo, else the collage of its recipes, else
 * the stack; a recipe its photo, else the chef's hat; leftovers the photo of their recipe, else
 * the hat; free text the hat; a restaurant the cutlery; an activity its photo, else the mountain.
 * A photo that is not loaded shows the symbol.
 */
export function EntryPicture(props: Frame & { entry: MealPlanEntry }) {
  const { entry, ...frame } = props;
  const recipesById = useRecipesById();
  const activitiesById = useActivitiesById();
  if (entry.kind === 'activity') {
    const activity = entry.activityId ? activitiesById[entry.activityId] : undefined;
    return <ActivityPicture activity={activity} {...frame} />;
  }
  if (entry.kind === 'restaurant') {
    return <Photo source={undefined} placeholderIcon={KIND_ICONS.restaurant} {...frame} />;
  }
  const recipe = entry.kind !== 'text' && entry.recipeId ? recipesById[entry.recipeId] : undefined;
  return <RecipePicture recipe={recipe} {...frame} />;
}

function ActivityPicture(props: Frame & { activity?: Activity }) {
  const { activity, ...frame } = props;
  const photo = usePhoto(activity?.photoPath);
  return (
    <Photo
      source={photo.uri ? { uri: photo.uri } : undefined}
      placeholderIcon={KIND_ICONS.activity}
      {...frame}
    />
  );
}

function RecipePicture(props: Frame & { recipe?: Recipe }) {
  const { recipe, ...frame } = props;
  const sources = useCoverSources(recipe);
  return (
    <PhotoCollage
      sources={sources}
      placeholderIcon={recipe?.kind === 'collection' ? KIND_ICONS.collection : KIND_ICONS.recipe}
      {...frame}
    />
  );
}
