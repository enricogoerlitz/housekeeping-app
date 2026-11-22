import type { Locator, Page } from '@playwright/test';
import {
  addDays,
  blockedText,
  formatPickerDate,
  monthGrid,
  moveTargetLabel,
  moveToastText,
  rangeLabel,
  startOfWeek,
  weekDates,
  weekRangeLabel,
  type ISODate,
} from '@housekeeping/core';

import {
  SLOT_DINNER,
  SLOT_LUNCH,
  SLOT_MORNING,
  TODAY,
  day,
  expect,
  freshSeed,
  isoWeekday,
  open,
  test,
  tid,
  tidPrefix,
  toastMessage,
} from './helpers';
import { seedIds } from './seed-ids';

// Spec 0016, REQ-001 to REQ-004 and REQ-007: dragging entries in week, month and year, from the
// day window and "Vorgemerkt", paging at the edge, refused targets, and drawing a trip over days.
// Phone: a finger through CDP touch events (hold until the entry lifts, then move); desktop: the
// mouse (press and move). The seed is dated from the real today: Eislaufen in the morning, the
// curry's leftovers at noon and Lasagne in the evening; Mango-Curry yesterday evening. Each test
// that moves something puts it back ("Rückgängig" or a second drag), so the next one starts from
// the seed.

freshSeed();

const LASAGNE = seedIds['plan-2'];
const CURRY_YESTERDAY = seedIds['plan-1'];
const ENRICO = seedIds['m-enrico'];
/** A day in the same week and grid row as today. */
const NEIGHBOUR = isoWeekday(TODAY) === 7 ? day(-1) : day(1);
/** A finger lifts an entry after 400 ms (drag-gesture-state.ts); hold a little longer. */
const HOLD_MS = 600;

interface Point {
  x: number;
  y: number;
}

async function centerOf(locator: Locator): Promise<Point> {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  if (!box) throw new Error('not laid out');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function scrollToCenter(locator: Locator): Promise<void> {
  await locator.evaluate((element) => element.scrollIntoView({ block: 'center' }));
}

function entry(page: Page, id: string, within?: Locator): Locator {
  const selector = `[data-testid="entry-${id}"]:visible`;
  return within ? within.locator(selector).first() : page.locator(selector).first();
}

/** A finger on the page through CDP touch events, so the browser sends touch pointer events. */
async function finger(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  let last: Point = { x: 0, y: 0 };
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', points: Point[]) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points.map((point) => ({ x: point.x, y: point.y, id: 1 })),
    });
  return {
    /** Puts the finger down and holds it still until the entry (or day) lifts. */
    hold: async (point: Point) => {
      last = point;
      await send('touchStart', [point]);
      await page.waitForTimeout(HOLD_MS);
    },
    move: async (point: Point, steps = 12) => {
      const from = last;
      for (let step = 1; step <= steps; step += 1) {
        await send('touchMove', [
          {
            x: from.x + ((point.x - from.x) * step) / steps,
            y: from.y + ((point.y - from.y) * step) / steps,
          },
        ]);
      }
      last = point;
    },
    lift: () => send('touchEnd', []),
  };
}

/** Presses the mouse on `from` and moves until the drag has started. */
async function mouseGrab(page: Page, from: Point): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 6, from.y + 6, { steps: 3 });
}

async function mouseTo(page: Page, to: Point): Promise<void> {
  await page.mouse.move(to.x, to.y, { steps: 12 });
}

async function undo(page: Page): Promise<void> {
  await tid(page, 'toast-action').click();
}

function lasagneToast(date: ISODate | null, slotName: string): string {
  return moveToastText({ title: 'Lasagne', date, slotName, today: TODAY });
}

