import { expect as baseExpect } from '@playwright/test';

import {
  day,
  expect,
  freshSeed,
  goOffline,
  nav,
  nestedSeedId,
  only,
  open,
  showPlanWeek,
  test,
  tid,
  tidPrefix,
  toastMessage,
} from './helpers';
import { seedIds } from './seed-ids';

// Spec 0023 — editing recipes from the read view, "Abbrechen", step timers, links, the new cooking
// mode, the plan window with dates and the deletion notice. Type-checked per spec; the suite runs
// once in spec 0028. The tests change the demo, so the file starts from a fresh seed.

const LASAGNE = seedIds['rec-lasagne'];
const HALLOUMI = seedIds['rec-halloumi-pfanne'];
const PFANNKUCHEN = seedIds['rec-pfannkuchen'];
/** Lasagne's ingredients: i1 = 150 g Rote Linsen, i13 = 40 g Butter (seed order). */
const LINSEN = nestedSeedId('lasagne-i1');

only('phone');
freshSeed();

test('AC-001 / AC-003: "Neue Zutat" starts with the article, then "Menge"; without article it stays open', async ({
  page,
}) => {
  await open(page, `/rezept/${LASAGNE}`);
  await tid(page, 'recipe-edit').click();
  await tid(page, 'recipe-add-ingredient').click();
  const search = tid(page, 'ingredient-article-search-input');
  await expect(search).toBeFocused();
  await tid(page, 'ingredient-amount').fill('400 ml');
  await tid(page, 'ingredient-save').click();
  await expect(tid(page, 'ingredient-article-error')).toHaveText('Artikel wählen');
  await expect(search).toBeFocused();
  await expect(tid(page, 'ingredient-amount')).toHaveValue('400 ml');
  await tid(page, 'ingredient-amount').fill('');
  await search.fill('Muskat');
  await page.keyboard.press('Enter');
  await expect(tid(page, 'ingredient-amount')).toBeFocused();
  await tid(page, 'ingredient-amount').fill('1 Prise');
  await expect(page.getByText('Bleibt beim Umrechnen gleich')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(tid(page, 'recipe-ingredients')).toContainText('1 Prise Muskatnuss');
});

test('AC-004 / AC-005 / AC-007: "Zutat bearbeiten" from the read view opens the edit mode with the row (spec 0037)', async ({
  page,
}) => {
  await open(page, `/rezept/${LASAGNE}`);
  await tid(page, `ingredient-menu-${LINSEN}`).click();
  const options = page.locator('[role="menuitem"]');
  await expect(options).toHaveText(['Zutat bearbeiten', 'Artikel bearbeiten', 'Entfernen']);
  await options.filter({ hasText: 'Zutat bearbeiten' }).click();
  await expect(tid(page, 'ingredient-amount')).toHaveValue('150 g');
  await expect(page.getByText('für 4 Portionen')).toBeVisible();
  await tid(page, 'ingredient-amount').fill('200 g');
  await tid(page, 'ingredient-save').click();
  await tid(page, 'recipe-edit-save').click();
  await expect(tid(page, `ingredient-amount-${LINSEN}`)).toHaveText('200 g');
  await expect(toastMessage(page)).toHaveText('Gespeichert');
});

test('AC-008: offline the three entries are greyed out', async ({ page }) => {
  await open(page, `/rezept/${LASAGNE}`);
  await goOffline(page);
  await tid(page, `ingredient-menu-${LINSEN}`).click();
  for (const label of ['Zutat bearbeiten', 'Artikel bearbeiten', 'Entfernen']) {
    await expect(
      page.locator('[role="menuitem"]').filter({ hasText: label }),
      label,
    ).toHaveAttribute('aria-disabled', 'true');
  }
});

test('AC-009 / AC-010: "Abbrechen" and Escape close a section without saving', async ({ page }) => {
  await open(page, `/rezept/${LASAGNE}`);
  await tid(page, 'recipe-edit').click();
  await tid(page, 'recipe-head-title').fill('Lasagne neu');
  await page.keyboard.press('Escape');
  // Spec 0037, AC-005: with changes it asks first.
  await tid(page, 'confirm-discard-confirm').click();
  await expect(tid(page, 'recipe-title')).toHaveText('Lasagne');
  await tid(page, 'recipe-edit').click();
  await expect(tid(page, 'recipe-edit-cancel')).toBeVisible();
  await tid(page, 'recipe-edit-cancel').click();
  await expect(tid(page, 'recipe-edit-save')).toBeHidden();
});

test('AC-013: ingredients without group first, then each group under its heading', async ({
  page,
}) => {
  await open(page, `/rezept/${LASAGNE}`);
  await expect(tid(page, 'ingredient-group-Ragù')).toContainText('Rote Linsen');
  await expect(tid(page, 'ingredient-group-Béchamel')).toContainText('Butter');
});

test('AC-015 / AC-016: a step timer of 1 to 600 minutes', async ({ page }) => {
  await open(page, `/rezept/${LASAGNE}`);
  await tid(page, 'recipe-edit').click();
  const menu = page.locator('[data-testid^="recipe-step-menu-"]').first();
  await menu.click();
  await page.locator('[role="menuitem"]').filter({ hasText: 'Bearbeiten' }).click();
  await tid(page, 'recipe-step-sheet-timer').fill('601');
  await tid(page, 'recipe-step-sheet-apply').click();
  await expect(page.getByText('1 bis 600 Minuten')).toBeVisible();
  await tid(page, 'recipe-step-sheet-timer').fill('35');
  await tid(page, 'recipe-step-sheet-apply').click();
  await tid(page, 'recipe-edit-save').click();
  await expect(tid(page, 'recipe-steps')).toContainText('35 Min');
});

test('AC-031 / AC-032 / AC-033: links are checked, saved and open in a new tab', async ({
  page,
  context,
}) => {
  await open(page, `/rezept/${LASAGNE}`);
  await expect(tid(page, 'recipe-links')).toContainText('Noch keine Links.');
  await tid(page, 'recipe-edit').click();
  await tid(page, 'recipe-links-add').click();
  await tid(page, 'recipe-link-url').fill('javascript:alert(1)');
  await tid(page, 'recipe-link-sheet-apply').click();
  await expect(page.getByText('Nur Adressen mit http:// oder https://')).toBeVisible();
  await tid(page, 'recipe-link-url').fill('chefkoch.de/r/1');
  await tid(page, 'recipe-link-label').fill('Omas Variante');
  await tid(page, 'recipe-link-sheet-apply').click();
  await tid(page, 'recipe-edit-save').click();
  const row = tid(page, 'recipe-link-0');
  await expect(row).toContainText('Omas Variante');
  await expect(row).toContainText('chefkoch.de');
  const [tab] = await Promise.all([context.waitForEvent('page'), row.click()]);
  baseExpect(tab.url()).toContain('chefkoch.de/r/1');
  await expect(tid(page, 'recipe-title')).toHaveText('Lasagne');
});

test('AC-037 / AC-039 / AC-044: the cooking mode shows the step as text and the ingredients below', async ({
  page,
}) => {
  await open(page, `/rezept/${LASAGNE}/kochen?portionen=6`);
  await expect(tid(page, 'cook-step-index')).toHaveText('Schritt 1 von 6');
  const text = tid(page, 'cook-step-text');
  await expect(text).not.toHaveAttribute('role', 'heading');
  const size = await text.evaluate((node) => parseFloat(getComputedStyle(node).fontSize));
  baseExpect(size).toBeGreaterThanOrEqual(20);
  await expect(tid(page, 'cook-ingredients')).toBeVisible();
  await expect(tid(page, 'cook-ingredients-toggle')).toContainText('Zutaten · 6 Portionen');
  await expect(tid(page, `cook-ingredient-${LINSEN}`)).toContainText('Rote Linsen');
  await tid(page, 'cook-ingredients-toggle').click();
  await tid(page, 'cook-next').click();
  await expect(tid(page, 'cook-ingredients')).toBeHidden();
  await page.keyboard.press('ArrowLeft');
  await expect(tid(page, 'cook-step-index')).toHaveText('Schritt 1 von 6');
});

test('AC-045 / AC-046: "Neu" offers exactly Rezept, Sammlung, Restaurant on both views', async ({
  page,
}) => {
  await open(page, '/rezepte?ansicht=restaurants');
  await tid(page, 'recipe-new').click();
  await expect(page.locator('[role="menuitem"]')).toHaveText(['Rezept', 'Sammlung', 'Restaurant']);
});

test('AC-049: deleting asks first and names the planned entries that go (spec 0036: asks first)', async ({
  page,
}) => {
  // Pfannkuchen, so Halloumi-Pfanne stays for the next test (there is no undo any more).
  await open(page, `/rezept/${PFANNKUCHEN}`);
  await tid(page, 'recipe-plan').click();
  await tid(page, 'plan-recipe-week-next').click();
  await tid(page, 'plan-recipe-save').click();
  await tid(page, 'recipe-more').click();
  await page.locator('[role="menuitem"]').filter({ hasText: 'Löschen' }).click();
  await expect(tid(page, 'confirm-delete-recipe')).toContainText('Pfannkuchen');
  await tid(page, 'confirm-delete-recipe-cancel').click();
  await expect(tid(page, 'recipe-title')).toHaveText('Pfannkuchen');
  await tid(page, 'recipe-more').click();
  await page.locator('[role="menuitem"]').filter({ hasText: 'Löschen' }).click();
  await tid(page, 'confirm-delete-recipe-confirm').click();
  await expect(toastMessage(page)).toContainText(
    'Pfannkuchen gelöscht · 1 geplanter Eintrag entfällt',
  );
  // Deleting leads back by itself and there is no undo.
  await expect(tid(page, 'recipe-more')).toHaveCount(0);
  await expect(tid(page, 'toast-action')).toHaveCount(0);
});

test('Decision 15: deleting asks about the ingredients of the entries that go and takes them off', async ({
  page,
}) => {
  // Halloumi-Pfanne next week, and only it put on the list from the calendar.
  await open(page, `/rezept/${HALLOUMI}`);
  await tid(page, 'recipe-plan').click();
  await tid(page, 'plan-recipe-week-next').click();
  await tid(page, 'plan-recipe-save').click();
  await nav(page, 'kalender');
  await showPlanWeek(page, day(7));
  await tid(page, 'plan-to-list').click();
  // The rows render after the window: `.all()` takes only what is there.
  await expect(tidPrefix(page, 'pick-entry-').first()).toBeVisible();
  let halloumis = 0;
  for (const check of await tidPrefix(page, 'pick-entry-')
    .and(page.locator('[role="checkbox"]'))
    .all()) {
    const id = (await check.getAttribute('data-testid'))?.replace(/-check$/, '') ?? '';
    const halloumi = (await tid(page, id).innerText()).includes('Halloumi-Pfanne');
    if (halloumi) halloumis += 1;
    const selected = (await check.getAttribute('aria-checked')) === 'true';
    if (halloumi !== selected) await check.click();
  }
  // Earlier tests of this file may have planned it in the same week too.
  expect(halloumis).toBeGreaterThan(0);
  await expect(tid(page, 'pc-next')).toHaveText(
    `Weiter: ${halloumis} ${halloumis === 1 ? 'Gericht' : 'Gerichte'}`,
  );
  await tid(page, 'pc-next').click();
  await tid(page, 'pc-apply').click();
  await expect(tid(page, 'pantry-check-sheet')).toBeHidden();

  await open(page, `/rezept/${HALLOUMI}`);
  await tid(page, 'recipe-more').click();
  await page.locator('[role="menuitem"]').filter({ hasText: 'Löschen' }).click();
  await expect(tid(page, 'recipe-delete-dialog')).toContainText('Halloumi-Pfanne löschen?');
  // Earlier tests of this file may have planned Halloumi-Pfanne next week too: one or more entries go.
  await expect(tid(page, 'recipe-delete-message')).toContainText(
    /^Für (1 geplanten Eintrag|\d+ geplante Einträge) (steht 1 Zutat|stehen \d+ Zutaten) auf der Einkaufsliste\.$/,
  );
  await tid(page, 'recipe-delete-with-list').click();
  await expect(toastMessage(page)).toContainText(
    /^Halloumi-Pfanne gelöscht · (1 geplanter Eintrag entfällt|\d+ geplante Einträge entfallen) · \d+ Zutaten? von der Liste genommen/,
  );
  await nav(page, 'liste');
  await expect(page.getByText('Halloumi-Pfanne')).toHaveCount(0);
});

test('AC-053 / AC-054: the plan window shows dates and reaches any day', async ({ page }) => {
  await open(page, `/rezept/${LASAGNE}`);
  await tid(page, 'recipe-plan').click();
  const today = day(0);
  await expect(tid(page, `plan-recipe-day-${today}`)).toHaveAttribute('aria-checked', 'true');
  await expect(tid(page, 'plan-recipe-save')).toContainText('einplanen');
  await tid(page, 'plan-recipe-other-date').click();
  await expect(tid(page, 'plan-recipe-calendar-picker')).toBeVisible();
});
