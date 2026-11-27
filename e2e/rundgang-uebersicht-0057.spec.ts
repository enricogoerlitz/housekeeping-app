import type { Locator, Page } from '@playwright/test';

import {
  ACTIVE,
  expect,
  freshSeed,
  isPhone,
  nav,
  open,
  settle,
  switchHousehold,
  test,
  tid,
  tidPrefix,
} from './helpers';
import { seedIds } from './seed-ids';

// Spec 0057 — "Übersicht und Feinschliff der Navigation": "Wie war's?" as a stack under "Zu tun"
// and "Einkauf", a second tap on the active tab, the highlight that stays with the origin, titles
// without automatic hyphenation and the one-line date title.

freshSeed();

/** The scroll offset of the page that is shown (the scroll area with the biggest offset). */
async function scrolledBy(page: Page): Promise<number> {
  return page.evaluate(() =>
    Math.max(
      0,
      ...[...document.querySelectorAll('div')]
        .filter((d) => d.getClientRects().length > 0 && d.scrollHeight > d.clientHeight + 4)
        .map((d) => d.scrollTop),
    ),
  );
}

async function scrollDown(page: Page): Promise<void> {
  const size = page.viewportSize() ?? { width: 390, height: 844 };
  await page.mouse.move(size.width / 2, size.height / 2);
  await page.mouse.wheel(0, 900);
  await expect.poll(() => scrolledBy(page)).toBeGreaterThan(50);
}

async function top(locator: Locator): Promise<number> {
  const box = await locator.boundingBox();
  if (!box) throw new Error('no box');
  return box.y;
}

const tab = (page: Page, key: string) => tid(page, isPhone(page) ? `tab-${key}` : `nav-${key}`);
const recapStars = (page: Page) =>
  page.locator(`[data-testid^="recap-"][data-testid$="-stars"]${ACTIVE}`);

test.describe('„Wie war’s?“ as a stack (REQ-001)', () => {
  test('AC-001 / AC-002: under „Zu tun“ and „Einkauf“, one entry with its position', async ({
    page,
  }) => {
    await open(page, '/');
    const recap = page.locator(`[data-testid="today-recap"]${ACTIVE}`);
    await expect(recap).toBeVisible();
    const chores = page.locator(`[data-testid="today-chores"]${ACTIVE}`);
    const shopping = page.locator(`[data-testid="today-shopping"]${ACTIVE}`);
    expect(await top(recap)).toBeGreaterThan(await top(chores));
    expect(await top(recap)).toBeGreaterThan(await top(shopping));
    await expect(recapStars(page)).toHaveCount(1);
    await expect(tid(page, 'today-recap-position')).toHaveText(/^1 von \d+$/);
    if (!isPhone(page)) {
      const box = await recap.boundingBox();
      expect(box?.height ?? 0).toBeLessThanOrEqual(220);
    }
  });

  test('AC-004: › leafs to the next entry, from the last back to the first', async ({ page }) => {
    await open(page, '/');
    const position = tid(page, 'today-recap-position');
    const count = Number((await position.textContent())?.split(' von ')[1]);
    const first = await recapStars(page).getAttribute('data-testid');
    await tid(page, 'today-recap-next').click();
    await expect(position).toHaveText(`2 von ${count}`);
    await expect(recapStars(page)).toHaveCount(1);
    await expect(recapStars(page)).not.toHaveAttribute('data-testid', first ?? '');
    for (let step = 2; step <= count; step += 1) await tid(page, 'today-recap-next').click();
    await expect(position).toHaveText(`1 von ${count}`);
    await expect(recapStars(page)).toHaveCount(1);
    await expect(recapStars(page)).toHaveAttribute('data-testid', first ?? '');
  });

  test('AC-007: without open entries there is no card', async ({ page }) => {
    await open(page, '/');
    await switchHousehold(page, seedIds['hh-test']);
    await nav(page, 'index');
    await expect(page.locator(`[data-testid="today-recap"]${ACTIVE}`)).toHaveCount(0);
  });
});

test.describe('a second tap on the active tab (REQ-002)', () => {
  test('AC-009 / AC-010: on the start page it scrolls to the top', async ({ page }) => {
    await open(page, '/');
    await scrollDown(page);
    await tab(page, 'index').click();
    await expect.poll(() => scrolledBy(page)).toBe(0);
    await expect(page).toHaveURL(/\/$/);
  });

  test('AC-011: on a recipe it leads to the recipe list', async ({ page }) => {
    await open(page, '/rezepte');
    await tidPrefix(page, 'recipe-card-').first().click();
    await expect(page).toHaveURL(/\/rezept\//);
    await tab(page, 'rezepte').click();
    await settle(page);
    await expect(page).toHaveURL(/\/rezepte$/);
  });
});

test.describe('the highlight stays with the origin (REQ-003)', () => {
  test('AC-014 / AC-020: a planned entry opened from the overview keeps „Übersicht“', async ({
    page,
  }) => {
    await open(page, '/');
    await page.locator(`[data-testid^="today-meal-"]${ACTIVE}`).first().click();
    await expect(page).toHaveURL(/von=uebersicht/);
    await expect(tab(page, 'index')).toHaveAttribute('aria-selected', 'true');
    for (const key of ['rezepte', 'kalender', 'liste', 'haushalt'])
      await expect(tab(page, key)).not.toHaveAttribute('aria-selected', 'true');
    await tab(page, 'index').click();
    await settle(page);
    await expect(page).toHaveURL(/\/$/);
  });

  test('AC-017 / AC-018: from the calendar an activity marks only „Kalender“ in the sidebar', async ({
    page,
  }) => {
    test.skip(isPhone(page), 'the sidebar is the desktop’s');
    await open(page, `/aktivitaeten?aktivitaet=${seedIds['act-bouldern']}&von=kalender`);
    await expect(tid(page, 'nav-kalender')).toHaveAttribute('aria-selected', 'true');
    await expect(tid(page, 'nav-manage-activities')).not.toHaveAttribute('aria-current', 'page');
    // AC-018: opened under "Verwalten" only the entry is marked, no tab.
    await open(page, `/aktivitaeten?aktivitaet=${seedIds['act-bouldern']}`);
    await expect(tid(page, 'nav-manage-activities')).toHaveAttribute('aria-current', 'page');
    await expect(tid(page, 'nav-kalender')).toHaveAttribute('aria-selected', 'false');
  });
});

test.describe('titles (REQ-004, REQ-005)', () => {
  test('AC-021: card titles never hyphenate automatically', async ({ page }) => {
    await open(page, '/rezepte');
    const titles = page.locator(`[data-testid^="recipe-card-"]${ACTIVE} [dir="auto"]`);
    await expect(titles.first()).toBeVisible();
    const hyphens = await titles.evaluateAll((nodes) =>
      nodes.map((node) => getComputedStyle(node).hyphens),
    );
    expect(hyphens).not.toContain('auto');
  });

  test('AC-025 / AC-026: the date title stands in one line', async ({ page }) => {
    await open(page, '/');
    const title = page.locator(`[data-testid="today-header"]${ACTIVE}`).first();
    await expect(title).toHaveText(
      isPhone(page)
        ? /^(Mo|Di|Mi|Do|Fr|Sa|So)\., \d{1,2}\. \S+$/
        : /^(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag), \d{1,2}\. \S+$/,
    );
    const lineHeight = await title.evaluate((node) =>
      parseFloat(getComputedStyle(node).lineHeight),
    );
    const box = await title.boundingBox();
    expect(box?.height ?? 0).toBeLessThan(lineHeight * 1.5);
  });
});
