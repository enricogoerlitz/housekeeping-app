import type { Page } from '@playwright/test';

import { expect, hexToRgb, open, openSettings, test, tid } from './helpers';

// Spec 0058 — new themes: the short theme picker (REQ-007), the sky of "Wolke" (REQ-003, REQ-005)
// and fonts that load only when a theme is shown (REQ-006). Reads and writes only the device's
// own settings.

/** The theme cards of the picker, top to bottom. */
async function cards(page: Page): Promise<string[]> {
  const ids = await page
    .locator('[data-testid="theme-picker"] [role="radio"]:visible')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-testid') ?? ''));
  return ids.map((id) => id.replace(/^theme-/, ''));
}

async function storeTheme(page: Page, themeId: string): Promise<void> {
  await page.addInitScript((id) => {
    window.localStorage.setItem(
      'housekeeping.settings.v1',
      JSON.stringify({ themeId: id, appearance: 'light' }),
    );
  }, themeId);
}

const fontFiles = (requests: string[], family: string) =>
  requests.filter((url) => url.includes(`/${family}_`) && url.endsWith('.ttf'));

test.describe('new themes (spec 0058)', () => {
  test('AC-017, AC-018, AC-019: three themes, „Mehr anzeigen“, the chosen one on top next time', async ({
    page,
  }) => {
    await open(page, '/');
    await openSettings(page);
    expect(await cards(page)).toEqual(['markthalle', 'klar', 'frisch']);
    await expect(tid(page, 'theme-picker-more')).toHaveText('Mehr anzeigen');
    await tid(page, 'theme-picker-more').click();
    expect(await cards(page)).toEqual([
      'markthalle',
      'klar',
      'frisch',
      'wolke',
      'mitternacht',
      'zitrus',
      'salbei',
      'lavendel',
      'espresso',
    ]);
    await expect(tid(page, 'theme-picker-more')).toHaveText('Weniger anzeigen');
    await tid(page, 'theme-lavendel').click();
    await expect(tid(page, 'theme-lavendel-selected')).toBeVisible();
    // The card stays where it was.
    expect((await cards(page)).indexOf('lavendel')).toBe(7);
    await page.reload();
    await openSettings(page);
    expect(await cards(page)).toEqual(['lavendel', 'markthalle', 'klar']);
    await expect(tid(page, 'theme-lavendel-selected')).toBeVisible();
  });

  test('AC-016, AC-005, AC-011: "Wolke" paints its sky and the status bar, and comes first', async ({
    page,
  }) => {
    await storeTheme(page, 'wolke');
    await open(page, '/');
    await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute(
      'content',
      '#F2D3DB',
    );
    const sky = await page.evaluate(() => {
      let element = document.getElementById('root')?.firstElementChild ?? null;
      while (element) {
        const style = getComputedStyle(element);
        if (style.backgroundImage.includes('gradient')) return style.backgroundColor;
        element = element.firstElementChild;
      }
      return null;
    });
    expect(sky).toBe(hexToRgb('#F2D3DB'));
    await openSettings(page);
    expect(await cards(page)).toEqual(['wolke', 'markthalle', 'klar']);
  });

  test('AC-013, AC-012: only the fonts of the chosen theme load until the picker shows more', async ({
    page,
    requests,
  }) => {
    await open(page, '/');
    await openSettings(page);
    expect(fontFiles(requests, 'Fraunces').length).toBeGreaterThan(0);
    for (const family of ['Nunito', 'Inter', 'Outfit', 'Lora', 'Lexend', 'Manrope']) {
      expect(fontFiles(requests, family), family).toEqual([]);
    }
    await tid(page, 'theme-picker-more').click();
    await expect.poll(() => fontFiles(requests, 'Nunito').length).toBeGreaterThan(0);
    await expect.poll(() => fontFiles(requests, 'Manrope').length).toBeGreaterThan(0);
  });
});
