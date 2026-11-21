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

  // A restaurant for tonight: "Heute" shows its card with the route button. On phones a day has
  // one "+ Hinzufügen" that preselects the evening (spec 0010, AC-008, AC-024).
  await nav(page, 'kalender');
  await tid(page, `add-${TODAY}`).click();
  await tid(page, 'add-entry-tab-restaurants').click();
  await tid(page, `add-entry-restaurant-${seedIds['rest-enzo']}`).click();
  await tid(page, 'add-entry-save').click();
  await showPlanWeek(page, TODAY);
  await nav(page, 'index');
  await expect(tid(page, 'today-meals')).toContainText('Trattoria Da Enzo');

  // Essen: list, recipe, cooking mode, restaurants and one restaurant.
  await nav(page, 'rezepte');
  // The filter row of "Essen" (spec 0008): the filter panel and the sort menu once.
  await tid(page, 'recipe-filters-filter').click();
  await expect(tid(page, 'recipe-filters-panel')).toBeVisible();
  await tid(page, 'recipe-filters-apply').click();
  await tid(page, 'recipe-sort').click();
  await expect(tid(page, 'recipe-sort-menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(tid(page, 'recipe-sort-menu')).toBeHidden();
  await tid(page, `recipe-card-${seedIds['rec-mango-curry']}`).click();
  await expect(tid(page, 'recipe-title')).toHaveText('Mango-Curry');
  // Ingredients with an article (spec 0007): "+ Zutat" with "Suchen oder anlegen", ⋯ at an
  // ingredient, "Mehrere einfügen" with its orange lines.
  await tid(page, 'recipe-add-ingredient').click();
  await tid(page, 'ingredient-article-search-input').fill('Kokos');
  await expect(
    tid(page, `ingredient-article-search-hit-${seedIds['art-kokosmilch']}`),
  ).toBeVisible();
  await tid(page, 'ingredient-sheet-close').click();
  await page.locator('[data-testid^="ingredient-menu-"]:visible').first().click();
  await expect(
    page.locator('[data-testid$="-article"][data-testid^="ingredient-menu-"]:visible'),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await tid(page, 'recipe-paste-ingredients').click();
  await tid(page, 'ingredients-paste').fill('1 Mango\n2 Drachenfrüchte');
  await tid(page, 'ingredients-paste-save').click();
  await expect(tid(page, 'ingredients-paste-missing')).toHaveText(
    '1 Zutat braucht noch einen Artikel',
  );
  await tid(page, 'ingredients-paste-sheet-close').click();
  // "Einplanen" opens its window on the page, ⋯ offers "Löschen" (spec 0008, AC-020, AC-034).
  await tid(page, 'recipe-plan').click();
  await expect(tid(page, 'plan-recipe-save')).toContainText('Abend einplanen');
  await tid(page, 'plan-recipe-sheet-close').click();
  await tid(page, 'recipe-more').click();
  await expect(tid(page, 'recipe-more-delete')).toBeVisible();
  await page.keyboard.press('Escape');
  await tid(page, 'start-cooking').click();
  await expect(tid(page, 'cooking-screen')).toBeVisible();
  await tid(page, 'cook-close').click();
  await back(page);
  await tid(page, 'food-switch-restaurants').click();
  await tid(page, `restaurant-${seedIds['rest-pho']}`).click();
  await expect(tid(page, 'restaurant-title')).toHaveText('Pho Saigon');
  await back(page);

  // Kalender → ▲ Aktivitäten: the page, one activity on its own page, the add sheet's tabs and
  // its "Neu anlegen" forms (spec 0010, REQ-007, REQ-008).
  await nav(page, 'kalender');
  await tid(page, 'calendar-activities').click();
  await expect(tid(page, 'activities-screen')).toBeVisible();
  await tid(page, `activity-${seedIds['act-eislaufen']}`).click();
  await expect(tid(page, 'activity-title')).toHaveText('Eislaufen');
  await tid(page, 'activity-plan').click();
  await expect(tid(page, 'add-entry-activity-chosen')).toHaveText('Eislaufen');
  await tid(page, 'add-entry-sheet-close').click();
  await back(page);
  await expect(tid(page, 'activities-screen')).toBeVisible();
  await back(page);
  await expect(tid(page, 'calendar-screen')).toBeVisible();
  await tid(page, `add-${TODAY}`).click();
  await tid(page, 'add-entry-tab-activities').click();
  await tid(page, 'add-entry-new-activity').click();
  await expect(tid(page, 'activity-name')).toBeVisible();
  await tid(page, 'add-entry-sheet-close').click();
  // The other kinds' "Neu anlegen" forms in the same sheet.
  await tid(page, `add-${TODAY}`).click();
  await tid(page, 'add-entry-new-recipe').click();
  await expect(tid(page, 'new-recipe-title')).toBeVisible();
  await tid(page, 'add-entry-new-back').click();
  await tid(page, 'add-entry-tab-restaurants').click();
  await tid(page, 'add-entry-new-restaurant').click();
  await expect(tid(page, 'restaurant-link')).toBeVisible();
  await tid(page, 'add-entry-sheet-close').click();

  // Month and year, and the absence window with its month calendar (spec 0010, REQ-004,
  // REQ-005, REQ-010).
  await tid(page, 'calendar-view-month').click();
  await expect(tid(page, 'month-phone')).toBeVisible();
  await tid(page, 'calendar-view-year').click();
  await expect(tid(page, 'year-view')).toBeVisible();
  await tid(page, 'calendar-more').click();
  await tid(page, 'calendar-more-absence-new').click();
  await expect(tid(page, 'absence-sheet')).toBeVisible();
  await tid(page, 'absence-from').click();
  await expect(tid(page, 'range-picker')).toBeVisible();
  await tid(page, 'absence-sheet-close').click();
  await tid(page, 'calendar-view-week').click();

  // The calendar's pantry check, the list and store mode, the household.
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
  // "Artikel" (spec 0007): search, "Artikel bearbeiten" with its area step, "+ Neu".
  await openManaged(page, 'articles');
  await expect(tid(page, 'articles-screen')).toBeVisible();
  await tid(page, 'articles-search').fill('Kokosmilch');
  await tid(page, `article-${seedIds['art-kokosmilch']}`).click();
  await expect(tid(page, 'article-sheet')).toBeVisible();
  await expect(tid(page, 'article-delete-reason')).toBeVisible();
  await tid(page, 'article-area').click();
  await expect(tid(page, 'article-area-search')).toBeVisible();
  await tid(page, 'article-step-back').click();
  await tid(page, 'article-done').click();
  await tid(page, 'articles-new').click();
  await expect(tid(page, 'new-article-sheet')).toBeVisible();
  await tid(page, 'new-article-sheet-close').click();
  await leaveManaged(page);
  // "Märkte & Bereiche" (spec 0007): a store with its ordering list and "+ Bereich hinzufügen",
  // the view "Bereiche" with "+ Neuer Bereich".
  await openManaged(page, 'stores');
  await tid(page, `store-${seedIds['store-rewe']}`).click();
  await expect(tid(page, 'store-order-screen')).toBeVisible();
  await expect(tid(page, `area-handle-${seedIds['area-obst-gemuese']}`)).toBeVisible();
  await tid(page, 'store-add-area').click();
  await expect(tid(page, 'add-area-sheet')).toBeVisible();
  await tid(page, 'add-area-sheet-close').click();
  await back(page);
  await tid(page, 'stores-view-bereiche').click();
  await expect(tid(page, 'areas-view')).toBeVisible();
  await tid(page, 'areas-new').click();
  await expect(tid(page, 'area-new-sheet')).toBeVisible();
  await tid(page, 'area-new-sheet-close').click();
  await tid(page, 'stores-view-maerkte').click();
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
  for (const key of ['rezepte', 'kalender', 'liste', 'haushalt', 'index'] as const) {
    await nav(page, key);
  }
  await nav(page, 'kalender');
  await tid(page, 'calendar-activities').click();
  await expect(tid(page, 'activities-empty')).toBeVisible();

  // Signing out: no screen stays behind that still reads the household, which exists only while
  // someone is signed in.
  await back(page);
  await nav(page, 'index');
  await openSettings(page);
  await tid(page, 'settings-sign-out').click();
  await expect(tid(page, 'login-screen')).toBeVisible();

  expect(warnings, 'console warnings').toEqual([]);
});
