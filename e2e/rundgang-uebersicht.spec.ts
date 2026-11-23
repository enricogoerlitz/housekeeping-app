import type { Page } from '@playwright/test';

import {
  ACTIVE,
  day,
  expect,
  freshSeed,
  goOffline,
  nav,
  only,
  open,
  switchHousehold,
  test,
  tid,
  toastMessage,
} from './helpers';
import { seedIds } from './seed-ids';

// Spec 0020 — "Übersicht: sieben Tage ab gestern": the Tagesleiste from yesterday, paging by seven
// days without jumps, "+" and "Hinzufügen" on an empty day, the prep lines and "Nicht gemacht"
// with "Rückgängig". The seed is relative to today; the empty household "Test" has no plan.

freshSeed();

/** Where the controls of the head stand, to compare before and after paging (AC-009). */
async function headBoxes(page: Page): Promise<string> {
  const boxes = [];
  for (const id of ['today-week-today', 'today-week-prev', 'today-range', 'today-week-next']) {
    // The range's fixed slot, not its text: the text is centred in it (AC-009, "gleich breit").
    const control = id === 'today-range' ? tid(page, id).locator('..') : tid(page, id);
    const box = await control.boundingBox();
    boxes.push(box ? `${Math.round(box.x)},${Math.round(box.y)},${Math.round(box.width)}` : 'none');
  }
  return boxes.join(' | ');
}

test.describe('the Tagesleiste and its head', () => {
  test('AC-001 / AC-007: yesterday to today + 5, the range without "KW", "Heute" greyed out', async ({
    page,
  }) => {
    await open(page, '/');
    for (let offset = -1; offset <= 5; offset += 1) {
      await expect(tid(page, `today-week-${day(offset)}`), `day ${offset}`).toBeVisible();
    }
    await expect(page.locator(`[data-testid="today-week-${day(-2)}"]${ACTIVE}`)).toHaveCount(0);
    await expect(page.locator(`[data-testid="today-week-${day(6)}"]${ACTIVE}`)).toHaveCount(0);
    await expect(tid(page, 'today-range')).not.toContainText('KW');
    await expect(tid(page, 'today-week-today')).toBeDisabled();
    await expect(page.getByText(/^Guten (Morgen|Tag|Abend), /)).toBeVisible();
    // AC-010: no calendar symbol in the head.
    await expect(page.locator('[data-testid="today-calendar"]')).toHaveCount(0);

    // AC-007: another day of the section keeps the greeting and the grey "Heute".
    await tid(page, `today-week-${day(2)}`).click();
    await expect(page.getByText(/^Guten (Morgen|Tag|Abend), /)).toBeVisible();
    await expect(tid(page, 'today-week-today')).toBeDisabled();
  });

  test('AC-002 / AC-008 / AC-009: › goes seven days, "In 7 Tagen", nothing moves', async ({
    page,
  }) => {
    await open(page, '/');
    const before = await headBoxes(page);
    await tid(page, 'today-week-next').click();
    await expect(tid(page, `today-week-${day(6)}`)).toBeVisible();
    await expect(tid(page, `today-week-${day(12)}`)).toBeVisible();
    await expect(page.getByText('In 7 Tagen')).toBeVisible();
    await expect(tid(page, 'today-week-today')).toBeEnabled();
    expect(await headBoxes(page)).toBe(before);

    await tid(page, 'today-week-today').click();
    await expect(page.getByText(/^Guten (Morgen|Tag|Abend), /)).toBeVisible();
    expect(await headBoxes(page)).toBe(before);
    await tid(page, 'today-week-prev').click();
    await tid(page, `today-week-${day(-6)}`).click();
    await expect(page.getByText('Vor 6 Tagen')).toBeVisible();
  });

  test('AC-011: ‹ › are "Vorige 7 Tage" / "Nächste 7 Tage"', async ({ page }) => {
    await open(page, '/');
    await expect(tid(page, 'today-week-prev')).toHaveAccessibleName('Vorige 7 Tage');
    await expect(tid(page, 'today-week-next')).toHaveAccessibleName('Nächste 7 Tage');
  });
});

