import {
  ACTIVE,
  appBackground,
  back,
  expect,
  goOffline,
  hexToRgb,
  hue,
  itemRows,
  nav,
  only,
  open,
  openSettings,
  parseRgb,
  test,
  tid,
  tidPrefix,
} from './helpers';

// Spec 0001 — app shell, themes, settings, demo data (REQ-001 to REQ-004).

const BG = {
  markthalleLight: hexToRgb('#FAF6EE'),
  markthalleDark: hexToRgb('#1B1613'),
  frischLight: hexToRgb('#FAF8F5'),
};

test.describe('shell at phone width', () => {
  only('phone');

  test('AC-004: the showroom shows every building block and switches light and dark', async ({
    page,
  }) => {
    await open(page, '/showroom');
    for (const block of [
      'showroom-text',
      'showroom-buttons',
      'showroom-chips',
      'showroom-inputs',
      'showroom-lists',
      'showroom-checks',
      'showroom-people',
      'showroom-progress',
      'showroom-media',
      'showroom-states',
      'showroom-offline-banner',
      'showroom-proposal',
      'showroom-overlay',
      'showroom-icons',
    ]) {
      await expect(tid(page, block), block).toBeVisible();
    }
    // The switch is a preview of the showroom only; the app setting stays as it is.
    const showroom = tid(page, 'showroom');
    const background = () => showroom.evaluate((el) => getComputedStyle(el).backgroundColor);
    await expect.poll(background).toBe(BG.markthalleLight);
    await tid(page, 'showroom-mode-dark').click();
    await expect(tid(page, 'showroom-mode-dark')).toHaveAttribute('aria-checked', 'true');
    await expect.poll(background).toBe(BG.markthalleDark);
    await tid(page, 'showroom-mode-light').click();
    await expect.poll(background).toBe(BG.markthalleLight);
  });

  test('AC-006: Heute, Rezepte and a recipe load everything from the same host', async ({
    page,
    requests,
  }) => {
    await open(page, '/');
    await nav(page, 'rezepte');
    await tid(page, 'recipe-card-rec-mango-curry').click();
    await expect(tid(page, 'recipe-title')).toHaveText('Mango-Curry');
    await page.waitForLoadState('networkidle');
    const origin = new URL(page.url()).host;
    const foreign = requests.filter(
      (url) => !url.startsWith('data:') && new URL(url).host !== origin,
    );
    expect(foreign, 'requests to other hosts').toEqual([]);
    // Fonts and photos really were loaded, and from here.
    expect(requests.some((url) => /\.(ttf|otf|woff2?)(\?|$)/.test(url))).toBe(true);
    expect(requests.some((url) => /\.(jpe?g|png|webp)(\?|$)/.test(url))).toBe(true);
  });

  test('AC-007: Heute with a bottom bar of five areas and the assistant button', async ({
    page,
  }) => {
    await open(page, '/');
    await expect(tid(page, 'today-screen')).toBeVisible();
    const labels = await tidPrefix(page, 'tab-').allInnerTexts();
    // Spec 0002 renamed "Rezepte" to "Essen" (0002 AC-001).
    expect(labels.map((label) => label.trim())).toEqual([
      'Heute',
      'Essen',
      'Plan',
      'Liste',
      'Haushalt',
    ]);
    const bar = await tid(page, 'tab-index').boundingBox();
    const viewport = page.viewportSize();
    expect(bar && viewport && bar.y > viewport.height * 0.8, 'tab bar sits at the bottom').toBe(
      true,
    );
    await expect(tid(page, 'assistant-open')).toBeVisible();
    await expect(tid(page, 'nav-index')).toBeHidden();
  });

  test('AC-009: dark system setting shows the dark design; Hell, Dunkel and System can be chosen', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await open(page, '/');
    await expect.poll(() => appBackground(page)).toBe(BG.markthalleDark);
    await openSettings(page);
    await expect(tid(page, 'appearance-system')).toHaveAttribute('aria-checked', 'true');
    await tid(page, 'appearance-light').click();
    await expect.poll(() => appBackground(page)).toBe(BG.markthalleLight);
    await tid(page, 'appearance-dark').click();
    await expect.poll(() => appBackground(page)).toBe(BG.markthalleDark);
    await tid(page, 'appearance-system').click();
    await page.emulateMedia({ colorScheme: 'light' });
    await expect.poll(() => appBackground(page)).toBe(BG.markthalleLight);
  });

  test('AC-010: simulated offline shows the orange hint, greys out editing, checking still works', async ({
    page,
  }) => {
    await open(page, '/');
    await goOffline(page);
    await nav(page, 'rezepte');
    const banner = tid(page, 'offline-banner');
    await expect(banner).toHaveText('Offline – Lesen und Abhaken gehen');
    const color = parseRgb(await banner.evaluate((el) => getComputedStyle(el).backgroundColor));
    const h = hue(color);
    expect(h >= 15 && h <= 50, `banner hue ${h} is orange`).toBe(true);
    await expect(tid(page, 'recipe-new')).toBeDisabled();
    await expect(tid(page, 'recipe-offline-hint')).toHaveText(
      'Offline – zum Bearbeiten brauchst du Netz',
    );
    await nav(page, 'liste');
    const milk = itemRows(page, 'Milch');
    await expect(milk).toHaveCount(1);
    await milk.locator('[role="checkbox"]').click();
    await expect(
      tid(page, 'done-section').locator('[aria-label="Milch"][role="button"]'),
    ).toBeVisible();
  });

  test('AC-011: an unknown address shows "Nicht gefunden" with a way back to Heute', async ({
    page,
  }) => {
    await open(page, '/gibt-es-nicht');
    await expect(tid(page, 'not-found')).toContainText('Nicht gefunden');
    await tid(page, 'not-found-home').click();
    await expect(tid(page, 'today-screen')).toBeVisible();
  });

  test('AC-012: the demo household "Enrico & Nadja" with members, recipes, plan, list, store and chores', async ({
    page,
  }) => {
    await open(page, '/');
    await openSettings(page);
    await expect(tid(page, 'household-hh-demo')).toContainText('Enrico & Nadja');
    await expect(tid(page, 'household-hh-demo-active')).toBeVisible();
    await expect(tid(page, 'profile-current')).toContainText('Enrico');
    await expect(tid(page, 'profile-current')).toContainText('isst alles');
    await tid(page, 'switch-member').click();
    await expect(tid(page, 'profile-current')).toContainText('Nadja');
    await expect(tid(page, 'profile-current')).toContainText('vegetarisch');
    await tid(page, 'link-stores').click();
    await expect(tid(page, 'store-store-rewe')).toContainText('Rewe Südstadt');
    await back(page);
    await back(page);

    await nav(page, 'rezepte');
    const count = Number((await tid(page, 'recipe-count').innerText()).match(/\d+/)?.[0]);
    expect(count).toBeGreaterThanOrEqual(20);
    await tid(page, 'recipe-card-rec-mango-curry').click();
    await expect(tid(page, 'variant').locator('[role="radio"]')).toHaveText([
      'mit Tofu',
      'mit Hähnchen',
    ]);
    await back(page);
    await tid(page, 'recipe-card-rec-spaghetti-bolognese').click();
    await expect(tid(page, 'recipe-title')).toHaveText('Spaghetti Bolognese');
    await expect(tid(page, 'variant')).toBeHidden();
    await back(page);

    await nav(page, 'plan');
    // Every day of the current week is shown, and the plan has dishes in it.
    await expect(tidPrefix(page, 'day-')).toHaveCount(7);
    expect(await tidPrefix(page, 'entry-plan-').count()).toBeGreaterThan(3);

    await nav(page, 'liste');
    await expect(tid(page, 'screen-title')).toHaveText('Standardliste');
    expect(
      await page
        .locator(`[data-testid^="item-"][role="checkbox"][aria-checked="false"]${ACTIVE}`)
        .count(),
    ).toBeGreaterThan(0);

    await nav(page, 'haushalt');
    await tid(page, 'chores-tab-all').click();
    const chores = tid(page, 'chores-all').locator('[data-testid^="chore-chore-"][role="button"]');
    expect(await chores.count()).toBeGreaterThanOrEqual(8);
  });

  test('AC-013: typing "Karot" suggests "Möhren · auch: Karotten"', async ({ page }) => {
    // The catalog size (≥ 250 articles with area and diet) is a data property and is pinned by
    // the unit tests of packages/api, not by this walk-through.
    await open(page, '/liste');
    await tid(page, 'smart-input').fill('Karot');
    await expect(tid(page, 'smart-suggestions')).toContainText('Möhren · auch: Karotten');
  });

  test('AC-014: reloading restores the demo data', async ({ page }) => {
    await open(page, '/liste');
    await tid(page, 'smart-input').fill('Spülmittel');
    await tid(page, 'smart-input').press('Enter');
    await expect(itemRows(page, 'Spülmittel')).toHaveCount(1);
    await page.reload();
    await expect(tid(page, 'screen-title')).toHaveText('Standardliste');
    await expect(itemRows(page, 'Milch')).toHaveCount(1);
    await expect(itemRows(page, 'Spülmittel')).toHaveCount(0);
  });

  test('AC-016: the empty household "Test" shows the first steps; the starter catalog is there', async ({
    page,
  }) => {
    await open(page, '/');
    await openSettings(page);
    await tid(page, 'household-hh-test').click();
    await expect(tid(page, 'household-hh-test-active')).toBeVisible();
    await back(page);
    await nav(page, 'rezepte');
    const empty = tid(page, 'recipes-empty');
    await expect(empty).toContainText('Noch keine Rezepte');
    await expect(tid(page, 'empty-recipe-title')).toHaveText(/Titel eingeben/);
    await expect(tid(page, 'empty-starter')).toHaveText(/Starter-Rezepte ansehen/);
    await expect(tid(page, 'empty-describe')).toHaveText(/Beschreiben ✨/);
    await nav(page, 'liste');
    await tid(page, 'smart-input').fill('Karot');
    await expect(tid(page, 'smart-suggestions')).toContainText('Möhren · auch: Karotten');
  });

  test('AC-046: "Markthalle" first, "Frisch" applies at once and survives a reload', async ({
    page,
  }) => {
    await open(page, '/');
    await expect.poll(() => appBackground(page)).toBe(BG.markthalleLight);
    await openSettings(page);
    await expect(tid(page, 'theme-markthalle-selected')).toBeVisible();
    await tid(page, 'theme-frisch').click();
    await expect(tid(page, 'theme-frisch-selected')).toBeVisible();
    await expect.poll(() => appBackground(page)).toBe(BG.frischLight);
    await back(page);
    for (const key of ['rezepte', 'plan', 'liste', 'haushalt'] as const) {
      await nav(page, key);
      await expect.poll(() => appBackground(page), key).toBe(BG.frischLight);
    }
    await expect(tid(page, 'chores-screen')).toBeVisible();
    await expect(page).toHaveURL(/\/haushalt$/);
    await page.reload();
    await expect(tid(page, 'chores-screen')).toBeVisible();
    await expect.poll(() => appBackground(page)).toBe(BG.frischLight);
    await openSettings(page);
    await expect(tid(page, 'theme-frisch-selected')).toBeVisible();
  });

  test('AC-047: an unknown stored theme falls back to "Markthalle" without errors', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'housekeeping.settings.v1',
        JSON.stringify({ themeId: 'gibt-es-nicht', appearance: 'light' }),
      );
    });
    await open(page, '/');
    await expect(tid(page, 'today-screen')).toBeVisible();
    await expect.poll(() => appBackground(page)).toBe(BG.markthalleLight);
    await openSettings(page);
    await expect(tid(page, 'theme-markthalle-selected')).toBeVisible();
    // Uncaught page errors fail every test (fixture "pageErrors").
  });
});

test.describe('shell at desktop width', () => {
  only('desktop');

  test('AC-008: navigation on the side, recipe list and recipe side by side', async ({ page }) => {
    await open(page, '/');
    await expect(tid(page, 'nav-index')).toBeVisible();
    await expect(tid(page, 'tab-index')).toBeHidden();
    await nav(page, 'rezepte');
    await tid(page, 'recipe-card-rec-mango-curry').click();
    await expect(tid(page, 'recipe-title')).toHaveText('Mango-Curry');
    const sidebar = await tid(page, 'nav-rezepte').boundingBox();
    const list = await tid(page, 'recipe-search').boundingBox();
    const detail = await tid(page, 'recipe-detail').boundingBox();
    expect(sidebar && list && detail).toBeTruthy();
    if (!sidebar || !list || !detail) return;
    expect(sidebar.x + sidebar.width, 'sidebar left of the list').toBeLessThanOrEqual(list.x);
    expect(list.x + list.width, 'list left of the recipe').toBeLessThanOrEqual(detail.x);
    // Side by side: both start in the upper part of the window.
    expect(detail.y).toBeLessThan(300);
    expect(list.y).toBeLessThan(300);
  });
});
