import { useActivitiesById, usePhoto, useRecipesById, useRestaurantsById } from '@housekeeping/api';
import type { Activity, MealPlanEntry, Recipe, Restaurant } from '@housekeeping/core';
import { KIND_ICONS, Photo, PhotoCollage } from '@housekeeping/ui';

import { useActivityIcon } from '@/features/activities/activity-photo';
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
 * the hat; free text the hat; a restaurant its photo, else the cutlery (spec 0024, REQ-004); an
 * activity its photo, else its symbol (its own, its kind's or the mountain; spec 0041). A photo that is not loaded shows the symbol.
 */
export function EntryPicture(props: Frame & { entry: MealPlanEntry }) {
  const { entry, ...frame } = props;
  const recipesById = useRecipesById();
  const activitiesById = useActivitiesById();
  const restaurantsById = useRestaurantsById();
  if (entry.kind === 'activity') {
    const activity = entry.activityId ? activitiesById[entry.activityId] : undefined;
    return <ActivityPicture activity={activity} {...frame} />;
  }
  if (entry.kind === 'restaurant') {
    const restaurant = entry.restaurantId ? restaurantsById[entry.restaurantId] : undefined;
    return <RestaurantPicture restaurant={restaurant} {...frame} />;
  }
  const recipe = entry.kind !== 'text' && entry.recipeId ? recipesById[entry.recipeId] : undefined;
  return <RecipePicture recipe={recipe} {...frame} />;
}

function RestaurantPicture(props: Frame & { restaurant?: Restaurant }) {
  const { restaurant, ...frame } = props;
  const photo = usePhoto(restaurant?.photoPath);
  return (
    <Photo
      source={photo.uri ? { uri: photo.uri } : undefined}
      placeholderIcon={KIND_ICONS.restaurant}
      {...frame}
    />
  );
}

function ActivityPicture(props: Frame & { activity?: Activity }) {
  const { activity, ...frame } = props;
  const photo = usePhoto(activity?.photoPath);
  // Its own symbol or its kind's, as in the calendar and the list (spec 0041, AC-005).
  const icon = useActivityIcon(activity);
  return (
    <Photo source={photo.uri ? { uri: photo.uri } : undefined} placeholderIcon={icon} {...frame} />
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