test.describe('phone', () => {
  test.beforeEach(() => {
    test.skip(test.info().project.name !== 'phone', 'runs in the phone project');
  });

  test('AC-001: held with a finger, Lasagne goes to another evening, with the target on the entry and "Rückgängig"', async ({
    page,
  }) => {
    await open(page, '/kalender');
    const lasagne = entry(page, LASAGNE);
    await scrollToCenter(lasagne);
    const touch = await finger(page);
    await touch.hold(await centerOf(lasagne));

    const target = tid(page, `week-slot-${NEIGHBOUR}-${SLOT_DINNER}`);
    await touch.move(await centerOf(target));
    await expect(tid(page, 'drag-label')).toHaveText(moveTargetLabel(NEIGHBOUR, 'Abend'));
    await touch.lift();

    await expect(toastMessage(page)).toHaveText(lasagneToast(NEIGHBOUR, 'Abend'));
    await expect(tid(page, 'toast-action')).toHaveText('Rückgängig');
    await expect(entry(page, LASAGNE, target)).toBeVisible();
    await expect(
      tid(page, `week-slot-${TODAY}-${SLOT_DINNER}`).locator(`[data-testid="entry-${LASAGNE}"]`),
    ).toHaveCount(0);

    await undo(page);
    await expect(
      entry(page, LASAGNE, tid(page, `week-slot-${TODAY}-${SLOT_DINNER}`)),
    ).toBeVisible();
  });

  test('AC-006: while dragging every Tageszeit of a day is a target; afterwards only filled ones show', async ({
    page,
  }) => {
    await open(page, '/kalender');
    await expect(tid(page, `week-slot-${NEIGHBOUR}-${SLOT_MORNING}`)).toHaveCount(0);
    await expect(tid(page, `week-slot-${NEIGHBOUR}-${SLOT_LUNCH}`)).toHaveCount(0);
    const lasagne = entry(page, LASAGNE);
    await scrollToCenter(lasagne);
    const touch = await finger(page);
    await touch.hold(await centerOf(lasagne));

    for (const slot of [SLOT_MORNING, SLOT_LUNCH, SLOT_DINNER]) {
      await expect(tid(page, `week-slot-${NEIGHBOUR}-${slot}`)).toBeVisible();
    }
    const lunch = tid(page, `week-slot-${NEIGHBOUR}-${SLOT_LUNCH}`);
    await touch.move(await centerOf(lunch));
    await expect(tid(page, 'drag-label')).toHaveText(moveTargetLabel(NEIGHBOUR, 'Mittag'));
    await touch.lift();

    await expect(toastMessage(page)).toHaveText(lasagneToast(NEIGHBOUR, 'Mittag'));
    await expect(entry(page, LASAGNE, lunch)).toBeVisible();
    await expect(tid(page, `week-slot-${NEIGHBOUR}-${SLOT_MORNING}`)).toHaveCount(0);

    await undo(page);
    await expect(
      entry(page, LASAGNE, tid(page, `week-slot-${TODAY}-${SLOT_DINNER}`)),
    ).toBeVisible();
  });

  test('AC-013 / AC-012: from the day window onto "Vormerken" under the grid, and back onto the day', async ({
    page,
  }) => {
    await open(page, '/kalender');
    await tid(page, 'calendar-view-month').click();
    await expect(tid(page, 'planned-later-strip')).toHaveCount(0);
    await tid(page, `month-day-${TODAY}`).click();
    const panel = tid(page, 'day-panel');
    await expect(panel).toBeVisible();

    const touch = await finger(page);
    await touch.hold(await centerOf(entry(page, LASAGNE, panel)));
    const target = tid(page, 'planned-later-target');
    await expect(target).toHaveText('Vormerken');
    // The day window shrinks to its header line, so the grid and the strip are free (AC-008).
    await expect
      .poll(async () => (await panel.boundingBox())?.height ?? 0)
      .toBeLessThan((page.viewportSize()?.height ?? 0) * 0.2);
    await touch.move(await centerOf(target));
    await expect(tid(page, 'drag-label')).toHaveText('Vormerken');
    await touch.lift();

    await expect(toastMessage(page)).toHaveText(lasagneToast(null, 'Abend'));
    await expect(tid(page, 'planned-later-toggle')).toContainText('Vorgemerkt · 1');
    await expect(entry(page, LASAGNE, panel)).toHaveCount(0);

    await tid(page, 'day-panel-close').click();
    await expect(panel).toBeHidden();
    await tid(page, 'planned-later-toggle').click();
    const parked = entry(page, LASAGNE, tid(page, 'planned-later-entries'));
    const back = await finger(page);
    await back.hold(await centerOf(parked));
    await back.move(await centerOf(tid(page, `month-day-${TODAY}`)));
    await expect(tid(page, 'drag-label')).toHaveText(moveTargetLabel(TODAY, 'Abend'));
    await back.lift();

    await expect(toastMessage(page)).toHaveText(lasagneToast(TODAY, 'Abend'));
    await expect(tid(page, 'planned-later-strip')).toHaveCount(0);
  });

  test('AC-029: a finger draws a trip in the year, backwards and across the month boundary', async ({
    page,
  }) => {
    const year = Number(TODAY.slice(0, 4)) + 1;
    const jan = (dayOfMonth: number) => `${year}-01-${String(dayOfMonth).padStart(2, '0')}`;
    const feb2 = `${year}-02-02`;
    await open(page, '/kalender');
    await tid(page, 'calendar-view-year').click();
    await tid(page, 'week-next').click();
    await expect(tid(page, 'calendar-title')).toHaveText(String(year));

    const touch = await finger(page);
    await touch.hold(await centerOf(tid(page, `year-day-${jan(4)}`)));
    await expect(tid(page, `trip-range-day-${jan(4)}`)).toBeVisible();
    await touch.move(await centerOf(tid(page, `year-day-${jan(1)}`)));
    await expect(tid(page, 'trip-range-label')).toHaveText(rangeLabel(jan(1), jan(4)));
    await expect(tidPrefix(page, 'trip-range-day-')).toHaveCount(4);
    // Released over the header: no target, nothing is marked or opened.
    await touch.move(await centerOf(tid(page, 'calendar-title')));
    await touch.lift();
    await expect(tidPrefix(page, 'trip-range-day-')).toHaveCount(0);
    await expect(tid(page, 'absence-sheet')).toHaveCount(0);

    const again = await finger(page);
    await again.hold(await centerOf(tid(page, `year-day-${jan(29)}`)));
    await again.move(await centerOf(tid(page, `year-day-${feb2}`)));
    await expect(tid(page, 'trip-range-label')).toHaveText(rangeLabel(jan(29), feb2));
    await again.lift();

    await expect(tid(page, 'absence-sheet')).toContainText('Reise eintragen');
    await expect(tid(page, 'absence-from-value')).toHaveText(formatPickerDate(jan(29)));
    await expect(tid(page, 'absence-to-value')).toHaveText(formatPickerDate(feb2));
    await expect(tid(page, 'absence-note')).toBeFocused();
    await tid(page, 'absence-sheet-close').click();
    await expect(tid(page, 'absence-sheet')).toBeHidden();
    await expect(tidPrefix(page, 'trip-range-day-')).toHaveCount(0);
  });
});

