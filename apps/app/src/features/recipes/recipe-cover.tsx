import { useCollectionContents, useRecipeImage } from '@housekeeping/api';
import { coverPhotos, type Recipe } from '@housekeeping/core';
import { Photo, PhotoCollage, Stack, type PhotoProps } from '@housekeeping/ui';
import { useMemo } from 'react';

import { useOnlineOnly } from '@/features/shell/offline';
import { PhotoActionRow, ZoomablePhoto } from '@/features/shell/own-photo';

import { RecipePhotoStatus, type RecipePhotoState } from './recipe-actions';

type ImageSource = number | { uri: string };

/**
 * The photos a recipe's or collection's cover shows (spec 0009, E14, core coverPhotos): its own
 * photo, else for a collection those of its first four contained recipes with one, in their
 * order; [] means the placeholder (also without a recipe). Always four image hooks, so the hook
 * order never changes.
 */
export function useCoverSources(recipe: Recipe | undefined): ImageSource[] {
  const contents = useCollectionContents(recipe?.kind === 'collection' ? recipe.id : undefined);
  const covers = recipe ? coverPhotos(recipe, contents) : [];
  const first = useRecipeImage(covers[0]);
  const second = useRecipeImage(covers[1]);
  const third = useRecipeImage(covers[2]);
  const fourth = useRecipeImage(covers[3]);
  return useMemo(
    () =>
      [first, second, third, fourth].filter(
        (source): source is ImageSource => source !== undefined,
      ),
    [first, second, third, fourth],
  );
}

/**
 * The cover of a recipe or a collection (E14): a recipe shows its photo or the sample photo; a
 * collection its own photo, the collage of its recipes' photos, or the stack placeholder.
 */
export function RecipeCover(props: { recipe: Recipe } & Omit<PhotoProps, 'source'>) {
  const { recipe, ...frame } = props;
  if (recipe.kind === 'collection') return <CollectionCover recipe={recipe} {...frame} />;
  return <PlainCover recipe={recipe} {...frame} />;
}

function PlainCover(props: { recipe: Recipe } & Omit<PhotoProps, 'source'>) {
  const { recipe, ...frame } = props;
  const image = useRecipeImage(recipe);
  return <Photo {...frame} source={image} />;
}

function CollectionCover(props: { recipe: Recipe } & Omit<PhotoProps, 'source'>) {
  const { recipe, ...frame } = props;
  const sources = useCoverSources(recipe);
  return <PhotoCollage {...frame} sources={sources} />;
}

/**
 * The photo of the page with its save state; a collection's cover is its collage (E14). A tap
 * shows it on the whole screen, "Foto ändern" and "Foto entfernen" stand right under it (spec
 * 0036, REQ-008, REQ-009).
 */
export function RecipePhoto(props: {
  recipe: Recipe;
  photo: RecipePhotoState;
  style?: { flex: number };
}) {
  const online = useOnlineOnly();
  const image = useRecipeImage(props.recipe);
  const covers = useCoverSources(props.recipe);
  const sources = props.recipe.kind === 'collection' ? covers : image ? [image] : [];
  return (
    <Stack gap={4} style={props.style}>
      <ZoomablePhoto sources={sources} name={props.recipe.title} testID="recipe-photo">
        <RecipeCover
          recipe={props.recipe}
          aspectRatio={4 / 3}
          alt={props.recipe.title}
          testID="recipe-photo"
        />
      </ZoomablePhoto>
      <PhotoActionRow
        hasPhoto={!!props.recipe.photoPath}
        disabled={online.disabled || props.photo.busy !== undefined}
        hint={online.hint}
        onChange={props.photo.change}
        onRemove={props.photo.remove}
        testPrefix="recipe"
      />
      <RecipePhotoStatus photo={props.photo} />
    </Stack>
  );
}
