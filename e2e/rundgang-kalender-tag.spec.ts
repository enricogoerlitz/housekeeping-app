import type { Page } from '@playwright/test';
import {
  tripEndLabel,
  addDays,
  dayMonthLongLabel,
  formatPickerDate,
  monthTitle,
  periodNavLabel,
  startOfMonth,
  startOfWeek,
  addMonths,
  weekDates,
  type ISODate,
} from '@housekeeping/core';

import {
  contentReady,
  PLAN_ENTRY,
  SLOT_DINNER,
  SLOT_LUNCH,
  SLOT_MORNING,
  TODAY,
  day,
  expect,
  freshSeed,
  goOffline,
  isPhone,
  isoWeekday,
  open,
  test,
  tid,
  tidPrefix,
  toastMessage,
} from './helpers';
import { seedIds } from './seed-ids';

// Spec 0016, REQ-006 and REQ-007 (AC-032): the day window of month and year. A tap on a day opens
// it instead of changing the view; it lists the trips, every Tageszeit with "+ Hinzufügen",
// "Reise eintragen" and "Woche anzeigen ›". Phone: from the bottom; desktop: beside the grid.
// The seed is dated from the real today: Eislaufen in the morning, the curry's leftovers at noon
// and Lasagne in the evening; today + 3 only has Bouldern; today - 7 is empty; "Urlaub Mallorca"
// is today + 12 to + 18. The tests change the plan, so the file starts from a fresh seed.

freshSeed();

const THURSDAY = day(3);
const EMPTY_DAY = day(-7);
const MALLORCA = day(12);
/** A day in the same grid row as today, so it is always on the month grid with today. */
const NEIGHBOUR = isoWeekday(TODAY) === 7 ? day(-1) : day(1);
const OFFLINE_HINT = 'Offline – zum Bearbeiten brauchst du Netz';

/** The title of the day window: "FR 27. NOVEMBER" (the capitals come from the styling). */
function panelTitle(date: ISODate): string {
  return dayMonthLongLabel(date).toUpperCase();
}

async function expectPanelDay(page: Page, date: ISODate): Promise<void> {
  await expect(tid(page, 'day-panel-title')).toHaveText(panelTitle(date), { useInnerText: true });
}

/** The month view, paged until `date` is on the grid. */
async function showMonthDay(page: Page, date: ISODate): Promise<void> {
  await open(page, '/kalender');
  await tid(page, 'calendar-view-month').click();
  // `isVisible` does not wait: the month must be drawn before it decides to page on.
  await expect(tidPrefix(page, 'month-day-').first()).toBeVisible();
  for (let step = 0; step < 3 && !(await tid(page, `month-day-${date}`).isVisible()); step += 1) {
    await tid(page, date > TODAY ? 'week-next' : 'week-prev').click();
  }
  await expect(tid(page, `month-day-${date}`)).toBeVisible();
}

async function openMonthDay(page: Page, date: ISODate): Promise<void> {
  await showMonthDay(page, date);
  await tid(page, `month-day-${date}`).click();
  await expect(tid(page, 'day-panel')).toBeVisible();
  await expectPanelDay(page, date);
}

