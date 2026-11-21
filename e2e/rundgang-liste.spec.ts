import type { Locator, Page } from '@playwright/test';

import {
  ACTIVE,
  back,
  day,
  doneItem,
  expect,
  freshSeed,
  goOffline,
  itemIdOf,
  itemRows,
  nav,
  only,
  open,
  openItem,
  secondDevice,
  shoppingCheck,
  showDone,
  showPlanWeek,
  switchHousehold,
  test,
  tid,
  tidPrefix,
  toastMessage,
} from './helpers';
import { seedIds } from './seed-ids';

// Spec 0006 — one shopping list: "Liste" without checking, "Posten bearbeiten", "Was fehlt?",
// the menu ⋯, "Einkaufen" with the store chosen on the device, "Auf die Einkaufsliste" in two
// steps and from the recipe page; plus the spec 0001 cases that still hold (AC-028 to AC-034).
// The tests change the demo list, so the file starts from a fresh seed and runs in order.

only('phone');
freshSeed();

const REWE = seedIds['store-rewe'];
const DM = seedIds['store-dm'];
const MANGO = seedIds['rec-mango-curry'];
const area = (key: string): string => seedIds[`area-${key}` as keyof typeof seedIds];
const article = (key: string): string => seedIds[`art-${key}` as keyof typeof seedIds];

/** Walking order of "Rewe Südstadt" in the demo data (packages/api/src/seed/demo.ts). */
const REWE_ORDER = [
  'obst-gemuese',
  'brot',
  'kuehlregal',
  'kaese',
  'fleisch',
  'fisch',
  'nudeln-reis',
  'konserven',
  'backen',
  'gewuerze-oel',
  'fruehstueck',
  'suesses',
  'getraenke',
  'kaffee-tee',
  'tiefkuehl',
  'drogerie',
  'haushalt',
].map(area);

async function addItem(page: Page, line: string): Promise<void> {
  await tid(page, 'smart-input').fill(line);
  await tid(page, 'smart-input').press('Enter');
}

/** Group keys of "Einkaufen" in screen order, e.g. "area:<id>" or "none". */
async function storeGroups(page: Page): Promise<string[]> {
  const ids = await tidPrefix(page, 'sm-group-').evaluateAll((elements) =>
    elements.map((element) => element.getAttribute('data-testid') ?? ''),
  );
  return ids.map((id) => id.replace(/^sm-group-/, ''));
}

/** A group of "Liste": its heading `group-<key>` and its rows. */
function group(page: Page, key: string): Locator {
  return tid(page, `group-${key}`).locator('xpath=..');
}

async function startShopping(page: Page): Promise<void> {
  await tid(page, 'start-shopping').click();
  await expect(tid(page, 'screen-title')).toHaveText('Einkaufen');
}

async function chooseStore(page: Page, choice: string): Promise<void> {
  await tid(page, 'shopping-store').click();
  await expect(tid(page, 'store-choice-sheet')).toBeVisible();
  await tid(page, choice).click();
  await expect(tid(page, 'store-choice-sheet')).toBeHidden();
}

