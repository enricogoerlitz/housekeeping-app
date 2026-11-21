import type { Page } from '@playwright/test';

import {
  ACTIVE,
  back,
  day,
  expect,
  fakeSpeech,
  freshSeed,
  itemRows,
  only,
  open,
  openSettings,
  showPlanWeek,
  test,
  tid,
  tidPrefix,
} from './helpers';
import { seedIds } from './seed-ids';

// Spec 0001 — shopping list, pantry check and store mode (REQ-007), dictation (AC-041), against
// the local backend. The tests change the demo list, so the file starts from a fresh seed and
// its tests rely on that order: AC-030 leaves Milch as it found it; AC-032 checks Milch (AC-041
// counts the rows of Milch before adding, so it holds either way).

only('phone');
freshSeed();

const REWE = seedIds['store-rewe'];
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

/** Open (unchecked) rows of the visible list. */
function openRows(page: Page) {
  return page.locator(`[data-testid^="item-"][role="checkbox"][aria-checked="false"]${ACTIVE}`);
}

/** Group keys of store mode in screen order, e.g. "area:area-brot" or "none". */
async function storeGroups(page: Page): Promise<string[]> {
  const ids = await tidPrefix(page, 'sm-group-').evaluateAll((elements) =>
    elements.map((element) => element.getAttribute('data-testid') ?? ''),
  );
  return ids.map((id) => id.replace(/^sm-group-/, ''));
}

async function startShoppingAtRewe(page: Page): Promise<void> {
  await tid(page, 'store-chip').click();
  await tid(page, `store-option-${REWE}`).click();
  await expect(tid(page, 'store-chip')).toHaveText(/Rewe Südstadt/);
  await tid(page, 'start-shopping').click();
  await expect(tid(page, 'screen-title')).toHaveText('Rewe Südstadt');
}

test('AC-028: "2 Käse (Gouda oder Emmentaler)" becomes Käse, 2×, with the note; input stays ready', async ({
  page,
}) => {
  await open(page, '/liste');
  await addItem(page, '2 Käse (Gouda oder Emmentaler)');
  const cheese = itemRows(page, 'Käse');
  await expect(cheese).toHaveCount(1);
  await expect(cheese).toContainText('(Gouda oder Emmentaler)');
  await expect(cheese.locator('[data-testid$="-amount"]')).toHaveText('2×');
  await expect(tid(page, 'smart-input')).toHaveValue('');
  await expect(tid(page, 'smart-input')).toBeFocused();
});

test('AC-029: entering Milch again makes one row with 2×; an empty entry changes nothing', async ({
  page,
}) => {
  // In the demo household "Milch" already shows 2× (1× by hand plus 1× from tonight's Lasagne),
  // so the precondition "Milch steht offen mit 1×" is set up in the empty household "Test".
  await open(page, '/');
  await openSettings(page);
  await tid(page, `household-${seedIds['hh-test']}`).click();
  await back(page);
  await tid(page, 'tab-liste').click();
  await expect(tid(page, 'list-empty')).toBeVisible();
  await addItem(page, 'Milch');
  const milk = itemRows(page, 'Milch');
  await expect(milk).toHaveCount(1);
  await expect(milk.locator('[data-testid$="-amount"]')).toHaveText('1×');
  await addItem(page, 'Milch');
  await expect(milk).toHaveCount(1);
  await expect(milk.locator('[data-testid$="-amount"]')).toHaveText('2×');

  const rows = page.locator(`[data-testid^="item-"][role="button"]${ACTIVE}`);
  const before = await rows.allInnerTexts();
  await tid(page, 'smart-input').fill('');
  await tid(page, 'smart-input').press('Enter');
  await tid(page, 'smart-input').fill('   ');
  await tid(page, 'smart-input').press('Enter');
  expect(await rows.allInnerTexts()).toEqual(before);
});

test('AC-030: checking Milch moves it to "Erledigt", tapping it there opens it again', async ({
  page,
}) => {
  await open(page, '/liste');
  const done = tid(page, 'done-section');
  const milk = itemRows(page, 'Milch');
  await expect(done.locator('[aria-label="Milch"][role="button"]')).toHaveCount(0);
  await milk.locator('[role="checkbox"]').click();
  await expect(done.locator('[aria-label="Milch"][role="button"]')).toHaveCount(1);
  await done.locator('[aria-label="Milch"][role="button"]').click();
  await expect(done.locator('[aria-label="Milch"][role="button"]')).toHaveCount(0);
  await expect(milk.locator('[role="checkbox"]')).toHaveAttribute('aria-checked', 'false');
});

