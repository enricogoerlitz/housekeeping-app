import { isTikTokUrl } from './recipe-draft';
import type { Recipe, RecipeVideo } from './types';

/** A recipe has at most this many videos (spec 0046, REQ-001; the database checks the same). */
export const MAX_VIDEOS = 10;

/**
 * The save button at a link (spec 0043, REQ-001; spec 0046, REQ-002): an https TikTok link (also
 * a short link) of a recipe whose video from that link is not saved yet, while there is room;
 * never for a collection, never for another site. The server checks the same again.
 */
export function offersVideo(recipe: Pick<Recipe, 'kind' | 'videos'>, url: string): boolean {
  return (
    recipe.kind === 'recipe' &&
    recipe.videos.length < MAX_VIDEOS &&
    !recipe.videos.some((video) => video.url === url) &&
    url.toLowerCase().startsWith('https://') &&
    isTikTokUrl(url)
  );
}

/** One page of the gallery at the recipe's photo (spec 0046, REQ-003). */
export type GalleryItem =
  | { kind: 'photo'; key: 'photo' }
  | { kind: 'video'; key: string; video: RecipeVideo; index: number };

/**
 * The pages of the gallery: the photo first (also its placeholder), then the videos in their
 * order (AC-009); without a photo it starts with the first video (AC-010); without videos it is
 * the photo alone, as before (AC-011).
 */
export function galleryItems(recipe: Pick<Recipe, 'videos'>, hasPhoto: boolean): GalleryItem[] {
  const videos = recipe.videos.map((video, index): GalleryItem => ({
    kind: 'video',
    key: video.path,
    video,
    index,
  }));
  if (hasPhoto || videos.length === 0) return [{ kind: 'photo', key: 'photo' }, ...videos];
  return videos;
}

/** "Video entfernen" (AC-017): the list without the video at `path`, the rest in order. */
export function withoutVideo(videos: readonly RecipeVideo[], path: string): RecipeVideo[] {
  return videos.filter((video) => video.path !== path);
}

/** The poster of the video at `path` (AC-012); a poster is never replaced. */
export function withVideoPoster(
  videos: readonly RecipeVideo[],
  path: string,
  poster: string,
): RecipeVideo[] {
  return videos.map((video) =>
    video.path === path && !video.poster ? { ...video, poster } : video,
  );
}

/** "Video" for the only one, else "Video 1", "Video 2" … (AC-016). */
export function videoLabel(index: number, count: number): string {
  return count === 1 ? 'Video' : `Video ${index + 1}`;
}
