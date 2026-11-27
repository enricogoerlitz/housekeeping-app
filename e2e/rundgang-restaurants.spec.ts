import type { Page } from '@playwright/test';

import {
  ACTIVE,
  PLAN_ENTRY,
  SLOT_DINNER,
  TODAY,
  aiFixtures,
  back,
  day,
  expect,
  freshSeed,
  goOffline,
  isPhone,
  itemRows,
  nav,
  only,
  open,
  routeUrl,
  showPlanWeek,
  stubMaps,
  switchHousehold,
  test,
  tid,
  tidPrefix,
  toastMessage,
} from './helpers';
import { seedIds } from './seed-ids';

// Spec 0002 — restaurants (all of it runs at phone and desktop width), plus the ingredient
// shopping note ("Zusatz") added to spec 0001, against the local backend. Short links are
// resolved by the edge function `resolve-maps-link`, stubbed here (helpers.ts). The tests change
// the demo, so the file starts from a fresh seed (once per width).

freshSeed();

const ENZO = `restaurant-${seedIds['rest-enzo']}`;
const PHO = `restaurant-${seedIds['rest-pho']}`;
const BURGER = `restaurant-${seedIds['rest-burger']}`;

/** Switches this device to the empty household "Test". */
async function toTestHousehold(page: Page): Promise<void> {
  await switchHousehold(page, seedIds['hh-test']);
}

/**
 * "+" on "Restaurants" creates a restaurant at once (spec 0054, AC-007); "Anlegen" of the first
 * step shows the empty form (spec 0062, REQ-008).
 */
async function newRestaurant(page: Page): Promise<void> {
  await tid(page, 'restaurant-new').click();
  await expect(tid(page, 'restaurant-sheet')).toBeVisible();
  await tid(page, 'restaurant-start-path-create').click();
}

/** Plans Trattoria Da Enzo on `date` (evening) from the calendar; returns the new entry's id. */
async function planEnzo(page: Page, date: string): Promise<string> {
  const enzoEntries = () =>
    page
      .locator(PLAN_ENTRY)
      .filter({ hasText: 'Trattoria Da Enzo' })
      .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-testid') ?? ''));
  // `evaluateAll` does not wait: the week must be drawn first.
  await expect(page.locator('[data-testid^="day-2"]:visible').first()).toBeVisible();
  const before = await enzoEntries();
  // Phones have one "+" per day (evening preselected); the wide grid one per Tageszeit.
  await tid(page, isPhone(page) ? `add-${date}` : `add-${date}-${SLOT_DINNER}`).click();
  await tid(page, 'add-entry-tab-restaurants').click();
  await tid(page, `add-entry-restaurant-${seedIds['rest-enzo']}`).click();
  await tid(page, 'add-entry-save').click();
  await expect(tid(page, 'add-entry-sheet')).toBeHidden();
  await expect.poll(async () => (await enzoEntries()).length).toBe(before.length + 1);
  const added = (await enzoEntries()).find((id) => !before.includes(id)) ?? '';
  return added.replace(/^entry-/, '');
}

/** The number in "N Restaurants". */
async function restaurantCount(page: Page): Promise<number> {
  return Number((await tid(page, 'restaurant-count').innerText()).match(/\d+/)?.[0]);
}

const ENZO_LINK = 'https://www.google.com/maps/place/Trattoria+Da+Enzo/@50.9271,6.9580,17z';
const PHO_LINK = 'https://maps.apple.com/?q=Pho+Saigon&ll=50.94,6.95';
const THURSDAY = day(3);

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
  await expect(tid(page, 'food-switch-recipes')).toHaveAttribute('aria-selected', 'true');
  await expect(tid(page, 'food-switch-restaurants')).toHaveText('Restaurants');
  await expect(tid(page, `recipe-card-${seedIds['rec-mango-curry']}`)).toBeVisible();

  await tid(page, 'food-switch-restaurants').click();
  const enzo = tid(page, ENZO);
  await expect(enzo).toContainText('Trattoria Da Enzo');
  await expect(enzo).toContainText('Italienisch · €€ · Köln');
  await expect(tid(page, `${ENZO}-stars`)).toHaveAttribute('aria-label', '5 von 5 Sternen');
});

test('0002 AC-002: the household "Test" shows the empty state with link, manual and the share hint', async ({
  page,
}) => {
  await open(page, '/');
  await toTestHousehold(page);
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
  await toTestHousehold(page);
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
  // "Test" already has the restaurant of AC-003 (data persists), so "+" instead of the empty state.
  await open(page, '/');
  await toTestHousehold(page);
  await openRestaurants(page);
  await newRestaurant(page);
  await tid(page, 'restaurant-link').fill(PHO_LINK);
  await expect(tid(page, 'restaurant-name')).toHaveValue('Pho Saigon');
  await expect(tid(page, 'restaurant-link-ok')).toContainText('Koordinaten übernommen');
  await tid(page, 'restaurant-save').click();
  await expect(tid(page, 'restaurant-title')).toHaveText('Pho Saigon');
  await tid(page, 'restaurant-route').click();
  expect(await routeUrl(page, 'route-apple')).toContain('daddr=50.94,6.95');
});

