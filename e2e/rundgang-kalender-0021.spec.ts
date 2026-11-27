import type { Locator, Page } from '@playwright/test';
import {
  addDays,
  formatLongDate,
  monthTitle,
  periodNavLabel,
  shiftPeriod,
  startOfMonth,
  startOfWeek,
  tripEndLabel,
  weekDates,
  type ISODate,
} from '@housekeeping/core';

import {
  ACTIVE,
  contentReady,
  uprightTouch,
  SLOT_DINNER,
  SLOT_LUNCH,
  SLOT_MORNING,
  TODAY,
  day,
  expect,
  freshSeed,
  goOffline,
  isoWeekday,
  only,
  open,
  showPlanWeek,
  test,
  tid,
  tidPrefix,
  toastMessage,
} from './helpers';
import { seedIds } from './seed-ids';

// Spec 0021, REQ-001 to REQ-005 and REQ-016 to REQ-019: the calendar fills the desktop's height,
// the month looks like the week with "+" on hover, phones open at today with a fixed header and
// page by swiping, and chores are checked and opened from the calendar. The seed is dated from
// the real today: Eislaufen in the morning, the curry's leftovers at noon and Lasagne in the
// evening; "Bad putzen" is due today; "Urlaub Mallorca" is today + 12 to + 18. The tests book a
// chore, so the file starts from a fresh seed.

freshSeed();

const SLOTS = [SLOT_MORNING, SLOT_LUNCH, SLOT_DINNER];
const OFFLINE_HINT = 'Offline – zum Bearbeiten brauchst du Netz';
const MALLORCA = seedIds['trip-mallorca'];
/** A day of this month's grid other than today, in today's row when possible. */
const NEIGHBOUR = isoWeekday(TODAY) === 7 ? day(-1) : day(1);
const HOLD_MS = 600;

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function boxOf(locator: Locator): Promise<Box> {
  await expect(locator).toBeVisible();
  // A view that just switched may still replace the element between the two calls.
  let box: Box | null = null;
  await expect
    .poll(async () => {
      box = await locator.boundingBox();
      return box !== null;
    })
    .toBe(true);
  if (!box) throw new Error('not laid out');
  return box;
}

async function slotHeights(page: Page, date: ISODate): Promise<number[]> {
  const heights: number[] = [];
  for (const slot of SLOTS)
    heights.push((await boxOf(tid(page, `week-slot-${date}-${slot}`))).height);
  return heights;
}

/** Whether the page's scroll area can scroll at all. */
async function pageScrolls(page: Page): Promise<boolean> {
  return tid(page, 'calendar-screen').evaluate((screen) =>
    Array.from(screen.querySelectorAll('*')).some((node) => {
      const style = getComputedStyle(node);
      return (
        (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
        node.scrollHeight > node.clientHeight + 1
      );
    }),
  );
}

async function showMonth(page: Page): Promise<void> {
  await open(page, '/kalender');
  await tid(page, 'calendar-view-month').click();
  await expect(tid(page, `month-day-${TODAY}`)).toBeVisible();
}

/** A finger on the page through CDP touch events, so the browser sends touch pointer events. */
async function finger(page: Page) {
  // The first touch right after a load misses the remounting content.
  await contentReady(page);
  const cdp = await uprightTouch(page);
  const send = (
    type: 'touchStart' | 'touchMove' | 'touchEnd',
    points: { x: number; y: number }[],
  ) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points.map((point) => ({ x: point.x, y: point.y, id: 1 })),
    });
  return { send };
}

/** A sideways finger swipe over the calendar body: -1 to the left (next), 1 to the right. */
async function swipe(page: Page, direction: -1 | 1): Promise<void> {
  const body = await boxOf(tid(page, 'calendar-swipe'));
  const touch = await finger(page);
  const y = body.y + Math.min(body.height / 2, 200);
  const from = body.x + body.width * (direction < 0 ? 0.8 : 0.2);
  const to = body.x + body.width * (direction < 0 ? 0.2 : 0.8);
  await touch.send('touchStart', [{ x: from, y }]);
  for (let step = 1; step <= 8; step += 1) {
    await touch.send('touchMove', [{ x: from + ((to - from) * step) / 8, y }]);
  }
  await touch.send('touchEnd', []);
}

