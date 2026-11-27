import {
  useArticlesById,
  useCollectionContents,
  usePhoto,
  useRecipeImage,
} from '@housekeeping/api';
import {
  coverPhotos,
  defaultImagePrompt,
  galleryItems,
  mainIngredientNames,
  recipeImageContext,
  type Recipe,
} from '@housekeeping/core';
import {
  MediaGallery,
  Photo,
  PhotoCollage,
  PhotoViewer,
  Stack,
  ViewerPhoto,
  type PhotoProps,
} from '@housekeeping/ui';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { useOnlineOnly } from '@/features/shell/offline';
import { PhotoActionRow } from '@/features/shell/own-photo';
import { PhotoWindow } from '@/features/shell/photo-window';

import { RecipePhotoStatus, type RecipePhotoState } from './recipe-actions';
import { VideoPage, VideoTile } from './recipe-video';

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
 * starts with the first video; a video plays only on the whole screen (REQ-004). On the whole
 * screen photo and videos swipe like the gallery (spec 0056, REQ-003). `compact` (phones and
 * tablets): without photo and video only the row "Foto hinzufügen", no placeholder (REQ-005).
 */
export function RecipePhoto(props: {
  recipe: Recipe;
  photo: RecipePhotoState;
  style?: { flex: number };
  /** "Teilen" at the right end of the photo's row (spec 0042, REQ-004). */
  onShare?: () => void;
  /** The photo "Speichern" will set: a chosen AI suggestion (spec 0040, AC-010). */
  pending?: Blob;
  /** Without photo and video no placeholder frame (spec 0056, REQ-005). */
  compact?: boolean;
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
  // The own photo loads from the device after the recipe and its videos are known; its page
  // stands in front meanwhile, so the gallery never opens on a video that the photo then pushes
  // aside (spec 0046, AC-021; Safari keeps the snapped page in view).
  const ownPhoto = usePhoto(props.recipe.kind === 'recipe' ? props.recipe.photoPath : undefined);
  const items = galleryItems(props.recipe, sources.length > 0 || ownPhoto.loading);
  // The page the full-screen viewer shows; `play` when a video's tile opened it (AC-013).
  const [viewer, setViewer] = useState<{ index: number; play: boolean }>();
  const [shown, setShown] = useState(0);
  const openViewer = (index: number, play: boolean) => {
    setShown(index);
    setViewer({ index, play });
  };
  const cover = pendingUri ? (
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
  );
  // A placeholder only shows; a photo opens the viewer.
  const photo =
    sources.length === 0 ? (
      <View key="photo">{cover}</View>
    ) : (
      <Pressable
        key="photo"
        accessibilityRole="button"
        accessibilityLabel={`Foto von ${props.recipe.title} groß anzeigen`}
        onPress={() => openViewer(0, false)}
        testID="recipe-photo-zoom"
        style={(state) => ({ opacity: state.pressed ? 0.85 : 1 })}
      >
        {cover}
      </Pressable>
    );
  const bare = props.compact === true && sources.length === 0 && props.recipe.videos.length === 0;
  return (
    <Stack gap={4} style={props.style}>
      {bare ? null : (
        <MediaGallery aspectRatio={PHOTO_ASPECT} labels={GALLERY_LABELS} testID="recipe-gallery">
          {items.map((item, at) =>
            item.kind === 'photo' ? (
              photo
            ) : (
              <VideoTile
                key={item.key}
                recipe={props.recipe}
                video={item.video}
                index={item.index}
                aspectRatio={PHOTO_ASPECT}
                onPlay={() => openViewer(at, true)}
                testID={`recipe-video-${item.index}`}
              />
            ),
          )}
        </MediaGallery>
      )}
      {viewer ? (
        <PhotoViewer
          sources={sources}
          alt={props.recipe.title}
          closeLabel="Schließen"
          onClose={() => setViewer(undefined)}
          pages={{
            content: items.map((item, at) =>
              item.kind === 'photo' ? (
                <ViewerPhoto key="photo" sources={sources} alt={props.recipe.title} />
              ) : (
                <VideoPage
                  key={item.key}
                  recipe={props.recipe}
                  video={item.video}
                  index={item.index}
                  active={shown === at}
                  autoplay={viewer.play && viewer.index === at}
                  testID={`recipe-viewer-video-${item.index}`}
                />
              ),
            ),
            initialIndex: viewer.index,
            labels: GALLERY_LABELS,
            onIndexChange: setShown,
          }}
          testID="recipe-photo-viewer"
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
          aiContext={recipeImageContext(props.recipe, articlesById)}
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