test.describe('desktop', () => {
  test.beforeEach(() => {
    test.skip(test.info().project.name !== 'desktop', 'runs in the desktop project');
  });

  test('AC-002: the mouse drags Lasagne onto another day at noon', async ({ page }) => {
    await open(page, '/kalender');
    await expect(tid(page, 'week-grid')).toBeVisible();
    await mouseGrab(page, await centerOf(entry(page, LASAGNE)));
    const lunch = tid(page, `week-slot-${NEIGHBOUR}-${SLOT_LUNCH}`);
    await mouseTo(page, await centerOf(lunch));
    await expect(tid(page, 'drag-label')).toHaveText(moveTargetLabel(NEIGHBOUR, 'Mittag'));
    await page.mouse.up();

    await expect(toastMessage(page)).toHaveText(lasagneToast(NEIGHBOUR, 'Mittag'));
    await expect(entry(page, LASAGNE, lunch)).toBeVisible();
    await undo(page);
    await expect(
      entry(page, LASAGNE, tid(page, `week-slot-${TODAY}-${SLOT_DINNER}`)),
    ).toBeVisible();
  });

  test('AC-009: held at the right edge the week turns and the entry stays on the pointer', async ({
    page,
  }) => {
    const nextMonday = addDays(startOfWeek(TODAY), 7);
    const tuesday = weekDates(nextMonday)[1] ?? addDays(nextMonday, 1);
    await open(page, '/kalender');
    await expect(tid(page, 'calendar-title')).toHaveText(weekRangeLabel(TODAY));
    const area = await tid(page, 'calendar-drag-area').boundingBox();
    if (!area) throw new Error('drag area not laid out');

    await mouseGrab(page, await centerOf(entry(page, LASAGNE)));
    // The paging zone lies 20 px inside the right edge and is 32 px wide.
    await mouseTo(page, { x: area.x + area.width - 20 - 16, y: area.y + area.height / 2 });
    await expect(tid(page, 'calendar-title')).toHaveText(weekRangeLabel(nextMonday));
    const target = tid(page, `week-slot-${tuesday}-${SLOT_DINNER}`);
    await mouseTo(page, await centerOf(target));
    await expect(tid(page, 'drag-label')).toHaveText(moveTargetLabel(tuesday, 'Abend'));
    await page.mouse.up();

    await expect(toastMessage(page)).toHaveText(lasagneToast(tuesday, 'Abend'));
    await expect(entry(page, LASAGNE, target)).toBeVisible();
    await expect(tid(page, 'calendar-title')).toHaveText(weekRangeLabel(nextMonday));
    await undo(page);
    await expect(entry(page, LASAGNE, target)).toHaveCount(0);
  });

  test('AC-011: from "Vorgemerkt" onto a field of the week', async ({ page }) => {
    await open(page, '/kalender');
    await entry(page, LASAGNE).click();
    await tid(page, 'entry-move-later').click();
    await expect(tid(page, 'entry-sheet')).toHaveCount(0);
    const later = tid(page, 'planned-later');
    await expect(entry(page, LASAGNE, later)).toBeVisible();

    await mouseGrab(page, await centerOf(entry(page, LASAGNE, later)));
    const dinner = tid(page, `week-slot-${TODAY}-${SLOT_DINNER}`);
    await mouseTo(page, await centerOf(dinner));
    await expect(tid(page, 'drag-label')).toHaveText(moveTargetLabel(TODAY, 'Abend'));
    await page.mouse.up();

    await expect(toastMessage(page)).toHaveText(lasagneToast(TODAY, 'Abend'));
    await expect(entry(page, LASAGNE, dinner)).toBeVisible();
    await expect(later.locator(`[data-testid="entry-${LASAGNE}"]`)).toHaveCount(0);
  });

  test('AC-007: in the month the day changes and the Tageszeit stays', async ({ page }) => {
    await open(page, '/kalender');
    await tid(page, 'calendar-view-month').click();
    const lasagne = entry(page, LASAGNE, tid(page, 'month-grid'));
    await scrollToCenter(lasagne);
    await mouseGrab(page, await centerOf(lasagne));
    const target = tid(page, `month-cell-${NEIGHBOUR}`);
    await mouseTo(page, await centerOf(target));
    await expect(tid(page, 'drag-label')).toHaveText(moveTargetLabel(NEIGHBOUR, 'Abend'));
    await page.mouse.up();

    await expect(toastMessage(page)).toHaveText(lasagneToast(NEIGHBOUR, 'Abend'));
    await expect(entry(page, LASAGNE, target)).toBeVisible();
    await undo(page);
    await expect(entry(page, LASAGNE, tid(page, `month-cell-${TODAY}`))).toBeVisible();
  });

  test('AC-015: a dish cannot go behind its leftovers; the days are pale and the reason shows', async ({
    page,
  }) => {
    const yesterday = day(-1);
    await open(page, '/kalender');
    await tid(page, 'calendar-view-month').click();
    const curry = entry(page, CURRY_YESTERDAY, tid(page, 'month-grid'));
    test.skip((await curry.count()) === 0, 'yesterday is not on the grid of this month');
    await scrollToCenter(curry);
    await mouseGrab(page, await centerOf(curry));

    const reason = blockedText({ kind: 'leftovers-planned', leftoversDate: TODAY }, 'Mango-Curry');
    await expect(tid(page, `month-cell-${TODAY}`)).toHaveCSS('opacity', '0.4');
    await expect(tid(page, `month-cell-${yesterday}`)).toHaveCSS('opacity', '1');
    await mouseTo(page, await centerOf(tid(page, `month-cell-${TODAY}`)));
    await expect(tid(page, 'drag-label')).toHaveText(reason);
    await page.mouse.up();

    await expect(toastMessage(page)).toHaveText(reason);
    await expect(entry(page, CURRY_YESTERDAY, tid(page, `month-cell-${yesterday}`))).toBeVisible();
    await expect(tid(page, `month-cell-${TODAY}`)).toHaveCSS('opacity', '1');
  });

  test('AC-028 / AC-030: the mouse draws a trip over five days; closing the next one saves nothing', async ({
    page,
  }) => {
    await open(page, '/kalender');
    await tid(page, 'calendar-view-month').click();
    await tid(page, 'week-next').click();
    const nextMonth = addDays(`${TODAY.slice(0, 7)}-01`, 40).slice(0, 7);
    const weeks = monthGrid(`${nextMonth}-01`);
    const second = weeks[1] ?? [];
    const third = weeks[2] ?? [];
    const [monday, , , , friday] = second;
    const [monday3, , wednesday3] = third;
    if (!monday || !friday || !monday3 || !wednesday3) throw new Error('month grid too short');

    /** Low in the free area of a day, below its entries. */
    const freeArea = async (date: ISODate): Promise<Point> => {
      const area = tid(page, `month-day-${date}-area`);
      await scrollToCenter(area);
      const box = await area.boundingBox();
      if (!box) throw new Error('free area not laid out');
      return { x: box.x + box.width / 2, y: box.y + box.height - 8 };
    };

    await mouseGrab(page, await freeArea(monday));
    await mouseTo(page, await freeArea(friday));
    await expect(tid(page, 'trip-range-label')).toHaveText(rangeLabel(monday, friday));
    for (const date of second.slice(0, 5)) {
      await expect(tid(page, `trip-range-day-${date}`)).toBeVisible();
    }
    await expect(tid(page, `trip-range-day-${second[5] ?? ''}`)).toHaveCount(0);
    await page.mouse.up();

    // Only "Reise eintragen" opens (AC-031), with the days and me chosen.
    await expect(tid(page, 'absence-sheet')).toContainText('Reise eintragen');
    await expect(tid(page, 'absence-from-value')).toHaveText(formatPickerDate(monday));
    await expect(tid(page, 'absence-to-value')).toHaveText(formatPickerDate(friday));
    await expect(tid(page, `absence-member-${ENRICO}`)).toHaveAttribute('aria-selected', 'true');
    await expect(tid(page, 'absence-note')).toBeFocused();
    await tid(page, 'absence-note').fill('Kiel');
    await tid(page, 'absence-save').click();
    await expect(tid(page, 'absence-sheet')).toBeHidden();
    await expect(tid(page, 'month-grid')).toContainText('Kiel');
    await expect(tidPrefix(page, 'trip-range-day-')).toHaveCount(0);

    const stripes = tid(page, 'month-grid').locator('[data-testid^="absence-stripe-"]:visible');
    const before = await stripes.count();
    await mouseGrab(page, await freeArea(monday3));
    await mouseTo(page, await freeArea(wednesday3));
    await expect(tid(page, 'trip-range-label')).toHaveText(rangeLabel(monday3, wednesday3));
    await page.mouse.up();
    await expect(tid(page, 'absence-sheet')).toBeVisible();
    await tid(page, 'absence-sheet-close').click();
    await expect(tid(page, 'absence-sheet')).toBeHidden();
    await expect(tidPrefix(page, 'trip-range-day-')).toHaveCount(0);
    await expect(stripes).toHaveCount(before);
  });
});
