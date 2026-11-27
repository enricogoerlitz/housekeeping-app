import type { Locator, Page } from '@playwright/test';
import {
  addDays,
  monthTitle,
  moveToastText,
  reminderAccessibilityLabel,
  reminderLabel,
  type ISODate,
} from '@housekeeping/core';

import {
  PLAN_ENTRY,
  TODAY,
  chooseTime,
  day,
  expectTime,
  expect,
  freshSeed,
  goOffline,
  only,
  open,
  showPlanWeek,
  test,
  tid,
  tidPrefix,
  toastMessage,
  dayBlock,
} from './helpers';
import { seedIds } from './seed-ids';

// Spec 0017 — "Erinnern" at calendar entries: switched on in the second step of the add window
// (REQ-001), seen, changed and switched off in the entry window (REQ-002), day and time
// (REQ-003), the bell in week, day window and entry window (REQ-002), the toast after moving
// (REQ-006) and the hints per person and device (REQ-007). The seed is dated from the real
// today, so every entry with a reminder lies a few days ahead; the clock of the run is real, and
// the expected labels come from core in the household's zone. Delivery (REQ-005) and what moving
// does to the stored reminder are pgTAP's and the scheduler's.

only('phone');
freshSeed();
// The production export with its service worker answers the device questions at once (spec 0013).
test.use({ serviceWorkers: 'allow' });

const ZONE = 'Europe/Berlin';
const AHEAD = day(3);
const CURRY_YESTERDAY = seedIds['plan-1'];

const label = (date: ISODate, offsetDays: number, at: string) =>
  reminderLabel(date, { offsetDays, at }, new Date(), ZONE);
const PAST_SUFFIX = ' · Erinnerung liegt in der Vergangenheit';

/** The input of a SwitchRow's switch (react-native-web puts the test id on its wrapper). */
function toggle(page: Page, id: string): Locator {
  return tid(page, id).locator('input');
}

function entryRow(page: Page, date: string, title: string): Locator {
  return dayBlock(page, date).locator(PLAN_ENTRY).filter({ hasText: title });
}

/**
 * Fakes the browser's permission: `answer` is what the person picks when asked; every question is
 * counted in `window.permissionAsks`; spec 0051: nothing may ask any more.
 */
async function fakePermission(page: Page, answer: 'denied' | 'default'): Promise<void> {
  await page.addInitScript((reply) => {
    const record = window as unknown as { permissionAsks: number };
    record.permissionAsks = 0;
    let state: NotificationPermission = 'default';
    Object.defineProperty(Notification, 'permission', { get: () => state, configurable: true });
    Notification.requestPermission = () => {
      record.permissionAsks += 1;
      state = reply;
      return Promise.resolve(reply);
    };
  }, answer);
}

function permissionAsks(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { permissionAsks: number }).permissionAsks);
}

/** "+ Hinzufügen" under `date`, free text `title`, up to the second step. */
async function startFreeText(page: Page, date: ISODate, title: string): Promise<void> {
  await open(page, '/kalender');
  await showPlanWeek(page, date);
  await tid(page, `add-${date}`).click();
  await tid(page, 'add-entry-search').fill(title);
  await tid(page, 'add-entry-new-text').click();
  await expect(tid(page, 'add-entry-text')).toHaveValue(title);
}

/** Plans free text `title` on `date` in the evening without a reminder and opens its window. */
async function planAndOpen(page: Page, date: ISODate, title: string): Promise<void> {
  await startFreeText(page, date, title);
  await tid(page, 'add-entry-save').click();
  await expect(tid(page, 'add-entry-sheet')).toBeHidden();
  await entryRow(page, date, title).click();
  await expect(tid(page, 'entry-sheet')).toBeVisible();
}

