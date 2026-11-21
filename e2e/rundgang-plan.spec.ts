import type { Locator, Page } from '@playwright/test';

import {
  ENRICO,
  NADJA,
  PLAN_ENTRY,
  SLOT_DINNER,
  SLOT_LUNCH,
  TODAY,
  back,
  day,
  expect,
  freshSeed,
  inThisWeek,
  nav,
  only,
  open,
  openSettings,
  showPlanWeek,
  test,
  tid,
} from './helpers';
import { seedIds } from './seed-ids';

// Spec 0001 — the weekly meal plan (REQ-006) and absences (AC-038), against the local backend.
// The seed is dated from the real today, not from a Monday: the AC's "Monday" is today, its
// "Thursday" is today + 3 (no dish planned, AC-024) and its "Saturday" today + 5. Days outside
// the current Monday–Sunday week are reached with the week arrows. The tests add to the plan in
// order, so the file starts from a fresh seed.

only('phone');
freshSeed();

const THURSDAY = day(3);
const SATURDAY = day(5);
const member = (key: 'm-enrico' | 'm-nadja') => seedIds[key];

/** The block of one meal on the phone layout: its heading row with "hinzufügen" plus its dishes. */
function meal(page: Page, date: string, slot: string): Locator {
  return tid(page, `add-${date}-${slot}`).locator('xpath=../..');
}

/** The dishes of one meal. */
function dishes(page: Page, date: string, slot: string): Locator {
  return meal(page, date, slot).locator(PLAN_ENTRY);
}

async function pickRecipe(page: Page, search: string, slug: keyof typeof seedIds): Promise<void> {
  await tid(page, 'add-entry-search').fill(search);
  await tid(page, `add-entry-recipe-${seedIds[slug]}`).click();
}

/** Opens the plan at the week of `date`. */
async function openPlanAt(page: Page, date: string): Promise<void> {
  await open(page, '/kalender');
  await showPlanWeek(page, date);
}

test('AC-024: Mango-Curry for both splits "mit Tofu 1 · mit Hähnchen 1" and shows it in the plan', async ({
  page,
}) => {
  await openPlanAt(page, THURSDAY);
  await expect(dishes(page, THURSDAY, SLOT_DINNER)).toHaveCount(0);
  await tid(page, `add-${THURSDAY}-${SLOT_DINNER}`).click();
  await pickRecipe(page, 'Mango', 'rec-mango-curry');
  await expect(tid(page, `eater-${member('m-enrico')}`)).toHaveAttribute('aria-selected', 'true');
  await expect(tid(page, `eater-${member('m-nadja')}`)).toHaveAttribute('aria-selected', 'true');
  await expect(tid(page, 'add-entry-split')).toHaveText('mit Tofu 1 · mit Hähnchen 1');
  await tid(page, 'add-entry-save').click();

  const entry = dishes(page, THURSDAY, SLOT_DINNER);
  await expect(entry).toHaveCount(1);
  await expect(entry).toContainText('Mango-Curry');
  await expect(entry.locator('[data-testid^="entry-variants-"]')).toHaveText(
    'mit Tofu 1 · mit Hähnchen 1',
  );
});

test('AC-025: Spaghetti Bolognese for Enrico and Nadja is marked "Passt nicht für Nadja"', async ({
  page,
}) => {
  await openPlanAt(page, THURSDAY);
  await tid(page, `add-${THURSDAY}-${SLOT_DINNER}`).click();
  await pickRecipe(page, 'Bolognese', 'rec-spaghetti-bolognese');
  await expect(tid(page, `eater-${member('m-enrico')}`)).toHaveAttribute('aria-selected', 'true');
  await expect(tid(page, `eater-${member('m-nadja')}`)).toHaveAttribute('aria-selected', 'true');
  await expect(tid(page, 'add-entry-misfit')).toHaveText(`Passt nicht für ${NADJA}`);
  await tid(page, 'add-entry-save').click();

  // AC-024 put Mango-Curry on the same meal before.
  const entry = dishes(page, THURSDAY, SLOT_DINNER).filter({ hasText: 'Spaghetti Bolognese' });
  await expect(entry).toHaveCount(1);
  await expect(entry.locator('[data-testid^="entry-misfit-"]')).toHaveText(
    `Passt nicht für ${NADJA}`,
  );
});