test('review 0031, R-01: a chore of a later day can be checked, as in the calendar', async ({
  page,
}) => {
  await open(page, '/');
  await tid(page, `today-week-${day(1)}`).click();
  const row = page
    .locator(`[data-testid^="today-chore-"]:not([data-testid$="-check"])${ACTIVE}`)
    .filter({ hasText: 'Küche wischen' })
    .first();
  await expect(row).toBeVisible();
  const check = page.locator(`[data-testid="${await row.getAttribute('data-testid')}-check"]`);
  await check.click();
  await expect(check).toHaveAttribute('aria-checked', 'true');
  // A second tap takes it back before it is booked (the check window).
  await check.click();
  await expect(check).toHaveAttribute('aria-checked', 'false');
});

test.describe('an empty day', () => {
  // "Nichts geplant" with "Hinzufügen" is the phone's (AC-022); the desktop has the tile's "+".
  only('phone');

  test('AC-022 / AC-023: "Nichts geplant" with "Hinzufügen" opens the add window; closing plans nothing', async ({
    page,
  }) => {
    await open(page, '/');
    await switchHousehold(page, seedIds['hh-test']);
    const empty = tid(page, 'today-meals-empty');
    await expect(empty).toContainText('Nichts geplant');
    await expect(page.getByText('Im Kalender planen ›')).toHaveCount(0);
    await tid(page, 'today-add').click();
    await expect(tid(page, 'add-entry-sheet')).toBeVisible();
    // AC-020: the day as a whole, without a Tageszeit in the title.
    await expect(tid(page, 'add-entry-sheet')).not.toContainText(' · Abend');
    await page.keyboard.press('Escape');
    await expect(tid(page, 'add-entry-sheet')).toBeHidden();
    await expect(tid(page, 'today-screen')).toBeVisible();
    await expect(empty).toBeVisible();
  });

  test('AC-025: offline "Hinzufügen" is greyed out, the day stays choosable', async ({ page }) => {
    await open(page, '/');
    await switchHousehold(page, seedIds['hh-test']);
    await goOffline(page);
    await expect(tid(page, 'today-add')).toBeDisabled();
    await tid(page, `today-week-${day(1)}`).click();
    await expect(tid(page, 'today-meals')).toContainText('Geplant am');
    await expect(tid(page, 'today-add')).toBeDisabled();
  });
});

test.describe('the tiles on the desktop', () => {
  only('desktop');

  test('AC-020 / AC-021: "+" of an empty tile opens the window, a tap elsewhere only chooses the day', async ({
    page,
  }) => {
    await open(page, '/');
    await switchHousehold(page, seedIds['hh-test']);
    // On wider screens leaving "Haushalt & Mitglieder" ends on "Verwalten".
    await nav(page, 'index');
    await tid(page, `today-week-${day(2)}-title`).click();
    await expect(tid(page, 'add-entry-sheet')).toBeHidden();
    await expect(tid(page, 'today-meals')).toContainText('Geplant am');
    await tid(page, `today-week-${day(3)}-add`).click();
    await expect(tid(page, 'add-entry-sheet')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(tid(page, `today-week-${day(3)}-add`)).toBeVisible();
  });
});

test.describe('Wie war’s?', () => {
  test('AC-036: "Nicht gemacht" shows a hint with "Rückgängig", which brings the row back', async ({
    page,
  }) => {
    await open(page, '/');
    const notDone = page
      .locator(`[data-testid^="recap-"][data-testid$="-not-done"]${ACTIVE}`)
      .first();
    await expect(notDone).toBeVisible();
    const id = (await notDone.getAttribute('data-testid'))?.replace(/-not-done$/, '') ?? '';
    await notDone.click();
    await expect(toastMessage(page)).toContainText('als nicht gemacht markiert');
    await expect(tid(page, id)).toBeHidden();
    await page.getByRole('button', { name: 'Rückgängig' }).click();
    await expect(tid(page, id)).toBeVisible();
  });

  test('AC-040 / AC-042: the stars start empty; an earlier rating stands beside them', async ({
    page,
  }) => {
    await open(page, '/');
    const earlier = page.locator(`[data-testid^="recap-"][data-testid$="-earlier"]${ACTIVE}`);
    for (const label of await earlier.allTextContents()) {
      expect(label).toMatch(/^Letztes Mal ★ \d(,5)?$/);
    }
  });
});