// Spec 0003 AC-031: the server resolves the short link (stubbed reply, helpers.ts).
test('0002 AC-005: a short link is recognised and saved with the place the server resolved', async ({
  page,
}) => {
  const place = aiFixtures.resolveMapsLink();
  await open(page, '/rezepte?ansicht=restaurants');
  const before = await restaurantCount(page);
  await newRestaurant(page);
  await tid(page, 'restaurant-link').fill('https://maps.app.goo.gl/AbC123');
  await expect(tid(page, 'restaurant-link-short')).toHaveText(
    /Kurzlink erkannt – Ort wird beim Speichern abgerufen/,
  );
  await tid(page, 'restaurant-save').click();
  await expect(tid(page, 'restaurant-title')).toHaveText(place.name);
  await expect(tid(page, 'restaurant-address-text')).toContainText(place.address ?? '');
  await backToList(page);
  await expect.poll(() => restaurantCount(page)).toBe(before + 1);
});

test('0002 AC-006: text that is not a map link shows an error and leaves the form empty', async ({
  page,
}) => {
  await open(page, '/rezepte?ansicht=restaurants');
  await newRestaurant(page);
  await tid(page, 'restaurant-link').fill('hallo welt');
  await expect(tid(page, 'restaurant-link-error')).toHaveText('Das ist kein Karten-Link');
  await expect(tid(page, 'restaurant-name')).toHaveValue('');
  await expect(tid(page, 'restaurant-address')).toHaveValue('');
});

test('0002 AC-007: saving without a name creates nothing and shows "Name fehlt"', async ({
  page,
}) => {
  await open(page, '/rezepte?ansicht=restaurants');
  const count = tid(page, 'restaurant-count');
  const before = await count.innerText();
  await newRestaurant(page);
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
  await open(page, '/rezepte?ansicht=restaurants');
  const count = await tid(page, 'restaurant-count').innerText();
  await newRestaurant(page);
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
  await open(page, '/rezepte?ansicht=restaurants');
  await expect(tid(page, `${BURGER}-favorite`)).toBeHidden();
  await expect(tid(page, `${BURGER}-stars`)).toHaveAttribute('aria-label', '4 von 5 Sternen');
  await tid(page, BURGER).click();
  await tid(page, 'restaurant-stars-5').click();
  await tid(page, 'restaurant-favorite').click();
  // Spec 0024, REQ-002: the note only in "Restaurant bearbeiten".
  await tid(page, 'restaurant-notes-edit').click();
  await tid(page, 'restaurant-notes').fill('Trüffelpasta!');
  await tid(page, 'restaurant-save').click();
  await expect(tid(page, 'restaurant-notes-text')).toHaveText('Trüffelpasta!');
  await backToList(page);
  await expect(tid(page, `${BURGER}-favorite`)).toBeVisible();
  await expect(tid(page, `${BURGER}-stars`)).toHaveAttribute('aria-label', '5 von 5 Sternen');
  await tid(page, BURGER).click();
  await expect(tid(page, 'restaurant-notes-text')).toHaveText('Trüffelpasta!');
});

test('0002 AC-011: a restaurant in the calendar adds nothing to the list', async ({ page }) => {
  await open(page, '/kalender');
  await showPlanWeek(page, THURSDAY);
  const entryId = await planEnzo(page, THURSDAY);
  await expect(tid(page, `entry-${entryId}`)).toContainText('Trattoria Da Enzo');
  // Spec 0006, AC-049: restaurants never appear in "Was soll auf die Liste?".
  await tid(page, 'plan-to-list').click();
  await expect(tid(page, 'pantry-check-sheet')).toContainText('Was soll auf die Liste?');
  await expect(page.locator(`[data-testid="pick-entry-${entryId}"]${ACTIVE}`)).toHaveCount(0);
});

test('0002 AC-012: "Route" on Heute opens Apple Karten or Google Maps at Enzo’s coordinates', async ({
  page,
}) => {
  await open(page, '/kalender');
  await planEnzo(page, TODAY);

  await nav(page, 'index');
  const card = tidPrefix(page, 'today-meal-').filter({ hasText: 'Trattoria Da Enzo' });
  await expect(card).toContainText('Abend');
  // The route button sits next to the card, not inside it (no button in a button).
  const entryId = (await card.getAttribute('data-testid'))?.replace('today-meal-', '');
  // Spec 0004, AC-019: the kind is the card's badge.
  await expect(tid(page, `today-badge-${entryId}`)).toHaveText('Restaurant');
  const route = tid(page, `today-route-${entryId}`);
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
  await open(page, '/rezepte?ansicht=restaurants');
  await tid(page, PHO).click();
  await expect(tid(page, 'restaurant-title')).toHaveText('Pho Saigon');
  await expect(tid(page, 'restaurant-visits')).toHaveText('Zuletzt: vor 12 Tagen · 3 Besuche');
});

