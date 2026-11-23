import type { Locator, Page } from '@playwright/test';

import {
  day,
  expect,
  freshSeed,
  leaveManaged,
  nav,
  only,
  open,
  openManaged,
  showPlanWeek,
  switchHousehold,
  test,
  tid,
  tidPrefix,
  toastMessage,
} from './helpers';
import { seedIds } from './seed-ids';

// Spec 0012 — Reisetaschen: the bags under "Verwalten", attaching them to a trip, the
// trip window with packing (Sammel-Fenster), "Alles einpacken", resetting, adding and removing,
// the card on the Übersicht and the bag symbol in the calendar. Seed: "Urlaub Mallorca" (whole
// household, today + 12 to + 18) with "Strand" and "Kulturbeutel", 6 of 21 packed; "Dienstreise
// Hamburg" (Nadja) without a packing list. The tests change the demo, so the file starts from a
// fresh seed and runs in order.

only('phone');
freshSeed();

const MALLORCA = seedIds['trip-mallorca'];
const HAMBURG = seedIds['trip-hamburg'];
const STRAND = seedIds['bag-strand'];

/** A packing item row in the trip window whose label starts with `name` ("Badehose 2×"). */
function tripItem(page: Page, name: string): Locator {
  return page.locator(
    `[data-testid^="trip-item-"][data-testid$="-check"][aria-label^="${name}"]:not([inert] *):visible`,
  );
}

/** The section of one bag in the trip window (`trip-bag-<listBagId>`, holds its counter). */
function tripBag(page: Page, name: string): Locator {
  return tidPrefix(page, 'trip-bag-')
    .filter({ has: page.locator('[data-testid$="-counter"]') })
    .filter({ hasText: name });
}

/** Opens the trip window of "Urlaub Mallorca" from "Verwalten" → "Reisen". */
async function openMallorca(page: Page): Promise<void> {
  await open(page, '/');
  await openManaged(page, 'trips');
  await tid(page, `trip-${MALLORCA}-open`).click();
  await expect(tid(page, 'trip-window-title')).toHaveText('Urlaub Mallorca');
}

test('AC-001 / AC-003 / AC-005 / AC-007: the bags list, a new bag with items, suggestions and name errors', async ({
  page,
}) => {
  await open(page, '/');
  await openManaged(page, 'packing-bags');
  await expect(tid(page, `bag-${STRAND}`)).toContainText('12 Packstücke');
  await expect(tid(page, `bag-${seedIds['bag-kulturbeutel']}-member`)).toBeVisible();

  await tid(page, 'bag-new').click();
  await tid(page, 'bag-new-sheet-save').click();
  await expect(tid(page, 'bag-new-sheet-name-error')).toHaveText('Name fehlt');
  await tid(page, 'bag-new-sheet-name').fill('strand');
  await tid(page, 'bag-new-sheet-save').click();
  await expect(tid(page, 'bag-new-sheet')).toContainText('Gibt es schon: Strand');
  await expect(tid(page, 'bag-new-sheet-open-existing')).toBeVisible();
  await tid(page, 'bag-new-sheet-name').fill('Camping');
  await tid(page, 'bag-new-sheet-save').click();
  await expect(tid(page, 'bag-screen-title')).toHaveText('Camping');

  const input = tid(page, 'bag-item-input');
  await input.fill('2 Badehose');
  await input.press('Enter');
  await expect(tid(page, 'bag-detail')).toContainText('Badehose 2×');
  await expect(input).toHaveValue('');
  await input.fill('Sonn');
  await expect(tid(page, 'bag-item-suggestion-Sonnencreme')).toBeVisible();
  await tid(page, 'bag-item-suggestion-Sonnencreme').click();
  await expect(tid(page, 'bag-detail')).toContainText('Sonnencreme');
  const rows = tidPrefix(page, 'bag-item-open-');
  await expect(rows).toHaveCount(2);
  await input.fill('');
  await input.press('Enter');
  await expect(rows).toHaveCount(2);

  // AC-004: "je Tag" on Badehose.
  await rows.filter({ hasText: 'Badehose' }).click();
  await tid(page, 'bag-item-per-day').click();
  await tid(page, 'bag-item-save').click();
  await expect(tid(page, 'bag-detail')).toContainText('Badehose · 2 je Tag');
});

