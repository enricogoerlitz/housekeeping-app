import type { BrowserContext, Page } from '@playwright/test';

import {
  ACTIVE,
  SLOT_DINNER,
  TODAY,
  back,
  day,
  expect,
  goOffline,
  isPhone,
  itemRows,
  nav,
  only,
  open,
  openSettings,
  test,
  tid,
  tidPrefix,
  toastMessage,
} from './helpers';

// Spec 0002 — restaurants (all of it runs at phone and desktop width), plus the ingredient
// shopping note ("Zusatz") added to spec 0001.

const ENZO_LINK = 'https://www.google.com/maps/place/Trattoria+Da+Enzo/@50.9271,6.9580,17z';
const PHO_LINK = 'https://maps.apple.com/?q=Pho+Saigon&ll=50.94,6.95';
const THURSDAY = day(3);

/** Map apps are never really opened: every request to them gets a stub page. */
async function stubMaps(context: BrowserContext): Promise<void> {
  await context.route(/^https:\/\/(maps\.apple\.com|www\.google\.com\/maps)/, (route) =>
    route.fulfill({ body: 'map stub', contentType: 'text/plain' }),
  );
}

/** Clicks a route button and returns the URL of the map page it opened. */
async function routeUrl(page: Page, button: string): Promise<string> {
  const [popup] = await Promise.all([
    page.context().waitForEvent('page'),
    tid(page, button).click(),
  ]);
  await popup.waitForLoadState();
  const url = popup.url();
  await popup.close();
  return url;
}

async function openRestaurants(page: Page): Promise<void> {
  await nav(page, 'rezepte');
  await tid(page, 'food-switch-restaurants').click();
  await expect(tid(page, 'restaurants-screen')).toBeVisible();
}

/** Back from a restaurant to the list; on wide screens list and detail share the screen. */
async function backToList(page: Page): Promise<void> {
  if (isPhone(page)) await back(page);
}

test.beforeEach(async ({ context }) => {
  await stubMaps(context);
});

test('0002 AC-001: "Essen" shows recipes with the switch; "Restaurants" lists name, cuisine, place, my rating', async ({
  page,
}) => {
  await open(page, '/');
  await nav(page, 'rezepte');
  await expect(tid(page, isPhone(page) ? 'tab-rezepte' : 'nav-rezepte')).toHaveText(/Essen/);
  await expect(tid(page, 'recipes-screen').locator('[data-testid="screen-title"]')).toHaveText(
    'Essen',
  );
  await expect(tid(page, 'food-switch-recipes')).toHaveAttribute('aria-checked', 'true');
  await expect(tid(page, 'food-switch-restaurants')).toHaveText('Restaurants');
  await expect(tid(page, 'recipe-card-rec-mango-curry')).toBeVisible();

  await tid(page, 'food-switch-restaurants').click();
  const enzo = tid(page, 'restaurant-rest-enzo');
  await expect(enzo).toContainText('Trattoria Da Enzo');
  await expect(enzo).toContainText('Italienisch · €€ · Köln');
  await expect(tid(page, 'restaurant-rest-enzo-stars')).toHaveAttribute(
    'aria-label',
    '5 von 5 Sternen',
  );
});

test('0002 AC-002: the household "Test" shows the empty state with link, manual and the share hint', async ({
  page,
}) => {
  await open(page, '/');
  await openSettings(page);
  await tid(page, 'household-hh-test').click();
  await back(page);
  await openRestaurants(page);
  const empty = tid(page, 'restaurants-empty');
  await expect(empty).toContainText('Noch keine Restaurants');
  await expect(tid(page, 'restaurant-empty-link')).toHaveText(/Link einfügen/);
  await expect(tid(page, 'restaurant-empty-manual')).toHaveText(/Von Hand anlegen/);
  await expect(empty).toContainText('Google Maps');
  await expect(empty).toContainText('Apple Karten');
  await expect(empty).toContainText('Teilen');
});

test('0002 AC-003: a Google Maps link fills in name and coordinates', async ({ page }) => {
  // In the empty household, so the link is not a duplicate of the demo restaurant (AC-009).
  await open(page, '/');
  await openSettings(page);
  await tid(page, 'household-hh-test').click();
  await back(page);
  await openRestaurants(page);
  await tid(page, 'restaurant-empty-link').click();
  await tid(page, 'restaurant-link').fill(ENZO_LINK);
  await expect(tid(page, 'restaurant-name')).toHaveValue('Trattoria Da Enzo');
  await expect(tid(page, 'restaurant-link-ok')).toContainText('Koordinaten übernommen');
  await tid(page, 'restaurant-save').click();
  await expect(tid(page, 'restaurant-title')).toHaveText('Trattoria Da Enzo');
  await tid(page, 'restaurant-route').click();
  expect(await routeUrl(page, 'route-google')).toContain('destination=50.9271,6.958');
});

