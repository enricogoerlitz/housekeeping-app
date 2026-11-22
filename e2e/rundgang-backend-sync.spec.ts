import type { BrowserContext, Page } from '@playwright/test';

import {
  accessToken,
  createTestHousehold,
  day,
  doneItem,
  expect,
  itemRows,
  nav,
  only,
  open,
  itemIdOf,
  leaveManaged,
  NADJA,
  openItem,
  openManaged,
  PLAN_ENTRY,
  secondDevice,
  shoppingCheck,
  showDone,
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

/** The check box of an item in "Einkaufen" ("Im Wagen" must be unfolded for checked ones). */
const smCheck = shoppingCheck;

/** Unfolds "Im Wagen (n)" in "Einkaufen" (it starts folded, spec 0006). */
async function showInCart(page: Page): Promise<void> {
  const rows = tid(page, 'sm-done').locator('[data-testid^="sm-item-"]');
  if ((await rows.count()) === 0) await tid(page, 'sm-done-toggle').click();
  await expect(rows.first()).toBeVisible();
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
  await openManaged(nadja, 'members');
  await expect(tid(nadja, `household-${householdId}-active`)).toBeVisible();

  await enrico.bringToFront();
  await nav(enrico, 'index');
  await openManaged(enrico, 'members');
  // Spec 0018, AC-010: "Entfernen" asks first; "Abbrechen" sends nothing.
  const removeCalls: string[] = [];
  enrico.on('request', (request) => {
    if (request.url().includes('/rpc/remove_member')) removeCalls.push(request.url());
  });
  await tid(enrico, `household-member-remove-${seedIds['m-nadja']}`).click();
  await expect(tid(enrico, 'member-remove-dialog')).toContainText(`${NADJA} aus „Zwei Geräte`);
  await expect(tid(enrico, 'member-remove-dialog')).toContainText('“ entfernen?');
  await tid(enrico, 'member-remove-dialog-cancel').click();
  await expect(tid(enrico, 'member-remove-dialog')).toHaveCount(0);
  await expect(tid(enrico, `household-member-${seedIds['m-nadja']}`)).toBeVisible();
  expect(removeCalls, 'no server call before the confirmation').toEqual([]);

  await tid(enrico, `household-member-remove-${seedIds['m-nadja']}`).click();
  await tid(enrico, 'member-remove-dialog-confirm').click();
  await expect(toastMessage(enrico)).toContainText('ist entfernt');
  expect(removeCalls).toHaveLength(1);

  await nadja.bringToFront();
  await expect(tid(nadja, `household-${householdId}`)).toHaveCount(0, SYNC);
  // Another of her households is active now, and the removed one's list is gone.
  await expect(tid(nadja, 'household-list').locator('[aria-label$=", aktiv"]')).toHaveCount(1);
  await leaveManaged(nadja);
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
  await tid(enrico, 'recipe-new-recipe').click();
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
  const { enrico, nadja } = await twoDevices(page, browser);
  await nav(enrico, 'kalender');
  await tid(enrico, `add-${TODAY}`).click();
  // The new household has no recipes: the dish is planned as free text.
  await tid(enrico, 'add-entry-search').fill('Halloumi-Pfanne');
  await tid(enrico, 'add-entry-new-text').click();
  await expect(tid(enrico, 'add-entry-text')).toHaveValue('Halloumi-Pfanne');
  await tid(enrico, 'add-entry-save').click();
  const entry = (p: Page) => p.locator(PLAN_ENTRY).filter({ hasText: 'Halloumi-Pfanne' });
  await expect(entry(enrico)).toHaveCount(1);

  await nadja.bringToFront();
  await nav(nadja, 'kalender');
  await expect(entry(nadja)).toHaveCount(1, SYNC);

  await enrico.bringToFront();
  await entry(enrico).click();
  await tid(enrico, 'entry-remove').click();
  await expect(entry(enrico)).toHaveCount(0);

  await nadja.bringToFront();
  await expect(entry(nadja)).toHaveCount(0, SYNC);
});

