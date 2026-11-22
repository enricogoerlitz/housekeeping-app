import type { Locator, Page } from '@playwright/test';

import {
  ENRICO,
  NADJA,
  PLAN_ENTRY,
  SLOT_DINNER,
  TODAY,
  back,
  day,
  expect,
  freshSeed,
  inThisWeek,
  leaveManaged,
  nav,
  only,
  open,
  openManaged,
  showPlanWeek,
  test,
  tid,
  tidPrefix,
  toastMessage,
} from './helpers';
import { seedIds } from './seed-ids';

// Spec 0001 — the weekly meal plan (REQ-006) and absences (AC-038), now in "Kalender" (spec 0010):
// one "+ Hinzufügen" per day with one search for every kind, the second step in the same window,
// the views Woche, Monat and Jahr, and the page "Reisen". The seed is dated from the real
// today: "Thursday" of the ACs is today + 3 (no dish planned), "Saturday" today + 5. The tests add
// to the calendar in order, so the file starts from a fresh seed.

only('phone');
freshSeed();

const THURSDAY = day(3);
const SATURDAY = day(5);
const member = (key: 'm-enrico' | 'm-nadja') => seedIds[key];

/** One day on the phone week: its head `day-<date>` and everything planned on it. */
function dayBlock(page: Page, date: string): Locator {
  return tid(page, `day-${date}`).locator('xpath=..');
}

/** The calendar rows of one day. */
function entries(page: Page, date: string): Locator {
  return dayBlock(page, date).locator(PLAN_ENTRY);
}

async function pickRecipe(page: Page, search: string, slug: keyof typeof seedIds): Promise<void> {
  await tid(page, 'add-entry-search').fill(search);
  await tid(page, `add-entry-recipe-${seedIds[slug]}`).click();
}

/** Opens the calendar at the week of `date`. */
async function openCalendarAt(page: Page, date: string): Promise<void> {
  await open(page, '/kalender');
  await showPlanWeek(page, date);
}

/**
 * Picks "Von" and "Bis" in the absence window's month calendar: the first tap sets "Von", the
 * next one "Bis" (spec 0010, AC-042).
 */
async function pickRange(page: Page, from: string, to: string): Promise<void> {
  await tid(page, 'absence-from').click();
  for (const date of [from, to]) {
    for (let step = 0; step < 3 && !(await tid(page, `range-day-${date}`).isVisible()); step += 1) {
      await tid(page, 'range-next').click();
    }
    await tid(page, `range-day-${date}`).click();
  }
}

test('AC-024 (0001) / AC-021 / AC-023 (0010): Mango-Curry for both splits the variants; the second step has a way back', async ({
  page,
}) => {
  await openCalendarAt(page, THURSDAY);
  await expect(entries(page, THURSDAY).filter({ hasText: 'Mango-Curry' })).toHaveCount(0);
  await tid(page, `add-${THURSDAY}`).click();
  const sheet = tid(page, 'add-entry-sheet');
  for (const tab of ['all', 'recipes', 'collections', 'restaurants', 'activities']) {
    await expect(tid(page, `add-entry-tab-${tab}`), tab).toBeVisible();
  }
  await pickRecipe(page, 'Mango', 'rec-mango-curry');
  // A day without a Tageszeit preselects the evening.
  await expect(tid(page, `add-entry-slot-${SLOT_DINNER}`)).toHaveAttribute('aria-checked', 'true');
  await expect(tid(page, `eater-${member('m-enrico')}`)).toHaveAttribute('aria-selected', 'true');
  await expect(tid(page, `eater-${member('m-nadja')}`)).toHaveAttribute('aria-selected', 'true');
  await expect(tid(page, 'add-entry-split')).toHaveText('mit Tofu 1 · mit Hähnchen 1');
  await tid(page, 'add-entry-step-back').click();
  await expect(tid(page, `add-entry-recipe-${seedIds['rec-mango-curry']}`)).toBeVisible();
  await tid(page, `add-entry-recipe-${seedIds['rec-mango-curry']}`).click();
  await tid(page, 'add-entry-save').click();
  await expect(sheet).toBeHidden();
  await expect(entries(page, THURSDAY).filter({ hasText: 'Mango-Curry' })).toHaveCount(1);
});

test('AC-025: Spaghetti Bolognese for Enrico and Nadja is marked "Passt nicht für Nadja"', async ({
  page,
}) => {
  await openCalendarAt(page, THURSDAY);
  await tid(page, `add-${THURSDAY}`).click();
  await pickRecipe(page, 'Bolognese', 'rec-spaghetti-bolognese');
  await expect(tid(page, `eater-${member('m-nadja')}`)).toHaveAttribute('aria-selected', 'true');
  await expect(tid(page, 'add-entry-misfit')).toHaveText(`Passt nicht für ${NADJA}`);
  await tid(page, 'add-entry-save').click();
  await expect(entries(page, THURSDAY).filter({ hasText: 'Spaghetti Bolognese' })).toHaveCount(1);
});

