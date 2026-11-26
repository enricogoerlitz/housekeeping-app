// The recipe's video from TikTok (spec 0043). "Video speichern" asks the server (edge function
// fetch-video) to load the video into the household's private bucket household-videos and to set
// the recipe's video_path; the pull after it brings the path. Playing downloads the file with the
// session, online only, and never keeps it on the device (no media store, no HTTP cache).
// "Video entfernen" clears the path on the diff path, then deletes the file. Everything online
// only; the link of the recipe stays in every case.
import type { Id } from '@housekeeping/core';

import { deviceSession, householdCall, onlineCall } from './backend';
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

/**
 * AC-001: the server stores the video behind the recipe's TikTok link `url`; resolves once the
 * pull has brought it. AC-002/AC-004 VIDEO_UNAVAILABLE_MESSAGE, AC-003 VIDEO_TOO_LARGE_MESSAGE,
 * else VIDEO_SAVE_FAILED_MESSAGE; AC-006 OfflineError without network.
 */
export async function saveRecipeVideo(recipeId: Id, url: string): Promise<void> {
  if (isOffline()) throw new OfflineError();
  const householdId = getState().activeHouseholdId;
  try {
    await householdCall((transport) => transport.fetchVideo({ householdId, recipeId, url }));
  } catch (error) {
    if (!(error instanceof TransportError)) throw error;
    // Another device, or this one's answer that came too late: the video is there.
    if (error.code === 'video_exists') return;
    if (error.code === 'video_too_large') throw new Error(VIDEO_TOO_LARGE_MESSAGE);
    if (error.kind === 'permanent') throw new Error(VIDEO_UNAVAILABLE_MESSAGE);
    throw new Error(VIDEO_SAVE_FAILED_MESSAGE);
  }
}

/** An MP4 starts with a box whose type is `ftyp` (ISO/IEC 14496-12). */
async function isMp4(blob: Blob): Promise<boolean> {
  const head = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
  return head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70;
}

/**
 * AC-007: the stored video as an MP4 blob for a blob: URL, downloaded with the session (sign-out
 * cancels it); AC-008 OfflineError without network; VIDEO_LOAD_FAILED_MESSAGE otherwise.
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

/** AC-009 "Video entfernen": the path is cleared, then the file is deleted; the link stays. */
export async function removeRecipeVideo(recipeId: Id): Promise<void> {
  if (isOffline()) throw new OfflineError();
  const old = getData().recipes.find((recipe) => recipe.id === recipeId)?.videoPath;
  if (!old) return;
  await commitConfirmed({ path: 'diff' }, () =>
    updateData((data) => ({
      ...data,
      recipes: data.recipes.map((recipe) =>
        recipe.id === recipeId ? { ...recipe, videoPath: undefined } : recipe,
      ),
    })),
  );
  await removeVideoQuietly(old);
}