test('0002 AC-004: an Apple Maps link fills in name and coordinates', async ({ page }) => {
  await open(page, '/');
  await openSettings(page);
  await tid(page, 'household-hh-test').click();
  await back(page);
  await openRestaurants(page);
  await tid(page, 'restaurant-empty-link').click();
  await tid(page, 'restaurant-link').fill(PHO_LINK);
  await expect(tid(page, 'restaurant-name')).toHaveValue('Pho Saigon');
  await expect(tid(page, 'restaurant-link-ok')).toContainText('Koordinaten übernommen');
  await tid(page, 'restaurant-save').click();
  await expect(tid(page, 'restaurant-title')).toHaveText('Pho Saigon');
  await tid(page, 'restaurant-route').click();
  expect(await routeUrl(page, 'route-apple')).toContain('daddr=50.94,6.95');
});

test('0002 AC-005: a short link is recognised and saved with a sample place', async ({ page }) => {
  await open(page, '/rezepte?view=restaurants');
  const before = await tidPrefix(page, 'restaurant-rest-').count();
  await tid(page, 'restaurant-add').click();
  await tid(page, 'restaurant-link').fill('https://maps.app.goo.gl/AbC123');
  await expect(tid(page, 'restaurant-link-short')).toHaveText(
    /Kurzlink erkannt – Ort wird beim Speichern abgerufen/,
  );
  await tid(page, 'restaurant-save').click();
  await expect(tid(page, 'restaurant-title')).not.toBeEmpty();
  await expect(tid(page, 'restaurant-address-text')).not.toBeEmpty();
  await backToList(page);
  expect(await tidPrefix(page, 'restaurant-').count()).toBeGreaterThan(before);
});

test('0002 AC-006: text that is not a map link shows an error and leaves the form empty', async ({
  page,
}) => {
  await open(page, '/rezepte?view=restaurants');
  await tid(page, 'restaurant-add').click();
  await tid(page, 'restaurant-link').fill('hallo welt');
  await expect(tid(page, 'restaurant-link-error')).toHaveText('Das ist kein Karten-Link');
  await expect(tid(page, 'restaurant-name')).toHaveValue('');
  await expect(tid(page, 'restaurant-address')).toHaveValue('');
});

test('0002 AC-007: saving without a name creates nothing and shows "Name fehlt"', async ({
  page,
}) => {
  await open(page, '/rezepte?view=restaurants');
  const count = tid(page, 'restaurant-count');
  const before = await count.innerText();
  await tid(page, 'restaurant-add').click();
  await tid(page, 'restaurant-save').click();
  await expect(tid(page, 'restaurant-name-error')).toHaveText('Name fehlt');
  await expect(tid(page, 'restaurant-sheet')).toBeVisible();
  await tid(page, 'restaurant-sheet-close').click();
  await expect(count).toHaveText(before);
});

test('0002 AC-008: /teilen opens "Restaurant hinzufügen" prefilled in the active household', async ({
  page,
}) => {
  await open(
    page,
    '/teilen?text=Trattoria%20Da%20Enzo&url=https%3A%2F%2Fwww.google.com%2Fmaps%2Fplace%2FTrattoria%2BDa%2BEnzo%2F%4050.9271%2C6.958%2C17z',
  );
  await expect(tid(page, 'restaurant-sheet')).toBeVisible();
  await expect(tid(page, 'restaurant-name')).toHaveValue('Trattoria Da Enzo');
  // The demo household is active and already has Enzo: the sheet says so instead of a copy.
  await expect(tid(page, 'restaurant-duplicate')).toContainText('Trattoria Da Enzo');
});

test('0002 AC-009: the same link again offers "Öffnen" instead of a second entry', async ({
  page,
}) => {
  await open(page, '/rezepte?view=restaurants');
  const count = await tid(page, 'restaurant-count').innerText();
  await tid(page, 'restaurant-add').click();
  await tid(page, 'restaurant-link').fill(ENZO_LINK);
  await expect(tid(page, 'restaurant-duplicate')).toContainText('Gibt es schon: Trattoria Da Enzo');
  await expect(tid(page, 'restaurant-duplicate-open')).toHaveText(/Öffnen/);
  await expect(tid(page, 'restaurant-save')).toBeDisabled();
  await tid(page, 'restaurant-duplicate-open').click();
  await expect(tid(page, 'restaurant-title')).toHaveText('Trattoria Da Enzo');
  await backToList(page);
  await expect(tid(page, 'restaurant-count')).toHaveText(count);
});

