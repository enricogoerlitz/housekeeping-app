import type { Locator, Page } from '@playwright/test';
import { dayMonthLongLabel, monthTitle, type ISODate } from '@housekeeping/core';

import {
  createTestHousehold,
  day,
  expect,
  open,
  openManaged,
  showPlanWeek,
  switchHousehold,
  test,
  tid,
  tidPrefix,
  TODAY,
  type ManagedPage,
} from './helpers';
import { seedIds } from './seed-ids';

// Spec 0031, REQ-031 to REQ-037: the year view with a finger, tablets, hyphenation, focus rings,
// one back pattern under "Verwalten" and the smaller alignments. The seed is dated from the real
// today: "Kichererbsen-Eintopf" tomorrow evening, "Bettwäsche wechseln" due in three days. The
// file runs in the phone project; wider cases set their own width.

const YEAR = TODAY.slice(0, 4);
const NOVEMBER_17 = `${YEAR}-11-17` as ISODate;

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function boxOf(locator: Locator): Promise<Box> {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  if (!box) throw new Error('no box');
  return box;
}

/** Character indexes at which the text of `locator` starts a new line, as the browser drew it. */
async function lineStarts(locator: Locator): Promise<number[]> {
  return locator.evaluate((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const starts: number[] = [];
    let offset = 0;
    let lastTop: number | undefined;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent ?? '';
      for (let index = 0; index < text.length; index += 1) {
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + 1);
        // Right after a hyphenation point Chromium also reports an empty box at the end of the line
        // before; the character itself is the last box with a width.
        const rect = [...range.getClientRects()].filter((box) => box.width > 0).pop();
        if (!rect || text[index] === ' ') continue;
        if (lastTop !== undefined && rect.top > lastTop + 2) starts.push(offset + index);
        lastTop = rect.top;
      }
      offset += text.length;
    }
    return starts;
  });
}

/** Every new line of `text` starts after a space or a hyphen, or at one of the `syllables`. */
async function expectBreaksAt(locator: Locator, text: string, syllables: number[]): Promise<void> {
  for (const start of await lineStarts(locator)) {
    const before = text[start - 1];
    expect(
      before === ' ' || before === '-' || syllables.includes(start),
      `"${text}" breaks before "${text.slice(start)}"`,
    ).toBe(true);
  }
}

test.describe('REQ-031: the year with a finger', () => {
  test('AC-073: a tap on the 17.11. opens November in the month view, never the 18.11.', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    const page = await context.newPage();
    await open(page, '/kalender?ansicht=jahr');
    await tid(page, `year-day-${NOVEMBER_17}`).tap();
    await expect(tid(page, 'month-phone')).toBeVisible();
    await expect(page).toHaveURL(/ansicht=monat/);
    await expect(tid(page, 'calendar-title')).toHaveText(monthTitle(`${YEAR}-11-01`));
    await expect(tid(page, 'day-panel')).toHaveCount(0);
    await context.close();
  });

  test('AC-074: on the desktop a click on the 17.11. opens its day window', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, '/kalender?ansicht=jahr');
    await tid(page, `year-day-${NOVEMBER_17}`).click();
    await expect(tid(page, 'day-panel-title')).toHaveText(
      dayMonthLongLabel(NOVEMBER_17).toUpperCase(),
      { useInnerText: true },
    );
  });
});

