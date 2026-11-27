import {
  ACTIVE,
  day,
  expect,
  freshSeed,
  goOffline,
  isoWeekday,
  only,
  open,
  openItem,
  test,
  tid,
  toastMessage,
} from './helpers';
import { seedIds } from './seed-ids';
import type { Page } from '@playwright/test';

// Spec 0060 "Dauerposten": the page under "Verwalten" and from the list's ⋯, the window with
// Artikel, Menge, Rhythmus and "Pausiert", "Regelmäßig kaufen" at the article and the block
// "Regelmäßig" in "+ Aus Kalender …". The scheduler itself (AC-013 to AC-020) is covered by pgTAP
// (supabase/tests/recurring_items.test.sql). Every Dauerposten here is due tomorrow, so the
// hourly job of the local database never puts one on the list while the run is going.

only('phone');
freshSeed();

const TOMORROW = day(1);
const TODAY_WEEKDAY = isoWeekday(day(0));
const TOMORROW_WEEKDAY = isoWeekday(TOMORROW);

/** "+ Dauerposten" for `article` with `amount`, weekly on tomorrow's weekday. */
async function createRecurring(page: Page, article: string, amount: string): Promise<void> {
  await tid(page, 'recurring-new').click();
  await tid(page, 'recurring-article-search-input').fill(article);
  await page
    .locator(`[data-testid^="recurring-article-search-hit-"]${ACTIVE}`)
    .filter({ hasText: article })
    .first()
    .click();
  await tid(page, 'recurring-amount').fill(amount);
  await tid(page, `repeat-weekday-${TOMORROW_WEEKDAY}`).click();
  await tid(page, `repeat-weekday-${TODAY_WEEKDAY}`).click();
  await tid(page, 'recurring-save').click();
}

function recurringRow(page: Page, name: string) {
  return page.locator(`[data-testid^="recurring-row-"][role="button"]${ACTIVE}`).filter({
    hasText: name,
  });
}

test('AC-001 / AC-002: empty page, then "Reis 2×" weekly, next time tomorrow', async ({ page }) => {
  await open(page, '/dauerposten');
  await expect(tid(page, 'recurring-empty')).toContainText('Noch keine Dauerposten');
  // Durchklick 27.11., D-04: the pattern of every page.
  await expect(tid(page, 'recurring-new')).toHaveAttribute('aria-label', 'Dauerposten anlegen');
  await createRecurring(page, 'Reis', '2');
  await expect(toastMessage(page)).toHaveText('Dauerposten „Reis“ angelegt');
  const row = recurringRow(page, 'Reis');
  await expect(row).toContainText('2×');
  await expect(row).toContainText('nächstes Mal morgen');
});

test('AC-008: a second Dauerposten for "Reis" is refused with "Öffnen ›"', async ({ page }) => {
  await open(page, '/dauerposten');
  await tid(page, 'recurring-new').click();
  await tid(page, 'recurring-article-search-input').fill('Reis');
  await page
    .locator(`[data-testid^="recurring-article-search-hit-"]${ACTIVE}`)
    .filter({ hasText: 'Reis' })
    .first()
    .click();
  await expect(tid(page, 'recurring-duplicate')).toHaveText(
    'Für Reis gibt es schon einen Dauerposten',
  );
  await expect(tid(page, 'recurring-save')).toBeDisabled();
  await tid(page, 'recurring-duplicate-open').click();
  await expect(tid(page, 'recurring-sheet')).toContainText('Dauerposten bearbeiten');
});

test('AC-007: "viel" is no amount', async ({ page }) => {
  await open(page, '/dauerposten');
  await recurringRow(page, 'Reis').click();
  await tid(page, 'recurring-amount').fill('viel');
  // Durchklick 27.11., D-05: below the row of "Menge" and "Zusatz".
  await expect(tid(page, 'recurring-amount-error')).toHaveText(
    'Menge nicht erkannt – z. B. 500 g oder 2',
  );
  await expect(tid(page, 'recurring-save')).toBeDisabled();
});

test('AC-005 / AC-006: paused reads "pausiert"; "Löschen" with "Rückgängig"', async ({ page }) => {
  await open(page, '/dauerposten');
  await recurringRow(page, 'Reis').click();
  await tid(page, 'recurring-paused').click();
  await tid(page, 'recurring-save').click();
  await expect(recurringRow(page, 'Reis')).toContainText('pausiert');
  await recurringRow(page, 'Reis').click();
  await tid(page, 'recurring-delete').click();
  await expect(toastMessage(page)).toHaveText('Reis entfernt');
  await expect(recurringRow(page, 'Reis')).toHaveCount(0);
  await tid(page, 'toast-action').click();
  await expect(recurringRow(page, 'Reis')).toContainText('pausiert');
});

test('AC-010 / AC-011: "Regelmäßig kaufen ›" at the article; Reis is used, not "Unbenutzt"', async ({
  page,
}) => {
  await open(page, '/liste');
  await tid(page, 'list-more').click();
  await tid(page, 'list-more-articles').click();
  await tid(page, 'articles-search').fill('Geschenkpapier');
  await tid(page, `article-${seedIds['art-geschenkpapier']}`).click();
  await tid(page, 'article-recurring').click();
  // Durchklick 27.11., I-05: the head of every form, "Zurück · Regelmäßig kaufen · Speichern".
  await expect(tid(page, 'article-sheet-header')).toContainText('Regelmäßig kaufen');
  await expect(tid(page, 'article-sheet-header')).toContainText('Zurück');
  await expect(tid(page, 'article-sheet-header')).toContainText('Speichern');
  await tid(page, 'recurring-amount').fill('1');
  await tid(page, `repeat-weekday-${TOMORROW_WEEKDAY}`).click();
  await tid(page, `repeat-weekday-${TODAY_WEEKDAY}`).click();
  await tid(page, 'recurring-save').click();
  await expect(tid(page, 'article-recurring')).toContainText('Regelmäßig');
  await expect(tid(page, 'article-recurring-rule')).toContainText('wöchentlich');
});

test('AC-009: offline the page is readable, changing is greyed out', async ({ page }) => {
  await open(page, '/dauerposten');
  await goOffline(page);
  await expect(recurringRow(page, 'Reis')).toBeVisible();
  await expect(tid(page, 'recurring-new')).toBeDisabled();
});

test('AC-023 / AC-024: "Regelmäßig" in "+ Aus Kalender …", not preselected; taken over with "regelmäßig"', async ({
  page,
}) => {
  // Reis was paused above: switch it on again from the list's ⋯.
  await open(page, '/liste');
  await tid(page, 'list-more').click();
  await tid(page, 'list-more-recurring').click();
  await recurringRow(page, 'Reis').click();
  await tid(page, 'recurring-paused').click();
  await tid(page, 'recurring-save').click();
  await open(page, '/liste');
  await tid(page, 'list-from-plan').click();
  const block = tid(page, 'pick-recurring');
  await expect(block).toContainText('Reis 2×');
  const reis = block.locator('[data-testid^="pick-recurring-"][role="button"]').filter({
    hasText: 'Reis',
  });
  await expect(reis.locator('[data-testid$="-check"]')).not.toBeChecked();
  await reis.click();
  await expect(tid(page, 'pc-next')).toContainText('Dauerposten');
  await tid(page, 'pc-next').click();
  await tid(page, 'pc-apply').click();
  await openItem(page, 'Reis').first().click();
  await expect(tid(page, 'item-sheet-origins')).toContainText('regelmäßig');
});
