import type { Page } from '@playwright/test';

import {
  back,
  expect,
  leaveManaged,
  login,
  nav,
  openManaged,
  openSettings,
  showPlanWeek,
  SLOT_DINNER,
  switchHousehold,
  test,
  tid,
  TODAY,
} from '../helpers';
import { seedIds } from '../seed-ids';

// Dev-mode smoke test (playwright.dev.config.ts): every screen once, in the states that have
// broken before (a restaurant planned for today on "Heute", a household with nothing planned),
// against the Expo dev server. The shared fixture fails on uncaught errors and console.error;
// this file also fails on every console warning, which is where React reports nested buttons,
// missing keys and act() problems in development.

/** Collects console warnings of the page for the end of the test. */
function warningsOf(page: Page): string[] {
  const warnings: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'warning') warnings.push(message.text());
  });
  return warnings;
}

test('dev smoke: every screen renders without a React warning or error', async ({ page }) => {
  const warnings = warningsOf(page);
  await login(page, 'enrico');

  // A restaurant for tonight: "Heute" shows its card with the route button.
  await nav(page, 'plan');
  await tid(page, `add-${TODAY}-${SLOT_DINNER}`).click();
  await tid(page, 'add-entry-mode-restaurant').click();
  await tid(page, `add-entry-restaurant-${seedIds['rest-enzo']}`).click();
  await tid(page, 'add-entry-restaurant-save').click();
  await showPlanWeek(page, TODAY);
  await nav(page, 'index');
  await expect(tid(page, 'today-meals')).toContainText('Trattoria Da Enzo');

  // Essen: list, recipe, cooking mode, restaurants and one restaurant.
  await nav(page, 'rezepte');
  await tid(page, `recipe-card-${seedIds['rec-mango-curry']}`).click();
  await expect(tid(page, 'recipe-title')).toHaveText('Mango-Curry');
  await tid(page, 'start-cooking').click();
  await expect(tid(page, 'cooking-screen')).toBeVisible();
  await tid(page, 'cook-close').click();
  await back(page);
  await tid(page, 'food-switch-restaurants').click();
  await tid(page, `restaurant-${seedIds['rest-pho']}`).click();
  await expect(tid(page, 'restaurant-title')).toHaveText('Pho Saigon');
  await back(page);

  // Plan → Aktivitäten: the collection, one activity on its own page, the add sheet's new kind
  // and its "Neu anlegen" form.
  await nav(page, 'plan');
  await tid(page, 'plan-view-activities').click();
  await tid(page, `activity-${seedIds['act-eislaufen']}`).click();
  await expect(tid(page, 'activity-title')).toHaveText('Eislaufen');
  await tid(page, 'activity-plan').click();
  await expect(tid(page, 'add-entry-activity-chosen')).toHaveText('Eislaufen');
  await tid(page, 'add-entry-sheet-close').click();
  await back(page);
  await tid(page, 'plan-view-week').click();
  await tid(page, `add-${TODAY}-${SLOT_DINNER}`).click();
  await tid(page, 'add-entry-mode-activity').click();
  await tid(page, 'add-entry-new-activity').click();
  await expect(tid(page, 'activity-name')).toBeVisible();
  await tid(page, 'add-entry-sheet-close').click();
  // The other kinds' "Neu anlegen" forms in the same sheet.
  await tid(page, `add-${TODAY}-${SLOT_DINNER}`).click();
  await tid(page, 'add-entry-new-recipe').click();
  await expect(tid(page, 'new-recipe-title')).toBeVisible();
  await tid(page, 'add-entry-new-back').click();
  await tid(page, 'add-entry-mode-restaurant').click();
  await tid(page, 'add-entry-new-restaurant').click();
  await expect(tid(page, 'restaurant-link')).toBeVisible();
  await tid(page, 'add-entry-sheet-close').click();

  // Plan with its pantry check, the list and store mode, the household.
  await tid(page, 'plan-to-list').click();
  await expect(tid(page, 'pantry-check-sheet')).toBeVisible();
  await tid(page, 'pantry-check-sheet-close').click();
  await nav(page, 'liste');
  await tid(page, 'start-shopping').click();
  await expect(tid(page, 'shopping-progress')).toBeVisible();
  await tid(page, 'shopping-close').click();
  await nav(page, 'haushalt');
  await expect(tid(page, 'chores-screen')).toBeVisible();
  await tid(page, 'chores-tab-history').click();
  await tid(page, 'chores-tab-all').click();

  // Settings, and every page under "Verwalten" (spec 0005): stores and one store, absences,
  // household and members, feedback. The AI is switched off, so there is no assistant to open.
  await nav(page, 'index');
  await openSettings(page);
  await back(page);
  await openManaged(page, 'stores');
  await tid(page, `store-${seedIds['store-rewe']}`).click();
  await expect(tid(page, 'store-order-screen')).toBeVisible();
  await back(page);
  await leaveManaged(page);
  for (const [key, screen] of [
    ['absences', 'absences-screen'],
    ['members', 'members-screen'],
    ['feedback', 'feedback'],
  ] as const) {
    await openManaged(page, key);
    await expect(tid(page, screen)).toBeVisible();
    await leaveManaged(page);
  }

  // A household with nothing planned and no chores: the empty states.
  await switchHousehold(page, seedIds['hh-test']);
  await expect(tid(page, 'today-screen')).toBeVisible();
  for (const key of ['rezepte', 'plan', 'liste', 'haushalt', 'index'] as const) {
    await nav(page, key);
  }
  await nav(page, 'plan');
  await tid(page, 'plan-view-activities').click();
  await expect(tid(page, 'activities-empty')).toBeVisible();

  expect(warnings, 'console warnings').toEqual([]);
});
