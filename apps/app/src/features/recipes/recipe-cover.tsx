import { useArticlesById, useCollectionContents, useRecipeImage } from '@housekeeping/api';
import {
  coverPhotos,
  defaultImagePrompt,
  galleryItems,
  mainIngredientNames,
  type Recipe,
  type RecipeVideo,
} from '@housekeeping/core';
import { MediaGallery, Photo, PhotoCollage, Stack, type PhotoProps } from '@housekeeping/ui';
import { useEffect, useMemo, useState } from 'react';

import { useOnlineOnly } from '@/features/shell/offline';
import { PhotoActionRow, ZoomablePhoto } from '@/features/shell/own-photo';
import { PhotoWindow } from '@/features/shell/photo-window';

import { RecipePhotoStatus, type RecipePhotoState } from './recipe-actions';
import { VideoPlayer, VideoTile } from './recipe-video';

/** The frame of the page's photo; the videos' posters stand in the same one (spec 0046). */
const PHOTO_ASPECT = 4 / 3;

const GALLERY_LABELS = {
  previous: 'Vorheriges',
  next: 'Nächstes',
  position: (page: number, count: number) => `${page} von ${count}`,
};

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

/** A blob: URL for `blob` while it is shown. */
function useBlobUri(blob: Blob | undefined): string | undefined {
  const uri = useMemo(() => (blob ? URL.createObjectURL(blob) : undefined), [blob]);
  useEffect(
    () => () => {
      if (uri) URL.revokeObjectURL(uri);
    },
    [uri],
  );
  return uri;
}

/**
 * The photo of the page with its save state; a collection's cover is its collage (E14). A tap
 * shows it on the whole screen, "Foto ändern" right under it opens the window "Foto" (spec 0036,
 * REQ-008, REQ-009; spec 0039, REQ-001), which the ⋯ menu opens too; under a sample photo too.
 * The recipe's videos follow the photo in a gallery (spec 0046, REQ-003); without a photo it
 * starts with the first video; a video plays only on the whole screen (REQ-004).
 */
export function RecipePhoto(props: {
  recipe: Recipe;
  photo: RecipePhotoState;
  style?: { flex: number };
  /** "Teilen" at the right end of the photo's row (spec 0042, REQ-004). */
  onShare?: () => void;
  /** The photo "Speichern" will set: a chosen AI suggestion (spec 0040, AC-010). */
  pending?: Blob;
}) {
  const online = useOnlineOnly();
  const articlesById = useArticlesById();
  const image = useRecipeImage(props.recipe);
  const covers = useCoverSources(props.recipe);
  const pendingUri = useBlobUri(props.pending);
  const sources = pendingUri
    ? [{ uri: pendingUri }]
    : props.recipe.kind === 'collection'
      ? covers
      : image
        ? [image]
        : [];
  const [playing, setPlaying] = useState<RecipeVideo>();
  const photo = (
    <ZoomablePhoto key="photo" sources={sources} name={props.recipe.title} testID="recipe-photo">
      {pendingUri ? (
        <Photo
          source={{ uri: pendingUri }}
          aspectRatio={PHOTO_ASPECT}
          alt={props.recipe.title}
          testID="recipe-photo-pending"
        />
      ) : (
        <RecipeCover
          recipe={props.recipe}
          aspectRatio={PHOTO_ASPECT}
          alt={props.recipe.title}
          testID="recipe-photo"
        />
      )}
    </ZoomablePhoto>
  );
  return (
    <Stack gap={4} style={props.style}>
      <MediaGallery aspectRatio={PHOTO_ASPECT} labels={GALLERY_LABELS} testID="recipe-gallery">
        {galleryItems(props.recipe, sources.length > 0).map((item) =>
          item.kind === 'photo' ? (
            photo
          ) : (
            <VideoTile
              key={item.key}
              recipe={props.recipe}
              video={item.video}
              index={item.index}
              aspectRatio={PHOTO_ASPECT}
              onPlay={() => setPlaying(item.video)}
              testID={`recipe-video-${item.index}`}
            />
          ),
        )}
      </MediaGallery>
      {playing ? (
        <VideoPlayer
          video={playing}
          title={props.recipe.title}
          onClose={() => setPlaying(undefined)}
        />
      ) : null}
      <PhotoActionRow
        // A sample photo shows too: "Foto ändern"; only an own one can be removed (in the window).
        hasPhoto={sources.length > 0}
        disabled={online.disabled || props.photo.busy !== undefined}
        hint={online.hint}
        onChange={props.photo.change}
        onShare={props.onShare}
        testPrefix="recipe"
      />
      <RecipePhotoStatus photo={props.photo} />
      {props.photo.windowOpen ? (
        <PhotoWindow
          current={props.recipe.kind === 'collection' ? covers[0] : image}
          hasPhoto={!!props.recipe.photoPath}
          name={props.recipe.title}
          aiPrompt={defaultImagePrompt(
            props.recipe.title,
            props.recipe.kind === 'recipe' ? mainIngredientNames(props.recipe, articlesById) : [],
          )}
          placeholderIcon={props.recipe.kind === 'collection' ? 'layers' : 'chef-hat'}
          aspectRatio={PHOTO_ASPECT}
          onApply={props.photo.apply}
          onRemove={props.photo.removeConfirmed}
          onClose={props.photo.closeWindow}
          testPrefix="recipe"
        />
      ) : null}
    </Stack>
  );
}