test.describe('desktop', () => {
  only('desktop');

  test('AC-001: Vormittag, Mittag and Abend share the height, the page does not scroll; taller adds to each', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, '/kalender');
    const before = await slotHeights(page, TODAY);
    for (const height of before) expect(height).toBeGreaterThanOrEqual(119);
    expect(Math.max(...before) - Math.min(...before)).toBeLessThanOrEqual(2);
    const parked = await boxOf(tid(page, 'planned-later'));
    expect(parked.y + parked.height).toBeLessThanOrEqual(900);
    expect(await pageScrolls(page)).toBe(false);

    await page.setViewportSize({ width: 1440, height: 1200 });
    await expect
      .poll(async () => (await slotHeights(page, TODAY))[0] ?? 0)
      .toBeGreaterThan((before[0] ?? 0) + 50);
    const after = await slotHeights(page, TODAY);
    const grown = after.map((height, index) => height - (before[index] ?? 0));
    expect(Math.max(...grown) - Math.min(...grown)).toBeLessThanOrEqual(3);
  });

  test('AC-002: at 600 px each Tageszeit is 120 px, the page scrolls, head and tabs stay', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 600 });
    await open(page, '/kalender');
    for (const height of await slotHeights(page, addDays(startOfWeek(TODAY), 6))) {
      expect(height).toBeGreaterThanOrEqual(119);
      expect(height).toBeLessThan(140);
    }
    expect(await pageScrolls(page)).toBe(true);
    await tid(page, 'planned-later').scrollIntoViewIfNeeded();
    await expect(tid(page, 'calendar-view')).toBeInViewport();
  });

  test('AC-003: the weeks of the month share the height; a day shows what fits and "+n weitere" the rest', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1400 });
    await showMonth(page);
    const weeks = weekDates(TODAY);
    const first = await boxOf(tid(page, `month-cell-${weeks[0]}`));
    const other = await boxOf(tid(page, `month-cell-${startOfMonth(TODAY)}`));
    expect(Math.abs(first.height - other.height)).toBeLessThanOrEqual(30);
    // Today has three entries: all of them stand, nothing more.
    await expect(tid(page, `month-cell-${TODAY}`)).toContainText('Lasagne');
    await expect(tid(page, `month-more-${TODAY}`)).toHaveCount(0);

    await page.setViewportSize({ width: 1440, height: 600 });
    expect(await pageScrolls(page)).toBe(true);
    await expect(tid(page, `month-cell-${TODAY}`)).toContainText('Eislaufen');
  });

  test('AC-004: with the day window open the grid gets narrower but keeps its height', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await showMonth(page);
    const before = await boxOf(tid(page, `month-cell-${TODAY}`));
    await tid(page, `month-day-${TODAY}`).click();
    await expect(tid(page, 'day-panel')).toBeVisible();
    await expect
      .poll(async () => (await boxOf(tid(page, `month-cell-${TODAY}`))).width)
      .toBeLessThan(before.width);
    const after = await boxOf(tid(page, `month-cell-${TODAY}`));
    expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(2);
  });

  test('AC-005: the month has no frame or vertical lines; today is tinted with its number in the accent', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await showMonth(page);
    const grid = tid(page, 'month-grid');
    await expect(grid).toHaveCSS('border-left-width', '0px');
    await expect(grid).toHaveCSS('border-top-width', '0px');
    const tile = tid(page, 'month-today-tile');
    await expect(tile).toBeVisible();
    expect(await tile.evaluate((node) => getComputedStyle(node).backgroundColor)).not.toBe(
      'rgba(0, 0, 0, 0)',
    );
    expect(await tile.evaluate((node) => parseFloat(getComputedStyle(node).borderRadius))).toBe(6);
  });

  test('AC-006: "Urlaub Mallorca" runs as one stripe per week row under the day numbers', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await showMonth(page);
    const trip = day(12);
    if (startOfMonth(trip) !== startOfMonth(TODAY)) await tid(page, 'week-next').click();
    const stripes = page.locator(`[data-testid="trip-stripe-${MALLORCA}"]${ACTIVE}`);
    await expect(stripes.first()).toContainText('Urlaub Mallorca');
    const rows = new Set([trip, addDays(trip, 6)].map((date) => startOfWeek(date)).filter(Boolean));
    await expect(stripes).toHaveCount(rows.size);
  });

  test('AC-008: "+" shows on hover, opens the add window for the day and keeps the month', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await showMonth(page);
    const add = tid(page, `month-add-${NEIGHBOUR}`);
    await expect(add).toHaveCSS('opacity', '0');
    await tid(page, `month-cell-${NEIGHBOUR}`).hover();
    await expect(add).toHaveCSS('opacity', '1');
    await expect(add).toHaveAttribute('aria-label', `Hinzufügen am ${formatLongDate(NEIGHBOUR)}`);
    const box = await boxOf(add);
    expect(box.width).toBeGreaterThanOrEqual(28);
    expect(box.height).toBeGreaterThanOrEqual(28);
    await add.click();
    await expect(tid(page, 'add-entry-sheet')).toBeVisible();
    await expect(tid(page, 'day-panel')).toBeHidden();
    await expect(tid(page, 'calendar-view-month')).toHaveAttribute('aria-selected', 'true');
  });

  test('AC-009: offline the "+" is greyed out with the hint', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await showMonth(page);
    await goOffline(page);
    await tid(page, `month-cell-${NEIGHBOUR}`).hover();
    const add = tid(page, `month-add-${NEIGHBOUR}`);
    await expect(add).toHaveAttribute('aria-disabled', 'true');
    await expect(add).toHaveAccessibleDescription(OFFLINE_HINT);
    // Not only dimmed: a click says why, and neither the add window nor the day window opens.
    // Playwright does not click what is aria-disabled; a person can.
    await add.click({ force: true });
    await expect(toastMessage(page)).toHaveText(OFFLINE_HINT);
    await expect(tid(page, 'add-entry-sheet')).toBeHidden();
    await expect(tid(page, 'day-panel')).toBeHidden();
  });

  test('AC-014: a chore name in the week wraps onto at most two lines without "…"', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, '/kalender');
    const chore = tid(page, `household-row-${TODAY}`)
      .locator('[data-testid^="chore-occ-"]')
      .filter({ hasText: 'Bad putzen' })
      .first();
    await expect(chore).toBeVisible();
    const text = chore.getByText('Bad putzen');
    await expect(text).toHaveCSS('-webkit-line-clamp', '2');
  });

  test('AC-014: in the week of "Urlaub Mallorca" its stripe shows the whole text', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, '/kalender');
    const trip = day(12);
    await showPlanWeek(page, trip);
    const label = tid(page, `trip-stripe-${MALLORCA}`).getByText(
      `Urlaub Mallorca · ${tripEndLabel(addDays(trip, 6))}`,
    );
    await expect(label).toBeVisible();
    // Not cut: the text is as wide as it needs (no "…").
    expect(await label.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  });

  test('AC-042: a chore planned on a later day is checked there and booked as done today', async ({
    page,
  }) => {
    // "Küche wischen" is due tomorrow; on a Sunday tomorrow lies in the next week.
    const tomorrow = day(1);
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, '/kalender');
    if (startOfWeek(tomorrow) !== startOfWeek(TODAY)) await tid(page, 'week-next').click();
    const row = tid(page, `household-row-${tomorrow}`);
    const box = row.locator(`[data-testid="chore-check-${seedIds['chore-kueche']}"]`);
    await box.click();
    await expect(box).toHaveAttribute('aria-checked', 'true');
    await expect(box).toHaveCount(0, { timeout: 6000 });
  });

  test('AC-044 / AC-012 (0054): the month always shows the day’s chores as lines under the entries', async ({
    page,
  }) => {
    // Tall enough that today's three entries and two chores fit (six week rows, REQ-001).
    await page.setViewportSize({ width: 1440, height: 1700 });
    await showMonth(page);
    await expect(tid(page, `month-chores-${TODAY}`)).toContainText('Bad putzen');
    await expect(tid(page, `month-cell-${TODAY}`)).toContainText('Lasagne');
  });
});

