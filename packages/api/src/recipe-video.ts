// The recipe's videos from TikTok (spec 0043, spec 0046). "Video speichern" at a link asks the
// server (edge function fetch-video) to load the video into the household's private bucket
// household-videos and to add it to the recipe's videos; the pull after it brings the list. Its
// poster is TikTok's cover, loaded by the server (fetch-image), prepared like every photo and
// stored in household-media. Playing downloads the file with the session, online only, and never
// keeps it on the device (no media store, no HTTP cache). "Video entfernen" takes one video out of
// the list on the server, then deletes its files. Everything online only; the links stay.
import {
  withoutVideo,
  withVideoPoster,
  type FetchVideoReply,
  type Id,
  type RecipeVideo,
} from '@housekeeping/core';

import { deviceSession, householdCall, onlineCall } from './backend';
import { loadPhotoFromAddress } from './photo-sources';
import { preparePhoto, removeQuietly, uploadPhoto } from './photos-remote';
import { commitConfirmed, getData, getState, isOffline, OfflineError, updateData } from './store';
import { TransportError } from './transport';

export const VIDEO_UNAVAILABLE_MESSAGE =
  'Das Video konnte nicht geladen werden. Der Link bleibt erhalten.';
export const VIDEO_TOO_LARGE_MESSAGE = 'Das Video ist zu groß (über 50 MB)';
export const VIDEO_SAVE_FAILED_MESSAGE =
  'Das Video ließ sich gerade nicht speichern – bitte noch einmal versuchen';
export const VIDEO_LOAD_FAILED_MESSAGE =
  'Das Video ließ sich gerade nicht laden – bitte noch einmal versuchen';

/** True for a stored video's name (household-videos); photos end in .jpg. */
export function isVideoPath(path: string): boolean {
  return path.endsWith('.mp4');
}

function patchVideos(recipeId: Id, change: (videos: RecipeVideo[]) => RecipeVideo[]): void {
  updateData((data) => ({
    ...data,
    recipes: data.recipes.map((recipe) =>
      recipe.id === recipeId ? { ...recipe, videos: change(recipe.videos) } : recipe,
    ),
  }));
}

/**
 * AC-006: the server stores the video behind the recipe's TikTok link `url`; resolves once the
 * pull has brought it, with the stored path and the cover's address for saveVideoPoster, or
 * undefined when that link's video was there already. AC-007 VIDEO_UNAVAILABLE_MESSAGE,
 * VIDEO_TOO_LARGE_MESSAGE, else VIDEO_SAVE_FAILED_MESSAGE; AC-008 OfflineError without network.
 */
export async function saveRecipeVideo(
  recipeId: Id,
  url: string,
): Promise<FetchVideoReply | undefined> {
  if (isOffline()) throw new OfflineError();
  const householdId = getState().activeHouseholdId;
  try {
    return await householdCall((transport) => transport.fetchVideo({ householdId, recipeId, url }));
  } catch (error) {
    if (!(error instanceof TransportError)) throw error;
    // Another device, or this one's answer that came too late: the video is there.
    if (error.code === 'video_exists') return undefined;
    if (error.code === 'video_too_large') throw new Error(VIDEO_TOO_LARGE_MESSAGE);
    if (error.kind === 'permanent') throw new Error(VIDEO_UNAVAILABLE_MESSAGE);
    throw new Error(VIDEO_SAVE_FAILED_MESSAGE);
  }
}

/**
 * AC-012: TikTok's cover at `coverUrl` becomes the poster of the video at `videoPath`: loaded by
 * the server, prepared like a photo (`prepare`, preparePhoto on the web), stored in the recipe's
 * photo folder and kept on the device, then named by set_recipe_video_poster. Never throws: without
 * a poster the gallery shows the recipe's photo; a file nobody names is deleted again.
 */
export async function saveVideoPoster(
  recipeId: Id,
  videoPath: string,
  coverUrl: string,
  prepare: (image: Blob) => Promise<Blob> = preparePhoto,
): Promise<void> {
  const householdId = getState().activeHouseholdId;
  let poster: string;
  try {
    const cover = await prepare(await loadPhotoFromAddress(coverUrl));
    poster = await uploadPhoto(householdId, 'recipes', recipeId, cover);
  } catch {
    return;
  }
  try {
    await commitConfirmed(
      {
        path: 'rpc',
        send: async (transport) => {
          if (!(await transport.setRecipeVideoPoster(householdId, recipeId, videoPath, poster)))
            throw new TransportError('permanent', 'video_not_found');
        },
      },
      () => patchVideos(recipeId, (videos) => withVideoPoster(videos, videoPath, poster)),
    );
  } catch {
    await removeQuietly(poster);
  }
}

/** An MP4 starts with a box whose type is `ftyp` (ISO/IEC 14496-12). */
async function isMp4(blob: Blob): Promise<boolean> {
  const head = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
  return head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70;
}

/**
 * AC-013: the stored video as an MP4 blob for a blob: URL, downloaded with the session (sign-out
 * cancels it); AC-015 OfflineError without network; VIDEO_LOAD_FAILED_MESSAGE otherwise.
 */
export async function loadRecipeVideo(path: string): Promise<Blob> {
  let video: Blob;
  try {
    video = await onlineCall((transport) => transport.downloadVideo(path, deviceSession()?.signal));
  } catch (error) {
    if (error instanceof OfflineError) throw error;
    throw new Error(VIDEO_LOAD_FAILED_MESSAGE);
  }
  // The bucket only checks the declared type: the bytes must be an MP4 too.
  if (!(await isMp4(video))) throw new Error(VIDEO_LOAD_FAILED_MESSAGE);
  return new Blob([video], { type: 'video/mp4' });
}

/** Deleting a file must not fail the action that made it unused; a leftover file is logged. */
export async function removeVideoQuietly(path: string): Promise<void> {
  try {
    await onlineCall((transport) => transport.removeVideos([path]));
  } catch (error) {
    // The nightly sweep (spec 0039) takes it.
    console.warn(
      `Removing a video failed: ${error instanceof TransportError ? error.code : 'unknown'}`,
    );
  }
}

/**
 * AC-017 "Video entfernen": the server takes the video at `path` out of the recipe's list, then
 * the files of what it took out are deleted; the other videos and the links stay. Nothing is
 * deleted when the server took nothing out (another device was faster, or the recipe is in its
 * "Rückgängig"), and a poster that the recipe's photo or another video still names stays.
 */
export async function removeRecipeVideo(recipeId: Id, path: string): Promise<void> {
  if (isOffline()) throw new OfflineError();
  const known = getData()
    .recipes.find((recipe) => recipe.id === recipeId)
    ?.videos.some((candidate) => candidate.path === path);
  if (!known) return;
  const householdId = getState().activeHouseholdId;
  const outcome: { removed: RecipeVideo | null } = { removed: null };
  await commitConfirmed(
    {
      path: 'rpc',
      send: async (transport) => {
        outcome.removed = await transport.removeRecipeVideo(householdId, recipeId, path);
        return outcome.removed;
      },
    },
    () => patchVideos(recipeId, (videos) => withoutVideo(videos, path)),
  );
  const taken = outcome.removed;
  if (!taken) return;
  await removeVideoQuietly(taken.path);
  const poster = taken.poster;
  if (!poster) return;
  const named = getData().recipes.some(
    (recipe) =>
      recipe.photoPath === poster || recipe.videos.some((video) => video.poster === poster),
  );
  if (!named) await removeQuietly(poster);
}