test('AC-026: free text on a day, and a dish noted without a day under "Vorgemerkt"', async ({
  page,
}) => {
  // Lunch of the same day: its dinner already has the dishes of AC-024 and AC-025.
  await openPlanAt(page, THURSDAY);
  await tid(page, `add-${THURSDAY}-${SLOT_LUNCH}`).click();
  await tid(page, 'add-entry-mode-text').click();
  await tid(page, 'add-entry-text').fill('Essen bei Oma');
  await tid(page, 'add-entry-text-save').click();
  const thursday = dishes(page, THURSDAY, SLOT_LUNCH);
  await expect(thursday).toHaveCount(1);
  await expect(thursday).toHaveAttribute('aria-label', 'Essen bei Oma');

  await expect(tid(page, 'planned-later')).not.toContainText('Shakshuka');
  await tid(page, 'add-later').click();
  await pickRecipe(page, 'Shakshuka', 'rec-shakshuka');
  await tid(page, 'add-entry-save').click();
  await expect(tid(page, 'planned-later')).toContainText('Shakshuka');
});

test('AC-048: a second dish in tonight’s meal, each with its cook; Heute shows both', async ({
  page,
}) => {
  await open(page, '/kalender');
  const tonight = dishes(page, TODAY, SLOT_DINNER);
  await expect(tonight).toHaveCount(1);
  await expect(tonight).toContainText('Lasagne');

  await tid(page, `add-${TODAY}-${SLOT_DINNER}`).click();
  await pickRecipe(page, 'Salat', 'rec-gemischter-salat');
  await tid(page, `cook-${member('m-nadja')}`).click();
  await expect(tid(page, `cook-${member('m-nadja')}`)).toHaveAttribute('aria-selected', 'true');
  await tid(page, 'add-entry-save').click();

  await expect(tonight).toHaveCount(2);
  const lasagne = tonight.filter({ hasText: 'Lasagne' });
  const salad = tonight.filter({ hasText: 'Gemischter Salat' });
  await expect(lasagne.locator('[data-testid^="entry-cook-"]')).toHaveAttribute(
    'aria-label',
    `${ENRICO} kocht`,
  );
  await expect(salad.locator('[data-testid^="entry-cook-"]')).toHaveAttribute(
    'aria-label',
    `${NADJA} kocht`,
  );

  await nav(page, 'index');
  const meals = tid(page, 'today-meals');
  const lasagneCard = meals.locator('[data-testid^="today-meal-"]').filter({ hasText: 'Lasagne' });
  const saladCard = meals
    .locator('[data-testid^="today-meal-"]')
    .filter({ hasText: 'Gemischter Salat' });
  await expect(lasagneCard).toContainText(`${ENRICO} kocht`);
  await expect(saladCard).toContainText(`${NADJA} kocht`);
});

test('AC-027: moving Lasagne from Monday to Thursday', async ({ page }) => {
  // Lasagne is planned for tonight. The sheet moves within the shown week: three days later
  // when that is still this week (Monday → Thursday as in the AC), otherwise three days earlier.
  const target = inThisWeek(day(3)) ? day(3) : day(-3);
  await open(page, '/kalender');
  await expect(tid(page, `day-${TODAY}`)).toBeVisible();
  await dishes(page, TODAY, SLOT_DINNER).filter({ hasText: 'Lasagne' }).click();
  await expect(tid(page, 'entry-sheet')).toBeVisible();
  await tid(page, `entry-move-${target}`).click();

  await expect(dishes(page, target, SLOT_DINNER).filter({ hasText: 'Lasagne' })).toHaveCount(1);
  await expect(dishes(page, TODAY, SLOT_DINNER).filter({ hasText: 'Lasagne' })).toHaveCount(0);
});

test('AC-038: with Enrico away on Saturday only Nadja is preselected for that day', async ({
  page,
}) => {
  await open(page, '/');
  await openSettings(page);
  await tid(page, 'absence-new').click();
  await expect(tid(page, `absence-member-${member('m-enrico')}`)).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await tid(page, `absence-from-${day(4)}`).click();
  await tid(page, `absence-to-${SATURDAY}`).click();
  await tid(page, 'absence-save').click();
  await expect(tid(page, 'absence-list')).toContainText(ENRICO);
  await back(page);

  await nav(page, 'kalender');
  await showPlanWeek(page, SATURDAY);
  await tid(page, `add-${SATURDAY}-${SLOT_LUNCH}`).click();
  await pickRecipe(page, 'Shakshuka', 'rec-shakshuka');
  await expect(tid(page, `eater-${member('m-enrico')}`)).toHaveAttribute('aria-selected', 'false');
  await expect(tid(page, `eater-${member('m-nadja')}`)).toHaveAttribute('aria-selected', 'true');
});
