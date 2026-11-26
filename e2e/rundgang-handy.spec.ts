import type { Page } from '@playwright/test';

import { contentReady, expect, open, routeUrl, settle, test, tid } from './helpers';
import { seedIds } from './seed-ids';

// Spec 0029 — phone polish. Runs once in spec 0028 with the full suite; here it is only
// type-checked. Read-only. Chromium has no home bar (safe area 0), so the gap itself (AC-005) is
// covered by the unit tests in `packages/ui`; here only that nothing moves without one (AC-008).

const ENZO = seedIds['rest-enzo'];

/** A sideways finger move from (x, y) by dx in a few steps, through the DevTools protocol. */
async function swipe(page: Page, x: number, y: number, dx: number): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const point = (at: number) => [{ x: at, y }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(x) });
  for (let step = 1; step <= 8; step += 1) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: point(x + (dx * step) / 8),
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await settle(page);
}

/** Waits until the "Vorratscheck" sheet has slid up and its bottom edge meets the screen's. */
async function expectSheetUp(page: Page): Promise<void> {
  const sheet = tid(page, 'pantry-check-sheet');
  const height = page.viewportSize()?.height ?? 0;
  await expect
    .poll(async () => {
      const box = await sheet.boundingBox();
      return Math.round((box?.y ?? 0) + (box?.height ?? 0));
    })
    .toBe(Math.round(height));
}

test.describe('sheets from below (REQ-001)', () => {
  test('AC-001: the scrim covers the screen at once, only the sheet slides up', async ({
    page,
  }) => {
    await open(page, '/liste');
    await tid(page, 'list-from-plan').click();
    const scrim = page.locator('[data-testid="pantry-check-sheet-scrim"]');
    const box = await scrim.boundingBox();
    expect(box?.y).toBe(0);
    expect(box?.height).toBe(page.viewportSize()?.height);
    const sheet = tid(page, 'pantry-check-sheet');
    await expect(sheet).toContainText('Was soll auf die Liste?');
    await expectSheetUp(page);
  });

  test('AC-002: closing slides the sheet down before it is gone', async ({ page }) => {
    await open(page, '/liste');
    await tid(page, 'list-from-plan').click();
    await expectSheetUp(page);
    await tid(page, 'pantry-check-sheet-close').click();
    await expect(page.locator('[data-testid="pantry-check-sheet"]')).toHaveCount(0);
    await expect(page).toHaveURL(/\/liste$/);
  });
});

test.describe('gap above the home bar (REQ-002)', () => {
  test('AC-008: without a home bar the tab bar keeps its height at the bottom', async ({
    page,
  }) => {
    await open(page, '/');
    const bar = await page.locator('[role="tablist"]').last().boundingBox();
    expect(bar?.height).toBe(62);
    expect((bar?.y ?? 0) + (bar?.height ?? 0)).toBe(page.viewportSize()?.height);
  });
});

test.describe('swipe between view tabs (REQ-003)', () => {
  test.use({ hasTouch: true, isMobile: true });

  test('AC-009: a swipe to the left goes from "Anstehend" to "Alle"', async ({ page }) => {
    await open(page, '/haushalt');
    await contentReady(page);
    await swipe(page, 300, 500, -200);
    await expect(page).toHaveURL(/\/haushalt\?ansicht=alle/);
  });

  test('AC-010: a swipe to the right goes from "Restaurants" back to "Rezepte"', async ({
    page,
  }) => {
    await open(page, '/rezepte?ansicht=restaurants');
    await contentReady(page);
    await swipe(page, 100, 500, 200);
    await expect(page).toHaveURL(/\/rezepte$/);
  });

  test('AC-011: before the first tab nothing changes', async ({ page }) => {
    await open(page, '/haushalt');
    await contentReady(page);
    await swipe(page, 100, 500, 220);
    await expect(page).toHaveURL(/\/haushalt$/);
  });

  test('AC-012: a short move and a move from the screen edge keep the tab', async ({ page }) => {
    await open(page, '/haushalt');
    await contentReady(page);
    await swipe(page, 300, 500, -40);
    await swipe(page, 380, 500, -200);
    await expect(page).toHaveURL(/\/haushalt$/);
  });
});

test.describe('route without an empty window (REQ-004)', () => {
  test('AC-018: in a browser tab "Apple Karten" opens maps.apple.com in a new tab', async ({
    page,
  }) => {
    await open(page, `/restaurant/${ENZO}`);
    await tid(page, 'restaurant-route').click();
    expect(await routeUrl(page, 'route-apple')).toMatch(/^https:\/\/maps\.apple\.com\/\?daddr=/);
  });

  test.describe('installed on an iPhone', () => {
    test.use({
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
    });

    test('AC-015: "Apple Karten" opens no new window and the page stays', async ({ page }) => {
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'standalone', { value: true });
      });
      await open(page, `/restaurant/${ENZO}`);
      await tid(page, 'restaurant-route').click();
      let popups = 0;
      page.on('popup', () => {
        popups += 1;
      });
      await tid(page, 'route-apple').click();
      await page.waitForTimeout(500);
      expect(popups).toBe(0);
      await expect(page).toHaveURL(new RegExp(`/restaurant/${ENZO}`));
      await expect(page.locator('[data-testid="route-sheet"]')).toHaveCount(0);
    });
  });
});

test.describe('store mode on the phone (review 0003, feedback 1)', () => {
  test('"Einkaufen" fills the window and scrolls inside it: the add bar stays at the bottom', async ({
    page,
  }) => {
    // Without the tab bar the JS stack fills the window; its card must not grow with the page,
    // or the page's ScrollView has no height and nothing scrolls (stack-options.test.mjs).
    await open(page, '/liste');
    await tid(page, 'start-shopping').click();
    const bar = tid(page, 'shopping-add-bar');
    await expect(bar).toBeInViewport();
    const box = await bar.boundingBox();
    expect(Math.round((box?.y ?? 0) + (box?.height ?? 0))).toBe(page.viewportSize()?.height);
  });
});
