import type { Locator, Page } from '@playwright/test';
import { dayInMonth, monthTitle, moveToastText, type ISODate } from '@housekeeping/core';

import {
  PLAN_ENTRY,
  SLOT_DINNER,
  SLOT_MORNING,
  TODAY,
  day,
  expect,
  freshSeed,
  nav,
  only,
  open,
  showPlanWeek,
  test,
  tid,
  toastMessage,
} from './helpers';
import { seedIds } from './seed-ids';

// Spec 0016, REQ-005: moving without dragging, beyond any week. "Anderes Datum …" in the entry
// window and in "Einplanen" of an activity opens a month calendar without a limit; days that
// would break the leftovers rule cannot be chosen, also not with the keyboard. The seed is dated
// from the real today: Lasagne tonight, Mango-Curry yesterday evening with its leftovers today.

only('phone');
freshSeed();

const LASAGNE = seedIds['plan-2'];
const CURRY_YESTERDAY = seedIds['plan-1'];
const EISLAUFEN = seedIds['act-eislaufen'];

const sameMonth = (a: ISODate, b: ISODate) => a.slice(0, 7) === b.slice(0, 7);

function dayBlock(page: Page, date: string): Locator {
  return tid(page, `day-${date}`).locator('xpath=..');
}

/** Opens the entry window of `title` on `date` in the week and checks its Tageszeit. */
async function expectEntryAt(page: Page, date: ISODate, title: string, slotId: string) {
  if (!(await tid(page, `day-${TODAY}`).isVisible())) await tid(page, 'week-today').click();
  await showPlanWeek(page, date);
  const row = dayBlock(page, date).locator(PLAN_ENTRY).filter({ hasText: title });
  await expect(row).toHaveCount(1);
  await row.click();
  await expect(tid(page, `entry-slot-${slotId}`)).toHaveAttribute('aria-selected', 'true');
  await tid(page, 'entry-done').click();
}

test('AC-019: "Anderes Datum …" moves Lasagne two months on and keeps "Abend"', async ({
  page,
}) => {
  const target = dayInMonth(TODAY, 2, 8);
  await open(page, '/kalender');
  await tid(page, `entry-${LASAGNE}`).click();
  await expect(tid(page, 'entry-sheet')).toBeVisible();
  await tid(page, 'entry-move-other').click();
  await expect(tid(page, 'entry-move-date-title')).toHaveText(monthTitle(TODAY));
  await expect(tid(page, `entry-move-date-day-${TODAY}`)).toHaveAttribute('aria-selected', 'true');

  await tid(page, 'entry-move-date-next').click();
  await tid(page, 'entry-move-date-next').click();
  await expect(tid(page, 'entry-move-date-title')).toHaveText(monthTitle(target));
  await tid(page, `entry-move-date-day-${target}`).click();

  await expect(tid(page, 'entry-sheet')).toHaveCount(0);
  await expect(toastMessage(page)).toContainText(
    moveToastText({ title: 'Lasagne', date: target, slotName: 'Abend', today: TODAY }),
  );
  await expect(tid(page, 'toast-action')).toHaveText('Rückgängig');
  await expect(
    dayBlock(page, TODAY).locator(PLAN_ENTRY).filter({ hasText: 'Lasagne' }),
  ).toHaveCount(0);
  await expectEntryAt(page, target, 'Lasagne', SLOT_DINNER);
});

test('AC-020: "Einplanen" of Eislaufen reaches a day more than 14 days ahead', async ({ page }) => {
  const target = dayInMonth(TODAY, 2, 16);
  await open(page, `/kalender/aktivitaet/${EISLAUFEN}`);
  await tid(page, 'activity-plan').click();
  await expect(tid(page, 'add-entry-activity-chosen')).toContainText('Eislaufen');
  await tid(page, 'add-entry-day-other').click();
  await expect(tid(page, 'add-entry-date-title')).toHaveText(monthTitle(TODAY));
  await tid(page, 'add-entry-date-next').click();
  await tid(page, 'add-entry-date-next').click();
  await tid(page, `add-entry-date-day-${target}`).click();
  await expect(tid(page, 'add-entry-date-picker')).toHaveCount(0);
  await expect(tid(page, 'add-entry-day-other')).toHaveAttribute('aria-selected', 'true');
  await tid(page, `add-entry-slot-${SLOT_MORNING}`).click();
  await tid(page, 'add-entry-save').click();

  await nav(page, 'kalender');
  await expectEntryAt(page, target, 'Eislaufen', SLOT_MORNING);
});

test('AC-021: with the keyboard, the days from the leftovers on are skipped', async ({ page }) => {
  const yesterday = day(-1);
  await open(page, '/kalender');
  await showPlanWeek(page, yesterday);
  const curry = tid(page, `entry-${CURRY_YESTERDAY}`);
  await curry.focus();
  await page.keyboard.press('Enter');
  await expect(tid(page, 'entry-sheet')).toBeVisible();
  await tid(page, 'entry-move-other').focus();
  await page.keyboard.press('Enter');

  // The leftovers are today: today and every later day are blocked, as is more than seven days
  // before them.
  await expect(tid(page, 'entry-move-date-title')).toHaveText(monthTitle(yesterday));
  for (const blocked of [day(0), day(1), day(2), day(-8)].filter((date) =>
    sameMonth(date, yesterday),
  )) {
    await expect(tid(page, `entry-move-date-day-${blocked}`)).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  }
  const marked = tid(page, `entry-move-date-day-${yesterday}`);
  await expect(marked).toHaveAttribute('tabindex', '0');
  await marked.focus();
  await page.keyboard.press('ArrowRight');
  await expect(marked).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  const target = day(-2);
  if (sameMonth(target, yesterday)) {
    await expect(tid(page, `entry-move-date-day-${target}`)).toBeFocused();
  }
  await page.keyboard.press('Enter');

  await expect(tid(page, 'entry-sheet')).toHaveCount(0);
  await expect(toastMessage(page)).toContainText('Mango-Curry →');
  await expectEntryAt(page, target, 'Mango-Curry', SLOT_DINNER);
});