test('AC-008 / AC-009 (0006): "Liste" shows groups with − 2× + or "500 g ›", no checkboxes and no store', async ({
  page,
}) => {
  await open(page, '/liste');
  await expect(tid(page, 'screen-title')).toHaveText('Einkaufsliste');
  await expect(tid(page, 'list-headline')).toHaveText(/^\d+ offen · für Lasagne/);
  const milk = await itemIdOf(openItem(page, 'Milch'));
  await expect(tid(page, `item-${milk}-count`)).toHaveText('2×');
  await expect(tid(page, `item-${milk}-minus`)).toBeVisible();
  await expect(tid(page, `item-${milk}-plus`)).toBeVisible();
  const carrots = await itemIdOf(openItem(page, 'Möhren'));
  await expect(tid(page, `item-${carrots}-amount`)).toContainText('500 g');
  await expect(tidPrefix(page, `item-${carrots}-minus`)).toHaveCount(0);
  // No row can be checked on "Liste" (D24), and there is no store choice (AC-009).
  await expect(page.locator(`[data-testid^="item-"][role="checkbox"]${ACTIVE}`)).toHaveCount(0);
  for (const id of ['store-chip', 'shopping-store', 'store-choice-sheet']) {
    await expect(page.locator(`[data-testid="${id}"]${ACTIVE}`), id).toHaveCount(0);
  }
  await expect(tid(page, 'start-shopping')).toBeVisible();
  await expect(tid(page, 'list-from-plan')).toHaveText(/Aus Kalender/);
  await expect(tid(page, 'done-toggle')).toHaveText('Erledigt (2)');
  await expect(tid(page, 'done-toggle')).toHaveAttribute('aria-expanded', 'false');
  await expect(tid(page, 'done-section').locator('[data-testid^="item-"]')).toHaveCount(0);
  // Groups follow the areas without a store: "Ohne Bereich" (Geschenkpapier) comes last.
  const groups = await tidPrefix(page, 'group-').evaluateAll((elements) =>
    elements.map((element) => element.getAttribute('data-testid') ?? ''),
  );
  expect(groups.at(-1)).toBe('group-none');
});

test('AC-018 / AC-020 (0006): a tap on "Möhren 500 g" or "Milch" opens "Posten bearbeiten"', async ({
  page,
}) => {
  await open(page, '/liste');
  await openItem(page, 'Möhren').click();
  await expect(tid(page, 'item-sheet')).toBeVisible();
  await expect(tid(page, 'item-sheet-amount')).toContainText('500 g');
  await tid(page, 'item-sheet-done').click();
  await expect(tid(page, 'item-sheet')).toBeHidden();

  await openItem(page, 'Milch').click();
  const sheet = tid(page, 'item-sheet');
  await expect(sheet).toContainText('Milch');
  await expect(tid(page, 'item-sheet-count-count')).toHaveText('2×');
  await expect(tid(page, 'item-sheet-note')).toBeVisible();
  await expect(tid(page, 'item-sheet-area-name')).toHaveText('Kühlregal & Molkerei');
  await expect(tid(page, 'item-sheet-origin')).toContainText('von Hand: 1×');
  await expect(tid(page, 'item-sheet-origin')).toContainText('Lasagne');
  await expect(tid(page, 'item-sheet-remove')).toBeVisible();
  await tid(page, 'item-sheet-done').click();
});

test('AC-014 / AC-015 (0006): + adds a share "von Hand", − takes it again, − on 1× removes with undo', async ({
  page,
}) => {
  await open(page, '/liste');
  await addItem(page, 'Zitronen');
  await expect(openItem(page, 'Zitronen')).toHaveCount(1);
  const lemons = await itemIdOf(openItem(page, 'Zitronen'));
  await tid(page, `item-${lemons}-plus`).click();
  await expect(tid(page, `item-${lemons}-count`)).toHaveText('2×');
  await tid(page, `item-${lemons}-minus`).click();
  await expect(tid(page, `item-${lemons}-count`)).toHaveText('1×');
  await tid(page, `item-${lemons}-minus`).click();
  await expect(openItem(page, 'Zitronen')).toHaveCount(0);
  await expect(toastMessage(page)).toHaveText('Zitronen entfernt');
  await tid(page, 'toast-action').click();
  await expect(openItem(page, 'Zitronen')).toHaveCount(1);
  await expect(tid(page, `item-${lemons}-count`)).toHaveText('1×');
  // The undo reached the server, not only this device.
  await page.reload();
  await expect(openItem(page, 'Zitronen')).toHaveCount(1);
});

