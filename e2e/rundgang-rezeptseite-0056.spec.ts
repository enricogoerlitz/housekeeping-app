import { expect as baseExpect } from '@playwright/test';

import { expect, freshSeed, goOffline, nav, only, open, test, tid, toastMessage } from './helpers';
import { seedIds } from './seed-ids';

// Spec 0056 — the read view saves "+ Zutat", "Mehrere einfügen" and "+ Link" at once, the
// actions on the phone without scrolling, no placeholder without a photo, the kept draft, and
// "Fertig" of the cooking mode. The swipe between photo and videos on the whole screen is proven
// in packages/ui (photo-viewer.test.tsx): the seed has no saved videos. The tests change the
// demo, so the file starts from a fresh seed.

const LASAGNE = seedIds['rec-lasagne'];
/** No own and no sample photo, no video, not planned today. */
const HALLOUMI = seedIds['rec-halloumi-pfanne'];
/** Not planned today either. */
const BIRCHER = seedIds['rec-bircher-muesli'];

only('phone');
freshSeed();

test('AC-001: "+ Zutat" in the read view saves at once and stays in the read view', async ({
  page,
}) => {
  await open(page, `/rezept/${LASAGNE}`);
  await tid(page, 'recipe-read-add-ingredient').click();
  await tid(page, 'ingredient-article-search-input').fill('Muskat');
  await page.keyboard.press('Enter');
  await tid(page, 'ingredient-amount').fill('1 Prise');
  await tid(page, 'ingredient-save').click();
  await expect(tid(page, 'ingredient-sheet')).toBeHidden();
  await expect(tid(page, 'recipe-edit-save')).toHaveCount(0);
  await expect(tid(page, 'recipe-ingredients')).toContainText('1 Prise Muskatnuss');
  await expect(toastMessage(page)).toHaveText('Gespeichert');
});

test('AC-002: "+ Link" in the read view saves at once; it is there after a reload', async ({
  page,
}) => {
  await open(page, `/rezept/${LASAGNE}`);
  await tid(page, 'recipe-read-add-link').click();
  await tid(page, 'recipe-link-url').fill('chefkoch.de/r/1');
  await tid(page, 'recipe-link-sheet-apply').click();
  await expect(tid(page, 'recipe-link-sheet')).toBeHidden();
  await expect(tid(page, 'recipe-edit-save')).toHaveCount(0);
  await expect(tid(page, 'recipe-link-0')).toContainText('chefkoch.de');
  await page.reload();
  await expect(tid(page, 'recipe-link-0')).toContainText('chefkoch.de');
});

test('AC-006 / AC-007 / AC-008: "Mehrere einfügen" saves the sure rows, the open ones wait in the edit mode', async ({
  page,
}) => {
  await open(page, `/rezept/${LASAGNE}`);
  await expect(tid(page, 'recipe-read-add-ingredient')).toBeVisible();
  await tid(page, 'recipe-read-paste-ingredients').click();
  await tid(page, 'ingredients-paste').fill('1 Zwiebel\n1 Paniermehlxy');
  await tid(page, 'ingredients-paste-save').click();
  await expect(toastMessage(page)).toHaveText('1 Zutat gespeichert · 1 braucht noch einen Artikel');
  await expect(tid(page, 'recipe-edit-save')).toBeVisible();
  await expect(tid(page, 'recipe-ingredients')).toContainText('Paniermehlxy');
  await tid(page, 'recipe-edit-cancel').click();
  await tid(page, 'confirm-discard-confirm').click();
  await expect(tid(page, 'recipe-ingredients')).toContainText('Zwiebel');
  await expect(tid(page, 'recipe-ingredients')).not.toContainText('Paniermehlxy');
});

test('AC-009: offline "+ Zutat", "Mehrere einfügen" and "+ Link" are greyed out', async ({
  page,
}) => {
  await open(page, `/rezept/${LASAGNE}`);
  await goOffline(page);
  for (const id of [
    'recipe-read-add-ingredient',
    'recipe-read-paste-ingredients',
    'recipe-read-add-link',
  ]) {
    await expect(tid(page, id), id).toHaveAttribute('aria-disabled', 'true');
  }
});