test.describe('phone', () => {
  test.beforeEach(() => {
    test.skip(test.info().project.name !== 'phone', 'runs in the phone project');
  });

  test('AC-022: a tap on a day opens the day window from below; another day switches it', async ({
    page,
  }) => {
    await showMonthDay(page, TODAY);
    await expect(tid(page, 'month-day-list')).toHaveCount(0);
    await tid(page, `month-day-${TODAY}`).click();
    await expect(tid(page, 'calendar-view-month')).toHaveAttribute('aria-selected', 'true');
    await expect(tid(page, `month-day-${TODAY}`)).toHaveAttribute('aria-selected', 'true');
    const panel = tid(page, 'day-panel');
    await expect(panel).toBeVisible();
    // Half height from the bottom: the grid above stays in view.
    const box = await panel.boundingBox();
    const height = page.viewportSize()?.height ?? 0;
    expect(box?.y ?? 0).toBeGreaterThan(height * 0.3);
    await expectPanelDay(page, TODAY);

    const strip = weekDates(TODAY);
    await expect(tidPrefix(page, 'day-panel-day-')).toHaveCount(7);
    for (const date of strip) await expect(tid(page, `day-panel-day-${date}`)).toBeVisible();
    await expect(tid(page, `day-panel-day-${TODAY}`)).toHaveAttribute('aria-selected', 'true');

    await expect(tid(page, `day-panel-slot-${SLOT_MORNING}`)).toContainText('Eislaufen');
    await expect(
      tid(page, `day-panel-slot-${SLOT_LUNCH}`).locator(
        `[data-testid="entry-${seedIds['plan-reste']}"]`,
      ),
    ).toBeVisible();
    await expect(tid(page, `day-panel-slot-${SLOT_DINNER}`)).toContainText('Lasagne');
    for (const slot of [SLOT_MORNING, SLOT_LUNCH, SLOT_DINNER]) {
      await expect(tid(page, `day-panel-add-${slot}`)).toContainText('Hinzufügen');
    }
    await expect(tid(page, 'day-panel-trip')).toHaveText('Reise eintragen');
    await expect(tid(page, 'day-panel-week')).toHaveText('Woche anzeigen ›');

    await tid(page, `month-day-${NEIGHBOUR}`).click();
    await expectPanelDay(page, NEIGHBOUR);
    await expect(tid(page, `month-day-${TODAY}`)).toHaveAttribute('aria-selected', 'false');
  });

  test('AC-022: a swipe sideways changes the day; a trip stripe leads to its page and back', async ({
    page,
  }) => {
    await openMonthDay(page, MALLORCA);
    const stripe = tid(page, `day-panel-stripe-${seedIds['trip-mallorca']}`);
    await expect(stripe).toContainText('Urlaub Mallorca');

    await contentReady(page);
    const strip = await tid(page, 'day-panel-week-strip').boundingBox();
    if (!strip) throw new Error('week strip not laid out');
    const y = strip.y + strip.height / 2;
    await page.mouse.move(strip.x + strip.width * 0.8, y);
    await page.mouse.down();
    await page.mouse.move(strip.x + strip.width * 0.2, y, { steps: 8 });
    await page.mouse.up();
    await expectPanelDay(page, addDays(MALLORCA, 1));

    await tid(page, `day-panel-stripe-${seedIds['trip-mallorca']}`).click();
    await expect(tid(page, 'trip-window-title')).toHaveText('Urlaub Mallorca');
    // The trip opens as a window above the calendar; closing it returns to the day window.
    await tid(page, 'trip-window-close').click();
    await expect(tid(page, 'day-panel')).toBeVisible();
    await expectPanelDay(page, addDays(MALLORCA, 1));
  });

  test('AC-023: the year opens the day window; the week strip marks the day; the month name opens the month', async ({
    page,
  }) => {
    await open(page, '/kalender');
    await tid(page, 'calendar-view-year').click();
    await tid(page, `year-day-${TODAY}`).click();
    await expect(tid(page, 'year-view')).toBeVisible();
    await expectPanelDay(page, TODAY);
    await expect(tid(page, `year-day-${TODAY}`)).toHaveAttribute('aria-label', /Aktivität/);

    await tid(page, `day-panel-day-${NEIGHBOUR}`).click();
    await expectPanelDay(page, NEIGHBOUR);
    await expect(tid(page, `year-day-${NEIGHBOUR}`)).toHaveAttribute('aria-selected', 'true');

    await tid(page, 'day-panel-close').click();
    await expect(tid(page, 'day-panel')).toBeHidden();
    const month = Number(NEIGHBOUR.slice(5, 7));
    await tid(page, `year-month-${month}-open`).click();
    await expect(tid(page, 'month-phone')).toBeVisible();
    await expect(tid(page, 'calendar-title')).toHaveText(monthTitle(NEIGHBOUR));
  });

  test('AC-025: adding at noon and removing an entry keep the day window open', async ({
    page,
  }) => {
    await openMonthDay(page, THURSDAY);
    await expect(tid(page, `month-day-${THURSDAY}`)).not.toHaveAttribute('aria-label', /Rezept/);
    await tid(page, `day-panel-add-${SLOT_LUNCH}`).click();
    await tid(page, 'add-entry-search').fill('Linsen');
    await tid(page, `add-entry-recipe-${seedIds['rec-linsen-dal']}`).click();
    await tid(page, 'add-entry-save').click();
    await expect(tid(page, 'add-entry-sheet')).toBeHidden();
    const lunch = tid(page, `day-panel-slot-${SLOT_LUNCH}`);
    await expect(lunch).toContainText('Linsen-Dal');
    await expect(tid(page, `month-day-${THURSDAY}`)).toHaveAttribute('aria-label', /1 Rezept/);

    await lunch.locator(PLAN_ENTRY).filter({ hasText: 'Linsen-Dal' }).click();
    await expect(tid(page, 'entry-sheet')).toBeVisible();
    await tid(page, 'entry-remove').click();
    await expect(tid(page, 'entry-sheet')).toBeHidden();
    await expect(tid(page, 'day-panel')).toBeVisible();
    await expect(lunch).not.toContainText('Linsen-Dal');
  });

  test('AC-026: an empty day says "Noch nichts geplant"; offline adding and trips are greyed out with one hint', async ({
    page,
  }) => {
    await openMonthDay(page, EMPTY_DAY);
    await expect(tid(page, 'day-panel-empty')).toHaveText('Noch nichts geplant');
    for (const slot of [SLOT_MORNING, SLOT_LUNCH, SLOT_DINNER]) {
      await expect(tid(page, `day-panel-add-${slot}`)).toBeEnabled();
    }
    await expect(tid(page, 'day-panel-offline')).toHaveCount(0);

    await goOffline(page);
    await expect(tid(page, 'day-panel')).toBeVisible();
    for (const slot of [SLOT_MORNING, SLOT_LUNCH, SLOT_DINNER]) {
      await expect(tid(page, `day-panel-add-${slot}`)).toBeDisabled();
    }
    await expect(tid(page, 'day-panel-trip')).toBeDisabled();
    await expect(tid(page, 'day-panel-offline')).toHaveText(OFFLINE_HINT);
    await expect(tid(page, 'day-panel').getByText(OFFLINE_HINT)).toHaveCount(1);
    // Spec 0031, review U-2: greyed out, but a tap says why (Playwright clicks no aria-disabled).
    await tid(page, `day-panel-add-${SLOT_MORNING}`).click({ force: true });
    await expect(toastMessage(page)).toHaveText(OFFLINE_HINT);
    await expect(tid(page, 'add-entry-sheet')).toHaveCount(0);
  });

  test('AC-027: paging keeps the day window; month and week follow the chosen day', async ({
    page,
  }) => {
    const chosen: ISODate = `${TODAY.slice(0, 4)}-01-08`;
    await open(page, '/kalender');
    await tid(page, 'calendar-view-year').click();
    await tid(page, `year-day-${chosen}`).click();
    await expectPanelDay(page, chosen);

    await tid(page, 'calendar-view-month').click();
    await expect(tid(page, 'calendar-title')).toHaveText(monthTitle(chosen));
    await expect(tid(page, `month-day-${chosen}`)).toHaveAttribute('aria-selected', 'true');
    await expectPanelDay(page, chosen);
    // Paging keeps the window open and chooses the new period's first day (calendar-screen `show`).
    const first = startOfMonth(chosen);
    await tid(page, 'week-next').click();
    await expect(tid(page, 'day-panel')).toBeVisible();
    await expectPanelDay(page, addMonths(first, 1));
    await tid(page, 'week-prev').click();
    await expectPanelDay(page, first);

    await tid(page, 'calendar-view-week').click();
    await expect(tid(page, 'calendar-title')).toHaveText(
      periodNavLabel('week', startOfWeek(first), TODAY).label,
    );
    await expect(tid(page, 'day-panel')).toBeHidden();
  });

  test('AC-032: "Reise eintragen" in the day window fills "Von" and "Bis" with the day', async ({
    page,
  }) => {
    const from = day(40);
    const to = addDays(from, 4);
    await openMonthDay(page, from);
    await tid(page, 'day-panel-trip').click();
    await expect(tid(page, 'trip-sheet')).toContainText('Reise eintragen');
    await expect(tid(page, 'trip-from-value')).toHaveText(formatPickerDate(from));
    await expect(tid(page, 'trip-to-value')).toHaveText(formatPickerDate(from));

    await tid(page, 'trip-to').click();
    for (let step = 0; step < 2 && !(await tid(page, `range-day-${to}`).isVisible()); step += 1) {
      await tid(page, 'range-next').click();
    }
    await tid(page, `range-day-${to}`).click();
    await tid(page, 'trip-note').fill('Ostsee');
    await tid(page, 'trip-save').click();
    await expect(tid(page, 'trip-sheet')).toBeHidden();
    const stripe = tid(page, 'day-panel').locator('[data-testid^="day-panel-stripe-"]');
    await expect(stripe.filter({ hasText: 'Ostsee' })).toContainText(tripEndLabel(to));
  });
});