/** Plans free text `title` on `date` in the evening with the default reminder ("Am Tag" 17:00). */
async function planWithReminder(page: Page, date: ISODate, title: string): Promise<void> {
  await startFreeText(page, date, title);
  await toggle(page, 'add-entry-reminder-switch').click();
  await expectTime(page, 'add-entry-reminder-time', '17:00');
  await tid(page, 'add-entry-save').click();
  await expect(tid(page, 'add-entry-sheet')).toBeHidden();
}

/** "Anderes Datum …" in the open entry window, `target` in the month calendar, then "Fertig". */
async function moveOther(page: Page, from: ISODate, target: ISODate): Promise<void> {
  await tid(page, 'entry-move-other').click();
  await expect(tid(page, 'entry-move-date-title')).toHaveText(monthTitle(from));
  if (monthTitle(target) !== monthTitle(from)) await tid(page, 'entry-move-date-prev').click();
  await tid(page, `entry-move-date-day-${target}`).click();
  // The window stays open after a move (spec 0021, AC-028); "Fertig" closes it.
  await tid(page, 'entry-done').click();
  await expect(tid(page, 'entry-sheet')).toHaveCount(0);
}

test('AC-001: the switch is off at first and nothing else shows; without it no reminder', async ({
  page,
}) => {
  await startFreeText(page, AHEAD, 'Lasagne ohne');
  await expect(toggle(page, 'add-entry-reminder-switch')).not.toBeChecked();
  for (const field of ['day-sameDay', 'time', 'text']) {
    await expect(tid(page, `add-entry-reminder-${field}`), field).toHaveCount(0);
  }
  await tid(page, 'add-entry-save').click();
  await entryRow(page, AHEAD, 'Lasagne ohne').click();
  await expect(toggle(page, 'entry-reminder-switch')).not.toBeChecked();
});

test('AC-002: switched on: "Am Tag" and 17:00 in the evening; the entry then reminds', async ({
  page,
}) => {
  await startFreeText(page, AHEAD, 'Lasagne mit');
  await toggle(page, 'add-entry-reminder-switch').click();
  await expect(tid(page, 'add-entry-reminder-day-sameDay')).toHaveText('Am Tag');
  await expect(tid(page, 'add-entry-reminder-day-dayBefore')).toHaveText('Am Vortag');
  await expect(tid(page, 'add-entry-reminder-day-otherDate')).toHaveText('Anderes Datum …');
  await expect(tid(page, 'add-entry-reminder-day-sameDay')).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expectTime(page, 'add-entry-reminder-time', '17:00');
  await expect(tid(page, 'add-entry-reminder')).toContainText('Woran erinnern? (optional)');
  await tid(page, 'add-entry-save').click();
  await expect(tid(page, 'add-entry-sheet')).toBeHidden();

  await entryRow(page, AHEAD, 'Lasagne mit').click();
  await expect(toggle(page, 'entry-reminder-switch')).toBeChecked();
  await expect(tid(page, 'entry-reminder')).toContainText(label(AHEAD, 0, '17:00'));
});

test('AC-003 / AC-007: "Vorgemerkt" and a past day offer no "Erinnern"', async ({ page }) => {
  await open(page, '/kalender');
  await tid(page, 'add-later').click();
  await tid(page, 'add-entry-search').fill('Shakshuka');
  await tid(page, `add-entry-recipe-${seedIds['rec-shakshuka']}`).click();
  await expect(tid(page, 'add-entry-save')).toHaveText('Vormerken');
  await expect(tid(page, 'add-entry-reminder')).toHaveCount(0);
  await tid(page, 'add-entry-save').click();

  await tid(page, 'planned-later').locator(PLAN_ENTRY).filter({ hasText: 'Shakshuka' }).click();
  await expect(tid(page, 'entry-sheet')).toBeVisible();
  await expect(tid(page, 'entry-reminder')).toHaveCount(0);
  await tid(page, 'entry-done').click();

  await showPlanWeek(page, day(-1));
  await tid(page, `entry-${CURRY_YESTERDAY}`).click();
  await expect(tid(page, 'entry-sheet')).toBeVisible();
  await expect(tid(page, 'entry-reminder')).toHaveCount(0);
});

