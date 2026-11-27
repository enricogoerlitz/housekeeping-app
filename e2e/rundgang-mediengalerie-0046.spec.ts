import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Page } from '@playwright/test';

import { accessToken, expect, open, rpc, test, tid, unique } from './helpers';
import { seedIds } from './seed-ids';

// Spec 0046 — findings from production (27.11.2026): after "Video speichern" the gallery stayed
// blank until the page was opened again (AC-020), and a recipe with an own photo and videos could
// open on a video (AC-021). TikTok is never asked: `fetch-video` is answered here, and the test
// adds the video itself with add_recipe_video, as the function does after its download. Each test
// works on its own new recipe, so the file needs no fresh seed.

const here = path.dirname(fileURLToPath(import.meta.url));
const PHOTO = path.join(here, 'fixtures/eislaufen-gps.jpg');
const HOUSEHOLD = seedIds['hh-demo'];
const SYNC = { timeout: 30_000 };
const TIKTOK = 'https://www.tiktok.com/@koch/video/7350000000000000001';

/** A new recipe with only a title; returns its id from the address of its page. */
async function newRecipe(page: Page, title: string): Promise<string> {
  await open(page, '/rezepte');
  await tid(page, 'recipe-new').click();
  await tid(page, 'new-recipe-title').fill(title);
  await tid(page, 'new-recipe-save').click();
  await expect(tid(page, 'recipe-title')).toHaveText(title);
  const id = /\/rezept\/([0-9a-f-]{36})/.exec(page.url())?.[1];
  if (!id) throw new Error(`no recipe id in ${page.url()}`);
  return id;
}

/** An own photo from the window "Foto". */
async function ownPhoto(page: Page): Promise<void> {
  await tid(page, 'recipe-photo-change').click();
  const chooser = page.waitForEvent('filechooser');
  await tid(page, 'recipe-photo-window-file').click();
  await (await chooser).setFiles(PHOTO);
  await expect(tid(page, 'recipe-photo-window-preview-new')).toBeVisible(SYNC);
  await tid(page, 'recipe-photo-window-apply').click();
  await expect(tid(page, 'recipe-photo').locator('img').first()).toHaveAttribute(
    'src',
    /^blob:/,
    SYNC,
  );
}

async function addLink(page: Page, url: string): Promise<void> {
  await tid(page, 'recipe-read-add-link').click();
  await tid(page, 'recipe-link-url').fill(url);
  await tid(page, 'recipe-link-sheet-apply').click();
  await expect(tid(page, 'recipe-link-sheet')).toBeHidden();
}

/** A stored video of the recipe, as fetch-video adds it (the file itself is not needed here). */
async function addVideo(recipeId: string, url?: string): Promise<string> {
  const videoPath = `${HOUSEHOLD}/recipes/${recipeId}/${randomUUID()}.mp4`;
  const added = await rpc<boolean>(await accessToken('enrico'), 'add_recipe_video', {
    p_household_id: HOUSEHOLD,
    p_recipe_id: recipeId,
    p_video: url ? { path: videoPath, url } : { path: videoPath },
  });
  expect(added).toBe(true);
  return videoPath;
}

test('spec 0046 AC-020: after "Video speichern" the photo and the video show at once', async ({
  page,
}) => {
  const recipeId = await newRecipe(page, `Galerie ${unique()}`);
  await ownPhoto(page);
  await addLink(page, TIKTOK);
  // Only the photo so far: no dots.
  await expect(tid(page, 'recipe-gallery-dots')).toHaveCount(0);

  await page.route('**/functions/v1/fetch-video', async (route) => {
    const videoPath = await addVideo(recipeId, TIKTOK);
    await route.fulfill({ json: { videoPath } });
  });
  await tid(page, 'recipe-link-video-0').click();
  await tid(page, 'recipe-video-save-confirm-confirm').click();
  await expect(tid(page, 'recipe-link-video-0')).toHaveCount(0, SYNC);

  // Without opening the recipe again: the photo fills its page, the dots show two.
  await tid(page, 'recipe-gallery').scrollIntoViewIfNeeded();
  await expect(tid(page, 'recipe-gallery-dots')).toBeVisible();
  await expect(tid(page, 'recipe-gallery-dot-0')).toHaveAttribute('data-active', 'true');
  const box = await tid(page, 'recipe-photo').boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(200);
  await expect(tid(page, 'recipe-photo')).toBeInViewport({ ratio: 0.9 });
  // Next to it the video's tile, the same width.
  const gallery = (await tid(page, 'recipe-gallery').boundingBox())?.width ?? 0;
  const tile = (await tid(page, 'recipe-video-0').boundingBox())?.width ?? 0;
  expect(Math.abs(tile - gallery)).toBeLessThan(2);
});

test('spec 0046 AC-021: a recipe with an own photo and videos always opens on the photo', async ({
  page,
}) => {
  const recipeId = await newRecipe(page, `Galerie ${unique()}`);
  await ownPhoto(page);
  await addVideo(recipeId);
  await addVideo(recipeId);

  // Opened anew (the own photo loads from the device after the videos are known).
  for (let round = 0; round < 3; round += 1) {
    await open(page, `/rezept/${recipeId}`);
    await expect(tid(page, 'recipe-gallery-dot-2')).toBeVisible(SYNC);
    await expect(tid(page, 'recipe-photo').locator('img').first()).toHaveAttribute(
      'src',
      /^blob:/,
      SYNC,
    );
    await expect(tid(page, 'recipe-gallery-dot-0')).toHaveAttribute('data-active', 'true');
    await expect(tid(page, 'recipe-photo')).toBeInViewport({ ratio: 0.9 });
  }
});
