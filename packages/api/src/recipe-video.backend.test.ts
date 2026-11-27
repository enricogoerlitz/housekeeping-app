// Spec 0043 "Rezeptvideo aus TikTok" and spec 0046 "Rezept-Mediengalerie": saving the video of a
// link (fetch-video, then the pull brings recipes.videos), its poster from TikTok's cover
// (fetch-image, stored like a photo), loading a video to play it (online, never kept on the
// device), removing one video, and the videos going with a deleted recipe or household, against
// the in-memory server.
import type { RecipeVideo } from '@housekeeping/core';
import { describe, expect, it } from 'vitest';

import { H, withBackend } from './backend-test-helpers';
import { createHousehold, deleteHousehold, switchHousehold } from './commands-household';
import { deleteRecipe, discardRecipePhoto } from './commands-recipes';
import { mediaKey } from './media-cache';
import {
  loadRecipeVideo,
  removeRecipeVideo,
  saveRecipeVideo,
  saveVideoPoster,
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
const SECOND = 'https://www.tiktok.com/@koch/video/1';
const COVER = 'https://p16-common-sign.tiktokcdn-eu.com/cover~tplv-tiktokx-origin.image?x=1';
const RECIPE = 'rec-lasagne';
const MP4 = new Uint8Array([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const mp4 = () => new Blob([MP4], { type: 'video/mp4' });
const jpeg = () => new Blob([JPEG], { type: 'image/jpeg' });
/** preparePhoto needs a canvas; the tests hand the cover through as the prepared JPEG. */
const prepare = (image: Blob) => Promise.resolve(new Blob([image], { type: 'image/jpeg' }));

/** Enrico's device, "Lasagne" with two TikTok links (as "Pasta Sorrentina" in the spec). */
async function withTikTokLinks(householdId = H, recipeId = RECIPE) {
  const engine = await fx.startEnrico();
  await fx.server.transport(ENRICO).applyChanges(householdId, [
    {
      kind: 'patch',
      table: 'recipes',
      id: recipeId,
      changes: { links: [{ url: LINK }, { url: SECOND }] },
    },
  ]);
  await fx.settle(engine);
  fx.clearCalls();
  return engine;
}

const videosOf = (recipeId = RECIPE): RecipeVideo[] =>
  getData().recipes.find((recipe) => recipe.id === recipeId)?.videos ?? [];

describe('Video speichern (0043 REQ-001, 0046 REQ-002)', () => {
  it('AC-006: the server stores the video of the link; after the pull the recipe has it', async () => {
    await withTikTokLinks();
    fx.server.setVideoAddress(LINK, mp4(), COVER);
    const saved = await saveRecipeVideo(RECIPE, LINK);
    expect(fx.calls[0]).toEqual({
      fn: 'fetchVideo',
      args: [{ householdId: H, recipeId: RECIPE, url: LINK }],
    });
    const [video] = videosOf();
    expect(video?.path).toMatch(new RegExp(`^${H}/recipes/${RECIPE}/[0-9a-f-]{36}\\.mp4$`));
    expect(video?.url).toBe(LINK);
    expect(saved).toEqual({ videoPath: video?.path, coverUrl: COVER });
    expect(fx.server.video(video?.path ?? '')).toBeDefined();
  });

  it('AC-002: the video of a second link stands after the first', async () => {
    await withTikTokLinks();
    fx.server.setVideoAddress(LINK, mp4());
    fx.server.setVideoAddress(SECOND, mp4());
    await saveRecipeVideo(RECIPE, LINK);
    await saveRecipeVideo(RECIPE, SECOND);
    expect(videosOf().map((video) => video.url)).toEqual([LINK, SECOND]);
  });

  it('AC-007: TikTok gives no video: the friendly hint, nothing is stored, the link stays', async () => {
    await withTikTokLinks();
    fx.server.setVideoAddress(LINK, 'video_unavailable');
    await expect(saveRecipeVideo(RECIPE, LINK)).rejects.toThrow(VIDEO_UNAVAILABLE_MESSAGE);
    expect(VIDEO_UNAVAILABLE_MESSAGE).toBe(
      'Das Video konnte nicht geladen werden. Der Link bleibt erhalten.',
    );
    expect(videosOf()).toEqual([]);
    expect(getData().recipes.find((recipe) => recipe.id === RECIPE)?.links).toEqual([
      { url: LINK },
      { url: SECOND },
    ]);
  });

  it('AC-003 (0043): over 50 MB: "Das Video ist zu groß (über 50 MB)", nothing is stored', async () => {
    await withTikTokLinks();
    fx.server.setVideoAddress(LINK, 'video_too_large');
    await expect(saveRecipeVideo(RECIPE, LINK)).rejects.toThrow(VIDEO_TOO_LARGE_MESSAGE);
    expect(VIDEO_TOO_LARGE_MESSAGE).toBe('Das Video ist zu groß (über 50 MB)');
    expect(videosOf()).toEqual([]);
  });

  it('AC-004 (0043): a link the server refuses is the same friendly hint', async () => {
    await withTikTokLinks();
    await expect(saveRecipeVideo(RECIPE, 'https://www.chefkoch.de/x')).rejects.toThrow(
      VIDEO_UNAVAILABLE_MESSAGE,
    );
  });

  it('AC-008: offline nothing is sent', async () => {
    const engine = await withTikTokLinks();
    engine.setSimulatedOffline(true);
    await expect(saveRecipeVideo(RECIPE, LINK)).rejects.toBeInstanceOf(OfflineError);
    expect(fx.calls).toEqual([]);
  });

  it('a network failure or timeout asks to try again', async () => {
    await withTikTokLinks();
    fx.server.setVideoAddress(LINK, mp4());
    fx.server.failNext('fetch-video', new TransportError('transient', 'timeout', 0));
    await expect(saveRecipeVideo(RECIPE, LINK)).rejects.toThrow(VIDEO_SAVE_FAILED_MESSAGE);
  });

  it('the video of that link stored meanwhile (another device, a late answer) is no error', async () => {
    await withTikTokLinks();
    fx.server.setVideoAddress(LINK, mp4());
    await saveRecipeVideo(RECIPE, LINK);
    await expect(saveRecipeVideo(RECIPE, LINK)).resolves.toBeUndefined();
    expect(videosOf()).toHaveLength(1);
  });
});

describe('Vorschaubild (0046, AC-012)', () => {
  it('AC-012: the cover becomes the poster, stored like a photo and kept on the device', async () => {
    await withTikTokLinks();
    fx.server.setVideoAddress(LINK, mp4(), COVER);
    fx.server.setImageAddress(COVER, jpeg());
    const saved = await saveRecipeVideo(RECIPE, LINK);
    if (!saved?.coverUrl) throw new Error('fixture');
    fx.clearCalls();
    await saveVideoPoster(RECIPE, saved.videoPath, saved.coverUrl, prepare);
    expect(fx.calls.map((call) => call.fn)).toEqual([
      'fetchImage',
      'uploadMedia',
      'setRecipeVideoPoster',
    ]);
    const poster = videosOf()[0]?.poster ?? '';
    expect(poster).toMatch(new RegExp(`^${H}/recipes/${RECIPE}/[0-9a-f-]{36}\\.jpg$`));
    expect(fx.server.media(poster)).toBeDefined();
    expect(await fx.storage.get(mediaKey(poster))).toBeDefined();
  });

  it('AC-012: without the cover the video stays without a poster, nothing is left behind', async () => {
    await withTikTokLinks();
    fx.server.setVideoAddress(LINK, mp4(), COVER);
    const saved = await saveRecipeVideo(RECIPE, LINK);
    if (!saved?.coverUrl) throw new Error('fixture');
    await expect(
      saveVideoPoster(RECIPE, saved.videoPath, saved.coverUrl, prepare),
    ).resolves.toBeUndefined();
    expect(videosOf()[0]?.poster).toBeUndefined();
  });

  it('AC-012: a refused poster (the video went meanwhile) deletes the uploaded file again', async () => {
    await withTikTokLinks();
    fx.server.setVideoAddress(LINK, mp4(), COVER);
    fx.server.setImageAddress(COVER, jpeg());
    const saved = await saveRecipeVideo(RECIPE, LINK);
    if (!saved?.coverUrl) throw new Error('fixture');
    await removeRecipeVideo(RECIPE, saved.videoPath);
    fx.clearCalls();
    await saveVideoPoster(RECIPE, saved.videoPath, saved.coverUrl, prepare);
    const uploaded = fx.calls.find((call) => call.fn === 'uploadMedia')?.args[0];
    expect(typeof uploaded).toBe('string');
    expect(fx.server.media(String(uploaded))).toBeUndefined();
    expect(fx.calls.map((call) => call.fn)).toContain('removeMedia');
  });
});

describe('Video abspielen (0046 REQ-004)', () => {
  it('AC-013: the video comes from the server as an MP4 blob, never from the device', async () => {
    await withTikTokLinks();
    fx.server.setVideoAddress(LINK, mp4());
    await saveRecipeVideo(RECIPE, LINK);
    const path = videosOf()[0]?.path ?? '';
    const video = await loadRecipeVideo(path);
    expect(video.type).toBe('video/mp4');
    expect(new Uint8Array(await video.arrayBuffer())).toEqual(MP4);
    expect(await fx.storage.get(mediaKey(path))).toBeUndefined();
  });

  it('AC-015: offline the video is not loaded', async () => {
    const engine = await withTikTokLinks();
    fx.server.setVideoAddress(LINK, mp4());
    await saveRecipeVideo(RECIPE, LINK);
    engine.setSimulatedOffline(true);
    await expect(loadRecipeVideo(videosOf()[0]?.path ?? '')).rejects.toBeInstanceOf(OfflineError);
  });

  it('a missing file or bytes that are no MP4 say it could not be loaded', async () => {
    await withTikTokLinks();
    await expect(loadRecipeVideo(`${H}/recipes/${RECIPE}/missing.mp4`)).rejects.toThrow(
      VIDEO_LOAD_FAILED_MESSAGE,
    );
    fx.server.setVideoAddress(LINK, new Blob(['<html>']));
    await saveRecipeVideo(RECIPE, LINK);
    await expect(loadRecipeVideo(videosOf()[0]?.path ?? '')).rejects.toThrow(
      VIDEO_LOAD_FAILED_MESSAGE,
    );
  });
});

describe('Video entfernen (0046 REQ-005)', () => {
  async function twoVideos() {
    await withTikTokLinks();
    fx.server.setVideoAddress(LINK, mp4(), COVER);
    fx.server.setVideoAddress(SECOND, mp4());
    fx.server.setImageAddress(COVER, jpeg());
    const saved = await saveRecipeVideo(RECIPE, LINK);
    if (!saved?.coverUrl) throw new Error('fixture');
    await saveVideoPoster(RECIPE, saved.videoPath, saved.coverUrl, prepare);
    await saveRecipeVideo(RECIPE, SECOND);
    const [first, second] = videosOf();
    if (!first?.poster || !second) throw new Error('fixture');
    fx.clearCalls();
    return { first: { ...first, poster: first.poster }, second };
  }

  it('AC-017: one video goes with its files; the other and the links stay', async () => {
    const { first, second } = await twoVideos();
    await removeRecipeVideo(RECIPE, first.path);
    expect(videosOf()).toEqual([second]);
    expect(fx.calls.map((call) => call.fn)).toEqual([
      'removeRecipeVideo',
      'removeVideos',
      'removeMedia',
    ]);
    expect(fx.calls[0]?.args).toEqual([H, RECIPE, first.path]);
    expect(fx.server.video(first.path)).toBeUndefined();
    expect(fx.server.media(first.poster)).toBeUndefined();
    expect(await fx.storage.get(mediaKey(first.poster))).toBeUndefined();
    expect(fx.server.video(second.path)).toBeDefined();
    expect(getData().recipes.find((recipe) => recipe.id === RECIPE)?.links).toHaveLength(2);
  });

  it('Risiken: only what the server took out is deleted; a stale device deletes no file', async () => {
    const { first } = await twoVideos();
    // Another device removed it meanwhile (and "Rückgängig" of a deletion could bring it back).
    await fx.server.transport(ENRICO).removeRecipeVideo(H, RECIPE, first.path);
    fx.server.setVideoAddress(LINK, mp4());
    fx.clearCalls();
    await removeRecipeVideo(RECIPE, first.path);
    expect(fx.calls.map((call) => call.fn)).toEqual(['removeRecipeVideo']);
    expect(fx.server.video(first.path)).toBeDefined();
    expect(fx.server.media(first.poster)).toBeDefined();
  });

  it('Risiken: a poster that is also the recipe photo stays when its video goes', async () => {
    const { first } = await twoVideos();
    await fx.server
      .transport(ENRICO)
      .applyChanges(H, [
        { kind: 'patch', table: 'recipes', id: RECIPE, changes: { photo_path: first.poster } },
      ]);
    await fx.settle();
    fx.clearCalls();
    await removeRecipeVideo(RECIPE, first.path);
    expect(fx.calls.map((call) => call.fn)).toEqual(['removeRecipeVideo', 'removeVideos']);
    expect(fx.server.media(first.poster)).toBeDefined();
  });

  it('AC-017: a video that is gone already changes nothing; offline it is refused', async () => {
    const engine = await withTikTokLinks();
    await removeRecipeVideo(RECIPE, `${H}/recipes/${RECIPE}/missing.mp4`);
    expect(fx.calls).toEqual([]);
    engine.setSimulatedOffline(true);
    await expect(removeRecipeVideo(RECIPE, 'x')).rejects.toBeInstanceOf(OfflineError);
  });

  it('AC-018: a deleted recipe takes all its videos and posters once "Rückgängig" ran out', async () => {
    const { first, second } = await twoVideos();
    const deletion = deleteRecipe(RECIPE);
    if (!deletion) throw new Error('fixture');
    expect(deletion.videos).toEqual([first, second]);
    await fx.settle();
    await discardRecipePhoto(deletion);
    expect(fx.server.video(first.path)).toBeUndefined();
    expect(fx.server.video(second.path)).toBeUndefined();
    expect(fx.server.media(first.poster)).toBeUndefined();
  });

  it('AC-010 (0043): deleting the household deletes its videos first', async () => {
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
      // Spec 0066, REQ-010: the KI-Agent chats (none here) before the household.
      'agentDelete',
      'deleteHousehold',
    ]);
    expect(fx.calls[1]?.args[0]).toEqual([videoPath]);
    expect(fx.server.video(videoPath)).toBeUndefined();
  });
});

describe('the server functions (0046, AC-003, AC-004)', () => {
  it('AC-003: a member of another household cannot change the videos', async () => {
    await withTikTokLinks();
    fx.server.setVideoAddress(LINK, mp4());
    await saveRecipeVideo(RECIPE, LINK);
    const path = videosOf()[0]?.path ?? '';
    fx.server.addProfile({ id: 'ben', name: 'Ben', email: 'ben@example.com' });
    fx.server.addHousehold({ id: 'hh-wg', name: 'WG' }, ['ben']);
    const foreign = fx.server.transport('ben');
    await expect(foreign.removeRecipeVideo(H, RECIPE, path)).rejects.toMatchObject({
      code: 'not_member',
    });
    await expect(
      foreign.setRecipeVideoPoster(H, RECIPE, path, `${H}/recipes/${RECIPE}/x.jpg`),
    ).rejects.toMatchObject({ code: 'not_member' });
    expect(fx.server.row(H, 'recipes', RECIPE)?.videos).toHaveLength(1);
  });

  it('AC-004: a poster outside the recipe folder is refused', async () => {
    await withTikTokLinks();
    fx.server.setVideoAddress(LINK, mp4());
    await saveRecipeVideo(RECIPE, LINK);
    const path = videosOf()[0]?.path ?? '';
    await expect(
      fx.server
        .transport(ENRICO)
        .setRecipeVideoPoster(
          H,
          RECIPE,
          path,
          `other/recipes/${RECIPE}/${crypto.randomUUID()}.jpg`,
        ),
    ).rejects.toMatchObject({ code: '23514' });
  });
});