test('AC-005 / AC-009 / AC-014: switched on later, "Am Vortag" 18:00 with a text, saved with "Fertig"', async ({
  page,
}) => {
  await planAndOpen(page, AHEAD, 'Lasagne später');
  await toggle(page, 'entry-reminder-switch').click();
  await tid(page, 'entry-reminder-day-dayBefore').click();
  await chooseTime(page, 'entry-reminder-time', '18:00');
  await tid(page, 'entry-reminder-text').fill('Fleisch auftauen');
  await expect(tid(page, 'entry-reminder')).toContainText('16/80');
  await tid(page, 'entry-done').click();
  await expect(tid(page, 'entry-sheet')).toBeHidden();

  await entryRow(page, AHEAD, 'Lasagne später').click();
  await expect(tid(page, 'entry-reminder')).toContainText(label(AHEAD, 1, '18:00'));
  await expect(tid(page, 'entry-reminder-day-dayBefore')).toHaveAttribute('aria-selected', 'true');
  await expectTime(page, 'entry-reminder-time', '18:00');
  await expect(tid(page, 'entry-reminder-text')).toHaveValue('Fleisch auftauen');
});

test('AC-006: switched off, everything goes; on again starts from the defaults', async ({
  page,
}) => {
  await planAndOpen(page, AHEAD, 'Lasagne aus');
  await toggle(page, 'entry-reminder-switch').click();
  await tid(page, 'entry-reminder-text').fill('Käse kaufen');
  await tid(page, 'entry-reminder-text').press('Enter');
  await expect(tid(page, 'entry-reminder')).toContainText(label(AHEAD, 0, '17:00'));

  await toggle(page, 'entry-reminder-switch').click();
  await expect(toggle(page, 'entry-reminder-switch')).not.toBeChecked();
  await expect(tid(page, 'entry-reminder')).not.toContainText('Erinnerung');
  await expect(tid(page, 'entry-reminder-time')).toHaveCount(0);
  await expect(tid(page, 'entry-reminder-text')).toHaveCount(0);

  await toggle(page, 'entry-reminder-switch').click();
  await expect(tid(page, 'entry-reminder-day-sameDay')).toHaveAttribute('aria-selected', 'true');
  await expectTime(page, 'entry-reminder-time', '17:00');
  await expect(tid(page, 'entry-reminder-text')).toHaveValue('');
});

test('AC-010: "Anderes Datum …" offers today up to the entry’s day and shows the date', async ({
  page,
}) => {
  await planAndOpen(page, AHEAD, 'Lasagne Datum');
  await toggle(page, 'entry-reminder-switch').click();
  await tid(page, 'entry-reminder-day-otherDate').click();
  await expect(tid(page, 'entry-reminder-date-title')).toHaveText(monthTitle(AHEAD));
  for (const blocked of [day(-1), addDays(AHEAD, 1)]) {
    if (monthTitle(blocked) !== monthTitle(AHEAD)) continue;
    await expect(tid(page, `entry-reminder-date-day-${blocked}`)).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  }
  const chosen = addDays(AHEAD, -2);
  if (monthTitle(chosen) !== monthTitle(AHEAD)) await tid(page, 'entry-reminder-date-prev').click();
  await tid(page, `entry-reminder-date-day-${chosen}`).click();
  await chooseTime(page, 'entry-reminder-time', '09:00');
  await expect(tid(page, 'entry-reminder')).toContainText(label(AHEAD, 2, '09:00'));
  await expect(tid(page, 'entry-reminder-day-otherDate')).toHaveAttribute('aria-selected', 'true');
  await expect(tid(page, 'entry-reminder-day-otherDate')).not.toHaveText('Anderes Datum …');
});