test('AC-021 / AC-022 (0006): a note "laktosefrei" shows in brackets; 201 characters are refused', async ({
  page,
}) => {
  await open(page, '/liste');
  await openItem(page, 'Milch').click();
  await tid(page, 'item-sheet-note').fill('x'.repeat(201));
  await expect(tid(page, 'item-sheet')).toContainText('Höchstens 200 Zeichen');
  await expect(tid(page, 'item-sheet-done')).toBeDisabled();
  await tid(page, 'item-sheet-note').fill('laktosefrei');
  await tid(page, 'item-sheet-done').click();
  await expect(itemRows(page, 'Milch (laktosefrei)')).toHaveCount(1);

  await openItem(page, 'Milch').click();
  await expect(tid(page, 'item-sheet-note')).toHaveValue('laktosefrei');
  await tid(page, 'item-sheet-note').fill('');
  await tid(page, 'item-sheet-done').click();
  await expect(itemRows(page, 'Milch (laktosefrei)')).toHaveCount(0);
  await expect(openItem(page, 'Milch')).toHaveCount(1);
});

test('AC-025 (0006): "Entfernen" in the window and a swipe both remove "Milch" with "Rückgängig"', async ({
  page,
}) => {
  await open(page, '/liste');
  await openItem(page, 'Milch').click();
  await tid(page, 'item-sheet-remove').click();
  await expect(tid(page, 'item-sheet')).toBeHidden();
  await expect(openItem(page, 'Milch')).toHaveCount(0);
  await expect(toastMessage(page)).toHaveText('Milch entfernt');
  await tid(page, 'toast-action').click();
  await expect(openItem(page, 'Milch')).toHaveCount(1);
  const milk = await itemIdOf(openItem(page, 'Milch'));
  await expect(tid(page, `item-${milk}-count`)).toHaveText('2×');

  // A swipe to the left on the phone does the same.
  const box = await tid(page, `item-${milk}-swipe`).boundingBox();
  if (!box) throw new Error('no swipe row');
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width - 20, y);
  await page.mouse.down();
  for (let step = 1; step <= 10; step += 1) {
    await page.mouse.move(box.x + box.width - 20 - step * 30, y);
  }
  await page.mouse.up();
  await expect(openItem(page, 'Milch')).toHaveCount(0);
  await expect(toastMessage(page)).toHaveText('Milch entfernt');
  await tid(page, 'toast-action').click();
  await expect(openItem(page, 'Milch')).toHaveCount(1);
});

test('AC-019 (0006): offline + and − are greyed out with the hint; reading still works', async ({
  page,
}) => {
  await open(page, '/liste');
  await goOffline(page);
  const milk = await itemIdOf(openItem(page, 'Milch'));
  for (const part of ['minus', 'plus']) {
    await expect(tid(page, `item-${milk}-${part}`)).toHaveAttribute('aria-disabled', 'true');
  }
  await tid(page, 'list-more').click();
  await expect(tid(page, 'list-more-clear-list')).toHaveAttribute('aria-disabled', 'true');
});

test('AC-028 (0001) / AC-030 (0006): "2 Käse (Gouda oder Emmentaler)" is Käse 2× with the note; a new name lands under "Ohne Bereich"', async ({
  page,
}) => {
  await open(page, '/liste');
  // AC-028 (0006): the input line sits above the tab bar without scrolling.
  const input = await tid(page, 'smart-input').boundingBox();
  const tabs = await tid(page, 'tab-liste').boundingBox();
  expect(input && tabs && input.y + input.height <= tabs.y, 'input above the tab bar').toBe(true);

  await addItem(page, '2 Käse (Gouda oder Emmentaler)');
  const cheese = itemRows(page, 'Käse (Gouda oder Emmentaler)');
  await expect(cheese).toHaveCount(1);
  await expect(tid(page, `item-${await itemIdOf(cheese)}-count`)).toHaveText('2×');
  await expect(tid(page, 'smart-input')).toHaveValue('');
  await expect(tid(page, 'smart-input')).toBeFocused();

  await addItem(page, 'Bastelkleber');
  await expect(group(page, 'none')).toContainText('Bastelkleber');
});