test('AC-026 (0001) / AC-024 (0010): no hits still offer free text; a dish without a day goes under "Vorgemerkt"', async ({
  page,
}) => {
  await openCalendarAt(page, THURSDAY);
  await tid(page, `add-${THURSDAY}`).click();
  await tid(page, 'add-entry-search').fill('qwertz');
  await expect(tidPrefix(page, 'add-entry-recipe-')).toHaveCount(0);
  await expect(tid(page, 'add-entry-new-text')).toHaveText(/„qwertz“ als Freitext eintragen/);
  await tid(page, 'add-entry-search').fill('Essen bei Oma');
  await tid(page, 'add-entry-new-text').click();
  await expect(tid(page, 'add-entry-text')).toHaveValue('Essen bei Oma');
  await tid(page, 'add-entry-save').click();
  await expect(entries(page, THURSDAY).filter({ hasText: 'Essen bei Oma' })).toHaveCount(1);

  await expect(tid(page, 'planned-later')).not.toContainText('Shakshuka');
  await tid(page, 'add-later').click();
  await pickRecipe(page, 'Shakshuka', 'rec-shakshuka');
  await tid(page, 'add-entry-save').click();
  await expect(tid(page, 'planned-later')).toContainText('Shakshuka');
});

test('AC-048: a second dish in tonight’s meal, each with its cook; the Übersicht shows both', async ({
  page,
}) => {
  await open(page, '/kalender');
  await expect(entries(page, TODAY).filter({ hasText: 'Lasagne' })).toHaveCount(1);
  await tid(page, `add-${TODAY}`).click();
  await pickRecipe(page, 'Salat', 'rec-gemischter-salat');
  await tid(page, `cook-${member('m-nadja')}`).click();
  await expect(tid(page, `cook-${member('m-nadja')}`)).toHaveAttribute('aria-selected', 'true');
  await tid(page, 'add-entry-save').click();
  await expect(entries(page, TODAY).filter({ hasText: 'Gemischter Salat' })).toHaveCount(1);

  await nav(page, 'index');
  const cards = tid(page, 'today-meals').locator('[data-testid^="today-meal-"]');
  await expect(cards.filter({ hasText: 'Lasagne' })).toContainText(`${ENRICO} kocht`);
  await expect(cards.filter({ hasText: 'Gemischter Salat' })).toContainText(`${NADJA} kocht`);
});

test('AC-027: moving Lasagne to another day of the week', async ({ page }) => {
  // Three days later when that is still this week, otherwise three days earlier.
  const target = inThisWeek(day(3)) ? day(3) : day(-3);
  await open(page, '/kalender');
  await tid(page, `entry-${seedIds['plan-2']}`).click();
  await expect(tid(page, 'entry-sheet')).toBeVisible();
  await tid(page, `entry-move-${target}`).click();
  await expect(entries(page, target).filter({ hasText: 'Lasagne' })).toHaveCount(1);
  await expect(entries(page, TODAY).filter({ hasText: 'Lasagne' })).toHaveCount(0);
});

test('AC-014 / AC-025 (0010): Woche, Monat and Jahr; ▲ opens "Aktivitäten" and back returns to the week', async ({
  page,
}) => {
  await open(page, '/kalender');
  await expect(tid(page, 'calendar-title')).toHaveText(/^KW \d+ · /);
  await tid(page, 'calendar-view-month').click();
  await expect(tid(page, 'month-phone')).toBeVisible();
  await expect(tid(page, `month-day-${TODAY}`)).toBeVisible();
  await tid(page, 'calendar-view-year').click();
  await expect(tid(page, 'year-view')).toBeVisible();
  await expect(tidPrefix(page, 'year-month-')).toHaveCount(12);
  // The month name opens the month; a day opens the day window (spec 0016, AC-023).
  await tid(page, 'year-month-3-open').click();
  await expect(tid(page, 'month-phone')).toBeVisible();
  await expect(tid(page, 'calendar-title')).toHaveText(/^März /);
  await tid(page, 'calendar-view-week').click();
  await tid(page, 'week-today').click();
  await expect(tid(page, `day-${TODAY}`)).toBeVisible();

  await tid(page, 'calendar-activities').click();
  await expect(tid(page, 'activities-title')).toBeVisible();
  await expect(tid(page, 'back')).toContainText('Kalender');
  await back(page);
  await expect(tid(page, 'calendar-view-week')).toHaveAttribute('aria-selected', 'true');
  await expect(tid(page, `day-${TODAY}`)).toBeVisible();
});

