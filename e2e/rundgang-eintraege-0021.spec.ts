import type { Page } from '@playwright/test';

import {
  accessToken,
  contentReady,
  expect,
  freshSeed,
  goOffline,
  open,
  rpc,
  supabaseFetch,
  test,
  tid,
  toastMessage,
  chooseTime,
} from './helpers';
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
const HOUSEHOLD = seedIds['hh-demo'];
const SYNC = { timeout: 30_000 };

/** Nadja changes the entry on her device (through the same write path as the app). */
async function nadjaChanges(entryId: string, changes: Record<string, unknown>): Promise<void> {
  await rpc(await accessToken('nadja'), 'apply_changes', {
    p_household_id: HOUSEHOLD,
    p_ops: [{ kind: 'patch', table: 'meal_plan_entries', id: entryId, changes }],
  });
}

/** The entry as the server has it. */
async function serverEntry(entryId: string): Promise<{ portions: number; note: string | null }> {
  const response = await supabaseFetch(
    `/rest/v1/meal_plan_entries?select=portions,note&id=eq.${entryId}`,
    { token: await accessToken('enrico') },
  );
  const [row] = (await response.json()) as { portions: number; note: string | null }[];
  if (!row) throw new Error(`entry ${entryId} not found`);
  return row;
}

/** Whether the device's local cache holds the text (the delta sync has brought it). */
async function cacheHolds(page: Page, text: string): Promise<boolean> {
  return page.evaluate(
    (wanted) =>
      new Promise<boolean>((resolve) => {
        const request = indexedDB.open('housekeeping');
        request.onsuccess = () => {
          const db = request.result;
          const all = db.transaction('cache').objectStore('cache').getAll();
          all.onsuccess = () => {
            db.close();
            resolve(JSON.stringify(all.result).includes(wanted));
          };
        };
        request.onerror = () => resolve(false);
      }),
    text,
  );
}

test('AC-015, AC-018: a person more is a portion more, "−" stops at 1', async ({ page }) => {
  await open(page, `/kalender?eintrag=${LASAGNE}`);
  await expect(tid(page, 'entry-sheet')).toBeVisible();
  const value = tid(page, 'entry-portions-value');
  const before = Number(await value.textContent());
  await tid(page, 'entry-portions-plus').click();
  await expect(value).toHaveText(String(before + 1));
  await tid(page, 'entry-done').click();
  await expect(tid(page, 'entry-sheet')).toBeHidden();
  // The delta sync after the write brings it into the cache; a reload before it ends would open
  // the window with the cached value from before.
  await contentReady(page);
  await open(page, `/kalender?eintrag=${LASAGNE}`);
  await expect(tid(page, 'entry-portions-value')).toHaveText(String(before + 1));
});

test('AC-049: closing a window with a stale draft keeps what Nadja changed meanwhile', async ({
  page,
}) => {
  await open(page, `/kalender?eintrag=${LASAGNE}`);
  await expect(tid(page, 'entry-sheet')).toBeVisible();
  const before = Number(await tid(page, 'entry-portions-value').textContent());

  // The window shows the state from opening; Nadja's change arrives by the delta sync.
  await nadjaChanges(LASAGNE, { portions: before + 2, note: 'von Nadja' });
  await expect.poll(() => cacheHolds(page, 'von Nadja'), SYNC).toBe(true);
  await expect(tid(page, 'entry-portions-value')).toHaveText(String(before));
  await tid(page, 'entry-done').click();
  await expect(tid(page, 'entry-sheet')).toBeHidden();
  await open(page, `/kalender?eintrag=${LASAGNE}`);
  await expect(tid(page, 'entry-portions-value')).toHaveText(String(before + 2));
  await expect(tid(page, 'entry-note-input')).toHaveValue('von Nadja');
  expect(await serverEntry(LASAGNE)).toEqual({ portions: before + 2, note: 'von Nadja' });

  // Only the changed field goes: one portion more, Nadja's newer Zusatz stays.
  await nadjaChanges(LASAGNE, { note: 'wieder von Nadja' });
  await expect.poll(() => cacheHolds(page, 'wieder von Nadja'), SYNC).toBe(true);
  await tid(page, 'entry-portions-plus').click();
  await tid(page, 'entry-done').click();
  await expect(tid(page, 'entry-sheet')).toBeHidden();
  await expect
    .poll(() => serverEntry(LASAGNE), SYNC)
    .toEqual({ portions: before + 3, note: 'wieder von Nadja' });
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
  await expect(tid(page, 'entry-sheet')).toBeHidden();
  await contentReady(page);
  await open(page, `/kalender?eintrag=${ENZO}`);
  await chooseTime(page, 'entry-time', '19:30');
  await expect(tid(page, 'entry-reminder-switch').locator('input')).toBeChecked();
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
  // The seed has leftovers (the curry of yesterday evening): they stand on top.
  await expect(tid(page, 'add-entry-leftovers-top')).toBeVisible();
  await tid(page, 'add-entry-leftovers-all').click();
  await expect(tid(page, 'add-entry-leftovers-older')).toBeVisible();
});

test('AC-040: removing with contributions on the list asks first', async ({ page }) => {
  await open(page, `/kalender?eintrag=${LASAGNE}`);
  await tid(page, 'entry-remove').click();
  // The seed has Lasagne's ingredients on the list, so removing asks first.
  await expect(tid(page, 'entry-remove-dialog')).toBeVisible();
  await expect(tid(page, 'entry-remove-message')).toContainText('auf der Einkaufsliste');
  await tid(page, 'entry-remove-cancel').click();
  await expect(tid(page, 'entry-sheet')).toBeVisible();
});

test('offline: the fields are greyed out and closing only closes', async ({ page }) => {
  await open(page, `/kalender?eintrag=${ENZO}`);
  await goOffline(page);
  await expect(tid(page, 'entry-time-hour')).toBeDisabled();
  await tid(page, 'entry-done').click();
  await expect(tid(page, 'entry-sheet')).toBeHidden();
});
