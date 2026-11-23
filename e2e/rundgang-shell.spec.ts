import {
  accessToken,
  ACTIVE,
  appBackground,
  back,
  expect,
  goOffline,
  hexToRgb,
  hue,
  itemRows,
  leaveManaged,
  nav,
  only,
  open,
  openItem,
  openManaged,
  openSettings,
  parseRgb,
  PLAN_ENTRY,
  secondDevice,
  shoppingCheck,
  SUPABASE_URL,
  supabaseFetch,
  switchHousehold,
  test,
  tid,
  tidPrefix,
} from './helpers';
import { seedIds } from './seed-ids';

// Spec 0001 — app shell, themes, settings, demo data (REQ-001 to REQ-004), signed in against the
// local backend (spec 0003). Read-only except AC-010 (one offline check) and AC-014 (adds
// "Spülmittel"); nothing here depends on another file's leftovers.

const MANGO = seedIds['rec-mango-curry'];

/** Open items of an article in the demo household, read as Enrico through the API. */
async function openItemsOnServer(name: string): Promise<number> {
  const token = await accessToken('enrico');
  const articles = (await (
    await supabaseFetch(
      `/rest/v1/articles?select=id&household_id=eq.${seedIds['hh-demo']}&name=eq.${encodeURIComponent(name)}`,
      { token },
    )
  ).json()) as { id: string }[];
  const ids = articles.map((article) => article.id).join(',');
  if (!ids) return 0;
  const items = (await (
    await supabaseFetch(
      `/rest/v1/shopping_items?select=id&checked=is.false&article_id=in.(${ids})`,
      {
        token,
      },
    )
  ).json()) as unknown[];
  return items.length;
}

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
    // The switch is a preview of the showroom only; the app setting stays as it is. The preview
    // bar slides away on phones while scrolling down, so it is used before the blocks are checked.
    const showroom = tid(page, 'showroom');
    const background = () => showroom.evaluate((el) => getComputedStyle(el).backgroundColor);
    await expect.poll(background).toBe(BG.markthalleLight);
    await tid(page, 'showroom-mode-dark').click();
    await expect(tid(page, 'showroom-mode-dark')).toHaveAttribute('aria-checked', 'true');
    await expect.poll(background).toBe(BG.markthalleDark);
    await tid(page, 'showroom-mode-light').click();
    await expect.poll(background).toBe(BG.markthalleLight);
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
  });

  test('AC-006: Heute, Rezepte and a recipe load everything from the same host (and our Supabase)', async ({
    page,
    requests,
  }) => {
    await open(page, '/');
    await nav(page, 'rezepte');
    await tid(page, `recipe-card-${MANGO}`).click();
    await expect(tid(page, 'recipe-title')).toHaveText('Mango-Curry');
    await page.waitForLoadState('networkidle');
    // Spec 0003: data comes from the household's own Supabase; nothing goes anywhere else.
    const allowed = new Set([new URL(page.url()).host, new URL(SUPABASE_URL()).host]);
    const foreign = requests.filter(
      (url) => !url.startsWith('data:') && !allowed.has(new URL(url).host),
    );
    expect(foreign, 'requests to other hosts').toEqual([]);
    // Fonts and photos really were loaded, and from here.
    expect(requests.some((url) => /\.(ttf|otf|woff2?)(\?|$)/.test(url))).toBe(true);
    expect(requests.some((url) => /\.(jpe?g|png|webp)(\?|$)/.test(url))).toBe(true);
  });

  test('AC-007: Übersicht with a bottom bar of five areas and ⊞ for "Verwalten"', async ({
    page,
  }) => {
    await open(page, '/');
    await expect(tid(page, 'today-screen')).toBeVisible();
    const labels = await tidPrefix(page, 'tab-').allInnerTexts();
    // "Essen" (spec 0002, AC-001), "Kalender" (spec 0010), "Übersicht" (spec 0005).
    expect(labels.map((label) => label.trim())).toEqual([
      'Übersicht',
      'Essen',
      'Kalender',
      'Liste',
      'Haushalt',
    ]);
    const bar = await tid(page, 'tab-index').boundingBox();
    const viewport = page.viewportSize();
    expect(bar && viewport && bar.y > viewport.height * 0.8, 'tab bar sits at the bottom').toBe(
      true,
    );
    // Spec 0005, AC-044: no assistant button while the AI switch is off; ⊞ instead.
    await expect(tid(page, 'header-manage')).toBeVisible();
    await expect(page.locator('[data-testid="assistant-open"]')).toHaveCount(0);
    await expect(tid(page, 'nav-index')).toBeHidden();
  });

  test('AC-044 (0005): with the AI switch off no way into the AI is shown', async ({
    page,
    requests,
  }) => {
    const aiEntries = [
      'assistant-open',
      'ai-search-toggle',
      'empty-describe',
      'recipe-assistant',
      'dictate',
      'list-assistant',
      'settings-ai',
      'nav-assistant',
    ];
    const noAi = async (where: string) => {
      for (const id of aiEntries) {
        await expect(
          page.locator(`[data-testid="${id}"]${ACTIVE}`),
          `${id} on ${where}`,
        ).toHaveCount(0);
      }
    };
    await open(page, '/');
    await noAi('Übersicht');
    await nav(page, 'rezepte');
    await expect(tid(page, `recipe-card-${MANGO}`)).toBeVisible();
    await noAi('Essen');
    await tid(page, `recipe-card-${MANGO}`).click();
    await expect(tid(page, 'recipe-title')).toHaveText('Mango-Curry');
    await noAi('Rezept');
    await back(page);
    for (const key of ['kalender', 'liste', 'haushalt'] as const) {
      await nav(page, key);
      await noAi(key);
    }
    await openSettings(page);
    await noAi('Einstellungen');
    // AC-045: nothing went to an AI function of the server.
    expect(requests.filter((url) => /\/functions\/v1\/(ai-|speech-)/.test(url))).toEqual([]);
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
    await expect(banner).toHaveText('Offline – Lesen, Einkaufen und Packen gehen');
    const color = parseRgb(await banner.evaluate((el) => getComputedStyle(el).backgroundColor));
    const h = hue(color);
    expect(h >= 15 && h <= 50, `banner hue ${h} is orange`).toBe(true);
    // "Neu" stays open; its entries are greyed out with the hint (spec 0008).
    await tid(page, 'recipe-new').click();
    await expect(tid(page, 'recipe-new-recipe')).toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('Escape');
    await expect(tid(page, 'recipe-offline-hint')).toHaveText(
      'Offline – zum Bearbeiten brauchst du Netz',
    );
    // Checking happens in "Einkaufen" (spec 0006, D24), and it works offline.
    await nav(page, 'liste');
    await tid(page, 'start-shopping').click();
    const milk = shoppingCheck(page, 'Milch');
    await expect(milk).toHaveAttribute('aria-checked', 'false');
    await milk.click();
    await expect(milk).toHaveAttribute('aria-checked', 'true');
  });

  test('AC-011: an unknown address shows "Nicht gefunden" with a way back to the Übersicht', async ({
    page,
  }) => {
    await open(page, '/gibt-es-nicht');
    await expect(tid(page, 'not-found')).toContainText('Nicht gefunden');
    await tid(page, 'not-found-home').click();
    await expect(tid(page, 'today-screen')).toBeVisible();
  });

  test('AC-012: the demo household "Enrico & Nadja" with members, recipes, plan, list, store and chores', async ({
    page,
    browser,
  }) => {
    await open(page, '/');
    await openSettings(page);
    await expect(tid(page, 'profile-current')).toContainText('Enrico');
    await expect(tid(page, 'profile-current')).toContainText('isst alles');
    await back(page);
    // "Als … ansehen" is gone with real accounts (spec 0003): Nadja's profile, on her device.
    const nadja = await secondDevice(browser, 'nadja');
    await openSettings(nadja.page);
    await expect(tid(nadja.page, 'profile-current')).toContainText('Nadja');
    await expect(tid(nadja.page, 'profile-current')).toContainText('vegetarisch');
    await nadja.context.close();
    await page.bringToFront();

    // Households and members live under "Verwalten" (spec 0005).
    const demo = seedIds['hh-demo'];
    await openManaged(page, 'members');
    await expect(tid(page, `household-${demo}`)).toContainText('Enrico & Nadja');
    await expect(tid(page, `household-${demo}-active`)).toBeVisible();
    await expect(tid(page, `household-member-${seedIds['m-nadja']}`)).toContainText('Nadja');
    await leaveManaged(page);
    await openManaged(page, 'stores');
    await expect(tid(page, `store-${seedIds['store-rewe']}`)).toContainText('Rewe Südstadt');
    await leaveManaged(page);

    await nav(page, 'rezepte');
    const count = Number((await tid(page, 'recipe-count').innerText()).match(/\d+/)?.[0]);
    expect(count).toBeGreaterThanOrEqual(20);
    await tid(page, `recipe-card-${MANGO}`).click();
    await expect(tid(page, 'variant').locator('[role="radio"]')).toHaveText([
      'mit Tofu',
      'mit Hähnchen',
    ]);
    await back(page);
    const bolognese = tid(page, `recipe-card-${seedIds['rec-spaghetti-bolognese']}`);
    await bolognese.scrollIntoViewIfNeeded();
    await bolognese.click();
    await expect(tid(page, 'recipe-title')).toHaveText('Spaghetti Bolognese');
    await expect(tid(page, 'variant')).toBeHidden();
    await back(page);

    await nav(page, 'kalender');
    // Every day of the current week is shown, and the calendar has dishes in it.
    // `day-<date>`, not the blocks `day-block-<date>` (spec 0031, T-03).
    await expect(page.locator(`[data-testid^="day-2"]${ACTIVE}`)).toHaveCount(7);
    expect(await page.locator(PLAN_ENTRY).count()).toBeGreaterThan(3);

    await nav(page, 'liste');
    await expect(tid(page, 'screen-title')).toHaveText('Einkaufsliste');
    await expect(tid(page, 'list-headline')).toContainText(/\d+ offen/);
    await expect(openItem(page, 'Milch')).toHaveCount(1);

    await nav(page, 'haushalt');
    await tid(page, 'chores-tab-all').click();
    const chores = tid(page, 'chores-all').locator('[data-testid^="chore-"][role="button"]');
    await expect.poll(() => chores.count()).toBeGreaterThanOrEqual(8);
  });

  test('AC-013: typing "Karot" suggests "Möhren · auch: Karotten"', async ({ page }) => {
    // The catalog size (≥ 250 articles with area and diet) is a data property and is pinned by
    // the unit tests of packages/api, not by this walk-through.
    await open(page, '/liste');
    await tid(page, 'smart-input').fill('Karot');
    await expect(tid(page, 'smart-suggestions')).toContainText('Möhren · auch: Karotten');
  });

  // Spec 0003 AC-014 replaces spec 0001 AC-014 ("reloading restores the demo data").
  test('AC-014 (0003): "Spülmittel" on the shopping list is still there after a reload', async ({
    page,
  }) => {
    await open(page, '/liste');
    await tid(page, 'smart-input').fill('Spülmittel');
    await tid(page, 'smart-input').press('Enter');
    await expect(itemRows(page, 'Spülmittel')).toHaveCount(1);
    // Saved on the server, not only in this device's overlay.
    await expect.poll(() => openItemsOnServer('Spülmittel')).toBe(1);
    await page.reload();
    await expect(tid(page, 'screen-title')).toHaveText('Einkaufsliste');
    await expect(itemRows(page, 'Milch')).toHaveCount(1);
    await expect(itemRows(page, 'Spülmittel')).toHaveCount(1);
  });

  test('AC-046 / AC-047 (0023) / AC-018 (0008): the empty household "Test" shows the first steps; the starter catalog is there', async ({
    page,
  }) => {
    await open(page, '/');
    await switchHousehold(page, seedIds['hh-test']);
    await nav(page, 'rezepte');
    const empty = tid(page, 'recipes-empty');
    await expect(empty).toContainText('Noch keine Rezepte');
    await expect(empty).toContainText(
      'Legt euer erstes Rezept an. Ein Titel reicht; Zutaten, Schritte und Links kommen später dazu.',
    );
    await expect(tid(page, 'empty-recipe-new')).toHaveText(/Rezept anlegen/);
    await expect(tid(page, 'empty-collection-new')).toHaveText(/Sammlung anlegen/);
    await expect(page.locator(`[data-testid="empty-starter"]${ACTIVE}`)).toHaveCount(0);
    // Spec 0008, AC-018: nothing to search or filter yet.
    await expect(page.locator(`[data-testid="recipe-search"]${ACTIVE}`)).toHaveCount(0);
    await expect(page.locator(`[data-testid="recipe-filters"]${ACTIVE}`)).toHaveCount(0);
    // Spec 0005, AC-047: no "Beschreiben ✨" while the AI switch is off.
    await expect(page.locator(`[data-testid="empty-describe"]${ACTIVE}`)).toHaveCount(0);
    // Spec 0023, AC-046: "Sammlung anlegen" opens "Neu" with the kind "Sammlung".
    await tid(page, 'empty-collection-new').click();
    await expect(tid(page, 'new-recipe-kind-collection')).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Escape');
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
    for (const key of ['rezepte', 'kalender', 'liste', 'haushalt'] as const) {
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

  test('AC-008: navigation on the side; a recipe opens as its own page next to it', async ({
    page,
  }) => {
    await open(page, '/');
    await expect(tid(page, 'nav-index')).toBeVisible();
    await expect(tid(page, 'tab-index')).toBeHidden();
    await nav(page, 'rezepte');
    await tid(page, `recipe-card-${MANGO}`).click();
    // Spec 0008 (E12): every width opens /rezept/<id>; the list is not beside it any more.
    await expect(page).toHaveURL(new RegExp(`/rezept/${MANGO}$`));
    await expect(tid(page, 'recipe-title')).toHaveText('Mango-Curry');
    await expect(tid(page, 'recipe-search')).toBeHidden();
    const sidebar = await tid(page, 'nav-rezepte').boundingBox();
    const detail = await tid(page, 'recipe-detail').boundingBox();
    expect(sidebar && detail).toBeTruthy();
    if (!sidebar || !detail) return;
    expect(sidebar.x + sidebar.width, 'sidebar left of the recipe').toBeLessThanOrEqual(detail.x);
    expect(detail.y).toBeLessThan(300);
  });
});