test('AC-031: pantry check for a planned Mango-Curry puts only what is needed on the list', async ({
  page,
}) => {
  const curryDay = day(2);
  await open(page, '/kalender');
  await showPlanWeek(page, curryDay);
  await expect(
    tid(page, `add-${curryDay}-${seedIds['slot-abend']}`)
      .locator('xpath=../..')
      .getByText('Mango-Curry'),
  ).toBeVisible();
  await tid(page, 'plan-to-list').click();
  // Only the curry's day: deselect every other preselected day.
  for (const chip of await tidPrefix(page, 'pc-day-').all()) {
    const id = await chip.getAttribute('data-testid');
    const selected = (await chip.getAttribute('aria-selected')) === 'true';
    if ((id === `pc-day-${curryDay}`) !== selected) await chip.click();
  }
  await expect(tid(page, `pc-day-${curryDay}`)).toHaveAttribute('aria-selected', 'true');
  await expect(tid(page, 'pc-dishes')).toHaveText('Mango-Curry');
  await tid(page, 'pc-next').click();

  await expect(tid(page, 'pc-zone-needed')).toHaveText('Kommt auf die Liste');
  for (const key of ['mango', 'kokosmilch']) {
    await expect(tid(page, `pc-row-${article(key)}-check`), key).toHaveAttribute(
      'aria-checked',
      'true',
    );
  }
  // Pantry articles are not in the needed zone; they sit, deselected, under "Vorrat & Gewürze".
  await expect(tid(page, `pc-row-${article('reis')}`)).toBeHidden();
  await expect(tid(page, 'pc-pantry-toggle')).toContainText('Vorrat & Gewürze');
  await tid(page, 'pc-pantry-toggle').click();
  for (const key of ['reis', 'kreuzkuemmel']) {
    await expect(tid(page, `pc-row-${article(key)}-check`), key).toHaveAttribute(
      'aria-checked',
      'false',
    );
    const toggle = await tid(page, 'pc-pantry-toggle').boundingBox();
    const row = await tid(page, `pc-row-${article(key)}`).boundingBox();
    expect(row && toggle && row.y > toggle.y, `${key} below "Vorrat & Gewürze"`).toBe(true);
  }

  await tid(page, `pc-row-${article('mango')}-check`).click();
  await expect(tid(page, `pc-row-${article('mango')}-check`)).toHaveAttribute(
    'aria-checked',
    'false',
  );
  await tid(page, 'pc-apply').click();
  await expect(tid(page, 'pantry-check-sheet')).toBeHidden();

  await tid(page, 'tab-liste').click();
  await expect(itemRows(page, 'Kokosmilch')).toHaveCount(1);
  for (const name of ['Mango', 'Reis', 'Kreuzkümmel']) {
    await expect(itemRows(page, name), name).toHaveCount(0);
  }
});

test('AC-032: store mode at Rewe groups by walking order, shows progress, "Ohne Bereich" last', async ({
  page,
}) => {
  await open(page, '/liste');
  await expect(openRows(page).first()).toBeVisible();
  const all = page.locator(`[data-testid^="item-"][role="checkbox"]${ACTIVE}`);
  const total = await all.count();
  const done = total - (await openRows(page).count());
  await startShoppingAtRewe(page);

  const groups = await storeGroups(page);
  expect(groups.length).toBeGreaterThan(2);
  expect(groups.at(-1)).toBe('none');
  await expect(tid(page, 'sm-group-none')).toContainText('Ohne Bereich');
  const areaGroups = groups.filter((key) => key.startsWith('area:')).map((key) => key.slice(5));
  const positions = areaGroups.map((areaId) => REWE_ORDER.indexOf(areaId));
  expect(positions.every((position) => position >= 0)).toBe(true);
  expect(positions, 'groups follow the walking order').toEqual(
    [...positions].sort((a, b) => a - b),
  );

  // "erledigt / gesamt" over the whole list, including what was already checked before.
  await expect(tid(page, 'shopping-progress')).toHaveText(`${done} / ${total}`);
  await tidPrefix(page, 'sm-item-').locator('[role="checkbox"][aria-label="Milch"]').click();
  await expect(tid(page, 'shopping-progress')).toHaveText(`${done + 1} / ${total}`);
});

