import {
  ACTIVE,
  expect,
  freshSeed,
  goOffline,
  itemIdOf,
  only,
  open,
  openItem,
  shoppingCheck,
  showDone,
  test,
  tid,
  tidPrefix,
  toastMessage,
} from './helpers';
import { seedIds } from './seed-ids';

// Spec 0025 "Einkauf": "+ Aus Kalender" for seven days, the input without tiles, "Von Hand" and ✕
// per origin, checking on the list, the pantry check with its own amounts, the one area picker,
// "Liegt woanders …", the Einkaufsgang and the article filters. Written for the full run in
// spec 0028; the file changes the demo list, so it starts from a fresh seed and runs in order.

only('phone');
freshSeed();

const area = (key: string): string => seedIds[`area-${key}` as keyof typeof seedIds];

test('AC-001 / AC-002: "+ Aus Kalender" shows seven days from today, ‹ ends at today', async ({
  page,
}) => {
  await open(page, '/liste');
  await tid(page, 'list-from-plan').click();
  await expect(tid(page, 'pick-week-prev')).toBeDisabled();
  const first = await tid(page, 'pick-week-title').innerText();
  await expect(tidPrefix(page, 'pick-kw-').first()).toContainText(/^KW \d+ · /);
  await tid(page, 'pick-week-next').click();
  await expect(tid(page, 'pick-week-prev')).toBeEnabled();
  await tid(page, 'pick-week-prev').click();
  await expect(tid(page, 'pick-week-title')).toHaveText(first);
  await expect(tid(page, 'pick-week-prev')).toBeDisabled();
});

test('AC-007 / AC-008: no tiles under "Was fehlt?"; the plus adds, blank does nothing', async ({
  page,
}) => {
  await open(page, '/liste');
  await expect(tidPrefix(page, 'quick-')).toHaveCount(0);
  await expect(tid(page, 'smart-submit')).toBeDisabled();
  await tid(page, 'smart-input').fill('2 Käse (Gouda)');
  await expect(tid(page, 'smart-preview')).toContainText('Menge 2×');
  await expect(tid(page, 'smart-preview')).toContainText('Zusatz Gouda');
  await tid(page, 'smart-submit').click();
  await expect(openItem(page, 'Käse')).toHaveCount(1);
  await expect(tid(page, 'smart-input')).toHaveValue('');
});

test('AC-010 / AC-012: "Von Hand" for Möhren, "viel" is refused, ✕ removes "Lasagne"', async ({
  page,
}) => {
  await open(page, '/liste');
  await openItem(page, 'Möhren').click();
  await expect(tid(page, 'item-sheet-manual')).toHaveValue('500 g');
  await tid(page, 'item-sheet-manual').fill('viel');
  await expect(tid(page, 'item-sheet')).toContainText('Menge nicht erkannt – z. B. 500 g oder 2');
  await expect(tid(page, 'item-sheet-done')).toBeDisabled();
  await tid(page, 'item-sheet-manual').fill('1 kg');
  await tid(page, 'item-sheet-done').click();
  await openItem(page, 'Möhren').click();
  await tid(page, 'item-sheet-origin-0-remove').click();
  await expect(toastMessage(page)).toContainText('entfernt');
  await expect(tid(page, 'toast-action')).toHaveText('Rückgängig');
});

test('AC-022 / AC-024: swiping right marks as done, offline with "wird synchronisiert"', async ({
  page,
}) => {
  await open(page, '/liste');
  await goOffline(page);
  const milk = openItem(page, 'Milch');
  const id = await itemIdOf(milk);
  const box = await tid(page, `item-${id}-swipe`).boundingBox();
  if (!box) throw new Error('row not visible');
  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(toastMessage(page)).toHaveText('Milch erledigt');
  await showDone(page);
  await expect(tid(page, `item-${id}-pending`)).toBeVisible();
});

test('AC-023: "Als erledigt markieren" in "Posten bearbeiten"', async ({ page }) => {
  await open(page, '/liste');
  await openItem(page, 'Zahnpasta').click();
  await tid(page, 'item-sheet-check').click();
  await expect(tid(page, 'item-sheet')).toBeHidden();
  await expect(openItem(page, 'Zahnpasta')).toHaveCount(0);
});

test('AC-026: the pantry check opens "Vorrat & Gewürze"', async ({ page }) => {
  await open(page, '/liste');
  await tid(page, 'list-from-plan').click();
  await tid(page, 'pick-choose-recipe').click();
  await tid(page, 'pick-recipe-search').fill('Mango');
  await tid(page, `pick-recipe-hit-${seedIds['rec-mango-curry']}`).click();
  await tid(page, 'pc-next').click();
  await expect(tid(page, 'pc-pantry-toggle')).toHaveAttribute('aria-expanded', 'true');
});

test('AC-036 / AC-038: one area picker; "Liegt woanders …" moves an item', async ({ page }) => {
  await open(page, '/liste');
  await tid(page, 'start-shopping').click();
  const more = tidPrefix(page, 'sm-more-').locator(ACTIVE).first();
  await more.click();
  await page.getByText('Liegt woanders …').click();
  await expect(tid(page, 'area-sheet')).toBeVisible();
  await expect(tid(page, 'area-picker-option-none')).toBeVisible();
  await tid(page, `area-picker-option-${area('gewuerze-oel')}`).click();
  await expect(toastMessage(page)).toContainText('liegt jetzt unter');
});

test('AC-042 / AC-044: the Einkaufsgang counts only this trip and survives a reload', async ({
  page,
}) => {
  await open(page, '/liste');
  await tid(page, 'start-shopping').click();
  await expect(tid(page, 'shopping-progress')).toHaveText(/^0\/\d+$/);
  await shoppingCheck(page, 'Milch').click();
  const progress = await tid(page, 'shopping-progress').innerText();
  expect(progress).toMatch(/^1\/\d+$/);
  await page.reload();
  await expect(tid(page, 'shopping-progress')).toHaveText(progress);
});

test('AC-045 / AC-046: an area row opens "Artikel" with that area; "Unbenutzt" counts', async ({
  page,
}) => {
  await open(page, '/maerkte?ansicht=bereiche');
  await tid(page, `area-articles-${area('obst-gemuese')}`).click();
  await expect(tid(page, 'articles-area-filter')).toHaveText('Bereich: Obst & Gemüse ✕');
  await expect(tid(page, 'articles-filter-unused')).toHaveText(/^Unbenutzt \(\d+\)$/);
});

test('AC-050: a new store takes the walking order of dm', async ({ page }) => {
  await open(page, '/maerkte');
  await tid(page, 'store-new').click();
  await tid(page, 'store-new-sheet-name').fill('Rossmann');
  await tid(page, 'store-new-copy').click();
  await page.getByText('dm', { exact: true }).last().click();
  await tid(page, 'store-new-sheet-save').click();
  await expect(toastMessage(page)).toHaveText('„Rossmann“ angelegt');
});
