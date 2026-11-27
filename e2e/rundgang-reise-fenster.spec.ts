import type { Page } from '@playwright/test';

import {
  day,
  expect,
  freshSeed,
  open,
  openManaged,
  switchHousehold,
  test,
  tid,
  toastMessage,
} from './helpers';
import { seedIds } from './seed-ids';

// Spec 0022 — the trip window: one window for the whole trip over the page it was opened on,
// changing fields in place, deleting, the Packstück window, "+ Neue Reisetasche", adopting changes
// of a Reisetasche and "Kommende Packlisten". Runs once in spec 0028 (only type-checked here).

const MALLORCA = seedIds['trip-mallorca'];
const HAMBURG = seedIds['trip-hamburg'];

freshSeed();

async function openFromTrips(page: Page, tripId: string): Promise<void> {
  await open(page, '/');
  await openManaged(page, 'trips');
  await tid(page, `trip-${tripId}`).click();
  await expect(tid(page, 'trip-window')).toBeVisible();
}

test('AC-001 / AC-006 (0022): the window over "Reisen" and over the "Übersicht"; no "Speichern" without a change', async ({
  page,
}) => {
  await openFromTrips(page, MALLORCA);
  await expect(tid(page, 'trip-window-title')).toHaveText('Urlaub Mallorca');
  await expect(tid(page, 'trip-starts')).toContainText('beginnt in');
  await expect(tid(page, 'trip-progress')).toContainText('Packliste ·');
  await expect(tid(page, 'trip-save')).toHaveCount(0);
  await expect(tid(page, 'trips-screen')).toBeAttached();
  await tid(page, 'trip-window-close').click();
  await expect(tid(page, 'trip-window')).toBeHidden();
  await expect(page).not.toHaveURL(/reise=/);
});

test('AC-007 (0022), REQ-013 (0019): the trip window and "Neue Reise" are windows in the address; Back closes them', async ({
  page,
}) => {
  await openFromTrips(page, MALLORCA);
  await expect(page).toHaveURL(new RegExp(`/reisen\\?reise=${MALLORCA}`));
  await page.goBack();
  await expect(tid(page, 'trip-window')).toBeHidden();
  await expect(page).toHaveURL(/\/reisen$/);
  await expect(tid(page, 'trips-screen')).toBeVisible();

  await tid(page, 'trips-new').click();
  await expect(page).toHaveURL(/\/reisen\?fenster=neu-reise$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/reisen$/);
});

test('AC-011 / AC-013 (0022): changing the note shows "Speichern", the window stays open; ✕ with changes asks', async ({
  page,
}) => {
  await openFromTrips(page, MALLORCA);
  await tid(page, 'trip-note').fill('Mallorca mit Oma');
  await expect(tid(page, 'trip-save')).toBeVisible();
  await tid(page, 'trip-window-close').click();
  await expect(tid(page, 'trip-discard-dialog')).toContainText(
    'Änderungen an der Reise verwerfen?',
  );
  await tid(page, 'trip-discard-dialog-cancel').click();
  await tid(page, 'trip-save').click();
  await expect(toastMessage(page)).toHaveText('Reise geändert');
  await expect(tid(page, 'trip-window-title')).toHaveText('Mallorca mit Oma');
  await expect(tid(page, 'trip-save')).toHaveCount(0);

  // Leave the note as the seed had it for the tests after this one.
  await tid(page, 'trip-note').fill('Urlaub Mallorca');
  await tid(page, 'trip-save').click();
  await expect(tid(page, 'trip-window-title')).toHaveText('Urlaub Mallorca');
});

test('AC-068 (0031): a shorter end, not yet saved, shows its days and "je Tag" quantities', async ({
  page,
}) => {
  await openFromTrips(page, MALLORCA);
  const shirts = page.locator('[data-testid^="trip-item-"]', { hasText: 'T-Shirts' }).first();
  await expect(tid(page, 'trip-subtitle')).toHaveText('7 Tage');
  await expect(shirts).toContainText('T-Shirts 7×');
  const end = day(15);
  await tid(page, 'trip-to').click();
  for (let step = 0; step < 2 && !(await tid(page, `range-day-${end}`).isVisible()); step += 1) {
    await tid(page, 'range-next').click();
  }
  await tid(page, `range-day-${end}`).click();
  await expect(tid(page, 'trip-save')).toBeVisible();
  await expect(tid(page, 'trip-subtitle')).toHaveText('4 Tage');
  await expect(shirts).toContainText('T-Shirts 4×');
});

test('AC-017 (0022): a trip without a packing list is deleted after asking first (spec 0036: asks first)', async ({
  page,
}) => {
  await openFromTrips(page, HAMBURG);
  await tid(page, 'trip-more').click();
  await tid(page, 'trip-more-delete').click();
  await expect(tid(page, 'confirm-delete-trip')).toBeVisible();
  await tid(page, 'confirm-delete-trip-cancel').click();
  await expect(tid(page, 'confirm-delete-trip')).toBeHidden();
  await tid(page, 'trip-more').click();
  await tid(page, 'trip-more-delete').click();
  await tid(page, 'confirm-delete-trip-confirm').click();
  await expect(toastMessage(page)).toHaveText('Reise gelöscht');
  await expect(tid(page, 'toast-action')).toHaveCount(0);
  await expect(tid(page, `trip-${HAMBURG}`)).toHaveCount(0);
});

test('AC-028 / AC-034 (0022): a Packstück window from its name; "+ Neue Reisetasche" "Camping"', async ({
  page,
}) => {
  await openFromTrips(page, MALLORCA);
  const shirts = page.locator('[data-testid^="trip-item-"]', { hasText: 'T-Shirts' }).first();
  await shirts.click();
  await expect(tid(page, 'trip-item-sheet')).toBeVisible();
  await tid(page, 'trip-item-save').click();
  await expect(tid(page, 'trip-item-sheet')).toBeHidden();
  await tid(page, `trip-add-bag-open-${MALLORCA}`).click();
  await tid(page, 'trip-add-bag-new').click();
  await tid(page, 'trip-add-bag-new-name').fill('Camping');
  await tid(page, 'trip-add-bag-new-save').click();
  await expect(tid(page, 'trip-window')).toContainText('Camping');
});

test('AC-039 (0022): "Kommende Packlisten" on "Reisetaschen" opens the window over the page', async ({
  page,
}) => {
  await open(page, '/');
  await openManaged(page, 'packing-bags');
  await expect(tid(page, 'bags-upcoming')).toContainText('Urlaub Mallorca');
  await tid(page, `bags-upcoming-${MALLORCA}`).click();
  await expect(tid(page, 'trip-window-title')).toHaveText('Urlaub Mallorca');
  await expect(tid(page, 'bags-screen')).toBeAttached();
});

test('AC-020 (0022): without trips "Noch keine Reisen" with "Reise eintragen"', async ({
  page,
}) => {
  await open(page, '/');
  await switchHousehold(page, seedIds['hh-test']);
  await openManaged(page, 'trips');
  await expect(tid(page, 'trips-empty')).toContainText('Noch keine Reisen');
  await expect(tid(page, 'trips-empty')).toContainText(
    'Tragt Urlaub oder Dienstreisen ein, auch im Kalender durch Ziehen über die Tage.',
  );
  await expect(tid(page, 'trips-empty-new')).toHaveText('Reise eintragen');
});
