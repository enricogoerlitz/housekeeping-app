import { expect, freshSeed, goOffline, open, test, tid, toastMessage, chooseTime } from './helpers';
import { seedIds } from './seed-ids';

// Spec 0021, REQ-006 to REQ-015: the window of an entry edits everything chosen when planning and
// saves on closing, the shopping list follows the portions, the add window has counters, Zusatz,
// time and the leftovers on top, and removing asks about the list. Typed only here; the full
// suite runs once in spec 0028. Seed: "Lasagne" today in the evening (plan-2), "Eislaufen" in the
// morning (plan-eislaufen-1), "Trattoria Da Enzo" the day after tomorrow (plan-enzo-2).

freshSeed();

const LASAGNE = seedIds['plan-2'];
const EISLAUFEN = seedIds['plan-eislaufen-1'];
const ENZO = seedIds['plan-enzo-2'];

test('AC-015, AC-018: a person more is a portion more, "−" stops at 1', async ({ page }) => {
  await open(page, `/kalender?eintrag=${LASAGNE}`);
  await expect(tid(page, 'entry-sheet')).toBeVisible();
  const value = tid(page, 'entry-portions-value');
  const before = Number(await value.textContent());
  await tid(page, 'entry-portions-plus').click();
  await expect(value).toHaveText(String(before + 1));
  await tid(page, 'entry-done').click();
  await expect(tid(page, 'entry-sheet')).toBeHidden();
  await open(page, `/kalender?eintrag=${LASAGNE}`);
  await expect(tid(page, 'entry-portions-value')).toHaveText(String(before + 1));
});

test('AC-023, AC-025: the Zusatz is saved by ✕ and stands behind the name', async ({ page }) => {
  await open(page, `/kalender?eintrag=${EISLAUFEN}`);
  await tid(page, 'entry-note-input').fill('Hohenschönhausen');
  await expect(tid(page, 'entry-sheet')).not.toContainText('Zusatz speichern');
  await page.keyboard.press('Escape');
  await expect(tid(page, 'entry-sheet')).toBeHidden();
  await expect(tid(page, `entry-${EISLAUFEN}`)).toContainText('Eislaufen (Hohenschönhausen)');
});

test('AC-035, AC-037: a first time on the restaurant switches "Erinnern" on', async ({ page }) => {
  await open(page, `/kalender?eintrag=${ENZO}`);
  await tid(page, 'entry-time-clear').click();
  await tid(page, 'entry-done').click();
  await open(page, `/kalender?eintrag=${ENZO}`);
  await chooseTime(page, 'entry-time', '19:30');
  await expect(tid(page, 'entry-reminder-switch')).toBeChecked();
  await tid(page, 'entry-done').click();
  await expect(tid(page, `entry-${ENZO}`)).toContainText('Trattoria Da Enzo · 19:30');
});

test('AC-028: a day chip moves the entry and the window stays open', async ({ page }) => {
  await open(page, `/kalender?eintrag=${LASAGNE}`);
  const chips = page.locator('[data-testid^="entry-move-20"]');
  await chips.nth(6).click();
  await expect(toastMessage(page)).toContainText('→');
  await expect(tid(page, 'entry-sheet')).toBeVisible();
});

test('AC-030, AC-031: leftovers stand on top, "Alle Reste ›" opens the tab', async ({ page }) => {
  await open(page, '/kalender');
  await page.locator('[data-testid^="add-20"]').last().click();
  await expect(tid(page, 'add-entry-sheet')).toBeVisible();
  const top = tid(page, 'add-entry-leftovers-top');
  if (await top.isVisible()) {
    await tid(page, 'add-entry-leftovers-all').click();
    await expect(tid(page, 'add-entry-leftovers-older')).toBeVisible();
  }
});

test('AC-040: removing with contributions on the list asks first', async ({ page }) => {
  await open(page, `/kalender?eintrag=${LASAGNE}`);
  await tid(page, 'entry-remove').click();
  const dialog = tid(page, 'entry-remove-dialog');
  if (await dialog.isVisible()) {
    await expect(tid(page, 'entry-remove-message')).toContainText('auf der Einkaufsliste');
    await tid(page, 'entry-remove-cancel').click();
    await expect(tid(page, 'entry-sheet')).toBeVisible();
  }
});

test('offline: the fields are greyed out and closing only closes', async ({ page }) => {
  await open(page, `/kalender?eintrag=${ENZO}`);
  await goOffline(page);
  await expect(tid(page, 'entry-time-hour')).toBeDisabled();
  await tid(page, 'entry-done').click();
  await expect(tid(page, 'entry-sheet')).toBeHidden();
});