test('AC-031 (0006): "Kokosmilsch" asks „Meinst du Kokosmilch?“; "Ja" adds Kokosmilch', async ({
  page,
}) => {
  await open(page, '/liste');
  await addItem(page, 'Kokosmilsch');
  await expect(tid(page, 'smart-brake')).toContainText('Meinst du Kokosmilch?');
  await expect(itemRows(page, 'Kokosmilsch')).toHaveCount(0);
  await tid(page, 'smart-brake-accept').click();
  await expect(openItem(page, 'Kokosmilch')).toHaveCount(1);
  await expect(itemRows(page, 'Kokosmilsch')).toHaveCount(0);
});

test('AC-023 (0006): "Bereich" in the window moves Geschenkpapier to "Haushalt & Reinigung"', async ({
  page,
}) => {
  await open(page, '/liste');
  await expect(group(page, 'none')).toContainText('Geschenkpapier');
  await openItem(page, 'Geschenkpapier').click();
  await tid(page, 'item-sheet-area').click();
  await tid(page, 'item-area-search-input').fill('Haus');
  await tid(page, `item-area-search-hit-${area('haushalt')}`).click();
  await expect(tid(page, 'item-sheet-area-name')).toHaveText('Haushalt & Reinigung');
  await tid(page, 'item-sheet-done').click();
  await expect(group(page, `area:${area('haushalt')}`)).toContainText('Geschenkpapier');
});

test('AC-010 (0006): unchecking "Brot" under "Erledigt" opens it again at once', async ({
  page,
}) => {
  await open(page, '/liste');
  await showDone(page);
  await expect(doneItem(page, 'Brot')).toHaveCount(1);
  const bread = await itemIdOf(doneItem(page, 'Brot'));
  await tid(page, `item-${bread}-check`).click();
  await expect(openItem(page, 'Brot')).toHaveCount(1);
  await expect(tid(page, 'done-toggle')).toHaveText('Erledigt (1)');
  await expect(tid(page, 'done-toggle')).toHaveAttribute('aria-expanded', 'true');
  await expect(tid(page, 'done-section').locator('[data-testid^="item-"]').first()).toBeVisible();
});

test('AC-034 (0006): ⋯ offers "Erledigt leeren", "Liste leeren …", "Märkte & Bereiche" and "Artikel"', async ({
  page,
}) => {
  await open(page, '/liste');
  await tid(page, 'list-more').click();
  for (const entry of ['clear-done', 'clear-list', 'stores', 'articles']) {
    await expect(tid(page, `list-more-${entry}`), entry).toBeVisible();
  }
  await tid(page, 'list-more-stores').click();
  await expect(tid(page, 'stores-screen')).toBeVisible();
  await back(page);
  await expect(tid(page, 'screen-title')).toHaveText('Einkaufsliste');
});