test('0002 AC-010: 5 stars, favourite and a note show in the list and on the detail page', async ({
  page,
}) => {
  // Deviation: in the demo data "Trattoria Da Enzo" already has Enrico's 5 stars, both hearts
  // and the note "Trüffelpasta! …", so tapping the heart there would remove it. The flow is
  // proven on "Brooklyn Burger Bar" (4 stars, no heart, no note).
  await open(page, '/rezepte?view=restaurants');
  await expect(tid(page, 'restaurant-rest-burger-favorite')).toBeHidden();
  await expect(tid(page, 'restaurant-rest-burger-stars')).toHaveAttribute(
    'aria-label',
    '4 von 5 Sternen',
  );
  await tid(page, 'restaurant-rest-burger').click();
  await tid(page, 'restaurant-stars-5').click();
  await tid(page, 'restaurant-favorite').click();
  await tid(page, 'restaurant-notes-edit').fill('Trüffelpasta!');
  await tid(page, 'restaurant-notes-save').click();
  await expect(tid(page, 'restaurant-notes-edit')).toHaveValue('Trüffelpasta!');
  await backToList(page);
  await expect(tid(page, 'restaurant-rest-burger-favorite')).toBeVisible();
  await expect(tid(page, 'restaurant-rest-burger-stars')).toHaveAttribute(
    'aria-label',
    '5 von 5 Sternen',
  );
  await tid(page, 'restaurant-rest-burger').click();
  await expect(tid(page, 'restaurant-notes-edit')).toHaveValue('Trüffelpasta!');
});

test('0002 AC-011: a restaurant in the plan has the restaurant mark and adds nothing to the list', async ({
  page,
}) => {
  await open(page, '/plan');
  await tid(page, `add-${THURSDAY}-${SLOT_DINNER}`).click();
  await tid(page, 'add-entry-mode-restaurant').click();
  await tid(page, 'add-entry-restaurant-rest-enzo').click();
  await tid(page, 'add-entry-restaurant-save').click();
  const mark = tidPrefix(page, 'entry-restaurant-');
  const entryId = (await mark.last().getAttribute('data-testid'))?.replace('entry-restaurant-', '');
  const entry = tid(page, `entry-${entryId}`);
  await expect(entry).toContainText('Trattoria Da Enzo');
  await expect(tid(page, `entry-restaurant-${entryId}`)).toHaveText('Restaurant');

  await tid(page, 'plan-to-list').click();
  for (const chip of await tidPrefix(page, 'pc-day-').all()) {
    const id = await chip.getAttribute('data-testid');
    const selected = (await chip.getAttribute('aria-selected')) === 'true';
    if ((id === `pc-day-${THURSDAY}`) !== selected) await chip.click();
  }
  await expect(tid(page, `pc-day-${THURSDAY}`)).toHaveAttribute('aria-selected', 'true');
  await expect(tid(page, 'pc-dishes')).toHaveText('Noch kein Gericht gewählt.');
  await expect(tid(page, 'pc-next')).toBeDisabled();
});

test('0002 AC-012: "Route" on Heute opens Apple Karten or Google Maps at Enzo’s coordinates', async ({
  page,
}) => {
  await open(page, '/plan');
  await tid(page, `add-${TODAY}-${SLOT_DINNER}`).click();
  await tid(page, 'add-entry-mode-restaurant').click();
  await tid(page, 'add-entry-restaurant-rest-enzo').click();
  await tid(page, 'add-entry-restaurant-save').click();

  await nav(page, 'index');
  const card = tidPrefix(page, 'today-meal-').filter({ hasText: 'Trattoria Da Enzo' });
  await expect(card).toContainText('Abend · Restaurant');
  const route = card.locator('[data-testid^="today-route-"]');
  await route.click();
  await expect(tid(page, 'route-sheet')).toBeVisible();
  await expect(tid(page, 'route-apple')).toHaveText(/Apple Karten/);
  await expect(tid(page, 'route-google')).toHaveText(/Google Maps/);
  const apple = await routeUrl(page, 'route-apple');
  expect(apple).toContain('maps.apple.com');
  expect(apple).toContain('daddr=50.9271,6.958');
  expect(decodeURIComponent(apple)).toContain('Trattoria Da Enzo');

  await route.click();
  const google = await routeUrl(page, 'route-google');
  expect(google).toContain('google.com/maps/dir/?api=1');
  expect(google).toContain('destination=50.9271,6.958');
});

test('0002 AC-013: "Pho Saigon" shows "Zuletzt: vor 12 Tagen · 3 Besuche"', async ({ page }) => {
  await open(page, '/rezepte?view=restaurants');
  await tid(page, 'restaurant-rest-pho').click();
  await expect(tid(page, 'restaurant-title')).toHaveText('Pho Saigon');
  await expect(tid(page, 'restaurant-visits')).toHaveText('Zuletzt: vor 12 Tagen · 3 Besuche');
});

