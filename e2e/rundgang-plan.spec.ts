import type { Locator, Page } from '@playwright/test';

import {
  ACTIVE,
  SLOT_DINNER,
  SLOT_LUNCH,
  TODAY,
  back,
  day,
  expect,
  nav,
  only,
  open,
  openSettings,
  test,
  tid,
} from './helpers';

// Spec 0001 — the weekly meal plan (REQ-006) and absences (AC-038).
// Fixed today is Monday 16 Nov 2026: day(3) is Thursday (no dinner), day(5) is Saturday.

only('phone');

const THURSDAY = day(3);
const SATURDAY = day(5);

/** The block of one meal on the phone layout: its heading row with "hinzufügen" plus its dishes. */
function meal(page: Page, date: string, slot: string): Locator {
  return tid(page, `add-${date}-${slot}`).locator('xpath=../..');
}

/** The dishes of one meal. */
function dishes(page: Page, date: string, slot: string): Locator {
  return meal(page, date, slot).locator(`[data-testid^="entry-plan-"]${ACTIVE}`);
}

async function pickRecipe(page: Page, search: string, recipeId: string): Promise<void> {
  await tid(page, 'add-entry-search').fill(search);
  await tid(page, `add-entry-recipe-${recipeId}`).click();
}

test('AC-024: Mango-Curry for both splits "mit Tofu 1 · mit Hähnchen 1" and shows it in the plan', async ({
  page,
}) => {
  await open(page, '/plan');
  await expect(dishes(page, THURSDAY, SLOT_DINNER)).toHaveCount(0);
  await tid(page, `add-${THURSDAY}-${SLOT_DINNER}`).click();
  await pickRecipe(page, 'Mango', 'rec-mango-curry');
  await expect(tid(page, 'eater-m-enrico')).toHaveAttribute('aria-selected', 'true');
  await expect(tid(page, 'eater-m-nadja')).toHaveAttribute('aria-selected', 'true');
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
  await open(page, '/plan');
  await tid(page, `add-${THURSDAY}-${SLOT_DINNER}`).click();
  await pickRecipe(page, 'Bolognese', 'rec-spaghetti-bolognese');
  await expect(tid(page, 'eater-m-enrico')).toHaveAttribute('aria-selected', 'true');
  await expect(tid(page, 'eater-m-nadja')).toHaveAttribute('aria-selected', 'true');
  await expect(tid(page, 'add-entry-misfit')).toHaveText('Passt nicht für Nadja');
  await tid(page, 'add-entry-save').click();

  const entry = dishes(page, THURSDAY, SLOT_DINNER);
  await expect(entry).toContainText('Spaghetti Bolognese');
  await expect(entry.locator('[data-testid^="entry-misfit-"]')).toHaveText('Passt nicht für Nadja');
});

test('AC-026: free text on a day, and a dish noted without a day under "Vorgemerkt"', async ({
  page,
}) => {
  await open(page, '/plan');
  await tid(page, `add-${THURSDAY}-${SLOT_DINNER}`).click();
  await tid(page, 'add-entry-mode-text').click();
  await tid(page, 'add-entry-text').fill('Essen bei Oma');
  await tid(page, 'add-entry-text-save').click();
  const thursday = dishes(page, THURSDAY, SLOT_DINNER);
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
  await open(page, '/plan');
  const tonight = dishes(page, TODAY, SLOT_DINNER);
  await expect(tonight).toHaveCount(1);
  await expect(tonight).toContainText('Lasagne');

  await tid(page, `add-${TODAY}-${SLOT_DINNER}`).click();
  await pickRecipe(page, 'Salat', 'rec-gemischter-salat');
  await tid(page, 'cook-m-nadja').click();
  await expect(tid(page, 'cook-m-nadja')).toHaveAttribute('aria-selected', 'true');
  await tid(page, 'add-entry-save').click();

  await expect(tonight).toHaveCount(2);
  const lasagne = tonight.filter({ hasText: 'Lasagne' });
  const salad = tonight.filter({ hasText: 'Gemischter Salat' });
  await expect(lasagne.locator('[data-testid^="entry-cook-"]')).toHaveAttribute(
    'aria-label',
    'Enrico kocht',
  );
  await expect(salad.locator('[data-testid^="entry-cook-"]')).toHaveAttribute(
    'aria-label',
    'Nadja kocht',
  );

  await nav(page, 'index');
  const meals = tid(page, 'today-meals');
  const lasagneCard = meals.locator('[data-testid^="today-meal-"]').filter({ hasText: 'Lasagne' });
  const saladCard = meals
    .locator('[data-testid^="today-meal-"]')
    .filter({ hasText: 'Gemischter Salat' });
  await expect(lasagneCard).toContainText('Enrico kocht');
  await expect(saladCard).toContainText('Nadja kocht');
});

test('AC-027: moving Lasagne from Monday to Thursday', async ({ page }) => {
  await open(page, '/plan');
  // The fixed today is a Monday; Lasagne is planned for tonight.
  await expect(tid(page, `day-${TODAY}`)).toContainText('Mo');
  await dishes(page, TODAY, SLOT_DINNER).filter({ hasText: 'Lasagne' }).click();
  await expect(tid(page, 'entry-sheet')).toBeVisible();
  await tid(page, `entry-move-${THURSDAY}`).click();

  await expect(tid(page, `day-${THURSDAY}`)).toContainText('Do');
  await expect(dishes(page, THURSDAY, SLOT_DINNER).filter({ hasText: 'Lasagne' })).toHaveCount(1);
  await expect(dishes(page, TODAY, SLOT_DINNER).filter({ hasText: 'Lasagne' })).toHaveCount(0);
});

test('AC-038: with Enrico away on Saturday only Nadja is preselected for that day', async ({
  page,
}) => {
  await open(page, '/');
  await openSettings(page);
  await tid(page, 'absence-new').click();
  await expect(tid(page, 'absence-member-m-enrico')).toHaveAttribute('aria-selected', 'true');
  await tid(page, `absence-from-${day(4)}`).click();
  await tid(page, `absence-to-${SATURDAY}`).click();
  await tid(page, 'absence-save').click();
  await expect(tid(page, 'absence-list')).toContainText('Enrico');
  await back(page);

  await nav(page, 'plan');
  await tid(page, `add-${SATURDAY}-${SLOT_LUNCH}`).click();
  await pickRecipe(page, 'Shakshuka', 'rec-shakshuka');
  await expect(tid(page, 'eater-m-enrico')).toHaveAttribute('aria-selected', 'false');
  await expect(tid(page, 'eater-m-nadja')).toHaveAttribute('aria-selected', 'true');
});