test.describe('desktop', () => {
  test.beforeEach(() => {
    test.skip(test.info().project.name !== 'desktop', 'runs in the desktop project');
  });

  test('AC-024: the day number and "+n weitere" open the day window beside the grid; Escape returns to the day', async ({
    page,
  }) => {
    expect(isPhone(page)).toBe(false);
    await openMonthDay(page, TODAY);
    // A day shows as many lines as fit (0021 REQ-001): add entries until it shows "+n weitere".
    const extra = [
      ['Salat', 'rec-gemischter-salat', 'Gemischter Salat'],
      ['Linsen', 'rec-linsen-dal', 'Linsen-Dal'],
      ['Shakshuka', 'rec-shakshuka', 'Shakshuka'],
      ['Pfannkuchen', 'rec-pfannkuchen', 'Pfannkuchen'],
    ] as const;
    const added: string[] = [];
    for (const [search, recipe, name] of extra) {
      if ((await tid(page, `month-more-${TODAY}`).count()) > 0) break;
      await tid(page, `day-panel-add-${SLOT_DINNER}`).click();
      await tid(page, 'add-entry-search').fill(search);
      await tid(page, `add-entry-recipe-${seedIds[recipe]}`).click();
      await tid(page, 'add-entry-save').click();
      await expect(tid(page, 'add-entry-sheet')).toBeHidden();
      added.push(name);
      await expect(tid(page, 'day-panel').locator(PLAN_ENTRY)).toHaveCount(3 + added.length);
    }
    const total = 3 + added.length;
    const shown = await tid(page, `month-cell-${TODAY}`).locator(PLAN_ENTRY).count();

    await page.keyboard.press('Escape');
    await expect(tid(page, 'day-panel')).toBeHidden();
    await expect(tid(page, `month-day-${TODAY}`)).toBeFocused();

    const more = tid(page, `month-more-${TODAY}`);
    await expect(more).toHaveText(`+${total - shown} weitere`);
    await more.click();
    const panel = tid(page, 'day-panel');
    await expect(panel).toBeVisible();
    await expect(panel.locator(PLAN_ENTRY)).toHaveCount(total);
    await expect(tidPrefix(page, `month-more-${TODAY}-`)).toHaveCount(0);
    await expect(page.getByText('Tag öffnen ›')).toHaveCount(0);
    const grid = await tid(page, 'month-grid').boundingBox();
    const side = await panel.boundingBox();
    expect(side?.x ?? 0).toBeGreaterThanOrEqual((grid?.x ?? 0) + (grid?.width ?? 0));

    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(tid(page, `month-day-${TODAY}`)).toBeFocused();

    // Leave the plan as the seed had it for the files after this one.
    await tid(page, `month-day-${TODAY}`).click();
    for (const name of added) {
      await tid(page, 'day-panel').locator(PLAN_ENTRY).filter({ hasText: name }).click();
      await tid(page, 'entry-remove').click();
    }
    await expect(tid(page, 'day-panel').locator(PLAN_ENTRY)).toHaveCount(3);
  });
});