test('AC-035 / AC-044 (0010): "Bis" before "Von" and nobody chosen save nothing', async ({
  page,
}) => {
  await open(page, '/');
  await openManaged(page, 'absences');
  await tid(page, 'absence-new').click();
  await expect(tid(page, 'absence-sheet')).toContainText('Reise eintragen');
  await pickRange(page, day(5), day(5));
  await tid(page, 'absence-to').click();
  await tid(page, `range-day-${day(4)}`).click();
  await expect(tid(page, 'absence-to-error')).toHaveText('„Bis“ liegt vor „Von“');
  for (const key of ['m-enrico', 'm-nadja'] as const) {
    const chip = tid(page, `absence-member-${member(key)}`);
    if ((await chip.getAttribute('aria-selected')) === 'true') await chip.click();
  }
  await expect(tid(page, 'absence-save')).toBeDisabled();
  await expect(tid(page, 'absence-who-hint')).toHaveText('Wähle, wer weg ist');
});

test('AC-038 (0001) / AC-033 / AC-037 (0010): with Enrico away on Saturday only Nadja is preselected', async ({
  page,
}) => {
  await open(page, '/');
  await openManaged(page, 'absences');
  await expect(tid(page, 'absences-screen')).toBeVisible();
  await tid(page, 'absence-new').click();
  const enrico = tid(page, `absence-member-${member('m-enrico')}`);
  await expect(enrico).toHaveAttribute('aria-selected', 'true');
  await expect(tid(page, `absence-member-${member('m-nadja')}`)).toHaveAttribute(
    'aria-selected',
    'false',
  );
  await pickRange(page, day(4), SATURDAY);
  await tid(page, 'absence-note').fill('Fortbildung Köln');
  await tid(page, 'absence-save').click();
  await expect(tid(page, 'absence-sheet')).toBeHidden();
  await expect(tid(page, 'absences-upcoming')).toContainText('Fortbildung Köln');
  await leaveManaged(page);

  await nav(page, 'kalender');
  await showPlanWeek(page, SATURDAY);
  await tid(page, `add-${SATURDAY}`).click();
  await pickRecipe(page, 'Shakshuka', 'rec-shakshuka');
  await expect(tid(page, `eater-${member('m-enrico')}`)).toHaveAttribute('aria-selected', 'false');
  await expect(tid(page, `eater-${member('m-nadja')}`)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Escape');

  // AC-037: deleting a row without a packing list offers "Rückgängig" for 5 seconds.
  await open(page, '/reisen');
  const row = tid(page, 'absences-upcoming')
    .locator('[data-testid^="absence-"][data-testid$="-open"]')
    .filter({ hasText: 'Fortbildung Köln' });
  const rowId = ((await row.getAttribute('data-testid')) ?? '').replace(/-open$/, '');
  await tid(page, `${rowId}-remove`).click();
  await expect(toastMessage(page)).toHaveText('Reise gelöscht');
  await expect(tid(page, 'absences-upcoming')).not.toContainText('Fortbildung Köln');
  await tid(page, 'toast-action').click();
  await expect(tid(page, 'absences-upcoming')).toContainText('Fortbildung Köln');
});

test('AC-034 (0016): "Reisen" lives at /reisen and a trip at /kalender/reise/<id>; the old addresses are gone', async ({
  page,
}) => {
  const mallorca = seedIds['abs-mallorca'];
  await open(page, '/');
  await openManaged(page, 'absences');
  await expect(page).toHaveURL(/\/reisen$/);
  await expect(tid(page, 'absences-screen')).toContainText('Reisen');
  await tid(page, `absence-${mallorca}-open`).click();
  await expect(page).toHaveURL(new RegExp(`/kalender/reise/${mallorca}(\\?|$)`));
  await expect(tid(page, 'trip-title')).toHaveText('Urlaub Mallorca');

  for (const path of ['/abwesenheiten', `/kalender/urlaub/${mallorca}`]) {
    await open(page, path);
    await expect(tid(page, 'not-found')).toContainText('Nicht gefunden');
  }
});

test('AC-018 / AC-019 (0018): an exact recipe name offers no new recipe; a similar one still does', async ({
  page,
}) => {
  await openCalendarAt(page, THURSDAY);
  await tid(page, `add-${THURSDAY}`).click();
  await tid(page, 'add-entry-search').fill('lasagne ');
  await expect(tid(page, `add-entry-recipe-${seedIds['rec-lasagne']}`)).toBeVisible();
  await expect(tid(page, 'add-entry-new-recipe')).toHaveCount(0);
  await tid(page, 'add-entry-search').fill('Lasagne vegetarisch');
  await expect(tid(page, 'add-entry-new-recipe')).toHaveText(
    '+ „Lasagne vegetarisch“ als Rezept anlegen',
  );
});

test('AC-021 (0018): the absence window names who is chosen: "Nur Enrico", then "Ganzer Haushalt"', async ({
  page,
}) => {
  await open(page, '/');
  await openManaged(page, 'absences');
  await tid(page, 'absence-new').click();
  await expect(tid(page, `absence-member-${member('m-enrico')}`)).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(tid(page, 'absence-who-hint')).toHaveText(`Nur ${ENRICO}`);
  await tid(page, `absence-member-${member('m-nadja')}`).click();
  await expect(tid(page, 'absence-who-hint')).toHaveText('Ganzer Haushalt');
});