test('AC-040 / AC-041 / AC-042 / AC-048 (0006): "Einkaufen" starts at Rewe, the device keeps dm', async ({
  page,
  browser,
}) => {
  await open(page, '/liste');
  await startShopping(page);
  await expect(tid(page, 'shopping-store')).toHaveText(/Rewe Südstadt/);
  // AC-032 (0001): groups in Rewe's walking order, "Ohne Bereich" last.
  const groups = await storeGroups(page);
  expect(groups.length).toBeGreaterThan(2);
  const areaGroups = groups.filter((key) => key.startsWith('area:')).map((key) => key.slice(5));
  const positions = areaGroups.map((areaId) => REWE_ORDER.indexOf(areaId));
  expect(positions.every((position) => position >= 0)).toBe(true);
  expect(positions, 'groups follow the walking order').toEqual(
    [...positions].sort((a, b) => a - b),
  );

  await tid(page, 'shopping-store').click();
  await expect(tid(page, `store-choice-${REWE}`)).toContainText('Standard');
  await expect(tid(page, `store-choice-${DM}`)).toBeVisible();
  await expect(tid(page, 'store-choice-none')).toContainText('Ohne Markt');
  // AC-048: "Märkte verwalten ›" and back lands in "Einkaufen" with the same store.
  await tid(page, 'store-choice-manage').click();
  await expect(tid(page, 'stores-screen')).toBeVisible();
  await back(page);
  await expect(tid(page, 'shopping-store')).toHaveText(/Rewe Südstadt/);

  await chooseStore(page, `store-choice-${DM}`);
  await expect(tid(page, 'shopping-store')).toHaveText(/dm Drogerie/);
  expect((await storeGroups(page))[0]).toBe(`area:${area('drogerie')}`);

  // AC-042: the device keeps dm after a reload; Nadja's device still starts at Rewe.
  await page.reload();
  await expect(tid(page, 'shopping-store')).toHaveText(/dm Drogerie/);
  const nadja = await secondDevice(browser, 'nadja');
  await nav(nadja.page, 'liste');
  await startShopping(nadja.page);
  await expect(tid(nadja.page, 'shopping-store')).toHaveText(/Rewe Südstadt/);
  await nadja.context.close();
  await page.bringToFront();
  await chooseStore(page, `store-choice-${REWE}`);
  await expect(tid(page, 'shopping-store')).toHaveText(/Rewe Südstadt/);
});

test('AC-044 / AC-047 (0006): a checked item stays struck, then moves to "Im Wagen"; "Fertig" clears it with undo', async ({
  page,
}) => {
  await open(page, '/liste');
  await startShopping(page);
  const progress = (await tid(page, 'shopping-progress').innerText()).match(/(\d+)\/(\d+)/);
  const [done, total] = [Number(progress?.[1]), Number(progress?.[2])];
  const lemons = shoppingCheck(page, 'Zitronen');
  await lemons.click();
  await expect(lemons).toHaveAttribute('aria-checked', 'true');
  await expect(tid(page, 'shopping-progress')).toHaveText(`${done + 1}/${total}`);
  // The Sammel-Fenster: 2 s after the last tap the row slides into "Im Wagen".
  await expect(tid(page, 'sm-done-toggle')).toContainText('Im Wagen', { timeout: 5_000 });
  await expect(tid(page, 'sm-done-toggle')).toHaveAttribute('aria-expanded', 'false');
  await tid(page, 'sm-done-toggle').click();
  await expect(tid(page, 'sm-done-toggle')).toHaveAttribute('aria-expanded', 'true');
  await expect(tid(page, 'sm-done').locator('[aria-label="Zitronen"]')).toHaveCount(1);

  await tid(page, 'shopping-close').click();
  await expect(tid(page, 'screen-title')).toHaveText('Einkaufsliste');
  await expect(toastMessage(page)).toHaveText(`${done + 1} gekauft · ${total - done - 1} bleiben`);
  await expect(tid(page, 'toast-action')).toHaveText('Rückgängig');
  await expect(openItem(page, 'Zitronen')).toHaveCount(0);
  await tid(page, 'toast-action').click();
  await showDone(page);
  await expect(doneItem(page, 'Zitronen')).toHaveCount(1);
});

test('AC-045 / AC-046 (0006): offline in "Einkaufen" checking and adding work; "Fertig" only leaves', async ({
  page,
}) => {
  await open(page, '/liste');
  await goOffline(page);
  await startShopping(page);
  const milk = shoppingCheck(page, 'Milch');
  await milk.click();
  await expect(milk).toHaveAttribute('aria-checked', 'true');
  await tid(page, 'shopping-add-input').fill('Salz');
  await tid(page, 'shopping-add-input').press('Enter');
  await expect(shoppingCheck(page, 'Salz')).toHaveCount(1);
  await tid(page, 'shopping-close').click();
  await expect(toastMessage(page)).toHaveText('Abgehakte räumen wir auf, sobald du Netz hast');
  await expect(tid(page, 'screen-title')).toHaveText('Einkaufsliste');
});

