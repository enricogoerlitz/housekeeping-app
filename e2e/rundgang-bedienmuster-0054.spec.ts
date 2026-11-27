import type { Page } from '@playwright/test';

import {
  expect,
  freshSeed,
  isPhone,
  only,
  open,
  openManaged,
  test,
  tid,
  tidPrefix,
  unique,
} from './helpers';
import { seedIds } from './seed-ids';

// Spec 0054 — uniform patterns: one "+" per page, ⋯ without what the page shows, no ⋯ in the
// calendar, no bin in a row, one head for windows that decide, no accent on leaving. Runs once in
// spec 0028 (only type-checked here).

const LASAGNE = seedIds['rec-lasagne'];
const SOMMERFEST = seedIds['rec-sommerfest'];
const ENZO = seedIds['rest-enzo'];
const BOULDERN = seedIds['act-bouldern'];
const HAMBURG = seedIds['trip-hamburg'];

freshSeed();

/** The entries of the open menu. */
function menuItems(page: Page) {
  return page.locator('[role="menuitem"]');
}

test('AC-001 / AC-002 / AC-005 / AC-006: "Rezept anlegen" opens "Neu" at once; "Sammlung" there creates a collection', async ({
  page,
}) => {
  await open(page, '/rezepte');
  const create = tid(page, 'recipe-new');
  await expect(create).toHaveAttribute('aria-label', 'Rezept anlegen');
  if (isPhone(page)) await expect(create).not.toContainText('Rezept anlegen');
  else await expect(create).toHaveText('Rezept anlegen');
  await create.click();
  await expect(menuItems(page)).toHaveCount(0);
  await expect(tid(page, 'new-recipe-sheet')).toBeVisible();
  await expect(tid(page, 'new-recipe-kind-recipe')).toHaveAttribute('aria-checked', 'true');
  await tid(page, 'new-recipe-kind-collection').click();
  const title = `Brunch ${unique()}`;
  await tid(page, 'new-recipe-title').fill(title);
  await tid(page, 'new-recipe-save').click();
  await expect(tid(page, 'collection-detail')).toBeVisible();
  await expect(tid(page, 'collection-badge')).toBeVisible();
});

test('AC-007: "Restaurant anlegen" opens the restaurant window with the cursor in "Name"', async ({
  page,
}) => {
  await open(page, '/rezepte?ansicht=restaurants');
  await expect(tid(page, 'recipe-new')).toHaveCount(0);
  await tid(page, 'restaurant-new').click();
  await expect(menuItems(page)).toHaveCount(0);
  await expect(tid(page, 'restaurant-sheet')).toBeVisible();
  await expect(tid(page, 'restaurant-name')).toBeFocused();
});

test.describe('desktop', () => {
  only('desktop');

  test('AC-004: "Märkte & Bereiche" has one "+" for the tab shown and none under the lists', async ({
    page,
  }) => {
    await open(page, '/');
    await openManaged(page, 'stores');
    await expect(tid(page, 'store-new')).toHaveText('Markt anlegen');
    await expect(tid(page, 'areas-new')).toHaveCount(0);
    await tid(page, 'stores-view-bereiche').click();
    await expect(tid(page, 'areas-new')).toHaveText('Bereich anlegen');
    await expect(tid(page, 'store-new')).toHaveCount(0);
  });

  test('AC-013: an old stored "Haushalt-Zeile aus" does not hide the household row', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const key = 'housekeeping.settings.v1';
      const stored = JSON.parse(window.localStorage.getItem(key) ?? '{}') as object;
      window.localStorage.setItem(
        key,
        JSON.stringify({ ...stored, householdRow: { week: false, month: false } }),
      );
    });
    await open(page, '/kalender');
    await expect(tid(page, 'household-row')).toBeVisible();
  });

  test('AC-020: "Einkaufsliste leeren?" has "Abbrechen" and "Liste leeren" at the bottom', async ({
    page,
  }) => {
    await open(page, '/liste');
    await tid(page, 'list-more').click();
    await tid(page, 'list-more-clear-list').click();
    const footer = tid(page, 'clear-list-sheet-footer');
    await expect(footer).toContainText('Abbrechen');
    await expect(footer).toContainText('Liste leeren');
    await tid(page, 'clear-list-cancel').click();
    await expect(tid(page, 'clear-list-sheet')).toBeHidden();
  });
});

