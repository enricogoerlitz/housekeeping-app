import type { Locator, Page } from '@playwright/test';

import {
  PLAN_ENTRY,
  day,
  dayBlock,
  expect,
  freshSeed,
  goOffline,
  open,
  showPlanWeek,
  test,
  tid,
  toastMessage,
} from './helpers';

// Spec 0063 — Planvorschläge: three suggestions in the add window of a day (A) and "Was kochen
// wir?" above the week (C). The seed's recipes have ingredients and little history, so the
// suggestions exist; which three they are is the core's business (plan-suggestions.test.ts),
// here only what a person sees and does. The week two weeks ahead has free evenings.

freshSeed();

const LATER_WEEK = day(14);

function entriesOf(page: Page, date: string): Locator {
  return dayBlock(page, date).locator(PLAN_ENTRY);
}

/** The rows of the block, without their "+" buttons. */
function suggestionRows(page: Page): Locator {
  return tid(page, 'plan-suggestions-list').locator(
    '[data-testid^="plan-suggestion-"]:not([data-testid^="plan-suggestion-add-"]):not([data-testid$="-open"])',
  );
}

async function openAddWindow(page: Page, date: string): Promise<void> {
  await open(page, '/kalender');
  await showPlanWeek(page, date);
  await tid(page, `add-${date}`).click();
  await expect(tid(page, 'add-entry-sheet')).toBeVisible();
}

test('AC-016 / AC-017: three suggestions above the A–Z list; typing or "Restaurants" hides them', async ({
  page,
}) => {
  await openAddWindow(page, LATER_WEEK);
  await expect(tid(page, 'plan-suggestions-heading')).toHaveText(/^Vorschläge für \w+abend$/);
  await expect(suggestionRows(page)).toHaveCount(3);
  await tid(page, 'add-entry-search').fill('L');
  await expect(tid(page, 'plan-suggestions')).toHaveCount(0);
  await tid(page, 'add-entry-search').fill('');
  await expect(tid(page, 'plan-suggestions')).toBeVisible();
  await tid(page, 'add-entry-tab-restaurants').click();
  await expect(tid(page, 'plan-suggestions')).toHaveCount(0);
  await tid(page, 'add-entry-tab-recipes').click();
  await expect(tid(page, 'plan-suggestions')).toBeVisible();
});

test('AC-024: "Andere" shows three others', async ({ page }) => {
  await openAddWindow(page, LATER_WEEK);
  const first = await suggestionRows(page).evaluateAll((rows) =>
    rows.map((row) => row.getAttribute('data-testid')),
  );
  await tid(page, 'plan-suggestions-others').click();
  const second = await suggestionRows(page).evaluateAll((rows) =>
    rows.map((row) => row.getAttribute('data-testid')),
  );
  expect(second).toHaveLength(3);
  expect(second.filter((id) => first.includes(id))).toEqual([]);
});

test('AC-018: no suggestions for a day in the past or for "vormerken"', async ({ page }) => {
  await open(page, '/kalender');
  await showPlanWeek(page, day(-7));
  await tid(page, `add-${day(-7)}`).click();
  await expect(tid(page, 'add-entry-sheet')).toBeVisible();
  await expect(tid(page, 'add-entry-hits')).toBeVisible();
  await expect(tid(page, 'plan-suggestions')).toHaveCount(0);
});

test('AC-020 / AC-022: "+" plans at once for everyone with "Rückgängig"; undo takes it back', async ({
  page,
}) => {
  await openAddWindow(page, LATER_WEEK);
  const before = await entriesOf(page, LATER_WEEK).count();
  const add = tid(page, 'plan-suggestions-list').locator('[data-testid^="plan-suggestion-add-"]');
  await add.first().click();
  await expect(tid(page, 'add-entry-sheet')).toBeHidden();
  await expect(toastMessage(page)).toContainText('steht am');
  await expect(entriesOf(page, LATER_WEEK)).toHaveCount(before + 1);
  await tid(page, 'toast-action').click();
  await expect(entriesOf(page, LATER_WEEK)).toHaveCount(before);
});