test('AC-008 / AC-009: duplicating "Camping" and deleting the copy with "Rückgängig"', async ({
  page,
}) => {
  await open(page, '/');
  await openManaged(page, 'packing-bags');
  await tidPrefix(page, 'bag-').filter({ hasText: 'Camping' }).first().click();
  await tid(page, 'bag-menu').click();
  await tid(page, 'bag-menu-duplicate').click();
  await expect(tid(page, 'bag-screen-title')).toHaveText('Camping (Kopie)');
  await expect(tid(page, 'bag-detail')).toContainText('Sonnencreme');
  await tid(page, 'bag-menu').click();
  await tid(page, 'bag-menu-delete').click();
  await expect(tid(page, 'bags-screen')).toBeVisible();
  await expect(toastMessage(page)).toHaveText('„Camping (Kopie)“ gelöscht');
  await expect(tid(page, 'bags-list')).not.toContainText('Camping (Kopie)');
  await tid(page, 'toast-action').click();
  await expect(tid(page, 'bags-list')).toContainText('Camping (Kopie)');
});

test('AC-002: the household "Test" has no bags yet', async ({ page }) => {
  await open(page, '/');
  await switchHousehold(page, seedIds['hh-test']);
  await openManaged(page, 'packing-bags');
  await expect(tid(page, 'bags-empty')).toContainText('Noch keine Reisetaschen');
  await expect(tid(page, 'bag-new')).toHaveText(/Reisetasche anlegen/);
});

test('AC-011 / AC-012 / AC-013: the trip window attaches bags; the button counts the items', async ({
  page,
}) => {
  await open(page, '/');
  await openManaged(page, 'trips');
  await tid(page, 'trips-new').click();
  await expect(tid(page, 'trip-bags')).toBeVisible();
  await expect(tid(page, 'trip-save')).toHaveText('Speichern');
  await tid(page, `trip-bag-${STRAND}`).click();
  await expect(tid(page, 'trip-save')).toHaveText('Speichern · 12 Packstücke');
  await tid(page, 'trip-bag-new').click();
  await tid(page, 'trip-bag-new-name').fill('Zelt');
  await tid(page, 'trip-bag-new-save').click();
  const zelt = tidPrefix(page, 'trip-bag-').filter({ hasText: 'Zelt' });
  await expect(zelt).toHaveAttribute('aria-pressed', 'true');
  await tid(page, 'trip-from').click();
  for (const date of [day(40), day(42)]) {
    for (let step = 0; step < 3 && !(await tid(page, `range-day-${date}`).isVisible()); step += 1) {
      await tid(page, 'range-next').click();
    }
    await tid(page, `range-day-${date}`).click();
  }
  await tid(page, 'trip-note').fill('Zeltwochenende');
  await tid(page, 'trip-save').click();
  await expect(tid(page, 'trip-sheet')).toBeHidden();

  const row = tid(page, 'trips-upcoming')
    .locator('[data-testid^="trip-"][data-testid$="-open"]')
    .filter({ hasText: 'Zeltwochenende' });
  await row.click();
  await expect(tid(page, 'trip-window-title')).toHaveText('Zeltwochenende');
  await expect(tid(page, 'trip-progress')).toHaveText('Packliste · 0 von 12 gepackt');
  await expect(tripBag(page, 'Strand')).toBeVisible();
  await expect(tripBag(page, 'Zelt')).toBeVisible();
});

test('AC-016 / AC-020 / AC-021: the trip window of "Urlaub Mallorca"; packing moves an item into "Gepackt" and back', async ({
  page,
}) => {
  await openMallorca(page);
  await expect(tid(page, 'trip-starts')).toHaveText('beginnt in 12 Tagen');
  await expect(tid(page, 'trip-progress')).toHaveText('Packliste · 6 von 21 gepackt');
  // The trip opens as a window over "Reisen" (0022 AC-039); it closes with its cross.
  await expect(tid(page, 'trip-window-close')).toBeVisible();

  const before = (await tripBag(page, 'Strand').locator('[data-testid$="-counter"]').innerText())
    .trim()
    .split('/');
  const item = tripItem(page, 'Sonnenhut');
  await item.click();
  await expect(item).toHaveAttribute('aria-checked', 'true');
  await expect(tid(page, 'trip-progress')).toHaveText('Packliste · 7 von 21 gepackt', {
    timeout: 6_000,
  });
  await expect(tripBag(page, 'Strand').locator('[data-testid$="-counter"]')).toHaveText(
    `${Number(before[0]) + 1}/${before[1]}`,
  );
  // AC-021: unpacking inside "Gepackt (n)" brings it back to the open items.
  const strand = tripBag(page, 'Strand');
  await strand.locator('[data-testid$="-packed-toggle"]').click();
  await tripItem(page, 'Sonnenhut').click();
  await expect(tid(page, 'trip-progress')).toHaveText('Packliste · 6 von 21 gepackt', {
    timeout: 6_000,
  });
  await expect(strand.locator('[data-testid^="trip-bag-"][data-testid$="-open"]')).toContainText(
    'Sonnenhut',
  );
});

