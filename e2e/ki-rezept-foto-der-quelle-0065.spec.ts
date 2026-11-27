import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Page, Route } from '@playwright/test';

import type { RecipeDraft, RecipeDraftReply } from '@housekeeping/core';

import { expect, open, test, tid, unique } from './helpers';

// Spec 0065 — "KI-Rezept: Foto der Quelle aus der Websuche": with "Websuche" on, "KI-Rezept" and
// "Mit KI ändern" offer „Original · KI-Bild · Keins“ instead of "Foto generieren". The edge
// functions are replaced with `page.route` (no paid call, no web search): ai-recipe-draft answers
// with a `webPhotoUrl`, fetch-image with a fixture, ai-image only counts.

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PHOTO = path.join(here, 'fixtures/eislaufen-gps.jpg');
const WEB_PHOTO = 'https://img.chefkoch-cdn.de/rezepte/chili/bild.jpg';

type DraftBody = { text: string; imagePrompt: boolean; webQuery?: string };

function draft(title: string): RecipeDraft {
  return {
    title,
    description: 'Würziges Chili mit Bohnen.',
    servings: 4,
    course: 'main',
    tags: [],
    variants: [],
    ingredients: [{ name: 'Kidneybohnen', amount: '2 Dosen' }],
    steps: [{ text: 'Alles 30 Minuten köcheln lassen', timerMinutes: 30 }],
    imagePrompt: 'a bowl of chili',
  };
}

/** The stubs: what ai-recipe-draft, fetch-image and ai-image were asked. */
async function stubs(page: Page, reply: (body: DraftBody) => RecipeDraftReply) {
  const bodies: DraftBody[] = [];
  const loaded: string[] = [];
  const images: string[] = [];
  await page.route('**/functions/v1/ai-recipe-draft', async (route: Route) => {
    const body = route.request().postDataJSON() as DraftBody;
    bodies.push(body);
    await route.fulfill({ json: reply(body) });
  });
  const photo = await readFile(FIXTURE_PHOTO);
  await page.route('**/functions/v1/fetch-image', async (route: Route) => {
    loaded.push((route.request().postDataJSON() as { url: string }).url);
    await route.fulfill({ contentType: 'application/octet-stream', body: photo });
  });
  await page.route('**/functions/v1/ai-image*', async (route: Route) => {
    images.push(route.request().url());
    await route.fulfill({ status: 503, json: { error: 'ai_unavailable' } });
  });
  return { bodies, loaded, images };
}

/** "Neu", tab "KI-Rezept", a wish and "Websuche" on. */
async function aiRecipeWithWebSearch(page: Page, wish: string): Promise<void> {
  await open(page, '/rezepte');
  await tid(page, 'recipe-new').click();
  await expect(tid(page, 'new-recipe-sheet')).toBeVisible();
  await tid(page, 'new-recipe-ai-tab-prompt').click();
  await tid(page, 'new-recipe-ai-text').fill(wish);
  await tid(page, 'new-recipe-ai-web-search').click();
  await expect(tid(page, 'new-recipe-ai-web-search')).toBeChecked();
}

