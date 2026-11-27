import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Route } from '@playwright/test';

import type { RecipeDraft, RecipeDraftReply } from '@housekeeping/core';

import { expect, open, test, tid, unique } from './helpers';

// Spec 0064 — "Rezepte aus YouTube-Videos": a YouTube link in "KI-Rezept" becomes a draft whose
// link is the normalized watch address and whose photo, with "Foto generieren" off, is the
// video's thumbnail („Original“). ai-recipe-draft and fetch-image are replaced with `page.route`
// (no paid call, no request to YouTube); what they get is checked from the request body.

const here = path.dirname(fileURLToPath(import.meta.url));
const THUMBNAIL_PHOTO = path.join(here, 'fixtures/eislaufen-gps.jpg');

const ID = 'gkgJAPBrwT8';
const YOUTU_BE = `https://youtu.be/${ID}?si=x`;
const WATCH = `https://www.youtube.com/watch?v=${ID}`;
const THUMB = `https://i.ytimg.com/vi/${ID}/maxresdefault.jpg`;

function draft(title: string): RecipeDraft {
  return {
    title,
    description: 'Die echte Lasagne aus Bologna mit Ragù und Béchamel.',
    servings: 4,
    course: 'main',
    tags: [],
    variants: [],
    ingredients: [{ name: 'Lasagneplatten', amount: '250 g' }],
    steps: [{ text: 'Ragù zwei Stunden köcheln lassen', timerMinutes: 120 }],
  };
}

test.describe('REQ-004: link and photo of a YouTube video', () => {
  test('AC-009, AC-010: a youtu.be link gives the watch address as the link and the thumbnail as the photo', async ({
    page,
  }) => {
    const title = `Lasagne Bolognese ${unique()}`;
    const bodies: { links: string[]; imagePrompt: boolean }[] = [];
    await page.route('**/functions/v1/ai-recipe-draft', async (route: Route) => {
      bodies.push(route.request().postDataJSON() as { links: string[]; imagePrompt: boolean });
      const reply: RecipeDraftReply = {
        draft: draft(title),
        sources: [
          { url: YOUTU_BE, kind: 'youtube', read: true, resolvedUrl: WATCH, coverUrl: THUMB },
        ],
      };
      await route.fulfill({ json: reply });
    });
    const asked: string[] = [];
    const photo = await readFile(THUMBNAIL_PHOTO);
    await page.route('**/functions/v1/fetch-image', async (route: Route) => {
      asked.push((route.request().postDataJSON() as { url: string }).url);
      await route.fulfill({ contentType: 'application/octet-stream', body: photo });
    });
    await page.route('**/functions/v1/ai-image*', (route) =>
      route.fulfill({ status: 503, json: { error: 'ai_unavailable' } }),
    );

    await open(page, '/rezepte');
    await tid(page, 'recipe-new').click();
    await expect(tid(page, 'new-recipe-sheet')).toBeVisible();
    await tid(page, 'new-recipe-ai-tab-prompt').click();
    await tid(page, 'new-recipe-ai-text').fill(YOUTU_BE);
    await tid(page, 'new-recipe-ai-generate-photo').click();
    await expect(tid(page, 'new-recipe-ai-generate-photo').locator('input')).not.toBeChecked();
    await tid(page, 'new-recipe-ai-submit').click();

    await expect(tid(page, 'recipe-edit-save')).toBeVisible();
    expect(bodies[0]?.links).toEqual([YOUTU_BE]);
    expect(bodies[0]?.imagePrompt).toBe(false);
    // AC-010: the thumbnail is loaded through fetch-image and becomes the draft's photo.
    await expect(tid(page, 'recipe-photo-pending')).toBeVisible();
    expect(asked).toEqual([THUMB]);
    await expect(tid(page, 'recipe-link-0')).toContainText('YouTube');

    // AC-009: "Speichern" stores the watch address, not the short link.
    const saved = page.waitForRequest(
      (request) =>
        request.url().includes('/rest/v1/') && (request.postData() ?? '').includes(WATCH),
    );
    await tid(page, 'recipe-edit-save').click();
    expect((await saved).postData()).not.toContain('youtu.be');
    await expect(tid(page, 'recipe-title')).toHaveText(title);
    await expect(tid(page, 'recipe-link-0')).toContainText('YouTube');
    await expect(tid(page, 'recipe-link-0')).toContainText('youtube.com');
  });
});