test('AC-011 / AC-027 (0006): a check in "Einkaufen" shows live on the list; an item removed elsewhere closes the open window', async ({
  page,
  browser,
}) => {
  const { enrico, nadja } = await twoDevices(page, browser);
  await nav(enrico, 'liste');
  for (const name of ['Milch', 'Brot']) {
    await addItem(enrico, name);
    await expect(openItem(enrico, name)).toHaveCount(1);
  }
  await nadja.bringToFront();
  await nav(nadja, 'liste');
  await expect(openItem(nadja, 'Brot')).toHaveCount(1, SYNC);

  await enrico.bringToFront();
  await startShopping(enrico);
  await smCheck(enrico, 'Milch').click();
  await nadja.bringToFront();
  await expect(tid(nadja, 'list-active-shopper')).toHaveText(
    'Enrico (Test) kauft gerade ein · 1 von 2',
    SYNC,
  );
  await showDone(nadja);
  await expect(doneItem(nadja, 'Milch')).toHaveCount(1);

  // AC-027: Nadja has "Brot" open while Enrico removes it.
  await openItem(nadja, 'Brot').click();
  await expect(tid(nadja, 'item-sheet')).toBeVisible();
  await enrico.bringToFront();
  await tid(enrico, 'shopping-close').click();
  await openItem(enrico, 'Brot').click();
  await tid(enrico, 'item-sheet-remove').click();
  await expect(openItem(enrico, 'Brot')).toHaveCount(0);
  await nadja.bringToFront();
  await expect(tid(nadja, 'item-sheet')).toBeHidden(SYNC);
  await expect(toastMessage(nadja)).toHaveText('Brot steht nicht mehr auf der Liste');
});