test('0002 offline: restaurants stay readable, editing is greyed out, the route still works', async ({
  page,
}) => {
  await open(page, '/rezepte?ansicht=restaurants');
  await goOffline(page);
  await expect(tid(page, 'restaurant-offline-hint')).toBeVisible();
  await expect(tid(page, 'restaurant-new')).toHaveAttribute('aria-disabled', 'true');
  await tid(page, PHO).click();
  await expect(tid(page, 'restaurant-title')).toHaveText('Pho Saigon');
  await expect(tid(page, 'restaurant-favorite')).toHaveAttribute('aria-disabled', 'true');
  await expect(tid(page, 'restaurant-notes-edit')).toBeDisabled();
  await expect(tid(page, 'restaurant-route')).not.toHaveAttribute('aria-disabled', 'true');
});

test.describe('restaurants at desktop width', () => {
  only('desktop');

  test('0002 AC-001: wide screens show restaurant list and restaurant side by side', async ({
    page,
  }) => {
    await open(page, '/rezepte?ansicht=restaurants');
    await tid(page, PHO).click();
    await expect(page).toHaveURL(new RegExp(`restaurant=${seedIds['rest-pho']}`));
    const list = await tid(page, PHO).boundingBox();
    const detail = await tid(page, 'restaurant-detail').boundingBox();
    expect(list && detail && list.x + list.width <= detail.x, 'list left of detail').toBe(true);
    await expect(tid(page, 'restaurant-close')).toBeVisible();
  });
});

test.describe('ingredient shopping note (spec 0001 addition)', () => {
  only('phone');

  const PIZZA_DAY = day(4);

  async function pantryCheckFor(page: Page, date: string): Promise<void> {
    await showPlanWeek(page, date);
    await tid(page, 'plan-to-list').click();
    const pizza = `pick-entry-${seedIds['plan-10']}-check`;
    // The rows render after the window: `.all()` takes only what is there.
    await expect(tidPrefix(page, 'pick-entry-').first()).toBeVisible();
    for (const check of await tidPrefix(page, 'pick-entry-')
      .and(page.locator('[role="checkbox"]'))
      .all()) {
      const id = await check.getAttribute('data-testid');
      const selected = (await check.getAttribute('aria-checked')) === 'true';
      if ((id === pizza) !== selected) await check.click();
    }
    await expect(tid(page, pizza)).toHaveAttribute('aria-checked', 'true');
    await expect(tid(page, 'pc-next')).toHaveText('Weiter: 1 Gericht');
    await tid(page, 'pc-next').click();
  }

  test('"Fior di Latte" on the Mozzarella reaches the list through the pantry check', async ({
    page,
  }) => {
    await open(page, '/kalender');
    await pantryCheckFor(page, PIZZA_DAY);
    await expect(tid(page, `pc-row-${seedIds['art-mozzarella']}`)).toContainText('(Fior di Latte)');
    await tid(page, 'pc-apply').click();
    await expect(toastMessage(page)).toContainText('auf der Liste');
    await nav(page, 'liste');
    await expect(itemRows(page, 'Mozzarella (Fior di Latte)')).toHaveCount(1);
  });

  test('"Fior di Latte" reaches the list through "Ist alle"', async ({ page }) => {
    await open(page, `/rezept/${seedIds['rec-pizza-margherita']}`);
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
    await expect(itemRows(page, 'Mozzarella (Fior di Latte)')).toHaveCount(1);
  });

  test('the note can be edited in the recipe and the pantry check uses the new one', async ({
    page,
  }) => {
    await open(page, `/rezept/${seedIds['rec-pizza-margherita']}`);
    const note = tidPrefix(page, 'ingredient-shopping-note-');
    const ingredientId = (await note.getAttribute('data-testid'))?.replace(
      'ingredient-shopping-note-',
      '',
    );
    // Spec 0008: edits sit behind the section's pen; the Zusatz is in the ingredient window.
    await tid(page, 'recipe-edit').click();
    await tid(page, `recipe-row-menu-${ingredientId}`).click();
    await tid(page, `recipe-row-menu-${ingredientId}-edit`).click();
    await expect(tid(page, 'ingredient-shopping-note')).toHaveValue('Fior di Latte');
    await tid(page, 'ingredient-shopping-note').fill('Büffelmozzarella');
    await tid(page, 'ingredient-save').click();
    await tid(page, 'recipe-edit-save').click();
    await expect(tid(page, `ingredient-shopping-note-${ingredientId}`)).toHaveText(
      '(Büffelmozzarella)',
    );

    await back(page);
    await nav(page, 'kalender');
    await pantryCheckFor(page, PIZZA_DAY);
    await expect(tid(page, `pc-row-${seedIds['art-mozzarella']}`)).toContainText(
      '(Büffelmozzarella)',
    );
    await expect(
      page.locator(`[data-testid="pc-row-${seedIds['art-mozzarella']}"]${ACTIVE}`),
    ).not.toContainText('Fior di Latte');
  });
});
