import type { BrowserContext, Page } from '@playwright/test';

import {
  accessToken,
  back,
  createTestHousehold,
  day,
  doneItem,
  expect,
  itemRows,
  nav,
  only,
  open,
  openItem,
  openSettings,
  PLAN_ENTRY,
  secondDevice,
  showPlanWeek,
  supabaseFetch,
  switchHousehold,
  test,
  tid,
  tidPrefix,
  TODAY,
  toastMessage,
  unique,
} from './helpers';
import { seedIds } from './seed-ids';

// Spec 0003 — data in Supabase reaches the other device (REQ-003/004), honest write errors
// (REQ-006) and the store queue (REQ-007), with two independent browsers: Enrico's (the test's
// page) and Nadja's (a second context). Each two-device test gets its own household with both
// as members (created through the API), so no test sees another's rows. Waiting is done with
// auto-retrying assertions (realtime is a signal that triggers a pull), never with sleeps.

only('phone');

const REJECTED = 'Hat nicht geklappt – bitte noch einmal versuchen';
/** Realtime signal → pull → render on the other device. */
const SYNC = { timeout: 20_000 };

const contexts: BrowserContext[] = [];
test.afterEach(async () => {
  for (const context of contexts.splice(0)) await context.close();
});

interface Devices {
  householdId: string;
  enrico: Page;
  nadja: Page;
}

/** A fresh household of Enrico and Nadja, active on both devices. */
async function twoDevices(
  page: Page,
  browser: Parameters<typeof secondDevice>[0],
): Promise<Devices> {
  const householdId = await createTestHousehold(`Zwei Geräte ${unique()}`, { withNadja: true });
  await open(page, '/');
  await switchHousehold(page, householdId);
  const nadja = await secondDevice(browser, 'nadja');
  contexts.push(nadja.context);
  await switchHousehold(nadja.page, householdId);
  await page.bringToFront();
  return { householdId, enrico: page, nadja: nadja.page };
}

async function addItem(page: Page, text: string): Promise<void> {
  await tid(page, 'smart-input').fill(text);
  await tid(page, 'smart-input').press('Enter');
}

/** Store mode of the default list. */
async function startShopping(page: Page): Promise<void> {
  await tid(page, 'start-shopping').click();
  await expect(tid(page, 'shopping-progress')).toBeVisible();
}

/** The check box of an item in store mode (open or done). */
function smCheck(page: Page, name: string) {
  return tidPrefix(page, 'sm-item-').locator(`[role="checkbox"][aria-label="${name}"]`);
}

/** Items of an article in a household, read through the API as Enrico. */
async function serverItems(
  householdId: string,
  name: string,
): Promise<{ checked: boolean; contributions: number }[]> {
  const token = await accessToken('enrico');
  const articles = (await (
    await supabaseFetch(
      `/rest/v1/articles?select=id&household_id=eq.${householdId}&name=eq.${encodeURIComponent(name)}`,
      { token },
    )
  ).json()) as { id: string }[];
  const ids = articles.map((article) => article.id).join(',');
  if (!ids) return [];
  const items = (await (
    await supabaseFetch(
      `/rest/v1/shopping_items?select=checked,shopping_contributions(id)&article_id=in.(${ids})`,
      { token },
    )
  ).json()) as { checked: boolean; shopping_contributions: unknown[] }[];
  return items.map((item) => ({
    checked: item.checked,
    contributions: item.shopping_contributions.length,
  }));
}

/** The id of a meal ("Mittag", "Abend") of a household, read through the API. */
async function slotId(householdId: string, name: string): Promise<string> {
  const [household] = (await (
    await supabaseFetch(`/rest/v1/households?select=meal_slots&id=eq.${householdId}`, {
      token: await accessToken('enrico'),
    })
  ).json()) as { meal_slots: { id: string; name: string }[] }[];
  const slot = household?.meal_slots.find((candidate) => candidate.name === name);
  if (!slot) throw new Error(`meal ${name} missing`);
  return slot.id;
}