test('AC-019: the server refuses a recipe change; the old value is back with a calm hint', async ({
  page,
  allowConsoleError,
}) => {
  allowConsoleError(/^Failed to load resource: the server responded with a status of 400/);
  // The change is the ingredient note ("Zusatz") of a recipe, saved with the section's "Fertig"
  // through apply_changes. The server's refusal is forced.
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
  await tid(page, 'recipe-ingredients-edit').click();
  await tid(page, `recipe-row-menu-${ingredientId}`).click();
  await tid(page, `recipe-row-menu-${ingredientId}-edit`).click();
  await tid(page, 'ingredient-shopping-note').fill('Büffelmozzarella');
  await tid(page, 'ingredient-save').click();
  await tid(page, 'recipe-ingredients-done').click();
  await expect(toastMessage(page)).toHaveText(REJECTED);
  // Spec 0008 (E7): the section opens again with what was sent, so it can be tried again.
  await expect(tid(page, 'recipe-ingredients-done')).toBeVisible();
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
  // Earlier files may have put these on the demo list; the failed take-over must add nothing.
  const before = {
    Mango: await serverItems(seedIds['hh-demo'], 'Mango'),
    Kokosmilch: await serverItems(seedIds['hh-demo'], 'Kokosmilch'),
  };
  await open(page, '/kalender');
  await showPlanWeek(page, curryDay);
  await page.route('**/rest/v1/rpc/add_shopping_contributions', (route) =>
    route.fulfill({
      status: 400,
      contentType: 'application/json',
      json: { code: 'P0001', message: 'forced failure', details: null, hint: null },
    }),
  );
  await tid(page, 'plan-to-list').click();
  const curry = `pick-entry-${seedIds['plan-9']}-check`;
  for (const check of await tidPrefix(page, 'pick-entry-')
    .and(page.locator('[role="checkbox"]'))
    .all()) {
    const id = await check.getAttribute('data-testid');
    const selected = (await check.getAttribute('aria-checked')) === 'true';
    if ((id === curry) !== selected) await check.click();
  }
  await expect(tid(page, 'pc-next')).toHaveText('Weiter: 1 Gericht');
  await tid(page, 'pc-next').click();
  const needed = tidPrefix(page, 'pc-row-').and(
    page.locator('[role="checkbox"][aria-checked="true"]'),
  );
  expect(await needed.count()).toBeGreaterThan(1);
  await tid(page, 'pc-apply').click();
  await expect(toastMessage(page)).toHaveText(REJECTED);

  await nav(page, 'liste');
  for (const name of ['Mango', 'Kokosmilch'] as const) {
    await expect(openItem(page, name), name).toHaveCount(
      before[name].filter((item) => !item.checked).length,
    );
    expect(await serverItems(seedIds['hh-demo'], name), name).toEqual(before[name]);
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
  await expect(smCheck(enrico, 'Milch')).toHaveAttribute('aria-checked', 'true');
  await expect(tid(enrico, 'offline-banner')).toBeVisible();

  await nadja.bringToFront();
  await nav(nadja, 'liste');
  await expect(openItem(nadja, 'Milch')).toHaveCount(1);

  await enrico.bringToFront();
  await context.setOffline(false);
  await nadja.bringToFront();
  await expect(tid(nadja, 'done-toggle')).toBeVisible(SYNC);
  await showDone(nadja);
  await expect(doneItem(nadja, 'Milch')).toHaveCount(1);
  expect(await serverItems(householdId, 'Milch')).toEqual([{ checked: true, contributions: 1 }]);
});

test('AC-022: checking wins — Enrico unchecks "Butter" offline, Nadja re-checks it, it stays checked', async ({
  page,
  browser,
  context,
}) => {
  const { householdId, enrico, nadja } = await twoDevices(page, browser);
  await nav(enrico, 'liste');
  // "Einkaufen" needs something still to buy.
  await addItem(enrico, 'Milch');
  await addItem(enrico, 'Butter');
  await expect(openItem(enrico, 'Butter')).toHaveCount(1);
  await startShopping(enrico);
  await smCheck(enrico, 'Butter').click();
  await expect(smCheck(enrico, 'Butter')).toHaveAttribute('aria-checked', 'true');
  await nadja.bringToFront();
  await nav(nadja, 'liste');
  await expect(tid(nadja, 'done-toggle')).toBeVisible(SYNC);
  await showDone(nadja);
  await expect(doneItem(nadja, 'Butter')).toHaveCount(1);

  await enrico.bringToFront();
  await showInCart(enrico);
  await context.setOffline(true);
  await smCheck(enrico, 'Butter').click();
  await expect(smCheck(enrico, 'Butter')).toHaveAttribute('aria-checked', 'false');

  // Nadja takes the check back and sets it again in "Einkaufen", online.
  await nadja.bringToFront();
  const butter = await itemIdOf(doneItem(nadja, 'Butter'));
  await tid(nadja, `item-${butter}-check`).click();
  await expect(openItem(nadja, 'Butter')).toHaveCount(1);
  await startShopping(nadja);
  await smCheck(nadja, 'Butter').click();
  await expect(smCheck(nadja, 'Butter')).toHaveAttribute('aria-checked', 'true');
  await expect
    .poll(() => serverItems(householdId, 'Butter'), SYNC)
    .toEqual([{ checked: true, contributions: 1 }]);

  await enrico.bringToFront();
  await context.setOffline(false);
  // Butter ends checked in "Im Wagen" on Enrico's device, too.
  await expect(
    enrico.locator('[data-testid^="sm-group-"] [role="checkbox"][aria-label="Butter"]'),
  ).toHaveCount(0, SYNC);
  await expect(
    tid(enrico, 'sm-done').locator('[role="checkbox"][aria-label="Butter"]'),
  ).toHaveAttribute('aria-checked', 'true');
  await expect
    .poll(() => serverItems(householdId, 'Butter'), SYNC)
    .toEqual([{ checked: true, contributions: 1 }]);
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
  // One row with 2× on both devices (the offline row took the server's item id).
  const count = async (device: Page) =>
    tid(device, `item-${await itemIdOf(itemRows(device, 'Brot'))}-count`).innerText();
  await expect.poll(() => count(enrico), SYNC).toBe('2×');
  await expect(itemRows(enrico, 'Brot')).toHaveCount(1);
  await nadja.bringToFront();
  await expect.poll(() => count(nadja), SYNC).toBe('2×');
  await expect(itemRows(nadja, 'Brot')).toHaveCount(1);
});

test.describe('with the service worker', () => {
  test.use({ serviceWorkers: 'allow' });

  // Runs in the demo household with three new items, so earlier tests cannot interfere.
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
    await showInCart(page);
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
  await expect(smCheck(enrico, 'Eier')).toHaveAttribute('aria-checked', 'true');

  // Nadja removes it in "Posten bearbeiten" (spec 0006, AC-025).
  await nadja.bringToFront();
  await nav(nadja, 'liste');
  await openItem(nadja, 'Eier').click();
  await tid(nadja, 'item-sheet-remove').click();
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