test.describe('REQ-032: tablets', () => {
  test('AC-075: at 820 px the overview is one column; title and "Wie war’s?" stay whole', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 820, height: 1180 });
    await open(page, '/');
    const title = tid(page, 'today-header');
    expect(await lineStarts(title)).toEqual([]);
    // The nav has its own row under the title.
    const nav = await boxOf(tid(page, 'today-week-nav'));
    const head = await boxOf(title);
    expect(nav.y).toBeGreaterThanOrEqual(head.y + head.height - 1);
    const recap = tid(page, 'today-recap');
    if ((await recap.count()) > 0) {
      const area = await boxOf(recap);
      for (const part of await tidPrefix(page, 'recap-').all()) {
        const box = await part.boundingBox();
        if (box) expect(box.x + box.width).toBeLessThanOrEqual(area.x + area.width + 1);
      }
    }
  });

  test('AC-076: at 820 px the calendar shows the tabs and the week as a list', async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 1180 });
    await open(page, '/kalender');
    for (const view of ['week', 'month', 'year'])
      await expect(tid(page, `calendar-view-${view}`)).toBeVisible();
    await expect(tid(page, 'week-list')).toBeVisible();
    await expect(tid(page, 'week-grid')).toHaveCount(0);
    const tabs = await boxOf(tid(page, 'calendar-view-week'));
    const today = await boxOf(tid(page, 'week-today'));
    expect(today.y).toBeGreaterThanOrEqual(tabs.y + tabs.height - 1);
  });

  test('AC-077: at 1100 px overview and calendar stay as on the desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 900 });
    await open(page, '/');
    const head = await boxOf(tid(page, 'today-header'));
    const nav = await boxOf(tid(page, 'today-week-nav'));
    expect(nav.y).toBeLessThan(head.y + head.height);
    await open(page, '/kalender');
    await expect(tid(page, 'week-grid')).toBeVisible();
  });
});

test.describe('REQ-033: hyphenation', () => {
  for (const width of [1440, 1024]) {
    test(`AC-078: at ${width} px long names break at a syllable, never inside it`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await open(page, '/kalender');
      await showPlanWeek(page, day(1));
      const stew = page
        .locator(`[data-testid^="week-slot-${day(1)}-"]`)
        .getByText('Kichererbsen-Eintopf', { exact: true })
        .first();
      await expect(stew).toBeVisible();
      expect(await stew.evaluate((element) => getComputedStyle(element).hyphens)).toBe('auto');
      // Where „Kichererbsen-“ does not fit the column the browser hyphenates by syllable:
      // „Ki-cher-erb-sen“ (Entscheidung 15), never „Kichererbse|n“.
      await expectBreaksAt(stew, 'Kichererbsen-Eintopf', [2, 6, 9]);

      // The household row of the week is on from the start (settings).
      await open(page, '/kalender');
      await showPlanWeek(page, day(3));
      const sheets = tid(page, `household-row-${day(3)}`)
        .getByText(/^Bettwäsche/)
        .first();
      await expect(sheets).toBeVisible();
      await expectBreaksAt(sheets, (await sheets.innerText()).replace(/\s+/g, ' '), [4]);
    });
  }
});

test.describe('REQ-034: focus rings in lists', () => {
  /** The ring (2 px outline, 2 px offset) of the focused element lies inside its scroll box. */
  async function expectRingWhole(page: Page, item: Locator): Promise<void> {
    await page.keyboard.press('Tab');
    await item.focus();
    const room = await item.evaluate((element) => {
      const style = getComputedStyle(element);
      const ring = parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
      const rect = element.getBoundingClientRect();
      let box = element.parentElement;
      while (box && getComputedStyle(box).overflowX === 'visible') box = box.parentElement;
      const clip = (box ?? document.documentElement).getBoundingClientRect();
      return {
        outline: style.outlineStyle,
        left: rect.left - ring - clip.left,
        right: clip.right - (rect.right + ring),
      };
    });
    expect(room.outline).toBe('solid');
    expect(room.left).toBeGreaterThanOrEqual(0);
    expect(room.right).toBeGreaterThanOrEqual(0);
  }

  test('AC-079: the ring of the tile at the left edge is whole in recipes, chores and articles', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, '/rezepte');
    await expectRingWhole(page, tidPrefix(page, 'recipe-card-').first());
    await open(page, '/haushalt?ansicht=alle');
    await expectRingWhole(
      page,
      tid(page, 'chores-all').locator('[data-testid^="chore-"][role="button"]').first(),
    );
    await open(page, '/artikel');
    // The list is virtualised (455 articles): take the first row that is drawn.
    await expectRingWhole(
      page,
      tid(page, 'articles-list').locator('[data-testid^="article-"]').first(),
    );
  });
});

