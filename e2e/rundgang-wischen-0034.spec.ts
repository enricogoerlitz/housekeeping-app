import type { Page } from '@playwright/test';

import { contentReady, expect, open, settle, test, tid } from './helpers';

// Spec 0034 — swiping on the phone: the neighbour tab beside the content (REQ-007) and the room
// under the months of the year (REQ-006). Read-only; the feel of the gesture is checked on the
// iPhone.

test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

/** A finger on (x, y) that moves sideways along `path` and stays down. */
async function hold(page: Page, x: number, y: number, path: number[]) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (const dx of path) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x + dx, y }],
    });
  }
  return async () => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await settle(page);
  };
}

const HALF_LEFT = [-6, -14, -30, -60, -100, -140, -170, -195];
const HALF_RIGHT = HALF_LEFT.map((dx) => -dx);

test.describe('REQ-007: the neighbour tab beside the content', () => {
  test('AC-015: held half way, the restaurants stand right beside the recipes', async ({
    page,
  }) => {
    await open(page, '/rezepte');
    await contentReady(page);
    const release = await hold(page, 300, 520, HALF_LEFT);
    const neighbour = tid(page, 'tab-swipe-preview-next');
    await expect(neighbour).toBeVisible();
    await expect(neighbour.getByTestId('restaurant-list')).toBeAttached();
    const box = await neighbour.boundingBox();
    // Its left edge lies inside the screen, about half way.
    expect(box?.x ?? 0).toBeGreaterThan(100);
    expect(box?.x ?? 0).toBeLessThan(300);
    await release();
    await expect(page).toHaveURL(/\/rezepte\?ansicht=restaurants/);
    await expect(page.locator('[data-testid^="tab-swipe-preview"]')).toHaveCount(0);
  });

  test('AC-016: released before the threshold, "Rezepte" springs back', async ({ page }) => {
    await open(page, '/rezepte');
    await contentReady(page);
    const before = (await tid(page, 'recipe-list').boundingBox())?.x;
    const release = await hold(page, 300, 520, [-6, -14, -24, -36]);
    await expect(tid(page, 'tab-swipe-preview-next')).toBeVisible();
    await release();
    await expect(page).toHaveURL(/\/rezepte$/);
    await expect(page.locator('[data-testid^="tab-swipe-preview"]')).toHaveCount(0);
    expect((await tid(page, 'recipe-list').boundingBox())?.x).toBe(before);
  });
});

test.describe('REQ-006: the year view', () => {
  test('AC-025: a swipe on "Reisen" chooses "Monat", the year stays', async ({ page }) => {
    await open(page, '/kalender?ansicht=jahr');
    await contentReady(page);
    await tid(page, 'year-trips').scrollIntoViewIfNeeded();
    await settle(page);
    const trips = await tid(page, 'year-trips').boundingBox();
    const release = await hold(page, 100, (trips?.y ?? 0) + 10, HALF_RIGHT);
    await release();
    await expect(page).toHaveURL(/ansicht=monat/);
  });

  test('AC-026: a swipe over the months pages the year, the view stays', async ({ page }) => {
    await open(page, '/kalender?ansicht=jahr');
    await contentReady(page);
    const year = Number(await tid(page, 'calendar-title').textContent());
    const grid = await tid(page, 'year-view').boundingBox();
    const release = await hold(page, 300, Math.max((grid?.y ?? 0) + 120, 300), HALF_LEFT);
    await release();
    await expect(tid(page, 'calendar-title')).toHaveText(String(year + 1));
    await expect(page).toHaveURL(/ansicht=jahr/);
  });
});