test('AC-033 (0001): assigning an area in "Einkaufen" moves Bastelkleber out of "Ohne Bereich"', async ({
  page,
}) => {
  await open(page, '/liste');
  await startShopping(page);
  const none = tid(page, 'sm-group-none');
  await expect(none).toContainText('Bastelkleber');
  await none.locator('[data-testid^="assign-area-"]').first().click();
  await expect(tid(page, 'area-sheet')).toBeVisible();
  await tid(page, `area-tile-${area('obst-gemuese')}`).click();
  await expect(tid(page, `sm-group-area:${area('obst-gemuese')}`)).toContainText('Bastelkleber');
  await expect(tid(page, 'sm-group-none')).toBeHidden();
});

test('AC-034 (0001): moving "Getränke" up at Rewe makes it the first group in "Einkaufen"', async ({
  page,
}) => {
  await open(page, '/liste');
  await addItem(page, 'Apfelsaft');
  await expect(openItem(page, 'Apfelsaft')).toHaveCount(1);
  await tid(page, 'list-more').click();
  await tid(page, 'list-more-stores').click();
  await tid(page, `store-${REWE}`).click();
  const drinks = tid(page, `area-pos-${area('getraenke')}`);
  const before = Number(await drinks.innerText());
  expect(before, 'Getränke after Kühlregal & Molkerei').toBeGreaterThan(
    Number(await tid(page, `area-pos-${area('kuehlregal')}`).innerText()),
  );
  for (let step = 1; step < before; step += 1) {
    await tid(page, `area-up-${area('getraenke')}`).click();
    await expect(drinks).toHaveText(String(before - step));
  }
  await back(page);
  await back(page);
  await startShopping(page);
  expect((await storeGroups(page))[0]).toBe(`area:${area('getraenke')}`);
});

test('AC-049 / AC-053 / AC-054 (0006): step 1 picks entries of a week, a recipe without a day, nothing in a past week', async ({
  page,
}) => {
  await open(page, '/liste');
  await tid(page, 'list-from-plan').click();
  const sheet = tid(page, 'pantry-check-sheet');
  await expect(sheet).toContainText('Was soll auf die Liste?');
  await expect(tid(page, 'pick-week-title')).toHaveText(/^KW \d+ · /);
  // Tonight's Lasagne is on the list already, so it is not preselected.
  const lasagne = tid(page, `pick-entry-${seedIds['plan-2']}-check`);
  await expect(lasagne).toHaveAttribute('aria-checked', 'false');
  // "Rezept wählen …": a recipe that is not in the plan goes under "Ohne Tag".
  await tid(page, 'pick-choose-recipe').click();
  await tid(page, 'pick-recipe-search').fill('Shaksh');
  await tid(page, `pick-recipe-hit-${seedIds['rec-shakshuka']}`).click();
  await expect(tid(page, 'pick-without-day')).toContainText('Shakshuka');
  await expect(tid(page, 'pc-next')).toHaveText(/^Weiter: \d+ Gerichte?$/);
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();

  // AC-054: from a past week in the calendar nothing is preselected.
  await nav(page, 'kalender');
  await tid(page, 'week-prev').click();
  await tid(page, 'plan-to-list').click();
  await expect(tid(page, 'pc-next')).toHaveText('Weiter');
  await expect(tid(page, 'pc-next')).toBeDisabled();
  await expect(tid(page, 'pc-next-hint')).toHaveText('Wähle mindestens ein Gericht');
});

