import type { Locator, Page } from '@playwright/test';
import { addDays, monthTitle, reminderLabel, type ISODate } from '@housekeeping/core';

import {
  PLAN_ENTRY,
  TODAY,
  day,
  expect,
  freshSeed,
  goOffline,
  only,
  open,
  openSettings,
  showPlanWeek,
  test,
  tid,
} from './helpers';
import { seedIds } from './seed-ids';

// Spec 0017 — "Erinnern" at calendar entries: switched on in the second step of the add window
// (REQ-001), seen, changed and switched off in the entry window (REQ-002), day and time
// (REQ-003), and the hints per person and device (REQ-007). The seed is dated from the real
// today, so every entry with a reminder lies a few days ahead; the clock of the run is real, and
// the expected labels come from core in the household's zone. Delivery (REQ-005) and moving
// (REQ-006) are pgTAP's and the scheduler's.

only('phone');
freshSeed();
// The production export with its service worker answers the device questions at once (spec 0013).
test.use({ serviceWorkers: 'allow' });

const ZONE = 'Europe/Berlin';
const AHEAD = day(3);
const CURRY_YESTERDAY = seedIds['plan-1'];

const label = (date: ISODate, offsetDays: number, at: string) =>
  reminderLabel(date, { offsetDays, at }, new Date(), ZONE);

/** The input of a SwitchRow's switch (react-native-web puts the test id on its wrapper). */
function toggle(page: Page, id: string): Locator {
  return tid(page, id).locator('input');
}

function dayBlock(page: Page, date: string): Locator {
  return tid(page, `day-${date}`).locator('xpath=..');
}

function entryRow(page: Page, date: string, title: string): Locator {
  return dayBlock(page, date).locator(PLAN_ENTRY).filter({ hasText: title });
}

/**
 * Fakes the browser's permission: `answer` is what the person picks when asked; every question is
 * counted in `window.permissionAsks` (as in the walk-through of spec 0013).
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
  await expect(tid(page, 'add-entry-reminder-time')).toHaveValue('17:00');
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
  await tid(page, 'entry-reminder-time').fill('18:00');
  await tid(page, 'entry-reminder-text').fill('Fleisch auftauen');
  await expect(tid(page, 'entry-reminder')).toContainText('16/80');
  await tid(page, 'entry-done').click();
  await expect(tid(page, 'entry-sheet')).toBeHidden();

  await entryRow(page, AHEAD, 'Lasagne später').click();
  await expect(tid(page, 'entry-reminder')).toContainText(label(AHEAD, 1, '18:00'));
  await expect(tid(page, 'entry-reminder-day-dayBefore')).toHaveAttribute('aria-selected', 'true');
  await expect(tid(page, 'entry-reminder-time')).toHaveValue('18:00');
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
  await expect(tid(page, 'entry-reminder-time')).toHaveValue('17:00');
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
  await tid(page, 'entry-reminder-time').fill('9:00');
  await tid(page, 'entry-reminder-time').press('Enter');
  await expect(tid(page, 'entry-reminder')).toContainText(label(AHEAD, 2, '09:00'));
  await expect(tid(page, 'entry-reminder-day-otherDate')).toHaveAttribute('aria-selected', 'true');
  await expect(tid(page, 'entry-reminder-day-otherDate')).not.toHaveText('Anderes Datum …');
});

test('AC-011 / AC-012: a past moment and an odd minute are refused under the time', async ({
  page,
}) => {
  await planAndOpen(page, TODAY, 'Curry heute');
  await toggle(page, 'entry-reminder-switch').click();
  await expect(tid(page, 'entry-reminder-day-dayBefore')).toHaveAttribute('aria-disabled', 'true');
  await tid(page, 'entry-reminder-time').fill('0:05');
  await tid(page, 'entry-reminder-time').press('Enter');
  await expect(tid(page, 'entry-reminder-time-error')).toHaveText('Liegt in der Vergangenheit');

  await tid(page, 'entry-reminder-time').fill('23:53');
  await tid(page, 'entry-reminder-time').press('Enter');
  await expect(tid(page, 'entry-reminder-time-error')).toHaveText('Bitte in 5-Minuten-Schritten');
  await tid(page, 'entry-reminder-time').fill('23:55');
  await tid(page, 'entry-reminder-time').press('Enter');
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

test('AC-026: asked only when "Erinnern" is switched on; refused, the reminder stays with the hint', async ({
  page,
}) => {
  await fakePermission(page, 'denied');
  await open(page, '/kalender');
  await showPlanWeek(page, AHEAD);
  expect(await permissionAsks(page), 'never asked on the way to the calendar').toBe(0);

  await tid(page, `add-${AHEAD}`).click();
  await tid(page, 'add-entry-search').fill('Lasagne gefragt');
  await tid(page, 'add-entry-new-text').click();
  await toggle(page, 'add-entry-reminder-switch').click();
  await expect.poll(() => permissionAsks(page)).toBe(1);
  await expect(tid(page, 'add-entry-reminder-reach')).toContainText(
    'Auf diesem Gerät kommen keine Benachrichtigungen an',
  );
  await expect(tid(page, 'add-entry-reminder-settings')).toHaveText('Benachrichtigungen');
  await tid(page, 'add-entry-save').click();

  await entryRow(page, AHEAD, 'Lasagne gefragt').click();
  await expect(toggle(page, 'entry-reminder-switch')).toBeChecked();
  await expect(tid(page, 'entry-reminder-reach')).toContainText(
    'Auf diesem Gerät kommen keine Benachrichtigungen an',
  );
  await tid(page, 'entry-reminder-settings').click();
  await expect(tid(page, 'notif-kinds')).toBeVisible();
});

test('REQ-007 / task 8: "Erinnerungen an Einträgen" is on, has no time; off, the block says so', async ({
  page,
}) => {
  await open(page, '/');
  await openSettings(page);
  await expect(tid(page, 'settings-notifications-summary')).toHaveText(/^3 an/);
  await tid(page, 'settings-notifications-row').click();
  await expect(tid(page, 'notif-kinds')).toContainText('Erinnerungen an Einträgen');
  await expect(toggle(page, 'notif-kind-entry-reminders')).toBeChecked();
  await expect(tid(page, 'notif-kind-entry-reminders-detail')).toHaveCount(0);
  await toggle(page, 'notif-kind-entry-reminders').click();
  await expect(toggle(page, 'notif-kind-entry-reminders')).not.toBeChecked();

  await open(page, '/kalender');
  await showPlanWeek(page, AHEAD);
  await tid(page, `add-${AHEAD}`).click();
  await tid(page, 'add-entry-search').fill('Lasagne still');
  await tid(page, 'add-entry-new-text').click();
  await toggle(page, 'add-entry-reminder-switch').click();
  await expect(tid(page, 'add-entry-reminder-reach')).toContainText(
    'Erinnerungen an Einträgen sind bei dir aus',
  );
  await tid(page, 'add-entry-reminder-settings').click();
  // Back to the default for the other files.
  await toggle(page, 'notif-kind-entry-reminders').click();
  await expect(toggle(page, 'notif-kind-entry-reminders')).toBeChecked();
});
