// Spec 0043 "Rezeptvideo aus TikTok": "Video speichern" (fetch-video, then the pull brings
// video_path), loading the video to play it (online, never kept on the device), "Video entfernen",
// and the videos going with a deleted recipe or household, against the in-memory server.
import { describe, expect, it } from 'vitest';

import { H, withBackend } from './backend-test-helpers';
import { createHousehold, deleteHousehold, switchHousehold } from './commands-household';
import { deleteRecipe, discardRecipePhoto } from './commands-recipes';
import { mediaKey } from './media-cache';
import {
  loadRecipeVideo,
  removeRecipeVideo,
  saveRecipeVideo,
  VIDEO_LOAD_FAILED_MESSAGE,
  VIDEO_SAVE_FAILED_MESSAGE,
  VIDEO_TOO_LARGE_MESSAGE,
  VIDEO_UNAVAILABLE_MESSAGE,
} from './recipe-video';
import { ENRICO } from './seed/demo';
import { getData, OfflineError } from './store';
import { TransportError } from './transport';

const fx = withBackend();

const LINK = 'https://vm.tiktok.com/ZGdXoJ8Ay/';
const RECIPE = 'rec-lasagne';
const MP4 = new Uint8Array([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
const mp4 = () => new Blob([MP4], { type: 'video/mp4' });

/** Enrico's device, "Lasagne" with the TikTok link (as "Pasta Sorrentina" in the spec). */
async function withTikTokLink(householdId = H, recipeId = RECIPE) {
  const engine = await fx.startEnrico();
  await fx.server
    .transport(ENRICO)
    .applyChanges(householdId, [
      { kind: 'patch', table: 'recipes', id: recipeId, changes: { links: [{ url: LINK }] } },
    ]);
  await fx.settle(engine);
  fx.clearCalls();
  return engine;
}

const videoPathOf = (recipeId = RECIPE) =>
  getData().recipes.find((recipe) => recipe.id === recipeId)?.videoPath;

describe('Video speichern (REQ-001)', () => {
  it('AC-001: the server stores the video; after the pull the recipe has it', async () => {
    await withTikTokLink();
    fx.server.setVideoAddress(LINK, mp4());
    await saveRecipeVideo(RECIPE, LINK);
    expect(fx.calls[0]).toEqual({
      fn: 'fetchVideo',
      args: [{ householdId: H, recipeId: RECIPE, url: LINK }],
    });
    const path = videoPathOf();
    expect(path).toMatch(new RegExp(`^${H}/recipes/${RECIPE}/[0-9a-f-]{36}\\.mp4$`));
    expect(fx.server.video(path ?? '')).toBeDefined();
  });

  it('AC-002: TikTok gives no video: the friendly hint, nothing is stored, the link stays', async () => {
    await withTikTokLink();
    fx.server.setVideoAddress(LINK, 'video_unavailable');
    await expect(saveRecipeVideo(RECIPE, LINK)).rejects.toThrow(VIDEO_UNAVAILABLE_MESSAGE);
    expect(VIDEO_UNAVAILABLE_MESSAGE).toBe(
      'Das Video konnte nicht geladen werden. Der Link bleibt erhalten.',
    );
    expect(videoPathOf()).toBeUndefined();
    expect(getData().recipes.find((recipe) => recipe.id === RECIPE)?.links).toEqual([
      { url: LINK },
    ]);
  });

  it('AC-003: over 50 MB: "Das Video ist zu groß (über 50 MB)", nothing is stored', async () => {
    await withTikTokLink();
    fx.server.setVideoAddress(LINK, 'video_too_large');
    await expect(saveRecipeVideo(RECIPE, LINK)).rejects.toThrow(VIDEO_TOO_LARGE_MESSAGE);
    expect(VIDEO_TOO_LARGE_MESSAGE).toBe('Das Video ist zu groß (über 50 MB)');
    expect(videoPathOf()).toBeUndefined();
  });

  it('AC-004: a link the server refuses is the same friendly hint', async () => {
    await withTikTokLink();
    await expect(saveRecipeVideo(RECIPE, 'https://www.chefkoch.de/x')).rejects.toThrow(
      VIDEO_UNAVAILABLE_MESSAGE,
    );
  });

  it('AC-006: offline nothing is sent', async () => {
    const engine = await withTikTokLink();
    engine.setSimulatedOffline(true);
    await expect(saveRecipeVideo(RECIPE, LINK)).rejects.toBeInstanceOf(OfflineError);
    expect(fx.calls).toEqual([]);
  });

  it('a network failure or timeout asks to try again', async () => {
    await withTikTokLink();
    fx.server.setVideoAddress(LINK, mp4());
    fx.server.failNext('fetch-video', new TransportError('transient', 'timeout', 0));
    await expect(saveRecipeVideo(RECIPE, LINK)).rejects.toThrow(VIDEO_SAVE_FAILED_MESSAGE);
  });

  it('a video stored meanwhile (another device, or a late answer) is no error', async () => {
    await withTikTokLink();
    fx.server.setVideoAddress(LINK, mp4());
    await saveRecipeVideo(RECIPE, LINK);
    await expect(saveRecipeVideo(RECIPE, LINK)).resolves.toBeUndefined();
  });
});

describe('Video abspielen (REQ-002)', () => {
  it('AC-007: the video comes from the server as an MP4 blob, never from the device', async () => {
    await withTikTokLink();
    fx.server.setVideoAddress(LINK, mp4());
    await saveRecipeVideo(RECIPE, LINK);
    const path = videoPathOf() ?? '';
    const video = await loadRecipeVideo(path);
    expect(video.type).toBe('video/mp4');
    expect(new Uint8Array(await video.arrayBuffer())).toEqual(MP4);
    expect(await fx.storage.get(mediaKey(path))).toBeUndefined();
  });

  it('AC-008: offline the video is not loaded', async () => {
    const engine = await withTikTokLink();
    fx.server.setVideoAddress(LINK, mp4());
    await saveRecipeVideo(RECIPE, LINK);
    engine.setSimulatedOffline(true);
    await expect(loadRecipeVideo(videoPathOf() ?? '')).rejects.toBeInstanceOf(OfflineError);
  });

  it('a missing file or bytes that are no MP4 say it could not be loaded', async () => {
    await withTikTokLink();
    await expect(loadRecipeVideo(`${H}/recipes/${RECIPE}/missing.mp4`)).rejects.toThrow(
      VIDEO_LOAD_FAILED_MESSAGE,
    );
    fx.server.setVideoAddress(LINK, new Blob(['<html>']));
    await saveRecipeVideo(RECIPE, LINK);
    await expect(loadRecipeVideo(videoPathOf() ?? '')).rejects.toThrow(VIDEO_LOAD_FAILED_MESSAGE);
  });
});

describe('Video entfernen (REQ-003)', () => {
  it('AC-009: the path is cleared, then the file is deleted; the link stays', async () => {
    await withTikTokLink();
    fx.server.setVideoAddress(LINK, mp4());
    await saveRecipeVideo(RECIPE, LINK);
    const path = videoPathOf() ?? '';
    fx.clearCalls();
    await removeRecipeVideo(RECIPE);
    expect(videoPathOf()).toBeUndefined();
    expect(fx.calls.map((call) => call.fn)).toEqual(['applyChanges', 'removeVideos']);
    expect(fx.calls[0]?.args[1]).toEqual([
      { kind: 'patch', table: 'recipes', id: RECIPE, changes: { video_path: null } },
    ]);
    expect(fx.server.video(path)).toBeUndefined();
    expect(getData().recipes.find((recipe) => recipe.id === RECIPE)?.links).toEqual([
      { url: LINK },
    ]);
  });

  it('AC-009: without a video nothing happens; offline it is refused', async () => {
    const engine = await withTikTokLink();
    await removeRecipeVideo(RECIPE);
    expect(fx.calls).toEqual([]);
    engine.setSimulatedOffline(true);
    await expect(removeRecipeVideo(RECIPE)).rejects.toBeInstanceOf(OfflineError);
  });

  it('REQ-003: a deleted recipe takes its video along once "Rückgängig" ran out', async () => {
    await withTikTokLink();
    fx.server.setVideoAddress(LINK, mp4());
    await saveRecipeVideo(RECIPE, LINK);
    const path = videoPathOf() ?? '';
    const deletion = deleteRecipe(RECIPE);
    if (!deletion) throw new Error('fixture');
    expect(deletion.videoPath).toBe(path);
    await fx.settle();
    await discardRecipePhoto(deletion);
    expect(fx.server.video(path)).toBeUndefined();
  });

  it('AC-010: deleting the household deletes its videos first', async () => {
    await fx.startEnrico();
    const wg = await createHousehold('WG Köln');
    const recipeId = crypto.randomUUID();
    await fx.server.transport(ENRICO).applyChanges(wg, [
      {
        kind: 'insert',
        table: 'recipes',
        row: { id: recipeId, kind: 'recipe', title: 'Pasta Sorrentina', links: [{ url: LINK }] },
      },
    ]);
    fx.server.setVideoAddress(LINK, mp4());
    const { videoPath } = await fx.server
      .transport(ENRICO)
      .fetchVideo({ householdId: wg, recipeId, url: LINK });
    switchHousehold(wg);
    fx.clearCalls();
    await deleteHousehold(wg);
    expect(fx.calls.map((call) => call.fn)).toEqual([
      'beginHouseholdDeletion',
      'removeVideos',
      'deleteHousehold',
    ]);
    expect(fx.calls[1]?.args[0]).toEqual([videoPath]);
    expect(fx.server.video(videoPath)).toBeUndefined();
  });
});