test('AC-055 / AC-056 / AC-057 (0006): the pantry check of a planned Mango-Curry puts only Kokosmilch on the list', async ({
  page,
}) => {
  const curryDay = day(2);
  await open(page, '/kalender');
  await showPlanWeek(page, curryDay);
  await tid(page, 'plan-to-list').click();
  await expect(tid(page, 'pantry-check-sheet')).toContainText('Was soll auf die Liste?');
  // Only the curry: deselect whatever else is preselected in that week.
  for (const check of await tidPrefix(page, 'pick-entry-')
    .and(page.locator('[role="checkbox"]'))
    .all()) {
    const id = await check.getAttribute('data-testid');
    const selected = (await check.getAttribute('aria-checked')) === 'true';
    if ((id === `pick-entry-${seedIds['plan-9']}-check`) !== selected) await check.click();
  }
  await expect(tid(page, `pick-entry-${seedIds['plan-9']}-check`)).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(tid(page, 'pc-next')).toHaveText('Weiter: 1 Gericht');
  await tid(page, 'pc-next').click();

  await expect(tid(page, 'pantry-check-sheet')).toContainText('Was brauchst du wirklich?');
  await expect(tid(page, 'pc-zone-needed')).toHaveText('Kommt auf die Liste');
  for (const key of ['mango', 'kokosmilch']) {
    await expect(tid(page, `pc-row-${article(key)}-check`), key).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(tid(page, `pc-row-${article(key)}`), key).toContainText('Mango-Curry');
  }
  // Pantry articles sit folded and deselected under "Vorrat & Gewürze".
  await expect(tid(page, `pc-row-${article('reis')}`)).toBeHidden();
  await expect(tid(page, 'pc-pantry-toggle')).toContainText('Vorrat & Gewürze');
  await expect(tid(page, 'pc-pantry-toggle')).toHaveAttribute('aria-expanded', 'false');

  // AC-057: back keeps the choice; deselecting everything greys out "0 übernehmen".
  await tid(page, 'pc-back').click();
  await expect(tid(page, `pick-entry-${seedIds['plan-9']}-check`)).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await tid(page, 'pc-next').click();
  const needed = Number((await tid(page, 'pc-apply').innerText()).match(/\d+/)?.[0]);
  await tid(page, `pc-row-${article('mango')}-check`).click();
  await expect(tid(page, 'pc-apply')).toHaveText(`${needed - 1} übernehmen`);
  await expect(tid(page, `pc-row-${article('mango')}-check`)).toHaveAttribute(
    'aria-checked',
    'false',
  );
  const checked = tidPrefix(page, 'pc-row-').and(
    page.locator('[role="checkbox"][aria-checked="true"]'),
  );
  for (let left = await checked.count(); left > 0; left -= 1) {
    await checked.first().click();
    await expect(checked).toHaveCount(left - 1);
  }
  await expect(tid(page, 'pc-apply')).toHaveText('0 übernehmen');
  await expect(tid(page, 'pc-apply')).toBeDisabled();
  await tid(page, `pc-row-${article('kokosmilch')}-check`).click();
  await expect(tid(page, 'pc-apply')).toHaveText('1 übernehmen');

  await tid(page, 'pc-pantry-toggle').click();
  await expect(tid(page, 'pc-pantry-toggle')).toHaveAttribute('aria-expanded', 'true');
  for (const key of ['reis', 'kreuzkuemmel']) {
    await expect(tid(page, `pc-row-${article(key)}-check`), key).toHaveAttribute(
      'aria-checked',
      'false',
    );
  }
  await tid(page, 'pc-apply').click();
  await expect(tid(page, 'pantry-check-sheet')).toBeHidden();

  await nav(page, 'liste');
  await expect(openItem(page, 'Kokosmilch')).toHaveCount(1);
  for (const name of ['Mango', 'Reis', 'Kreuzkümmel']) {
    await expect(openItem(page, name), name).toHaveCount(0);
  }
});