test('AC-016: on the phone "Kochen" is on the first screen, above the stars', async ({ page }) => {
  await open(page, `/rezept/${LASAGNE}`);
  const cook = await tid(page, 'start-cooking').boundingBox();
  const stars = await tid(page, 'recipe-rating').boundingBox();
  const height = page.viewportSize()?.height ?? 0;
  baseExpect(cook && cook.y + cook.height).toBeLessThanOrEqual(height);
  baseExpect(cook && stars && cook.y < stars.y).toBe(true);
});

test('AC-017: without photo and video there is no placeholder frame', async ({ page }) => {
  await open(page, `/rezept/${HALLOUMI}`);
  await expect(tid(page, 'recipe-gallery')).toHaveCount(0);
  await expect(tid(page, 'recipe-photo-change')).toBeVisible();
  const title = await tid(page, 'recipe-title').boundingBox();
  baseExpect(title && title.y).toBeLessThan(220);
});

test('AC-019 / AC-021: a changed draft survives browser back; "Verwerfen" removes it', async ({
  page,
}) => {
  await open(page, `/rezept/${LASAGNE}`);
  await tid(page, 'recipe-edit').click();
  await tid(page, 'recipe-head-title').fill('Omas Lasagne');
  await page.goBack();
  await page.goForward();
  await expect(tid(page, 'recipe-draft-backup')).toContainText('Ungespeicherte Änderungen von');
  await tid(page, 'recipe-draft-resume').click();
  await expect(tid(page, 'recipe-head-title')).toHaveValue('Omas Lasagne');
  await tid(page, 'recipe-edit-cancel').click();
  await tid(page, 'confirm-discard-confirm').click();
  await page.reload();
  await expect(tid(page, 'recipe-title')).toHaveText('Lasagne');
  await expect(tid(page, 'recipe-draft-backup')).toHaveCount(0);
});

test('AC-020 / AC-022: the draft survives a tab change; after "Speichern" nothing is offered', async ({
  page,
}) => {
  await open(page, `/rezept/${LASAGNE}`);
  await tid(page, 'recipe-edit').click();
  await tid(page, 'recipe-head-title').fill('Lasagne al forno');
  await nav(page, 'kalender');
  await nav(page, 'rezepte');
  await page.goto(`/rezept/${LASAGNE}`);
  await expect(tid(page, 'recipe-draft-backup')).toBeVisible();
  await tid(page, 'recipe-draft-resume').click();
  await tid(page, 'recipe-edit-save').click();
  await expect(tid(page, 'recipe-title')).toHaveText('Lasagne al forno');
  await page.reload();
  await expect(tid(page, 'recipe-draft-backup')).toHaveCount(0);
});

test('AC-030 / AC-033: "Fertig" without an entry of today asks; Escape stays, "Eintragen" plans today', async ({
  page,
}) => {
  await open(page, `/rezept/${HALLOUMI}/kochen?schritt=99`);
  await tid(page, 'cook-done').click();
  await expect(tid(page, 'cook-cooked-today')).toContainText('Heute gekocht eintragen?');
  await page.keyboard.press('Escape');
  await expect(tid(page, 'cook-cooked-today')).toBeHidden();
  await expect(tid(page, 'cooking-screen')).toBeVisible();
  await tid(page, 'cook-done').click();
  await tid(page, 'cook-cooked-today-confirm').click();
  await expect(toastMessage(page)).toHaveText('Heute gekocht eingetragen');
  await expect(tid(page, 'cooking-screen')).toBeHidden();
  // AC-031: now there is an entry of today, "Fertig" asks no more.
  await page.goto(`/rezept/${HALLOUMI}/kochen?schritt=99`);
  await tid(page, 'cook-done').click();
  await expect(tid(page, 'cooking-screen')).toBeHidden();
  await expect(tid(page, 'cook-cooked-today')).toHaveCount(0);
});

test('AC-031 / AC-034: planned today or offline, "Fertig" just leaves', async ({ page }) => {
  await open(page, `/rezept/${LASAGNE}/kochen?schritt=99`);
  await tid(page, 'cook-done').click();
  await expect(tid(page, 'cook-cooked-today')).toHaveCount(0);
  await expect(tid(page, 'cooking-screen')).toBeHidden();
  await open(page, `/rezept/${BIRCHER}/kochen?schritt=99`);
  await goOffline(page);
  await tid(page, 'cook-done').click();
  await expect(tid(page, 'cook-cooked-today')).toHaveCount(0);
  await expect(tid(page, 'cooking-screen')).toBeHidden();
});