test('AC-011: a past moment is refused under the time', async ({ page }) => {
  // 0:05 must lie in the past and 23:55 ahead: outside 0:10–23:45 the test says nothing.
  const minutes = new Date().getHours() * 60 + new Date().getMinutes();
  test.skip(minutes < 10 || minutes > 23 * 60 + 45, 'runs between 0:10 and 23:45 local time');
  await planAndOpen(page, TODAY, 'Curry heute');
  await toggle(page, 'entry-reminder-switch').click();
  await expect(tid(page, 'entry-reminder-day-dayBefore')).toHaveAttribute('aria-disabled', 'true');
  await chooseTime(page, 'entry-reminder-time', '00:05');
  await expect(tid(page, 'entry-reminder-time-error')).toHaveText('Liegt in der Vergangenheit');

  // Spec 0027, AC-029: only five-minute steps can be chosen, so no step message exists.
  await expect(tid(page, 'entry-reminder-time-minute').locator('option')).toHaveCount(12);
  await chooseTime(page, 'entry-reminder-time', '23:55');
  await expect(tid(page, 'entry-reminder-time-error')).toHaveCount(0);
  await expect(tid(page, 'entry-reminder')).toContainText(label(TODAY, 0, '23:55'));
});

test('AC-015: the text takes at most 80 characters', async ({ page }) => {
  await startFreeText(page, AHEAD, 'Lasagne lang');
  await toggle(page, 'add-entry-reminder-switch').click();
  await tid(page, 'add-entry-reminder-text').fill('x'.repeat(81));
  await expect(tid(page, 'add-entry-reminder-text')).toHaveValue('x'.repeat(80));
  await expect(tid(page, 'add-entry-reminder')).toContainText('80/80');
});

test('REQ-002: offline the block is greyed out with the known hint', async ({ page }) => {
  await planAndOpen(page, AHEAD, 'Lasagne offline');
  await goOffline(page);
  await expect(tid(page, 'entry-sheet')).toContainText('Offline – zum Bearbeiten brauchst du Netz');
  await expect(toggle(page, 'entry-reminder-switch')).toBeDisabled();
});

test('spec 0051, AC-006: switching "Erinnern" on never asks for a permission; no device hint', async ({
  page,
}) => {
  await fakePermission(page, 'denied');
  await open(page, '/kalender');
  await showPlanWeek(page, AHEAD);
  await tid(page, `add-${AHEAD}`).click();
  await tid(page, 'add-entry-search').fill('Lasagne gefragt');
  await tid(page, 'add-entry-new-text').click();
  await toggle(page, 'add-entry-reminder-switch').click();
  await expect(toggle(page, 'add-entry-reminder-switch')).toBeChecked();
  await expect(tid(page, 'add-entry-reminder-reach')).toHaveCount(0);
  await tid(page, 'add-entry-save').click();
  await entryRow(page, AHEAD, 'Lasagne gefragt').click();
  await expect(toggle(page, 'entry-reminder-switch')).toBeChecked();
  expect(await permissionAsks(page), 'never asked').toBe(0);
});

test('AC-002 / AC-005: the bell with day and time in the week, the day window and the entry window, not in the month', async ({
  page,
}) => {
  const title = 'Lasagne Glocke';
  const expected = label(AHEAD, 0, '17:00');
  await planWithReminder(page, AHEAD, title);

  const row = entryRow(page, AHEAD, title);
  await expect(row).toContainText(expected);
  await expect(row).toHaveAttribute(
    'aria-label',
    reminderAccessibilityLabel(title, AHEAD, { offsetDays: 0, at: '17:00' }, new Date(), ZONE),
  );
  await row.click();
  await expect(tid(page, 'entry-reminder-bell')).toHaveText(expected);
  await tid(page, 'entry-done').click();

  await tid(page, 'calendar-view-month').click();
  // `isVisible` does not wait: the month must be drawn before it decides to page on.
  await expect(tidPrefix(page, 'month-day-').first()).toBeVisible();
  for (let step = 0; step < 3 && !(await tid(page, `month-day-${AHEAD}`).isVisible()); step += 1) {
    await tid(page, 'week-next').click();
  }
  await expect(tid(page, `month-day-${AHEAD}`)).not.toContainText('Erinnerung');
  await tid(page, `month-day-${AHEAD}`).click();
  const panel = tid(page, 'day-panel');
  await expect(panel).toBeVisible();
  await expect(panel.locator(PLAN_ENTRY).filter({ hasText: title })).toContainText(expected);
});