test('AC-026 / AC-028 / AC-029: "Alles einpacken" with "Rückgängig"; resetting asks first', async ({
  page,
}) => {
  await openMallorca(page);
  const strand = tripBag(page, 'Strand');
  await strand.locator('[data-testid$="-more"]').first().click();
  await tidPrefix(page, 'trip-bag-').and(page.locator('[data-testid$="-more-pack-all"]')).click();
  await expect(toastMessage(page)).toHaveText('„Strand“ eingepackt');
  await tid(page, 'toast-action').click();
  await expect(tid(page, 'trip-progress')).toHaveText('Packliste · 6 von 21 gepackt');

  await tid(page, 'trip-more').click();
  await tid(page, 'trip-more-reset').click();
  await expect(tid(page, 'trip-reset-dialog')).toContainText('Alle 6 Haken entfernen?');
  await tid(page, 'trip-reset-dialog-cancel').click();
  await expect(tid(page, 'trip-reset-dialog')).toBeHidden();
  await expect(tid(page, 'trip-progress')).toHaveText('Packliste · 6 von 21 gepackt');
  await tid(page, 'trip-more').click();
  await tid(page, 'trip-more-reset').click();
  await tid(page, 'trip-reset-dialog-confirm').click();
  await expect(tid(page, 'trip-progress')).toHaveText('Packliste · 0 von 21 gepackt');
});

test('AC-031 / AC-033 / AC-034: an item, a bag added and a bag removed with "Rückgängig"', async ({
  page,
}) => {
  await openMallorca(page);
  const strand = tripBag(page, 'Strand');
  await strand.locator('[data-testid$="-add"]').click();
  await tid(page, 'trip-add-item-name').fill('Schnorchel');
  await tid(page, 'trip-add-item-save').click();
  await expect(tripItem(page, 'Schnorchel')).toHaveCount(1);
  await expect(tid(page, 'trip-progress')).toHaveText('Packliste · 0 von 22 gepackt');

  await tid(page, `trip-add-bag-open-${MALLORCA}`).click();
  await tid(page, `trip-add-bag-option-${seedIds['bag-technik']}`).click();
  await expect(toastMessage(page)).toHaveText('„Technik“ hinzugefügt');
  await expect(tripBag(page, 'Technik')).toBeVisible();

  const technik = tripBag(page, 'Technik');
  await technik.locator('[data-testid$="-more"]').first().click();
  await tidPrefix(page, 'trip-bag-').and(page.locator('[data-testid$="-more-remove"]')).click();
  await expect(tidPrefix(page, 'trip-bag-').filter({ hasText: 'Technik' })).toHaveCount(0);
  await tid(page, 'toast-action').click();
  await expect(tripBag(page, 'Technik')).toBeVisible();
});

test('AC-019: "Dienstreise Hamburg" has no packing list yet', async ({ page }) => {
  await open(page, '/');
  await openManaged(page, 'trips');
  await tid(page, `trip-${HAMBURG}-open`).click();
  await expect(tid(page, `trip-empty-${HAMBURG}`)).toContainText('Noch keine Packliste');
  await expect(tid(page, `trip-add-bag-open-${HAMBURG}`)).toBeVisible();
  await tid(page, 'trip-window-close').click();
  await expect(tid(page, 'trips-screen')).toBeVisible();
  await leaveManaged(page);
});

test('AC-042 / AC-046: the Übersicht card a week ahead and the bag symbol on the calendar stripe', async ({
  page,
}) => {
  await open(page, '/');
  await expect(tid(page, `today-packing-${MALLORCA}`)).toBeHidden();
  await tid(page, 'today-week-next').click();
  const card = tid(page, `today-packing-${MALLORCA}`);
  await expect(card).toContainText('Urlaub Mallorca');
  await expect(tid(page, `today-packing-${MALLORCA}-progress`)).toHaveText(/^\d+\/\d+ gepackt$/);
  await expect(tid(page, `today-packing-${MALLORCA}-starts`)).toHaveText(/^beginnt in \d+ Tagen$/);
  await tid(page, `today-packing-${MALLORCA}-open`).click();
  await expect(tid(page, 'trip-window-title')).toHaveText('Urlaub Mallorca');
  await tid(page, 'trip-window-close').click();
  await expect(tid(page, 'trip-window')).toHaveCount(0);
  await expect(tid(page, 'today-screen')).toBeVisible();

  await nav(page, 'kalender');
  await showPlanWeek(page, day(12));
  await expect(tid(page, `trip-stripe-${MALLORCA}-bag`)).toBeVisible();
  await tid(page, `trip-stripe-${MALLORCA}`).click();
  await expect(tid(page, 'trip-window-title')).toHaveText('Urlaub Mallorca');
  await expect(tid(page, 'calendar-title')).toBeAttached();
});