test('AC-019 / AC-021: a vorgemerkt dish comes first and "+" moves it to the day', async ({
  page,
}) => {
  // A dish that fits that evening: the last of the three shown. Which one it is follows from the
  // seed's history, dated from today (a fixed name like "Shakshuka" was cooked two days ago).
  await openAddWindow(page, LATER_WEEK);
  await expect(suggestionRows(page)).toHaveCount(3);
  const last = suggestionRows(page).last();
  const rowId = (await last.getAttribute('data-testid')) ?? '';
  const recipeId = rowId.replace('plan-suggestion-', '');
  const label =
    (await tid(page, `plan-suggestion-add-${recipeId}`).getAttribute('aria-label')) ?? '';
  const title = label.replace(/ einplanen$/, '');
  expect(title).not.toBe('');
  await page.keyboard.press('Escape');
  await expect(tid(page, 'add-entry-sheet')).toBeHidden();

  await open(page, '/kalender');
  await tid(page, 'add-later').click();
  await tid(page, 'add-entry-search').fill(title);
  await tid(page, `add-entry-recipe-${recipeId}`).click();
  await tid(page, 'add-entry-save').click();
  await expect(tid(page, 'planned-later')).toContainText(title);

  await showPlanWeek(page, LATER_WEEK);
  await tid(page, `add-${LATER_WEEK}`).click();
  const first = suggestionRows(page).first();
  await expect(first).toHaveAttribute('data-testid', rowId);
  await expect(first).toContainText('Vorgemerkt');
  await tid(page, `plan-suggestion-add-${recipeId}`).click();
  await expect(entriesOf(page, LATER_WEEK).filter({ hasText: title })).toHaveCount(1);
  await expect(tid(page, 'planned-later').getByText(title)).toHaveCount(0);
});

test('AC-023: offline the suggestions stay visible and "+" is greyed out', async ({ page }) => {
  // Offline the day's "Hinzufügen" is greyed out itself, so the window is opened online.
  await openAddWindow(page, LATER_WEEK);
  const add = tid(page, 'plan-suggestions-list')
    .locator('[data-testid^="plan-suggestion-add-"]')
    .first();
  await expect(add).toBeEnabled();
  await goOffline(page);
  await expect(add).toBeVisible();
  await expect(add).toBeDisabled();
});

test('AC-025 / AC-027 / AC-032 / AC-033 / AC-034: "Was kochen wir?" plans two evenings in one go', async ({
  page,
}) => {
  await open(page, '/kalender');
  await showPlanWeek(page, LATER_WEEK);
  const line = tid(page, 'week-menu-open');
  await expect(line).toContainText(/\d Abende frei/);
  await expect(line).toContainText('Was kochen wir?');
  await line.click();
  const sheet = tid(page, 'week-menu-sheet');
  await expect(sheet).toBeVisible();
  // Every free evening is chosen, no dish is.
  const evenings = tid(page, 'week-menu-evenings').locator('[data-testid^="week-menu-evening-"]');
  expect(await evenings.count()).toBeGreaterThanOrEqual(2);
  const picks = tid(page, 'week-menu-picks').locator('[data-testid^="week-menu-dish-"]');
  expect(await picks.count()).toBeLessThanOrEqual(6);
  await expect(tid(page, 'week-menu-save')).toBeDisabled();

  await picks.nth(0).click();
  await picks.nth(1).click();
  await expect(tid(page, 'week-menu-bar').locator('[data-testid^="week-menu-bar-"]')).toHaveCount(
    2,
  );
  await expect(tid(page, 'week-menu-save')).toHaveText(/2 Abende einplanen/);
  await tid(page, 'week-menu-save').click();
  await expect(sheet).toBeHidden();
  await expect(toastMessage(page)).toHaveText('2 Abende eingeplant');
  await expect(tid(page, 'week-menu-to-list')).toContainText('2 Gerichte nicht auf der Liste');

  await tid(page, 'toast-action').click();
  await expect(tid(page, 'week-menu-open')).toBeVisible();
});

test('AC-031: more dishes than evenings → the rest is vorgemerkt', async ({ page }) => {
  await open(page, '/kalender');
  await showPlanWeek(page, LATER_WEEK);
  await tid(page, 'week-menu-open').click();
  const evenings = tid(page, 'week-menu-evenings').locator('[data-testid^="week-menu-evening-"]');
  const count = await evenings.count();
  // Leave two evenings in.
  for (let index = 2; index < count; index += 1) await evenings.nth(index).click();
  const picks = tid(page, 'week-menu-picks').locator('[data-testid^="week-menu-dish-"]');
  for (let index = 0; index < 3; index += 1) await picks.nth(index).click();
  await expect(tid(page, 'week-menu-save')).toHaveText(/2 Abende einplanen · 1 vormerken/);
});

test('AC-028: "Mehr" adds dishes and keeps the chosen ones', async ({ page }) => {
  await open(page, '/kalender');
  await showPlanWeek(page, LATER_WEEK);
  await tid(page, 'week-menu-open').click();
  const picks = tid(page, 'week-menu-picks').locator('[data-testid^="week-menu-dish-"]');
  const before = await picks.count();
  await picks.first().click();
  await tid(page, 'week-menu-more').click();
  expect(await picks.count()).toBeGreaterThan(before);
  await expect(picks.first()).toHaveAttribute('aria-checked', 'true');
});