test('AC-022: moved before its reminder, the toast says so, the entry shows "Erinnerung vorbei"; undo brings it back', async ({
  page,
}) => {
  const title = 'Lasagne vorbei';
  await planAndOpen(page, AHEAD, title);
  await toggle(page, 'entry-reminder-switch').click();
  await tid(page, 'entry-reminder-day-dayBefore').click();
  await chooseTime(page, 'entry-reminder-time', '18:00');
  await expect(tid(page, 'entry-reminder-bell')).toHaveText(label(AHEAD, 1, '18:00'));

  // "Am Vortag" of tonight is yesterday, 18:00: always in the past.
  await moveOther(page, AHEAD, TODAY);
  await expect(toastMessage(page)).toContainText(`${title} → `);
  await expect(toastMessage(page)).toContainText(PAST_SUFFIX);
  await tid(page, 'toast-action').click();
  await expect(entryRow(page, AHEAD, title)).toContainText(label(AHEAD, 1, '18:00'));

  await entryRow(page, AHEAD, title).click();
  await moveOther(page, AHEAD, TODAY);
  await expect(toastMessage(page)).toHaveText(
    moveToastText({ title, date: TODAY, slotName: 'Abend', today: TODAY, reminderPast: true }),
  );
  if (!(await tid(page, `day-${TODAY}`).isVisible())) await tid(page, 'week-today').click();
  await expect(entryRow(page, TODAY, title)).toContainText('Erinnerung vorbei');
  await entryRow(page, TODAY, title).click();
  await expect(tid(page, 'entry-reminder-bell')).toHaveText('Erinnerung vorbei');
});

test('AC-021: moved to a later day, the reminder goes along and the toast adds nothing', async ({
  page,
}) => {
  const title = 'Lasagne weiter';
  const later = addDays(AHEAD, 1);
  await planWithReminder(page, AHEAD, title);
  await entryRow(page, AHEAD, title).click();
  await tid(page, 'entry-move-other').click();
  if (monthTitle(later) !== monthTitle(AHEAD)) await tid(page, 'entry-move-date-next').click();
  await tid(page, `entry-move-date-day-${later}`).click();
  await expect(toastMessage(page)).toContainText(`${title} → `);
  await expect(toastMessage(page)).not.toContainText('Erinnerung');
  if (!(await tid(page, `day-${later}`).isVisible())) await tid(page, 'week-next').click();
  await expect(entryRow(page, later, title)).toContainText(label(later, 0, '17:00'));
});

test('AC-023: "Vormerken" drops the bell and says only "vorgemerkt"; undo brings the reminder back', async ({
  page,
}) => {
  const title = 'Lasagne gemerkt';
  await planWithReminder(page, AHEAD, title);
  await entryRow(page, AHEAD, title).click();
  await tid(page, 'entry-move-later').click();
  await expect(toastMessage(page)).toHaveText(`${title} vorgemerkt`);
  if (await tid(page, 'entry-sheet').isVisible()) await tid(page, 'entry-done').click();
  await expect(tid(page, 'entry-sheet')).toHaveCount(0);
  await expect(
    tid(page, 'planned-later').locator(PLAN_ENTRY).filter({ hasText: title }),
  ).not.toContainText('Erinnerung');
  await tid(page, 'toast-action').click();
  await expect(entryRow(page, AHEAD, title)).toContainText(label(AHEAD, 0, '17:00'));
});