test.describe('REQ-002, REQ-003: the photo choice of "KI-Rezept" with "Websuche"', () => {
  test('AC-004, AC-006, AC-009: "Original" replaces "Foto generieren" and takes the photo the web search found', async ({
    page,
  }) => {
    const title = `Chili sin Carne ${unique()}`;
    const { bodies, loaded, images } = await stubs(page, () => ({
      draft: draft(title),
      sources: [],
      webContext: 'used',
      webPhotoUrl: WEB_PHOTO,
    }));
    await open(page, '/rezepte');
    await tid(page, 'recipe-new').click();
    await tid(page, 'new-recipe-ai-tab-prompt').click();
    await expect(tid(page, 'new-recipe-ai-generate-photo')).toBeVisible();
    await expect(tid(page, 'new-recipe-ai-web-photo')).toHaveCount(0);
    await tid(page, 'new-recipe-ai-text').fill('Chili sin Carne mit Schokolade');
    await tid(page, 'new-recipe-ai-web-search').click();

    // AC-004: one photo control, „Original“ first.
    await expect(tid(page, 'new-recipe-ai-generate-photo')).toHaveCount(0);
    await expect(tid(page, 'new-recipe-ai-web-photo-source')).toBeChecked();
    await expect(tid(page, 'new-recipe-ai-web-photo-note')).toContainText('Treffer der Websuche');
    // Off again, the switch is back.
    await tid(page, 'new-recipe-ai-web-search').click();
    await expect(tid(page, 'new-recipe-ai-generate-photo')).toBeVisible();
    await expect(tid(page, 'new-recipe-ai-web-photo')).toHaveCount(0);
    await tid(page, 'new-recipe-ai-web-search').click();

    await tid(page, 'new-recipe-ai-submit').click();
    await expect(tid(page, 'recipe-edit-save')).toBeVisible();
    // AC-009: the image prompt is asked for, the web search goes along.
    expect(bodies[0]?.imagePrompt).toBe(true);
    expect(bodies[0]?.webQuery).toContain('Chili sin Carne');
    // AC-006: the web search's photo becomes the draft's, no suggestions are made.
    await expect(tid(page, 'recipe-photo-pending')).toBeVisible();
    expect(loaded).toEqual([WEB_PHOTO]);
    expect(images).toEqual([]);
  });

  test('AC-007: "Original" without a photo of the web search makes three suggestions', async ({
    page,
  }) => {
    const title = `Chili ${unique()}`;
    const { loaded, images } = await stubs(page, () => ({
      draft: draft(title),
      sources: [],
      webContext: 'used',
    }));
    await aiRecipeWithWebSearch(page, 'Chili mit Bohnen');
    await tid(page, 'new-recipe-ai-submit').click();
    await expect(tid(page, 'recipe-edit-save')).toBeVisible();
    await expect.poll(() => images.length).toBeGreaterThan(0);
    expect(loaded).toEqual([]);
  });

  test('AC-008, AC-009: "Keins" asks for no image prompt and gives no photo', async ({ page }) => {
    const title = `Chili ${unique()}`;
    const { bodies, loaded, images } = await stubs(page, () => ({
      draft: draft(title),
      sources: [],
      webContext: 'used',
      webPhotoUrl: WEB_PHOTO,
    }));
    await aiRecipeWithWebSearch(page, 'Chili mit Bohnen');
    await tid(page, 'new-recipe-ai-web-photo-none').click();
    await expect(tid(page, 'new-recipe-ai-web-photo-note')).toHaveText(
      'Das Rezept bekommt kein Foto.',
    );
    await tid(page, 'new-recipe-ai-submit').click();
    await expect(tid(page, 'recipe-edit-save')).toBeVisible();
    expect(bodies[0]?.imagePrompt).toBe(false);
    await expect(tid(page, 'recipe-photo-pending')).toHaveCount(0);
    expect(loaded).toEqual([]);
    expect(images).toEqual([]);
  });
});

test.describe('REQ-002: "Mit KI ändern" with the chip "Web"', () => {
  test('AC-005: "Web" takes the place of "Bild"; a recipe with a photo starts with "Keins"', async ({
    page,
  }) => {
    const title = `Chili ${unique()}`;
    await stubs(page, () => ({
      draft: draft(title),
      sources: [],
      webContext: 'used',
      webPhotoUrl: WEB_PHOTO,
    }));
    await aiRecipeWithWebSearch(page, 'Chili mit Bohnen');
    await tid(page, 'new-recipe-ai-submit').click();
    await tid(page, 'recipe-edit-save').click();
    await expect(tid(page, 'recipe-title')).toHaveText(title);
    await expect(tid(page, 'recipe-photo').locator('img').first()).toHaveAttribute('src', /.+/);

    await tid(page, 'recipe-ai-change-open').click();
    await expect(tid(page, 'recipe-ai-change-field-generate-photo')).toBeVisible();
    await expect(tid(page, 'recipe-ai-change-field-web-photo')).toHaveCount(0);
    await tid(page, 'recipe-ai-change-field-web-search').click();
    await expect(tid(page, 'recipe-ai-change-field-generate-photo')).toHaveCount(0);
    await expect(tid(page, 'recipe-ai-change-field-web-photo-none')).toBeChecked();
    await expect(tid(page, 'recipe-ai-change-field-web-photo-note')).toHaveText('Kein neues Foto.');
  });
});
