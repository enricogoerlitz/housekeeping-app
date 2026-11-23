import type { Page } from '@playwright/test';

import { day, expect, freshSeed, open, test, tid, toastMessage, TODAY } from './helpers';
import { seedIds } from './seed-ids';

// Spec 0030 — Enrico's review 0002: sticky day heads, readable days while drawing a trip, "Reisen"
// by month with a filter, trips as drafts, equal day chips in "Einplanen", the order of the add
// window's tabs, the tab swipe on iOS, and trips that act only on chores. Runs once with the full
// suite (only type-checked here).

const MALLORCA = seedIds['trip-mallorca'];
const HAMBURG = seedIds['trip-hamburg'];
const LASAGNE = seedIds['rec-lasagne'];
const ENRICO_ID = seedIds['m-enrico'];
const NADJA_ID = seedIds['m-nadja'];

freshSeed();

async function css(page: Page, id: string, property: string): Promise<string> {
  return tid(page, id)
    .first()
    .evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property);
}

test.describe('REQ-001: day heads stay at the top', () => {
  test('AC-001: the desktop week keeps its day heads at the top of the scroll area', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 700 });
    await open(page, '/kalender');
    expect(await css(page, 'week-day-heads', 'position')).toBe('sticky');
    expect(await css(page, 'week-day-heads', 'top')).toBe('0px');
  });

  test('AC-003 / AC-004: the month keeps its weekdays at the top, written out on the desktop', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 700 });
    await open(page, '/kalender?ansicht=monat');
    expect(await css(page, 'month-weekday-heads', 'position')).toBe('sticky');
    await expect(tid(page, 'month-weekday-heads')).toContainText('Montag');
    await expect(tid(page, 'month-weekday-heads')).toContainText('Sonntag');
    await page.setViewportSize({ width: 900, height: 700 });
    await expect(tid(page, 'month-weekday-heads')).not.toContainText('Montag');
    await expect(tid(page, 'month-weekday-heads')).toContainText('Mo');
  });
});

test.describe('REQ-003: "Reisen" by month', () => {
  test('AC-007 / AC-008 / AC-010: months under "Kommend", the filter "Zeitraum" in the address', async ({
    page,
  }) => {
    await open(page, '/reisen');
    const mallorcaMonth = day(12).slice(0, 7);
    await expect(tid(page, `trips-month-${mallorcaMonth}`)).toContainText('Urlaub Mallorca');
    await expect(tid(page, `trip-${MALLORCA}-tile`)).toBeVisible();
    await tid(page, 'trips-period').click();
    await tid(page, `trips-period-${mallorcaMonth}`).click();
    await expect(page).toHaveURL(new RegExp(`zeitraum=${mallorcaMonth}`));
    await expect(tid(page, `trip-${MALLORCA}`)).toBeVisible();
    await open(page, '/reisen?zeitraum=2030');
    await expect(tid(page, 'trips-period-empty')).toContainText('Keine Reisen in diesem Zeitraum.');
    await tid(page, 'trips-period-all').click();
    await expect(tid(page, `trip-${HAMBURG}`)).toBeVisible();
    await open(page, '/reisen?zeitraum=abc');
    await expect(tid(page, `trip-${MALLORCA}`)).toBeVisible();
  });
});

