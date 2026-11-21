import { useCollectionContents, useRecipeImage } from '@housekeeping/api';
import { coverPhotos, type Recipe } from '@housekeeping/core';

/**
 * The picture of a planned recipe on the Übersicht: its own photo, for a collection without one
 * the photo of its first contained recipe that has one (core coverPhotos, spec 0009, E14); none
 * means the placeholder. The small cards show one photo, not the collage of the recipe page.
 */
export function useCoverImage(recipe: Recipe | undefined): number | { uri: string } | undefined {
  const collection = recipe?.kind === 'collection' ? recipe : undefined;
  const contents = useCollectionContents(collection?.id);
  return useRecipeImage(collection ? coverPhotos(collection, contents)[0] : recipe);
}