/** Records every toast text shown from now on (to prove that none appeared). */
async function recordToasts(page: Page): Promise<() => Promise<string[]>> {
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { e2eToasts: string[] }).e2eToasts = seen;
    new MutationObserver(() => {
      const toast = document.querySelector('[data-testid="toast-message"]');
      const text = toast?.textContent ?? '';
      if (text && seen.at(-1) !== text) seen.push(text);
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
  return () =>
    page.evaluate(() => (window as unknown as { e2eToasts: string[] }).e2eToasts.slice());
}

test('AC-012: Enrico removes Nadja; the household disappears from her device with its data', async ({
  page,
  browser,
}) => {
  const { householdId, enrico, nadja } = await twoDevices(page, browser);
  // Nadja has it in her local cache, with data: an item on its list.
  await nav(enrico, 'liste');
  await addItem(enrico, 'Milch');
  await nadja.bringToFront();
  await nav(nadja, 'liste');
  await expect(openItem(nadja, 'Milch')).toHaveCount(1, SYNC);
  await openSettings(nadja);
  await expect(tid(nadja, `household-${householdId}-active`)).toBeVisible();

  await enrico.bringToFront();
  await openSettings(enrico);
  await tid(enrico, `household-member-remove-${seedIds['m-nadja']}`).click();
  await expect(toastMessage(enrico)).toContainText('ist entfernt');

  await nadja.bringToFront();
  await expect(tid(nadja, `household-${householdId}`)).toHaveCount(0, SYNC);
  // Another of her households is active now, and the removed one's list is gone.
  await expect(tid(nadja, 'household-list').locator('[aria-label$=", aktiv"]')).toHaveCount(1);
  await back(nadja);
  await nav(nadja, 'liste');
  await expect(tid(nadja, 'screen-title')).toBeVisible();
  const cached = await nadja.evaluate(
    (id) =>
      new Promise<boolean>((resolve) => {
        const request = indexedDB.open('housekeeping');
        request.onsuccess = () => {
          const db = request.result;
          const all = db.transaction('cache').objectStore('cache').getAll();
          all.onsuccess = () => {
            db.close();
            resolve(JSON.stringify(all.result).includes(id));
          };
        };
      }),
    householdId,
  );
  expect(cached, 'the removed household is still in her local cache').toBe(false);
});

test('AC-013: Enrico creates "Linsen-Dal Test"; it appears at Nadja without a reload', async ({
  page,
  browser,
}) => {
  const { enrico, nadja } = await twoDevices(page, browser);
  const title = `Linsen-Dal Test ${unique()}`;
  await nav(nadja, 'rezepte');
  await enrico.bringToFront();
  await nav(enrico, 'rezepte');
  await tid(enrico, 'recipe-new').click();
  await tid(enrico, 'new-recipe-title').fill(title);
  await tid(enrico, 'new-recipe-save').click();
  await expect(tid(enrico, 'recipe-title')).toHaveText(title);

  await nadja.bringToFront();
  await expect(tidPrefix(nadja, 'recipe-card-').filter({ hasText: title })).toHaveCount(1, SYNC);
});

test('AC-015: Enrico removes "Halloumi-Pfanne" from the plan; it disappears at Nadja', async ({
  page,
  browser,
}) => {
  const { householdId, enrico, nadja } = await twoDevices(page, browser);
  const dinner = await slotId(householdId, 'Abend');
  await nav(enrico, 'plan');
  await tid(enrico, `add-${TODAY}-${dinner}`).click();
  // The new household has no recipes: the dish is planned as free text.
  await tid(enrico, 'add-entry-mode-text').click();
  await tid(enrico, 'add-entry-text').fill('Halloumi-Pfanne');
  await tid(enrico, 'add-entry-text-save').click();
  const entry = (p: Page) => p.locator(PLAN_ENTRY).filter({ hasText: 'Halloumi-Pfanne' });
  await expect(entry(enrico)).toHaveCount(1);

  await nadja.bringToFront();
  await nav(nadja, 'plan');
  await expect(entry(nadja)).toHaveCount(1, SYNC);

  await enrico.bringToFront();
  await entry(enrico).click();
  await tid(enrico, 'entry-remove').click();
  await expect(entry(enrico)).toHaveCount(0);

  await nadja.bringToFront();
  await expect(entry(nadja)).toHaveCount(0, SYNC);
});

test('AC-019: the server refuses a recipe change; the old value is back with a calm hint', async ({
  page,
  allowConsoleError,
}) => {
  allowConsoleError(/^Failed to load resource: the server responded with a status of 400/);
  // There is no rename in the app; the change is the ingredient note ("Zusatz") of a recipe,
  // which takes the same path (apply_changes). The server's refusal is forced.
  await open(page, `/rezept/${seedIds['rec-pizza-margherita']}`);
  const note = tidPrefix(page, 'ingredient-shopping-note-');
  await expect(note).toHaveText('(Fior di Latte)');
  const ingredientId = (await note.getAttribute('data-testid'))?.replace(
    'ingredient-shopping-note-',
    '',
  );
  await page.route('**/rest/v1/rpc/apply_changes', (route) =>
    route.fulfill({
      status: 400,
      contentType: 'application/json',
      json: {
        code: '23514',
        message: 'new row for relation "recipes" violates check constraint',
        details: null,
        hint: null,
      },
    }),
  );
  await tid(page, `ingredient-note-${ingredientId}`).click();
  await tid(page, 'ingredient-note-input').fill('Büffelmozzarella');
  await tid(page, 'ingredient-note-save').click();
  await expect(toastMessage(page)).toHaveText(REJECTED);
  await expect(tid(page, `ingredient-shopping-note-${ingredientId}`)).toHaveText('(Fior di Latte)');
  await page.unroute('**/rest/v1/rpc/apply_changes');
  await page.reload();
  await expect(tid(page, `ingredient-shopping-note-${ingredientId}`)).toHaveText('(Fior di Latte)');
});

test('AC-020: a server error while taking over the pantry check puts nothing on the list', async ({
  page,
  allowConsoleError,
}) => {
  allowConsoleError(/^Failed to load resource: the server responded with a status of 400/);
  const curryDay = day(2);
  await open(page, '/plan');
  await showPlanWeek(page, curryDay);
  await page.route('**/rest/v1/rpc/add_shopping_contributions', (route) =>
    route.fulfill({
      status: 400,
      contentType: 'application/json',
      json: { code: 'P0001', message: 'forced failure', details: null, hint: null },
    }),
  );
  await tid(page, 'plan-to-list').click();
  for (const chip of await tidPrefix(page, 'pc-day-').all()) {
    const id = await chip.getAttribute('data-testid');
    const selected = (await chip.getAttribute('aria-selected')) === 'true';
    if ((id === `pc-day-${curryDay}`) !== selected) await chip.click();
  }
  await expect(tid(page, 'pc-dishes')).toHaveText('Mango-Curry');
  await tid(page, 'pc-next').click();
  const needed = tidPrefix(page, 'pc-row-').locator('[role="checkbox"][aria-checked="true"]');
  expect(await needed.count()).toBeGreaterThan(1);
  await tid(page, 'pc-apply').click();
  await expect(toastMessage(page)).toHaveText(REJECTED);

  await nav(page, 'liste');
  for (const name of ['Mango', 'Kokosmilch']) {
    await expect(itemRows(page, name), name).toHaveCount(0);
    expect(await serverItems(seedIds['hh-demo'], name), name).toEqual([]);
  }
});

test('AC-021: Enrico checks "Milch" offline in store mode; online again, it is checked at Nadja', async ({
  page,
  browser,
  context,
}) => {
  const { householdId, enrico, nadja } = await twoDevices(page, browser);
  await nav(enrico, 'liste');
  await addItem(enrico, 'Milch');
  await expect(openItem(enrico, 'Milch')).toHaveCount(1);
  await startShopping(enrico);

  await context.setOffline(true);
  await smCheck(enrico, 'Milch').click();
  await expect(tid(enrico, 'sm-done')).toContainText('Milch');
  await expect(tid(enrico, 'offline-banner')).toBeVisible();

  await nadja.bringToFront();
  await nav(nadja, 'liste');
  await expect(openItem(nadja, 'Milch')).toHaveCount(1);

  await enrico.bringToFront();
  await context.setOffline(false);
  await nadja.bringToFront();
  await expect(doneItem(nadja, 'Milch')).toHaveCount(1, SYNC);
  expect(await serverItems(householdId, 'Milch')).toEqual([{ checked: true, contributions: 1 }]);
});

test('AC-022: checking wins — Enrico unchecks "Butter" offline, Nadja re-checks it, it stays checked', async ({
  page,
  browser,
  context,
}) => {
  const { householdId, enrico, nadja } = await twoDevices(page, browser);
  await nav(enrico, 'liste');
  // Store mode needs something still to buy.
  await addItem(enrico, 'Milch');
  await addItem(enrico, 'Butter');
  await openItem(enrico, 'Butter').locator('[role="checkbox"]').click();
  await expect(doneItem(enrico, 'Butter')).toHaveCount(1);
  await nadja.bringToFront();
  await nav(nadja, 'liste');
  await expect(doneItem(nadja, 'Butter')).toHaveCount(1, SYNC);

  await enrico.bringToFront();
  await startShopping(enrico);
  await context.setOffline(true);
  await smCheck(enrico, 'Butter').click();
  await expect(smCheck(enrico, 'Butter')).toHaveAttribute('aria-checked', 'false');

  // Nadja takes the check back and sets it again, online.
  await nadja.bringToFront();
  await doneItem(nadja, 'Butter').click();
  await expect(openItem(nadja, 'Butter')).toHaveCount(1);
  await openItem(nadja, 'Butter').locator('[role="checkbox"]').click();
  await expect(doneItem(nadja, 'Butter')).toHaveCount(1);

  await enrico.bringToFront();
  await context.setOffline(false);
  await expect(smCheck(enrico, 'Butter')).toHaveAttribute('aria-checked', 'true', SYNC);
  await expect
    .poll(() => serverItems(householdId, 'Butter'), SYNC)
    .toEqual([{ checked: true, contributions: 1 }]);
  await nadja.bringToFront();
  await expect(doneItem(nadja, 'Butter')).toHaveCount(1);
});

test('AC-023: Enrico (offline) and Nadja both add "Brot": one item with both contributions', async ({
  page,
  browser,
  context,
}) => {
  const { householdId, enrico, nadja } = await twoDevices(page, browser);
  await nav(nadja, 'liste');
  await enrico.bringToFront();
  await nav(enrico, 'liste');
  await expect(itemRows(enrico, 'Brot')).toHaveCount(0);

  await context.setOffline(true);
  await addItem(enrico, 'Brot');
  await expect(openItem(enrico, 'Brot')).toHaveCount(1);

  await nadja.bringToFront();
  await addItem(nadja, 'Brot');
  await expect(openItem(nadja, 'Brot')).toHaveCount(1);

  await enrico.bringToFront();
  await context.setOffline(false);
  await expect
    .poll(() => serverItems(householdId, 'Brot'), SYNC)
    .toEqual([{ checked: false, contributions: 2 }]);
  await expect(itemRows(enrico, 'Brot')).toHaveCount(1);
  await expect(itemRows(enrico, 'Brot').locator('[data-testid$="-amount"]')).toHaveText('2×', SYNC);
  await nadja.bringToFront();
  await expect(itemRows(nadja, 'Brot')).toHaveCount(1);
  await expect(itemRows(nadja, 'Brot').locator('[data-testid$="-amount"]')).toHaveText('2×', SYNC);
});

test.describe('with the service worker', () => {
  test.use({ serviceWorkers: 'allow' });

  // The active household is not kept across a reload (open issue), so this runs in the demo
  // household, which is active after every sign-in and reload; the three items are new ones.
  test('AC-024: three offline checks survive a reload without network and are sent afterwards', async ({
    page,
    context,
  }) => {
    const names = ['A', 'B', 'C'].map((letter) => `Neuladen ${letter} ${unique()}`);
    const demo = seedIds['hh-demo'];
    await open(page, '/liste');
    for (const name of names) {
      await addItem(page, name);
      await expect(openItem(page, name)).toHaveCount(1);
    }
    for (const name of names) {
      await expect
        .poll(() => serverItems(demo, name))
        .toEqual([{ checked: false, contributions: 1 }]);
    }
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    await expect
      .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
      .toBe(true);
    await startShopping(page);

    await context.setOffline(true);
    for (const name of names) await smCheck(page, name).click();
    for (const name of names) {
      await expect(smCheck(page, name)).toHaveAttribute('aria-checked', 'true');
    }
    await page.reload();
    await expect(tid(page, 'shopping-progress')).toBeVisible({ timeout: 20_000 });
    for (const name of names) {
      await expect(smCheck(page, name)).toHaveAttribute('aria-checked', 'true');
      expect(await serverItems(demo, name), `${name} not yet on the server`).toEqual([
        { checked: false, contributions: 1 },
      ]);
    }

    await context.setOffline(false);
    for (const name of names) {
      await expect
        .poll(() => serverItems(demo, name), SYNC)
        .toEqual([{ checked: true, contributions: 1 }]);
    }
  });
});

test('AC-025: Enrico checks "Eier" offline, Nadja deletes it; online again it is gone without an error', async ({
  page,
  browser,
  context,
}) => {
  const { householdId, enrico, nadja } = await twoDevices(page, browser);
  await nav(enrico, 'liste');
  await addItem(enrico, 'Eier');
  await addItem(enrico, 'Milch');
  await expect(openItem(enrico, 'Eier')).toHaveCount(1);
  await startShopping(enrico);
  await context.setOffline(true);
  await smCheck(enrico, 'Eier').click();
  await expect(tid(enrico, 'sm-done')).toContainText('Eier');

  // Nadja deletes it: the app removes items by checking them and clearing "Erledigt".
  await nadja.bringToFront();
  await nav(nadja, 'liste');
  await openItem(nadja, 'Eier').locator('[role="checkbox"]').click();
  await expect(doneItem(nadja, 'Eier')).toHaveCount(1);
  await tid(nadja, 'clear-done').click();
  await expect(itemRows(nadja, 'Eier')).toHaveCount(0);
  await expect.poll(() => serverItems(householdId, 'Eier'), SYNC).toEqual([]);

  await enrico.bringToFront();
  const toasts = await recordToasts(enrico);
  await context.setOffline(false);
  await expect(smCheck(enrico, 'Eier')).toHaveCount(0, SYNC);
  await expect(smCheck(enrico, 'Milch')).toHaveCount(1);
  expect(await serverItems(householdId, 'Eier')).toEqual([]);
  expect(await toasts(), 'no error after coming back online').toEqual([]);
});