test.describe('REQ-004: a trip as a draft', () => {
  test('AC-012 / AC-014 / AC-018: saved as a draft, marked and hatched; confirming asks nothing', async ({
    page,
  }) => {
    await open(page, '/reisen?fenster=neu-reise');
    await tid(page, 'trip-note').fill('Skiurlaub');
    await tid(page, 'trip-draft').click();
    await tid(page, 'trip-save').click();
    await expect(toastMessage(page)).toHaveText('Entwurf gespeichert');
    const row = page
      .locator('[data-testid^="trip-"][data-testid$="-open"]')
      .filter({ hasText: 'Skiurlaub' });
    await expect(row).toContainText('Entwurf');
    await row.click();
    await expect(tid(page, 'trip-draft-badge')).toBeVisible();
    await tid(page, 'trip-draft').click();
    await tid(page, 'trip-save').click();
    await expect(toastMessage(page)).toHaveText('Reise bestätigt');
    await expect(tid(page, 'trip-draft-badge')).toHaveCount(0);
  });

  test('AC-013 / REQ-004: a draft on the Übersicht is dashed and carries a visible "Entwurf"', async ({
    page,
  }) => {
    // The window starts on today, so the draft lies in today's Abschnitt of the day strip.
    await open(page, '/reisen?fenster=neu-reise');
    await tid(page, 'trip-note').fill('Kurztrip');
    await tid(page, 'trip-draft').click();
    await tid(page, 'trip-save').click();
    await expect(toastMessage(page)).toHaveText('Entwurf gespeichert');
    await open(page, '/');
    const label = tid(page, 'today-week').locator('[data-testid$="-draft"]');
    await expect(label.first()).toHaveText('Entwurf');
  });
});

test.describe('REQ-005 / REQ-006: windows', () => {
  test('AC-019: the seven day chips of "Einplanen" are equally wide and stay put when paging', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, `/rezept/${LASAGNE}`);
    await tid(page, 'recipe-plan').click();
    const chips = page.getByTestId(/^plan-recipe-day-\d{4}-\d{2}-\d{2}$/);
    await expect(chips).toHaveCount(7);
    const widths = await chips.evaluateAll((nodes) =>
      nodes.map((node) => node.getBoundingClientRect().width),
    );
    // Equal shares; the browser snaps each to the pixel grid.
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1);
    const before = await chips.first().boundingBox();
    await tid(page, 'plan-recipe-week-next').click();
    const after = await chips.first().boundingBox();
    expect(after?.x).toBe(before?.x);
  });

  test('AC-032: the seven day chips under "Verschieben" are equally wide and stay put in another week', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, `/kalender?eintrag=${seedIds['plan-2']}`);
    const chips = page.getByTestId(/^entry-move-\d{4}-\d{2}-\d{2}$/);
    await expect(chips).toHaveCount(7);
    const widths = await chips.evaluateAll((nodes) =>
      nodes.map((node) => node.getBoundingClientRect().width),
    );
    // Equal shares; the browser snaps each to the pixel grid.
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1);
    const before = await chips.first().boundingBox();
    await tid(page, 'entry-move-other').click();
    // A week later; the calendar opens on the entry's month.
    if (day(7).slice(0, 7) !== TODAY.slice(0, 7)) await tid(page, 'entry-move-date-next').click();
    await tid(page, `entry-move-date-day-${day(7)}`).click();
    const after = await chips.first().boundingBox();
    expect(after?.x).toBe(before?.x);
  });

  test('AC-021: the tabs of the add window are "Alle, Rezepte, Restaurants, Aktivitäten, Sammlungen, Reste"', async ({
    page,
  }) => {
    // Phones have one „+ Hinzufügen“ per day; the desktop grid adds per Tageszeit.
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, '/kalender');
    await tid(page, `add-${day(0)}`)
      .first()
      .click();
    const tabs = page.getByTestId(/^add-entry-tab-[a-z]+$/);
    await expect(tabs).toHaveText([
      'Alle',
      'Rezepte',
      'Restaurants',
      'Aktivitäten',
      'Sammlungen',
      'Reste',
    ]);
  });
});