test.describe('REQ-036: one way back', () => {
  const pages: ManagedPage[] = ['trips', 'stores', 'members', 'feedback', 'packing-bags'];
  for (const key of pages) {
    test(`AC-081: "${key}" shows "‹ Verwalten" and leads there`, async ({ page }) => {
      await open(page, '/');
      await openManaged(page, key);
      await expect(tid(page, 'back-label')).toHaveText('Verwalten');
      await tid(page, 'back').click();
      await expect(tid(page, 'manage-screen')).toBeVisible();
    });
  }

  test('AC-082: "Heute" in the calendar is greyed out in this week and leads back from the next', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, '/kalender');
    const today = tid(page, 'week-today');
    await expect(today).toBeDisabled();
    await tid(page, 'week-next').click();
    await expect(today).toBeEnabled();
    await today.click();
    await expect(today).toBeDisabled();
    await expect(tid(page, `day-${TODAY}`)).toBeVisible();
  });
});

test.describe('REQ-037: alignments', () => {
  async function startShopping(page: Page): Promise<void> {
    await open(page, '/liste');
    await tid(page, 'start-shopping').click();
    await expect(tid(page, 'shopping-progress')).toBeVisible();
  }

  test('AC-083: items in "Einkaufen" stand in the UI font, not in Fraunces', async ({ page }) => {
    await startShopping(page);
    const row = page.locator('[data-testid^="sm-item-"]:not([data-testid$="-check"])').first();
    const font = await row
      .locator('[role="button"]')
      .first()
      .evaluate((button) => {
        const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
        const text = walker.nextNode();
        return text?.parentElement ? getComputedStyle(text.parentElement).fontFamily : '';
      });
    expect(font).not.toMatch(/Fraunces/i);
  });

  test('AC-084: from tablets the input bar of "Einkaufen" is as wide as the rows', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 1366 });
    await startShopping(page);
    const row = await boxOf(
      page.locator('[data-testid^="sm-item-"]:not([data-testid$="-check"])').first(),
    );
    const input = await tid(page, 'shopping-add-bar').evaluate((bar) => {
      const inner = bar.firstElementChild?.getBoundingClientRect();
      return inner ? { x: inner.x, width: inner.width } : undefined;
    });
    expect(input).toBeDefined();
    expect(Math.abs((input?.x ?? 0) - row.x)).toBeLessThanOrEqual(1);
    expect(Math.abs((input?.width ?? 0) - row.width)).toBeLessThanOrEqual(1);
  });

  test('AC-085: in an empty household the buttons stand centred; chores say „Legt eure …“', async ({
    page,
  }) => {
    const householdId = await createTestHousehold(`Leer ${Date.now()}`);
    await open(page, '/');
    await switchHousehold(page, householdId);
    await open(page, '/haushalt?ansicht=alle');
    const empty = tid(page, 'chores-empty');
    await expect(empty).toContainText('Legt eure erste Aufgabe an oder nehmt eine Vorlage.');
    const area = await boxOf(empty);
    const button = await boxOf(tid(page, 'chores-empty-new'));
    expect(Math.abs(button.x + button.width / 2 - (area.x + area.width / 2))).toBeLessThanOrEqual(
      2,
    );
    await switchHousehold(page, seedIds['hh-demo']);
  });

  test('AC-086: an activity shows the ratings as a recipe does, the own one once', async ({
    page,
  }) => {
    await open(page, `/aktivitaet/${seedIds['act-bouldern']}`);
    const ratings = tid(page, 'activity-stars-all');
    await expect(ratings).toBeVisible();
    await expect(ratings.getByText('Du', { exact: true })).toHaveCount(1);
    await expect(tid(page, `activity-stars-member-${seedIds['m-nadja']}`)).toBeVisible();
    await expect(tid(page, 'activity-ratings')).toHaveCount(0);
  });

  test('AC-087: on the phone "Kochen" comes first over the width, then two buttons side by side', async ({
    page,
  }) => {
    await open(page, `/rezept/${seedIds['rec-lasagne']}`);
    const cook = await boxOf(tid(page, 'start-cooking'));
    const plan = await boxOf(tid(page, 'recipe-plan'));
    const list = await boxOf(tid(page, 'recipe-to-list'));
    expect(plan.y).toBeGreaterThan(cook.y + cook.height - 1);
    expect(Math.abs(plan.y - list.y)).toBeLessThanOrEqual(1);
    expect(list.x).toBeGreaterThan(plan.x + plan.width - 1);
    expect(Math.abs(plan.x - cook.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(list.x + list.width - (cook.x + cook.width))).toBeLessThanOrEqual(1);
  });
});