test('0002 offline: restaurants stay readable, editing is greyed out, the route still works', async ({
  page,
}) => {
  await open(page, '/rezepte?view=restaurants');
  await goOffline(page);
  await expect(tid(page, 'restaurant-offline-hint')).toBeVisible();
  await expect(tid(page, 'restaurant-add')).toHaveAttribute('aria-disabled', 'true');
  await tid(page, 'restaurant-rest-pho').click();
  await expect(tid(page, 'restaurant-title')).toHaveText('Pho Saigon');
  await expect(tid(page, 'restaurant-favorite')).toHaveAttribute('aria-disabled', 'true');
  await expect(tid(page, 'restaurant-notes-edit')).not.toBeEditable();
  await expect(tid(page, 'restaurant-route')).not.toHaveAttribute('aria-disabled', 'true');
});

test.describe('restaurants at desktop width', () => {
  only('desktop');

  test('0002 AC-001: wide screens show restaurant list and restaurant side by side', async ({
    page,
  }) => {
    await open(page, '/rezepte?view=restaurants');
    await tid(page, 'restaurant-rest-pho').click();
    await expect(page).toHaveURL(/rid=rest-pho/);
    const list = await tid(page, 'restaurant-rest-pho').boundingBox();
    const detail = await tid(page, 'restaurant-detail').boundingBox();
    expect(list && detail && list.x + list.width <= detail.x, 'list left of detail').toBe(true);
    await expect(tid(page, 'restaurant-close')).toBeVisible();
  });
});

test.describe('ingredient shopping note (spec 0001 addition)', () => {
  only('phone');

  const PIZZA_DAY = day(4);

  async function pantryCheckFor(page: Page, date: string): Promise<void> {
    await tid(page, 'plan-to-list').click();
    for (const chip of await tidPrefix(page, 'pc-day-').all()) {
      const id = await chip.getAttribute('data-testid');
      const selected = (await chip.getAttribute('aria-selected')) === 'true';
      if ((id === `pc-day-${date}`) !== selected) await chip.click();
    }
    await expect(tid(page, 'pc-dishes')).toHaveText('Pizza Margherita');
    await tid(page, 'pc-next').click();
  }

  test('"Fior di Latte" on the Mozzarella reaches the list through the pantry check', async ({
    page,
  }) => {
    await open(page, '/plan');
    await pantryCheckFor(page, PIZZA_DAY);
    await expect(tid(page, 'pc-row-art-mozzarella')).toContainText('(Fior di Latte)');
    await tid(page, 'pc-apply').click();
    await expect(toastMessage(page)).toContainText('auf der Liste');
    await nav(page, 'liste');
    await expect(itemRows(page, 'Mozzarella')).toContainText('(Fior di Latte)');
  });

  test('"Fior di Latte" reaches the list through "Ist alle"', async ({ page }) => {
    await open(page, '/rezept/rec-pizza-margherita');
    const note = tidPrefix(page, 'ingredient-shopping-note-');
    await expect(note).toHaveText('(Fior di Latte)');
    const ingredientId = (await note.getAttribute('data-testid'))?.replace(
      'ingredient-shopping-note-',
      '',
    );
    await tid(page, `ingredient-empty-${ingredientId}`).click();
    await expect(toastMessage(page)).toHaveText('Mozzarella steht auf der Liste');
    await back(page);
    await nav(page, 'liste');
    await expect(itemRows(page, 'Mozzarella')).toContainText('(Fior di Latte)');
  });

  test('the note can be edited in the recipe and the pantry check uses the new one', async ({
    page,
  }) => {
    await open(page, '/rezept/rec-pizza-margherita');
    const note = tidPrefix(page, 'ingredient-shopping-note-');
    const ingredientId = (await note.getAttribute('data-testid'))?.replace(
      'ingredient-shopping-note-',
      '',
    );
    await tid(page, `ingredient-note-${ingredientId}`).click();
    await expect(tid(page, 'ingredient-note-input')).toHaveValue('Fior di Latte');
    await tid(page, 'ingredient-note-input').fill('Büffelmozzarella');
    await tid(page, 'ingredient-note-save').click();
    await expect(toastMessage(page)).toHaveText('Zusatz gespeichert');
    await expect(tid(page, `ingredient-shopping-note-${ingredientId}`)).toHaveText(
      '(Büffelmozzarella)',
    );

    await back(page);
    await nav(page, 'plan');
    await pantryCheckFor(page, PIZZA_DAY);
    await expect(tid(page, 'pc-row-art-mozzarella')).toContainText('(Büffelmozzarella)');
    await expect(page.locator(`[data-testid="pc-row-art-mozzarella"]${ACTIVE}`)).not.toContainText(
      'Fior di Latte',
    );
  });
});