test.describe('REQ-007: the tab swipe on the phone', () => {
  test.use({ hasTouch: true, isMobile: true });

  /** A finger path of [dx, dy] offsets from (x, y), one touchMove each. */
  async function drag(page: Page, x: number, y: number, path: [number, number][]) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (const [dx, dy] of path) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: x + dx, y: y + dy }],
      });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }

  /** The middle of a group heading of Haushalt, where no row takes the finger. */
  async function headingY(page: Page, name: string): Promise<number> {
    const box = await page.getByRole('heading', { name, exact: true }).boundingBox();
    return (box?.y ?? 0) + (box?.height ?? 0) / 2;
  }

  test('AC-023: the scroll area under the tabs of Haushalt pans only vertically', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, '/haushalt');
    const panY = await page
      .locator('[style*="touch-action"]')
      .evaluateAll((nodes) => nodes.some((node) => getComputedStyle(node).touchAction === 'pan-y'));
    expect(panY).toBe(true);
  });

  test('AC-023: a swipe from the middle of the screen, also with a diagonal start, changes the tab', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, '/haushalt');
    await drag(page, 300, await headingY(page, 'Diese Woche'), [
      [-5, -5],
      [-9, -9],
      [-14, -12],
      [-30, -14],
      [-60, -16],
      [-100, -18],
      [-150, -20],
      [-190, -20],
    ]);
    await expect(page).toHaveURL(/\/haushalt\?ansicht=alle/);
  });

  test('AC-024: on Essen, scrolled down a little, a swipe to the left chooses "Restaurants"', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, '/rezepte');
    await drag(page, 200, 700, [
      [-2, -20],
      [-4, -60],
      [-8, -120],
    ]);
    await drag(page, 300, 500, [
      [-20, 0],
      [-60, -4],
      [-120, -6],
      [-180, -6],
    ]);
    await expect(page).toHaveURL(/\/rezepte\?ansicht=restaurants/);
  });

  test('AC-025: a move that starts mostly vertically stays a scroll, even when it turns sideways', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, '/haushalt');
    await drag(page, 300, await headingY(page, 'Diese Woche'), [
      [-2, -6],
      [-4, -12],
      [-6, -18],
      [-60, -22],
      [-120, -25],
      [-180, -26],
    ]);
    await expect(page).toHaveURL(/\/haushalt$/);
  });
});

test.describe('REQ-008: trips act only on chores', () => {
  test('AC-027: "Wer isst mit?" keeps everyone on a day of a trip', async ({ page }) => {
    await open(page, `/rezept/${LASAGNE}`);
    await tid(page, 'recipe-plan').click();
    await tid(page, 'plan-recipe-week-next').click();
    await tid(page, 'plan-recipe-week-next').click();
    await tid(page, `plan-recipe-day-${day(14)}`).click();
    await expect(tid(page, `eater-${ENRICO_ID}`)).toHaveAttribute('aria-selected', 'true');
    await expect(tid(page, `eater-${NADJA_ID}`)).toHaveAttribute('aria-selected', 'true');
  });

  test('AC-031: a hand-made "Wer isst mit?" stays when changing the day, the week or "Vormerken"', async ({
    page,
  }) => {
    await open(page, `/rezept/${LASAGNE}`);
    await tid(page, 'recipe-plan').click();
    await tid(page, `eater-${NADJA_ID}`).click();
    await expect(tid(page, `eater-${NADJA_ID}`)).toHaveAttribute('aria-selected', 'false');
    await tid(page, 'plan-recipe-week-next').click();
    await tid(page, `plan-recipe-day-${day(8)}`).click();
    await tid(page, 'plan-recipe-later').click();
    await expect(tid(page, `eater-${ENRICO_ID}`)).toHaveAttribute('aria-selected', 'true');
    await expect(tid(page, `eater-${NADJA_ID}`)).toHaveAttribute('aria-selected', 'false');
  });

  test('AC-026 / AC-030: saving a trip asks nothing about dishes; the note names no eaters', async ({
    page,
  }) => {
    await open(page, '/reisen?fenster=neu-reise');
    await expect(tid(page, 'trip-effect-note')).not.toContainText('Wer isst mit');
    await tid(page, 'trip-save').click();
    await expect(toastMessage(page)).toHaveText('Reise eingetragen');
    await expect(tid(page, 'trip-sheet')).toHaveCount(0);
  });
});
