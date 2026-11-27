import type { Page } from '@playwright/test';

import {
  back,
  expect,
  leaveManaged,
  login,
  nav,
  nestedSeedId,
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
  // Read view: ⋯ at an ingredient offers "Artikel bearbeiten" (spec 0007, AC-007). Editing the
  // section "Zutaten" (spec 0008, REQ-007, E9): the pen, "+ Zutat" with "Suchen oder anlegen",
  // "Mehrere einfügen" with its orange row; "Fertig" keeps the section open with it (AC-032),
  // and closes it once the row is removed.
  await page.locator('[data-testid^="ingredient-menu-"]:visible').first().click();
  await expect(
    page.locator('[data-testid$="-article"][data-testid^="ingredient-menu-"]:visible'),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await tid(page, 'recipe-edit').click();
  await tid(page, 'recipe-add-ingredient').click();
  await tid(page, 'ingredient-article-search-input').fill('Kokos');
  await expect(
    tid(page, `ingredient-article-search-hit-${seedIds['art-kokosmilch']}`),
  ).toBeVisible();
  await tid(page, 'ingredient-sheet-close').click();
  await tid(page, 'recipe-paste-ingredients').click();
  await tid(page, 'ingredients-paste').fill('2 Drachenfrüchte');
  await tid(page, 'ingredients-paste-save').click();
  await expect(tid(page, 'recipe-ingredients-missing')).toHaveText(
    '1 Zutat braucht noch einen Artikel',
  );
  await tid(page, 'recipe-edit-save').click();
  await expect(tid(page, 'recipe-ingredients-missing')).toBeVisible();
  await page.locator('[data-testid^="open-row-"][data-testid$="-remove"]').click();
  await tid(page, 'recipe-edit-save').click();
  await expect(tid(page, 'recipe-edit')).toBeVisible();
  // "Einplanen" opens its window on the page, ⋯ offers "Löschen" (spec 0008, AC-020, AC-034).
  await tid(page, 'recipe-plan').click();
  await expect(tid(page, 'plan-recipe-save')).toContainText('Abend einplanen');
  await tid(page, 'plan-recipe-sheet-close').click();
  await tid(page, 'recipe-more').click();
  await expect(tid(page, 'recipe-more-delete')).toBeVisible();
  // ⋯ → "Zu Sammlung hinzufügen" lists the collections A to Z (spec 0009, AC-008).
  await tid(page, 'recipe-more-collection').click();
  await expect(tid(page, `add-to-collection-${seedIds['rec-grillabend']}`)).toBeVisible();
  await tid(page, 'add-to-collection-sheet-close').click();
  // "Was brauchst du wirklich?" down to its rows: a row is one checkbox, its "− n× +" are buttons
  // of their own beside it, so React reports no nested button (spec 0031, AC-066).
  await tid(page, 'recipe-to-list').click();
  await expect(tid(page, 'pantry-check-sheet')).toContainText('Was brauchst du wirklich?');
  const mango = `pc-row-${seedIds['art-mango']}`;
  await expect(tid(page, `${mango}-open`)).toHaveAttribute('role', 'checkbox');
  const count = await tid(page, `${mango}-count`).innerText();
  await tid(page, `${mango}-plus`).click();
  await expect(tid(page, `${mango}-count`)).not.toHaveText(count);
  await tid(page, 'pantry-check-sheet-close').click();
  await tid(page, 'start-cooking').click();
  await expect(tid(page, 'cooking-screen')).toBeVisible();
  await tid(page, 'cook-close').click();
  await back(page);
  // The page of a collection with its Kennzeichen, "Enthält" and no "Kochen" (spec 0009, E13).
  await tid(page, `recipe-card-${seedIds['rec-grillabend']}`).click();
  await expect(tid(page, 'collection-badge')).toBeVisible();
  await expect(tid(page, `collection-content-${seedIds['rec-nudelsalat']}`)).toBeVisible();
  await expect(tid(page, 'start-cooking')).toBeHidden();
  // "+ Rezept hinzufügen" opens the edit mode with "Rezepte zu …" and "schon enthalten" (AC-010;
  // spec 0037): the rows of "Enthält" have ⋯, "Speichern" closes the edit mode again.
  await tid(page, 'collection-add-recipes').click();
  await expect(tid(page, `collection-recipes-row-${seedIds['rec-nudelsalat']}`)).toContainText(
    'schon enthalten',
  );
  await tid(page, 'collection-recipes-sheet-close').click();
  await expect(tid(page, 'collection-rows-list')).toBeVisible();
  await tid(page, 'recipe-edit-save').click();
  await expect(tid(page, 'recipe-edit')).toBeVisible();
  await back(page);
  await tid(page, 'food-switch-restaurants').click();
  await tid(page, `restaurant-${seedIds['rest-pho']}`).click();
  await expect(tid(page, 'restaurant-title')).toHaveText('Pho Saigon');
  await back(page);

  // Verwalten → Aktivitäten: the page, one activity, the add sheet's tabs and its "Neu anlegen"
  // forms (spec 0010, REQ-007, REQ-008; spec 0024, REQ-009).
  await openManaged(page, 'activities');
  await expect(tid(page, 'activities-screen')).toBeVisible();
  await tid(page, `activity-${seedIds['act-eislaufen']}`).click();
  await expect(tid(page, 'activity-title')).toHaveText('Eislaufen');
  await tid(page, 'activity-plan').click();
  await expect(tid(page, 'plan-recipe-title')).toHaveText('Eislaufen');
  await tid(page, 'plan-recipe-sheet-close').click();
  // On phones the activity is its own page; closing the window stays on it (spec 0024, REQ-009).
  await expect(tid(page, 'activity-title')).toHaveText('Eislaufen');
  await back(page);
  await expect(tid(page, 'activities-screen')).toBeVisible();
  await nav(page, 'kalender');
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
  // The tab "Sammlungen" with the seed's collections and "als Sammlung anlegen" (spec 0009,
  // AC-021).
  await tid(page, 'add-entry-tab-collections').click();
  await expect(tid(page, `add-entry-recipe-${seedIds['rec-grillabend']}`)).toBeVisible();
  await tid(page, 'add-entry-new-collection').click();
  await expect(tid(page, 'new-recipe-title')).toBeVisible();
  await tid(page, 'add-entry-new-back').click();
  await tid(page, 'add-entry-tab-restaurants').click();
  await tid(page, 'add-entry-new-restaurant').click();
  await expect(tid(page, 'restaurant-link')).toBeVisible();
  await tid(page, 'add-entry-sheet-close').click();

  // Month and year, and the trip window with its month calendar (spec 0010, REQ-004,
  // REQ-005, REQ-010).
  await tid(page, 'calendar-view-month').click();
  await expect(tid(page, 'month-phone')).toBeVisible();
  await tid(page, 'calendar-view-year').click();
  await expect(tid(page, 'year-view')).toBeVisible();
  // No ⋯ any more (spec 0054): the day window enters a trip.
  await tid(page, `year-day-${TODAY}`).click();
  await tid(page, 'day-panel-trip').click();
  await expect(tid(page, 'trip-sheet')).toBeVisible();
  await tid(page, 'trip-from').click();
  await expect(tid(page, 'range-picker')).toBeVisible();
  // Its Reisetaschen (spec 0012, AC-011, AC-012): a chosen bag counts into the button.
  await expect(tid(page, 'trip-save')).toHaveText('Speichern');
  await tid(page, `trip-bag-${seedIds['bag-strand']}`).click();
  await expect(tid(page, 'trip-save')).toHaveText('Speichern · 12 Packstücke');
  await tid(page, 'trip-bag-new').click();
  await expect(tid(page, 'trip-bag-new-name')).toBeVisible();
  await tid(page, 'trip-sheet-close').click();
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

  // Settings, and every page under "Verwalten" (spec 0005): stores and one store, trips,
  // household and members, feedback. The AI is switched off, so there is no assistant to open.
  await nav(page, 'index');
  await openSettings(page);
  await back(page);
  // The bell with the notices (spec 0051).
  await tid(page, 'notices-bell').click();
  await expect(tid(page, 'notices-sheet')).toBeVisible();
  await tid(page, 'notices-close').click();
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
  // "Reisetaschen" (spec 0012, REQ-001): the list, one bag with its Packstücke, a suggestion
  // from another bag while typing, the window of a Packstück and the name window.
  await openManaged(page, 'packing-bags');
  await expect(tid(page, 'bags-screen')).toBeVisible();
  await tid(page, `bag-${seedIds['bag-strand']}`).click();
  await expect(tid(page, 'bag-screen')).toBeVisible();
  await tid(page, 'bag-item-input').fill('Sonn');
  await expect(tid(page, 'bag-item-suggestion-Sonnencreme')).toBeVisible();
  await tid(page, 'bag-item-input').fill('');
  // A tap on the row opens the window of a Packstück (no ✎ any more).
  await page.locator('[data-testid^="bag-item-open-"]:visible').first().click();
  await expect(tid(page, 'bag-item-sheet')).toBeVisible();
  await tid(page, 'bag-item-sheet-close').click();
  await tid(page, 'bag-rename').click();
  await expect(tid(page, 'bag-rename-sheet')).toBeVisible();
  await tid(page, 'bag-rename-sheet-cancel').click();
  await back(page);
  await leaveManaged(page);
  for (const [key, screen] of [
    ['trips', 'trips-screen'],
    ['members', 'members-screen'],
    ['feedback', 'feedback'],
  ] as const) {
    await openManaged(page, key);
    await expect(tid(page, screen)).toBeVisible();
    await leaveManaged(page);
  }

  // The trip window of "Urlaub Mallorca" (spec 0012, REQ-003 to REQ-007; spec 0022): head and
  // progress, a Packstück packed through the check window into "Gepackt (n)", ⋯ of a bag, the
  // windows behind "+ Packstück" and "+ Reisetasche hinzufügen", and the reset dialog. It opens
  // from its row in "Reisen" and ✕ closes it there. "Abbrechen" in the reset dialog leaves every
  // Haken as it was (AC-029).
  const strand = `trip-bag-${nestedSeedId('pack-mallorca-1')}`;
  const sunHat = `trip-item-${nestedSeedId('pack-mallorca-7')}`;
  await openManaged(page, 'trips');
  await tid(page, `trip-${seedIds['trip-mallorca']}`).click();
  await expect(tid(page, 'trip-window-title')).toHaveText('Urlaub Mallorca');
  await expect(tid(page, 'trip-progress')).toHaveText('Packliste · 6 von 21 gepackt');
  await tid(page, `${sunHat}-check`).click();
  await expect(tid(page, `${strand}-packed-toggle`)).toContainText('Gepackt (5)');
  await tid(page, `${strand}-packed-toggle`).click();
  await expect(tid(page, `${strand}-packed-body`)).toContainText('Sonnenhut');
  await tid(page, `${strand}-more`).click();
  await expect(tid(page, `${strand}-more-pack-all`)).toBeVisible();
  // Escape closes only the menu, not the window below it.
  await page.keyboard.press('Escape');
  await expect(tid(page, `${strand}-more-pack-all`)).toBeHidden();
  await expect(tid(page, 'trip-window-title')).toHaveText('Urlaub Mallorca');
  await tid(page, `${strand}-add`).click();
  await expect(tid(page, 'trip-add-item-also')).toBeVisible();
  await tid(page, 'trip-add-item-sheet-close').click();
  await tid(page, `trip-add-bag-open-${seedIds['trip-mallorca']}`).click();
  await expect(tid(page, 'trip-add-bag-list')).toBeVisible();
  await tid(page, 'trip-add-bag-sheet-close').click();
  await tid(page, 'trip-more').click();
  await tid(page, 'trip-more-reset').click();
  await expect(tid(page, 'trip-reset-dialog')).toContainText('Alle 7 Haken entfernen?');
  await tid(page, 'trip-reset-dialog-cancel').click();
  await expect(tid(page, 'trip-reset-dialog')).toHaveCount(0);
  await expect(tid(page, 'trip-progress')).toHaveText('Packliste · 7 von 21 gepackt');
  await expect(tid(page, `${strand}-packed-toggle`)).toContainText('Gepackt (5)');
  // Since spec 0022 the trip is a window over "Reisen"; ✕ closes it there.
  await tid(page, 'trip-window-close').click();
  await expect(tid(page, 'trips-screen')).toBeVisible();
  await leaveManaged(page);
  await nav(page, 'kalender');
  await expect(tid(page, 'calendar-screen')).toBeVisible();
  await nav(page, 'index');

  // The card "Reisetasche" on the Übersicht (spec 0012, AC-042, AC-044): "Urlaub Mallorca"
  // starts in 12 days, so only a week later the card stands below "Einkauf"; it still counts
  // from today (spec 0018, AC-020); a tap opens the trip window, and ✕ closes it on the
  // Übersicht.
  const mallorcaCard = `today-packing-${seedIds['trip-mallorca']}`;
  await expect(tid(page, mallorcaCard)).toHaveCount(0);
  await tid(page, 'today-week-next').click();
  await expect(tid(page, `${mallorcaCard}-progress`)).toHaveText('7/21 gepackt');
  await expect(tid(page, `${mallorcaCard}-starts`)).toHaveText('beginnt in 12 Tagen');
  await tid(page, `${mallorcaCard}-open`).click();
  await expect(tid(page, 'trip-window-title')).toHaveText('Urlaub Mallorca');
  await tid(page, 'trip-window-close').click();
  await expect(tid(page, 'today-screen')).toBeVisible();
  await tid(page, 'today-week-today').click();

  // A household with nothing planned and no chores: the empty states.
  await switchHousehold(page, seedIds['hh-test']);
  await expect(tid(page, 'today-screen')).toBeVisible();
  for (const key of ['rezepte', 'kalender', 'liste', 'haushalt', 'index'] as const) {
    await nav(page, key);
  }
  await openManaged(page, 'activities');
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