test('AC-058 (0006): "Auf die Liste" on the recipe page skips step 1 and scales to 6 portions', async ({
  page,
}) => {
  await open(page, `/rezept/${MANGO}`);
  await tid(page, 'servings-plus').click();
  await tid(page, 'servings-plus').click();
  await expect(tid(page, 'servings-value')).toHaveText('6');
  await tid(page, 'recipe-to-list').click();
  await expect(tid(page, 'pantry-check-sheet')).toContainText('Was brauchst du wirklich?');
  await expect(page.locator(`[data-testid="pc-back"]${ACTIVE}`)).toHaveCount(0);
  await expect(tid(page, `pc-row-${article('kokosmilch')}`)).toContainText('600 ml');
  await tid(page, 'pc-apply').click();
  await expect(tid(page, 'pantry-check-sheet')).toBeHidden();
  await expect(tid(page, 'recipe-title')).toHaveText('Mango-Curry');
});

test('AC-035 / AC-036 (0006): "Liste leeren …" asks first; "Abbrechen" keeps it, "Rückgängig" brings all back', async ({
  page,
}) => {
  await open(page, '/liste');
  await expect(openItem(page, 'Milch')).toHaveCount(1);
  const before = await page.locator(`[data-testid^="item-"][role="button"]${ACTIVE}`).count();
  await tid(page, 'list-more').click();
  await tid(page, 'list-more-clear-list').click();
  await expect(tid(page, 'clear-list-sheet')).toContainText('Einkaufsliste leeren?');
  await expect(tid(page, 'clear-list-text')).toHaveText(
    /^Alle \d+ Posten werden entfernt, auch die aus dem Kalender\.$/,
  );
  const total = Number((await tid(page, 'clear-list-text').innerText()).match(/\d+/)?.[0]);
  await tid(page, 'clear-list-cancel').click();
  await expect(tid(page, 'clear-list-sheet')).toBeHidden();
  await expect(page.locator(`[data-testid^="item-"][role="button"]${ACTIVE}`)).toHaveCount(before);

  await tid(page, 'list-more').click();
  await tid(page, 'list-more-clear-list').click();
  await tid(page, 'clear-list-confirm').click();
  await expect(tid(page, 'list-empty')).toBeVisible();
  await expect(toastMessage(page)).toHaveText(`Einkaufsliste geleert · ${total} Posten`);
  await tid(page, 'toast-action').click();
  await expect(openItem(page, 'Milch')).toHaveCount(1);
  await expect(tid(page, 'list-headline')).toBeVisible();
});

test('AC-006 / AC-013 (0006) / AC-029 (0001): the empty list of "Test", Milch twice is one row with 2×', async ({
  page,
}) => {
  // In the demo household "Milch" already shows 2×, so the case runs in the empty household.
  await open(page, '/');
  await switchHousehold(page, seedIds['hh-test']);
  await nav(page, 'liste');
  await expect(tid(page, 'screen-title')).toHaveText('Einkaufsliste');
  await expect(page.getByText('Standardliste')).toHaveCount(0);
  await expect(tid(page, 'list-empty')).toBeVisible();
  await expect(tid(page, 'list-from-plan')).toBeVisible();
  await expect(tid(page, 'smart-input')).toBeVisible();
  await expect(tid(page, 'start-shopping')).toBeDisabled();
  await tid(page, 'list-more').click();
  await expect(tid(page, 'list-more-clear-list')).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Escape');

  await addItem(page, 'Milch');
  const milk = openItem(page, 'Milch');
  await expect(milk).toHaveCount(1);
  const id = await itemIdOf(milk);
  await expect(tid(page, `item-${id}-count`)).toHaveText('1×');
  await addItem(page, 'Milch');
  await expect(milk).toHaveCount(1);
  await expect(tid(page, `item-${id}-count`)).toHaveText('2×');

  const rows = page.locator(`[data-testid^="item-"][role="button"]${ACTIVE}`);
  const before = await rows.allInnerTexts();
  await tid(page, 'smart-input').fill('   ');
  await tid(page, 'smart-input').press('Enter');
  expect(await rows.allInnerTexts()).toEqual(before);
});