test.describe('tablet', () => {
  only('desktop');

  test('AC-004: at 1024 × 1366 each Tageszeit has its natural height and the page scrolls', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 1366 });
    await open(page, '/kalender');
    // Below desktop width the week is the list: today's three Tageszeiten, one entry each.
    for (const height of await slotHeights(page, TODAY)) expect(height).toBeLessThan(110);
    expect(await pageScrolls(page)).toBe(true);
  });

  test('AC-009: a tablet without a mouse shows no "+"; a tap opens the day window', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 1024, height: 1366 },
      hasTouch: true,
      isMobile: true,
    });
    const page = await context.newPage();
    await showMonth(page);
    await expect(tidPrefix(page, 'month-add-')).toHaveCount(0);
    await tid(page, `month-day-${NEIGHBOUR}`).tap();
    await expect(tid(page, 'day-panel')).toBeVisible();
    await context.close();
  });
});

test.describe('phone', () => {
  only('phone');

  test('AC-007: the phone month keeps its grid with dots', async ({ page }) => {
    await showMonth(page);
    await expect(tid(page, 'month-phone')).toBeVisible();
    await expect(tid(page, 'month-grid')).toHaveCount(0);
  });

  test('AC-010: the week opens with today right under the tabs; the next week starts on Monday', async ({
    page,
  }) => {
    await open(page, '/kalender');
    const nav = await boxOf(tid(page, 'calendar-phone-nav'));
    await expect
      .poll(async () => (await boxOf(tid(page, `day-${TODAY}`))).y)
      .toBeLessThan(nav.y + nav.height + 40);
    await tid(page, 'week-next').click();
    const monday = addDays(startOfWeek(TODAY), 7);
    // Right under the tabs: under the line "Was kochen wir?" above the week (spec 0063).
    const line = await boxOf(tid(page, 'week-menu-open'));
    await expect
      .poll(async () => (await boxOf(tid(page, `day-${monday}`))).y)
      .toBeLessThan(line.y + line.height + 60);
  });

  test('AC-011: the year opens at the current month; the next year at January', async ({
    page,
  }) => {
    await open(page, '/kalender');
    await tid(page, 'calendar-view-year').click();
    const month = Number(TODAY.slice(5, 7));
    const nav = await boxOf(tid(page, 'calendar-phone-nav'));
    // "Oben": at the top, or as high as the year scrolls when the month sits in the last row.
    await expect
      .poll(async () =>
        tid(page, `year-month-${month}`).evaluate(
          (element, limit) => {
            let scroller = element.parentElement;
            while (scroller && scroller.scrollHeight <= scroller.clientHeight) {
              scroller = scroller.parentElement;
            }
            const atEnd =
              !!scroller && scroller.scrollTop >= scroller.scrollHeight - scroller.clientHeight - 1;
            const top = element.getBoundingClientRect().top;
            return top < limit || (atEnd && top < window.innerHeight / 2);
          },
          nav.y + nav.height + 60,
        ),
      )
      .toBe(true);
    await tid(page, 'week-next').click();
    await expect
      .poll(async () => (await boxOf(tid(page, 'year-month-1'))).y)
      .toBeLessThan(nav.y + nav.height + 60);
  });

  test('AC-012: with the household row off in the month the day window still shows the chores', async ({
    page,
  }) => {
    await showMonth(page);
    await tid(page, `month-day-${TODAY}`).click();
    await expect(tid(page, 'day-panel-chores')).toContainText('Bad putzen');
  });

  test('AC-013: the screen reader counts leftovers as "Essen"', async ({ page }) => {
    await showMonth(page);
    await expect(tid(page, `month-day-${TODAY}`)).toHaveAttribute('aria-label', /1 Essen/);
  });

  test('AC-043: a tap on the chore in the day window opens its chore window; offline the box is greyed', async ({
    page,
  }) => {
    await showMonth(page);
    await tid(page, `month-day-${TODAY}`).click();
    await tid(page, 'day-panel-chores').getByText('Bad putzen').click();
    await expect(tid(page, 'chore-sheet')).toBeVisible();
    await expect(tid(page, 'chore-sheet')).toContainText('Bad putzen');
    await page.goBack();
    await expect(tid(page, 'chore-sheet')).toBeHidden();
    await goOffline(page);
    await expect(
      tid(page, 'day-panel-chores').locator(`[data-testid="chore-check-${seedIds['chore-bad']}"]`),
    ).toHaveAttribute('aria-disabled', 'true');
  });

  test('AC-045: the year marks a day with chores and its day window lists them', async ({
    page,
  }) => {
    await open(page, '/kalender');
    await tid(page, 'calendar-view-year').click();
    await expect(tid(page, `year-chore-${TODAY}`)).toBeVisible();
    await tid(page, `year-day-${TODAY}`).click();
    await expect(tid(page, 'day-panel-chores')).toContainText('Bad putzen');
  });

  test('AC-046: the arrows stay put; outside today’s week the label leads back with "Heute ›"', async ({
    page,
  }) => {
    await open(page, '/kalender');
    // Within the nav row: the whole header moves when the large title collapses on scrolling
    // to today (spec 0057), the arrows must not move inside it.
    const inNav = async (id: string) => {
      const nav = await boxOf(tid(page, 'calendar-phone-nav'));
      const box = await boxOf(tid(page, id));
      return { ...box, y: box.y - nav.y };
    };
    const prev = await inNav('week-prev');
    const next = await inNav('week-next');
    const week = startOfWeek(TODAY);
    await expect(tid(page, 'calendar-title')).toHaveText(periodNavLabel('week', week, TODAY).label);
    await expect(tid(page, 'calendar-today-hint')).toHaveCount(0);

    await tid(page, 'week-next').click();
    const following = shiftPeriod('week', week, 1);
    await expect(tid(page, 'calendar-title')).toHaveText(
      periodNavLabel('week', following, TODAY).label,
    );
    await expect(tid(page, 'calendar-today-hint')).toHaveText('Heute ›');
    expect(await inNav('week-prev')).toEqual(prev);
    expect(await inNav('week-next')).toEqual(next);

    await expect(tid(page, 'week-today')).toHaveAttribute('aria-label', 'Zurück zu heute');
    await tid(page, 'week-today').click();
    await expect(tid(page, 'calendar-title')).toHaveText(periodNavLabel('week', week, TODAY).label);
    await expect(tid(page, 'calendar-today-hint')).toHaveCount(0);
  });

  test('AC-047: a swipe left shows the next month, a swipe right the month before', async ({
    page,
  }) => {
    await showMonth(page);
    const month = startOfMonth(TODAY);
    await swipe(page, -1);
    await expect(tid(page, 'calendar-title')).toHaveText(
      monthTitle(shiftPeriod('month', month, 1)),
    );
    await swipe(page, 1);
    await expect(tid(page, 'calendar-title')).toHaveText(monthTitle(month));
  });

  test('AC-048: holding Lasagne and dragging it sideways moves it and does not turn the week', async ({
    page,
  }) => {
    await open(page, '/kalender');
    const title = await tid(page, 'calendar-title').textContent();
    const lasagne = tid(page, `entry-${seedIds['plan-2']}`).first();
    const from = await boxOf(lasagne);
    const touch = await finger(page);
    const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
    await touch.send('touchStart', [start]);
    await page.waitForTimeout(HOLD_MS);
    for (let step = 1; step <= 12; step += 1) {
      await touch.send('touchMove', [{ x: start.x - (step * 120) / 12, y: start.y + step * 6 }]);
    }
    await touch.send('touchEnd', []);
    await expect(tid(page, 'calendar-title')).toHaveText(title ?? '');
  });
});