test('AC-008 / AC-010: the recipe ⋯ holds only "Zu Sammlung hinzufügen" and "Löschen"; the photo row and window keep the rest', async ({
  page,
}) => {
  await open(page, `/rezept/${LASAGNE}`);
  await tid(page, 'recipe-more').click();
  await expect(menuItems(page)).toHaveText(['Zu Sammlung hinzufügen', 'Löschen']);
  await page.keyboard.press('Escape');
  await expect(tid(page, 'recipe-share')).toBeVisible();
  await expect(tid(page, 'recipe-photo-change')).toBeVisible();
});

test('AC-009: collection, restaurant and activity have only "Löschen" in ⋯, and it asks first', async ({
  page,
}) => {
  for (const [route, more] of [
    [`/rezept/${SOMMERFEST}`, 'recipe-more'],
    [`/restaurant/${ENZO}`, 'restaurant-more'],
    [`/aktivitaet/${BOULDERN}`, 'activity-more'],
  ] as const) {
    await open(page, route);
    await tid(page, more).click();
    await expect(menuItems(page), route).toHaveText(['Löschen']);
    await tid(page, `${more}-delete`).click();
    // A collection whose ingredients are on the list asks with its own three answers.
    await expect(
      page
        .locator('[data-testid^="confirm-delete-"], [data-testid="recipe-delete-dialog"]')
        .first(),
    ).toBeVisible();
    await page.keyboard.press('Escape');
  }
});

test('AC-011: the calendar has no ⋯ in week, month and year', async ({ page }) => {
  await open(page, '/kalender');
  for (const view of ['week', 'month', 'year']) {
    await tid(page, `calendar-view-${view}`).click();
    await expect(tid(page, 'calendar-more'), view).toHaveCount(0);
  }
});

test('AC-016 / AC-017: "Reisen" has no bin in a row; deleting goes through the trip window', async ({
  page,
}) => {
  await open(page, '/');
  await openManaged(page, 'trips');
  const row = tid(page, `trip-${HAMBURG}`);
  await expect(row).toBeVisible();
  await expect(tid(page, `trip-${HAMBURG}-remove`)).toHaveCount(0);
  await expect(row.getByRole('button', { name: /löschen/i })).toHaveCount(0);
  await tid(page, `trip-${HAMBURG}-open`).click();
  await tid(page, 'trip-more').click();
  await expect(tid(page, 'trip-more-delete')).toHaveText('Reise löschen');
});

test.describe('phone', () => {
  only('phone');

  test('AC-018: a question has "Abbrechen" · title · "Löschen" on top and no ✕', async ({
    page,
  }) => {
    await open(page, '/');
    await openManaged(page, 'trips');
    await tid(page, `trip-${HAMBURG}-open`).click();
    await tid(page, 'trip-more').click();
    await tid(page, 'trip-more-delete').click();
    const head = tid(page, 'confirm-delete-trip-header');
    await expect(head).toContainText('Abbrechen');
    await expect(head).toContainText('Reise löschen?');
    await expect(tid(page, 'confirm-delete-trip-confirm')).toHaveText('Löschen');
    await expect(tid(page, 'confirm-delete-trip-close')).toHaveCount(0);
    await tid(page, 'confirm-delete-trip-cancel').click();
    await expect(tid(page, 'confirm-delete-trip')).toBeHidden();
    await expect(tid(page, 'trip-window')).toBeVisible();
  });

  test('AC-019: "Mitteilungen" closes with "Schließen" on top', async ({ page }) => {
    await open(page, '/');
    await tid(page, 'notices-bell').click();
    await expect(tid(page, 'notices-close')).toHaveText('Schließen');
    await tid(page, 'notices-close').click();
    await expect(tid(page, 'notices-sheet')).toBeHidden();
  });
});

test('AC-022: "Verlassen" in the members is in ink, not in the accent', async ({ page }) => {
  await open(page, '/');
  await openManaged(page, 'members');
  const leave = tidPrefix(page, 'household-member-remove-').first();
  await expect(leave).toBeVisible();
  const ink = await tid(page, 'household-members')
    .getByText('(du)')
    .evaluate((node) => getComputedStyle(node).color);
  const color = await leave
    .getByText(/Verlassen|Entfernen/)
    .evaluate((node) => getComputedStyle(node).color);
  expect(color).toBe(ink);
});
