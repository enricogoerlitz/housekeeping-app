import { randomUUID } from 'node:crypto';

import type { Locator, Page } from '@playwright/test';
import {
  addDays,
  blockedText,
  dayMonthLongLabel,
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
  contentReady,
  uprightTouch,
  SLOT_DINNER,
  SLOT_LUNCH,
  SLOT_MORNING,
  TODAY,
  accessToken,
  day,
  expect,
  freshSeed,
  goOffline,
  isoWeekday,
  open,
  rpc,
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
const HOUSEHOLD = seedIds['hh-demo'];
const ENRICO = seedIds['m-enrico'];
const MALLORCA = seedIds['trip-mallorca'];
const OFFLINE_HINT = 'Offline – zum Bearbeiten brauchst du Netz';
/** A day in the same week and grid row as today. */
const NEIGHBOUR = isoWeekday(TODAY) === 7 ? day(-1) : day(1);
/** A finger lifts an entry after 400 ms (drag-gesture-state.ts); hold a little longer. */
const HOLD_MS = 600;

interface Point {
  x: number;
  y: number;
}

/**
 * How much of the phone's day window shows: it keeps its full height and slides down
 * (docked-panel.tsx), so its box height says nothing.
 */
async function shownHeight(page: Page, panel: Locator): Promise<number> {
  const box = await panel.boundingBox();
  return box ? Math.max(0, (page.viewportSize()?.height ?? 0) - box.y) : 0;
}

/** The middle of `locator` once it stands still (a view may still be scrolling to its place). */
async function centerOf(locator: Locator): Promise<Point> {
  await expect(locator).toBeVisible();
  let last = '';
  let point: Point = { x: 0, y: 0 };
  await expect
    .poll(async () => {
      const box = await locator.boundingBox();
      if (!box) return false;
      point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      const now = `${point.x},${point.y}`;
      const still = now === last;
      last = now;
      return still;
    })
    .toBe(true);
  return point;
}

async function scrollToCenter(locator: Locator): Promise<void> {
  await locator.evaluate((element) => element.scrollIntoView({ block: 'center' }));
}

/**
 * Both in the middle of the screen: the source centred, then scrolled by half the distance to the
 * target. A full day (a Saturday of the seed) would otherwise leave the next evening at the bottom
 * edge, where the drag scrolls the page instead of showing its target.
 */
async function scrollPairToCenter(page: Page, source: Locator, target: Locator): Promise<void> {
  await scrollToCenter(source);
  const [from, to] = [await centerOf(source), await centerOf(target)];
  const viewport = page.viewportSize() ?? { width: 390, height: 844 };
  await page.mouse.move(viewport.width / 2, viewport.height / 2);
  await page.mouse.wheel(0, (to.y - from.y) / 2);
  await expect
    .poll(async () => Math.abs((await centerOf(source)).y - from.y))
    .toBeGreaterThan(Math.abs(to.y - from.y) / 4);
}

function entry(page: Page, id: string, within?: Locator): Locator {
  const selector = `[data-testid="entry-${id}"]:visible`;
  return within ? within.locator(selector).first() : page.locator(selector).first();
}

/** A finger on the page through CDP touch events, so the browser sends touch pointer events. */
async function finger(page: Page) {
  // The first touch right after a load misses the remounting content.
  await contentReady(page);
  const cdp = await uprightTouch(page);
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
      // A finger never stands quite still: one more move once the targets were measured on the
      // next frames (a slow runner may not have them for the last step).
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      await send('touchMove', [point]);
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

/** Low in the free area of a day of the month grid, below its entries. */
async function freeArea(page: Page, date: ISODate): Promise<Point> {
  const area = tid(page, `month-day-${date}-area`);
  await scrollToCenter(area);
  const box = await area.boundingBox();
  if (!box) throw new Error('free area not laid out');
  return { x: box.x + box.width / 2, y: box.y + box.height - 8 };
}

/** "Bad putzen" in today's household row of the week (the seed has it due today). */
function choreToday(page: Page): Locator {
  return tid(page, `household-row-${TODAY}`)
    .locator('[data-testid^="chore-occ-"]:visible')
    .filter({ hasText: 'Bad putzen' })
    .first();
}

/** Turns the week until the stripe "Urlaub Mallorca" (today + 12 to + 18) shows. */
async function showMallorcaWeek(page: Page): Promise<Locator> {
  const stripe = tid(page, `trip-stripe-${MALLORCA}`);
  // `isVisible` does not wait: the week must be drawn first.
  await expect(page.locator('[data-testid^="day-2"]:visible').first()).toBeVisible();
  for (let step = 0; step < 3 && !(await stripe.isVisible()); step += 1) {
    await tid(page, 'week-next').click();
  }
  await expect(stripe).toBeVisible();
  return stripe;
}

/**
 * Holds `source` with a finger (phone) or presses it with the mouse (desktop), moves onto
 * `over`, and checks on the way that nothing hangs on the pointer: no target label, no marked
 * days, and on the phone the week does not open its empty Tageszeiten as targets (AC-006).
 */
async function tryToDrag(page: Page, source: Locator, over: Locator): Promise<void> {
  await scrollToCenter(source);
  const from = await centerOf(source);
  const slots = await tidPrefix(page, 'week-slot-').count();
  if (test.info().project.name === 'phone') {
    const touch = await finger(page);
    await touch.hold(from);
    await touch.move(await centerOf(over));
    await expectNothingLifted(page, slots);
    await touch.lift();
  } else {
    await mouseGrab(page, from);
    await mouseTo(page, await centerOf(over));
    await expectNothingLifted(page, slots);
    await page.mouse.up();
  }
}

async function expectNothingLifted(page: Page, slots: number): Promise<void> {
  await expect(tid(page, 'drag-label')).toHaveCount(0);
  await expect(tidPrefix(page, 'trip-range-day-')).toHaveCount(0);
  await expect(tidPrefix(page, 'week-slot-')).toHaveCount(slots);
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
    const target = tid(page, `week-slot-${NEIGHBOUR}-${SLOT_DINNER}`);
    await scrollPairToCenter(page, lasagne, target);
    const touch = await finger(page);
    await touch.hold(await centerOf(lasagne));
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
    // The day window lists the chores first; Lasagne may sit below the screen. The panel's
    // scroller reaches under the tab bar, so "center" is not on screen: scroll it to the top.
    await entry(page, LASAGNE, panel).evaluate((element) =>
      element.scrollIntoView({ block: 'start' }),
    );
    await touch.hold(await centerOf(entry(page, LASAGNE, panel)));
    const target = tid(page, 'planned-later-target');
    await expect(target).toHaveText('Vormerken');
    // The day window shrinks to its header line, so the grid and the strip are free (AC-008).
    await expect
      .poll(async () => shownHeight(page, panel))
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

  test('AC-005: offline a held entry does not lift; the hint shows and the tap does not open it', async ({
    page,
  }) => {
    await open(page, '/kalender');
    await goOffline(page);
    const dinner = tid(page, `week-slot-${TODAY}-${SLOT_DINNER}`);
    const lasagne = entry(page, LASAGNE, dinner);
    await scrollToCenter(lasagne);
    const slots = await tidPrefix(page, 'week-slot-').count();
    const touch = await finger(page);
    const from = await centerOf(lasagne);
    await touch.hold(from);

    await expect(toastMessage(page)).toHaveText(OFFLINE_HINT);
    await touch.move({ x: from.x, y: from.y + 160 });
    await expectNothingLifted(page, slots);
    await touch.lift();

    await expect(entry(page, LASAGNE, dinner)).toBeVisible();
    await expect(tid(page, 'entry-sheet')).toHaveCount(0);
  });

  test('AC-008: in the year, from the day window onto another day; the window shows its day again', async ({
    page,
  }) => {
    // The year view shows one year: on 31 December the neighbour is the day before.
    const neighbour =
      [NEIGHBOUR, day(1), day(-1)].find((date) => date.slice(0, 4) === TODAY.slice(0, 4)) ??
      NEIGHBOUR;
    const title = (date: ISODate) => dayMonthLongLabel(date).toUpperCase();
    await open(page, '/kalender');
    await tid(page, 'calendar-view-year').click();
    await tid(page, `year-day-${TODAY}`).click();
    const panel = tid(page, 'day-panel');
    await expect(tid(page, 'day-panel-title')).toHaveText(title(TODAY), { useInnerText: true });
    const height = (page.viewportSize()?.height ?? 0) * 0.2;

    const touch = await finger(page);
    // The day window lists the chores first; Lasagne may sit below the screen. The panel's
    // scroller reaches under the tab bar, so "center" is not on screen: scroll it to the top.
    await entry(page, LASAGNE, panel).evaluate((element) =>
      element.scrollIntoView({ block: 'start' }),
    );
    await touch.hold(await centerOf(entry(page, LASAGNE, panel)));
    await expect.poll(async () => shownHeight(page, panel)).toBeLessThan(height);
    await touch.move(await centerOf(tid(page, `year-day-${neighbour}`)));
    await expect(tid(page, 'drag-label')).toHaveText(moveTargetLabel(neighbour, 'Abend'));
    await touch.lift();

    await expect(toastMessage(page)).toHaveText(lasagneToast(neighbour, 'Abend'));
    await expect(tid(page, 'day-panel-title')).toHaveText(title(TODAY), { useInnerText: true });
    await expect.poll(async () => shownHeight(page, panel)).toBeGreaterThan(height);
    await expect(entry(page, LASAGNE, panel)).toHaveCount(0);
    await tid(page, `year-day-${neighbour}`).click();
    await expect(tid(page, 'day-panel-title')).toHaveText(title(neighbour), { useInnerText: true });
    await expect(entry(page, LASAGNE, panel)).toBeVisible();

    await undo(page);
    await tid(page, `year-day-${TODAY}`).click();
    await expect(entry(page, LASAGNE, panel)).toBeVisible();
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
    await expect(tid(page, 'trip-sheet')).toHaveCount(0);

    const again = await finger(page);
    await again.hold(await centerOf(tid(page, `year-day-${jan(29)}`)));
    await again.move(await centerOf(tid(page, `year-day-${feb2}`)));
    await expect(tid(page, 'trip-range-label')).toHaveText(rangeLabel(jan(29), feb2));
    await again.lift();

    await expect(tid(page, 'trip-sheet')).toContainText('Reise eintragen');
    await expect(tid(page, 'trip-from-value')).toHaveText(formatPickerDate(jan(29)));
    await expect(tid(page, 'trip-to-value')).toHaveText(formatPickerDate(feb2));
    await expect(tid(page, 'trip-note')).toBeFocused();
    await tid(page, 'trip-sheet-close').click();
    await expect(tid(page, 'trip-sheet')).toBeHidden();
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

  test('AC-005: offline the mouse lifts nothing; the hint shows and Lasagne stays', async ({
    page,
  }) => {
    await open(page, '/kalender');
    await expect(tid(page, 'week-grid')).toBeVisible();
    await goOffline(page);
    const dinner = tid(page, `week-slot-${TODAY}-${SLOT_DINNER}`);
    const lunch = tid(page, `week-slot-${NEIGHBOUR}-${SLOT_LUNCH}`);
    await mouseGrab(page, await centerOf(entry(page, LASAGNE, dinner)));

    await expect(toastMessage(page)).toHaveText(OFFLINE_HINT);
    await mouseTo(page, await centerOf(lunch));
    await expect(tid(page, 'drag-label')).toHaveCount(0);
    await page.mouse.up();

    await expect(entry(page, LASAGNE, dinner)).toBeVisible();
    await expect(lunch.locator(`[data-testid="entry-${LASAGNE}"]`)).toHaveCount(0);
    await expect(tid(page, 'entry-sheet')).toHaveCount(0);
  });

  test('AC-031: offline drawing over days marks nothing and shows the hint', async ({ page }) => {
    await open(page, '/kalender');
    await tid(page, 'calendar-view-month').click();
    await goOffline(page);
    const [monday, , wednesday] = monthGrid(`${TODAY.slice(0, 7)}-01`)[1] ?? [];
    if (!monday || !wednesday) throw new Error('month grid too short');
    const from = await freeArea(page, monday);
    const to = await freeArea(page, wednesday);

    await mouseGrab(page, from);
    await expect(toastMessage(page)).toHaveText(OFFLINE_HINT);
    await mouseTo(page, to);
    await expect(tidPrefix(page, 'trip-range-day-')).toHaveCount(0);
    await expect(tid(page, 'trip-range-label')).toHaveCount(0);
    await page.mouse.up();

    await expect(tid(page, 'trip-sheet')).toHaveCount(0);
    await expect(tidPrefix(page, 'trip-range-day-')).toHaveCount(0);
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
    // The window stays open after a move (0021 AC-028).
    await tid(page, 'entry-done').click();
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
    // Lasagne is today's third entry: with the day's chores (how many depends on the weekday) a
    // day of a 900 px window may show it only behind "+n weitere"; a taller window shows it.
    await page.setViewportSize({ width: 1440, height: 1400 });
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
    // Its own curry on the 14th with leftovers on the 15th, two months ahead, so no today, no
    // month boundary and no other test's days are involved.
    const month = addDays(`${TODAY.slice(0, 7)}-01`, 70).slice(0, 7);
    const cooked = `${month}-14`;
    const leftovers = `${month}-15`;
    const curryId = randomUUID();
    const leftoversId = randomUUID();
    const base = {
      household_id: HOUSEHOLD,
      recipe_id: seedIds['rec-mango-curry'],
      eater_ids: [ENRICO, seedIds['m-nadja']],
      guests: 0,
      portions: 2,
      variants: [],
      sort: 0,
    };
    const token = await accessToken('enrico');
    const change = (ops: unknown[]) =>
      rpc(token, 'apply_changes', { p_household_id: HOUSEHOLD, p_ops: ops });
    await change([
      {
        kind: 'insert',
        table: 'meal_plan_entries',
        row: { ...base, id: curryId, date: cooked, slot_id: SLOT_DINNER, kind: 'recipe' },
      },
      {
        kind: 'insert',
        table: 'meal_plan_entries',
        row: {
          ...base,
          id: leftoversId,
          date: leftovers,
          slot_id: SLOT_LUNCH,
          kind: 'leftovers',
          leftovers_of_entry_id: curryId,
        },
      },
    ]);
    try {
      await open(page, '/kalender');
      await tid(page, 'calendar-view-month').click();
      await tid(page, 'week-next').click();
      await tid(page, 'week-next').click();
      const curry = entry(page, curryId, tid(page, `month-cell-${cooked}`));
      await scrollToCenter(curry);
      await mouseGrab(page, await centerOf(curry));

      const reason = blockedText(
        { kind: 'leftovers-planned', leftoversDate: leftovers },
        'Mango-Curry',
      );
      await expect(tid(page, `month-cell-${leftovers}`)).toHaveCSS('opacity', '0.4');
      await expect(tid(page, `month-cell-${cooked}`)).toHaveCSS('opacity', '1');
      await mouseTo(page, await centerOf(tid(page, `month-cell-${leftovers}`)));
      await expect(tid(page, 'drag-label')).toHaveText(reason);
      await page.mouse.up();

      await expect(toastMessage(page)).toHaveText(reason);
      await expect(entry(page, curryId, tid(page, `month-cell-${cooked}`))).toBeVisible();
      await expect(tid(page, `month-cell-${leftovers}`)).toHaveCSS('opacity', '1');
    } finally {
      await change([
        { kind: 'delete', table: 'meal_plan_entries', id: leftoversId },
        { kind: 'delete', table: 'meal_plan_entries', id: curryId },
      ]);
    }
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

    await mouseGrab(page, await freeArea(page, monday));
    await mouseTo(page, await freeArea(page, friday));
    await expect(tid(page, 'trip-range-label')).toHaveText(rangeLabel(monday, friday));
    for (const date of second.slice(0, 5)) {
      await expect(tid(page, `trip-range-day-${date}`)).toBeVisible();
    }
    await expect(tid(page, `trip-range-day-${second[5] ?? ''}`)).toHaveCount(0);
    await page.mouse.up();

    // Only "Reise eintragen" opens (AC-031), with the days and me chosen.
    await expect(tid(page, 'trip-sheet')).toContainText('Reise eintragen');
    await expect(tid(page, 'trip-from-value')).toHaveText(formatPickerDate(monday));
    await expect(tid(page, 'trip-to-value')).toHaveText(formatPickerDate(friday));
    await expect(tid(page, `trip-member-${ENRICO}`)).toHaveAttribute('aria-selected', 'true');
    await expect(tid(page, 'trip-note')).toBeFocused();
    await tid(page, 'trip-note').fill('Kiel');
    await tid(page, 'trip-save').click();
    await expect(tid(page, 'trip-sheet')).toBeHidden();
    await expect(tid(page, 'month-grid')).toContainText('Kiel');
    await expect(tidPrefix(page, 'trip-range-day-')).toHaveCount(0);

    const stripes = tid(page, 'month-grid').locator('[data-testid^="trip-stripe-"]:visible');
    const before = await stripes.count();
    await mouseGrab(page, await freeArea(page, monday3));
    await mouseTo(page, await freeArea(page, wednesday3));
    await expect(tid(page, 'trip-range-label')).toHaveText(rangeLabel(monday3, wednesday3));
    await page.mouse.up();
    await expect(tid(page, 'trip-sheet')).toBeVisible();
    await tid(page, 'trip-sheet-close').click();
    await expect(tid(page, 'trip-sheet')).toBeHidden();
    await expect(tidPrefix(page, 'trip-range-day-')).toHaveCount(0);
    await expect(stripes).toHaveCount(before);
  });
});

test('AC-010: a chore of the household row and a trip stripe do not lift', async ({ page }) => {
  await open(page, '/kalender');
  const chore = choreToday(page);
  await tryToDrag(page, chore, tid(page, `week-slot-${TODAY}-${SLOT_DINNER}`));
  await expect(choreToday(page)).toBeVisible();
  await expect(toastMessage(page)).toHaveCount(0);

  const stripe = await showMallorcaWeek(page);
  await tryToDrag(page, stripe, tid(page, 'calendar-title'));
  await expect(page).toHaveURL(/\/kalender(\?|$)/);
  await expect(tid(page, `trip-stripe-${MALLORCA}`)).toBeVisible();
  await expect(toastMessage(page)).toHaveCount(0);
});