test('AC-033: assigning an area moves an item from "Ohne Bereich" to "Haushalt & Reinigung"', async ({
  page,
}) => {
  // Deviation: "Spülmittel" belongs to "Haushalt & Reinigung" in the starter catalog, so it can
  // never be without area. The demo data uses the hand-typed "Geschenkpapier" for this case.
  await open(page, '/liste');
  await startShoppingAtRewe(page);
  const none = tid(page, 'sm-group-none');
  const item = none.locator('[data-testid^="sm-item-"]').filter({ hasText: 'Geschenkpapier' });
  await expect(item).toHaveCount(1);
  await none.locator('[data-testid^="assign-area-"]').first().click();
  await expect(tid(page, 'area-sheet')).toBeVisible();
  await tid(page, `area-tile-${area('haushalt')}`).click();
  const household = tid(page, `sm-group-area:${area('haushalt')}`);
  await expect(household).toContainText('Haushalt & Reinigung');
  await expect(household).toContainText('Geschenkpapier');
  await expect(tid(page, 'sm-group-none')).toBeHidden();
});

test('AC-034: moving "Getränke" to the top of Rewe makes it the first group in store mode', async ({
  page,
}) => {
  await open(page, '/liste');
  await addItem(page, 'Apfelsaft');
  await expect(itemRows(page, 'Apfelsaft')).toHaveCount(1);
  await tid(page, 'store-chip').click();
  await tid(page, `store-option-${REWE}`).click();

  await tid(page, 'store-chip').click();
  await tid(page, 'manage-stores').click();
  await tid(page, `store-${REWE}`).click();
  const drinks = Number(await tid(page, `area-pos-${area('getraenke')}`).innerText());
  const dairy = Number(await tid(page, `area-pos-${area('kuehlregal')}`).innerText());
  expect(drinks, 'Getränke after Kühlregal & Molkerei').toBeGreaterThan(dairy);
  await tid(page, `area-top-${area('getraenke')}`).click();
  await expect(tid(page, `area-pos-${area('getraenke')}`)).toHaveText('1');
  await back(page);
  await back(page);

  await tid(page, 'start-shopping').click();
  await expect(tid(page, 'screen-title')).toHaveText('Rewe Südstadt');
  expect((await storeGroups(page))[0]).toBe(`area:${area('getraenke')}`);
});

/** Dictation (spec 0003): microphone → Azure Speech, faked in the browser. */
async function dictate(page: Parameters<typeof open>[0]): Promise<void> {
  await fakeSpeech(page, 'Milch, sechs Eier und Brot.');
  await tid(page, 'dictate').click();
  await expect(tid(page, 'dictation-live')).toContainText('Milch, sechs Eier und Brot');
  await tid(page, 'dictation-stop').click();
}

test('AC-041: dictation shows three dashed proposals; "Alle übernehmen" adds Milch, 6× Eier, Brot', async ({
  page,
}) => {
  await open(page, '/liste');
  await dictate(page);
  await expect(tid(page, 'dictation-transcript')).toContainText('Milch, sechs Eier und Brot');
  const ghosts = page.locator(
    `[data-testid^="ghost-"]:not([data-testid*="-a"]):not([data-testid*="-d"])${ACTIVE}`,
  );
  await expect(ghosts).toHaveCount(3);
  await expect(ghosts.first()).toHaveCSS('border-top-style', 'dashed');
  const openBefore = {
    milk: await itemRows(page, 'Milch').count(),
  };
  await tid(page, 'ghost-accept-all').click();
  await expect(ghosts).toHaveCount(0);
  const openRow = (name: string) =>
    itemRows(page, name).filter({ has: page.locator('[role="checkbox"][aria-checked="false"]') });
  await expect(openRow('Milch')).toHaveCount(openBefore.milk);
  await expect(openRow('Eier')).toHaveCount(1);
  await expect(openRow('Eier').locator('[data-testid$="-amount"]')).toHaveText('6×');
  await expect(openRow('Brot')).toHaveCount(1);
});

test('AC-041: discarding one proposal removes only that row', async ({ page }) => {
  await open(page, '/liste');
  // The previous test put Eier on the list; discarding must not add another row or amount.
  await expect(itemRows(page, 'Milch')).not.toHaveCount(0);
  const eggs = await itemRows(page, 'Eier').allInnerTexts();
  await dictate(page);
  await expect(tid(page, 'ghost-1')).toContainText('Eier');
  await tid(page, 'ghost-1-discard').click();
  await expect(tid(page, 'ghost-1')).toBeHidden();
  await expect(tid(page, 'ghost-0')).toContainText('Milch');
  await expect(tid(page, 'ghost-2')).toContainText('Brot');
  expect(await itemRows(page, 'Eier').allInnerTexts()).toEqual(eggs);
});
