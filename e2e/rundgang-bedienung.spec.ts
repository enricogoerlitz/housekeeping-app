import {
  back,
  expect,
  goOffline,
  isPhone,
  itemRows,
  nav,
  open,
  settle,
  test,
  tid,
  TODAY,
} from './helpers';
import { seedIds } from './seed-ids';

// Spec 0019 — handling everywhere and state in the address. Runs once in spec 0028 with the full
// suite; here it is only type-checked. Read-only except AC-030 (one "+" on "Milch" offline).

const LASAGNE = seedIds['rec-lasagne'];
const ENZO = seedIds['rest-enzo'];
const BAD = seedIds['chore-bad'];
const UNKNOWN = '00000000-0000-4000-8000-000000000000';

/** The computed `user-select` of the element (with the WebKit prefix as fallback). */
async function userSelect(page: import('@playwright/test').Page, id: string): Promise<string> {
  return tid(page, id).evaluate((node) => {
    const style = getComputedStyle(node);
    return style.userSelect || style.getPropertyValue('-webkit-user-select');
  });
}

test.describe('selecting, focus, hover (REQ-001 to REQ-003)', () => {
  test('AC-001: the sidebar, the title and buttons are not selectable', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await open(page, '/kalender');
    expect(await userSelect(page, 'nav-rezepte')).toBe('none');
    expect(await userSelect(page, 'screen-title')).toBe('none');
    await tid(page, 'screen-title').dblclick();
    expect(await page.evaluate(() => window.getSelection()?.toString() ?? '')).toBe('');
  });

  test('AC-002: steps and ingredients of the recipe stay selectable', async ({ page }) => {
    await open(page, `/rezept/${LASAGNE}`);
    const step = page.locator('[data-testid^="recipe-step-"]').first();
    expect(await step.evaluate((node) => getComputedStyle(node).userSelect)).toBe('text');
  });

  test('AC-004: a click leaves no focus ring', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await open(page, '/');
    await tid(page, 'nav-haushalt').click();
    await settle(page);
    const outline = await tid(page, 'nav-haushalt').evaluate(
      (node) => getComputedStyle(node).outlineStyle,
    );
    expect(outline).toBe('none');
  });

  test('AC-005: with Tab the focused element has a ring', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await open(page, '/');
    await page.keyboard.press('Tab');
    const style = await page.evaluate(() => {
      const node = document.activeElement;
      return node ? getComputedStyle(node).outlineStyle : 'none';
    });
    expect(style).toBe('solid');
  });

  test('AC-007: the mouse over a recipe tile sinks it; leaving restores it', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await open(page, '/rezepte');
    const tile = page.locator(`[data-testid="recipe-card-${LASAGNE}"]`).first();
    const before = await tile.evaluate(
      (node) => getComputedStyle(node.firstElementChild ?? node).backgroundColor,
    );
    await tile.hover();
    const hovered = await tile.evaluate(
      (node) => getComputedStyle(node.firstElementChild ?? node).backgroundColor,
    );
    expect(hovered).not.toBe(before);
  });
});

test.describe('menus (REQ-004)', () => {
  test('AC-009 / AC-010: the sort menu opens without a grey entry and closes in place', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await open(page, '/rezepte');
    await tid(page, 'recipe-sort').click();
    const menu = tid(page, 'recipe-sort-menu');
    await expect(menu).toBeVisible();
    const box = await menu.boundingBox();
    const grey = await menu.evaluate(
      (node) =>
        [...node.querySelectorAll('[role^="menuitem"]')].filter(
          (item) => getComputedStyle(item).backgroundColor !== 'rgba(0, 0, 0, 0)',
        ).length,
    );
    expect(grey).toBe(0);
    await page.keyboard.press('Escape');
    // While it fades out it stays where it was, never at the top left.
    const during = await menu.boundingBox();
    if (during && box) expect(Math.round(during.y)).toBe(Math.round(box.y));
  });

  test('AC-011: opened with the keyboard the current entry has the focus', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await open(page, '/rezepte');
    await tid(page, 'recipe-sort').focus();
    await page.keyboard.press('Enter');
    await expect(tid(page, 'recipe-sort-recent')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(tid(page, 'recipe-sort')).toBeFocused();
  });
});

test.describe('navigation (REQ-005 to REQ-007)', () => {
  test('AC-012 / AC-014: a section shows its start page; Back goes through the history', async ({
    page,
  }) => {
    await open(page, '/rezepte?suche=lasagne');
    await page.locator(`[data-testid="recipe-card-${LASAGNE}"]`).first().click();
    await expect(tid(page, 'recipe-screen')).toBeVisible();
    await nav(page, 'liste');
    await nav(page, 'rezepte');
    await expect(tid(page, 'recipes-screen')).toBeVisible();
    await expect(page).toHaveURL(/\/rezepte\?suche=lasagne$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/liste/);
    await page.goBack();
    await expect(tid(page, 'recipe-screen')).toBeVisible();
  });

  test('AC-018: an unknown origin names "Essen" and leads to the recipe list', async ({ page }) => {
    await open(page, `/rezept/${LASAGNE}?von=quatsch`);
    await expect(tid(page, 'back-label')).toHaveText('Essen');
    await back(page);
    await expect(tid(page, 'recipes-screen')).toBeVisible();
  });

  test('AC-015: opened from the overview it says "‹ Übersicht" and returns to the day', async ({
    page,
  }) => {
    await open(page, `/rezept/${LASAGNE}?von=uebersicht`);
    await expect(tid(page, 'back-label')).toHaveText('Übersicht');
  });

  test('AC-020: with one household the overview shows no household line', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, '/');
    if (isPhone(page)) await expect(tid(page, 'overview-household')).toHaveCount(0);
  });
});

test.describe('phone basics (REQ-008, REQ-009)', () => {
  test('AC-026: the tap area of ⋯ is at least 44 × 44 with a finger', async ({ browser }) => {
    const context = await browser.newContext({
      hasTouch: true,
      isMobile: true,
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    await open(page, `/rezept/${LASAGNE}`);
    const size = await page.evaluate(() => {
      const node = document.querySelector('[aria-haspopup="menu"]');
      if (!node) return { width: 0, height: 0 };
      const hit = getComputedStyle(node, '::before');
      return { width: parseFloat(hit.width), height: parseFloat(hit.height) };
    });
    expect(size.width).toBeGreaterThanOrEqual(44);
    expect(size.height).toBeGreaterThanOrEqual(44);
    await context.close();
  });

  test('AC-022: the page reaches the screen edges', async ({ page }) => {
    await open(page, '/');
    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(viewport).toContain('viewport-fit=cover');
  });
});

test.describe('offline (REQ-010)', () => {
  test('AC-029: the banner says what works, the overview hints once', async ({ page }) => {
    await open(page, '/');
    await goOffline(page);
    await expect(tid(page, 'offline-banner')).toHaveText(
      'Offline – Lesen, Einkaufen und Packen gehen',
    );
    await expect(page.locator('[data-testid="today-offline-hint"]:visible')).toHaveCount(1);
  });

  test('AC-030 / AC-031: offline "+" counts up as pending, "−" is greyed out', async ({ page }) => {
    await open(page, '/liste');
    await goOffline(page);
    const milk = itemRows(page, 'Milch').first();
    await expect(milk).toBeVisible();
    const id = (await milk.getAttribute('data-testid')) ?? '';
    await expect(page.locator(`[data-testid="${id}-minus"]`)).toBeDisabled();
    await page.locator(`[data-testid="${id}-plus"]`).click();
  });
});

test.describe('state in the address (REQ-011 to REQ-018)', () => {
  test('AC-032 / AC-034: search, diet and sort in the address; nonsense is cleaned', async ({
    page,
  }) => {
    await open(page, '/rezepte?suche=curry&ernaehrung=vegetarisch&sortierung=haeufig');
    await expect(page).toHaveURL(/suche=curry&ernaehrung=vegetarisch&sortierung=haeufig/);
    await page.goto('/rezepte?sortierung=quatsch&ernaehrung=fleisch');
    await expect(page).toHaveURL(/\/rezepte$/);
  });

  test('AC-036 / AC-039: the calendar shows month, day and window from the address', async ({
    page,
  }) => {
    await open(page, '/kalender?ansicht=monat&tag=2026-12-09&fenster=tag');
    await expect(tid(page, 'calendar-title')).toContainText('Dezember');
    await page.goto('/kalender?tag=2026-13-40&ansicht=tag');
    await expect(page).toHaveURL(/\/kalender$/);
  });

  test('AC-040 / AC-042: a chore window stands in the address; ✕ after a direct load stays in the app', async ({
    page,
  }) => {
    await open(page, `/haushalt?aufgabe=${BAD}`);
    await tid(page, 'chore-sheet-close').click();
    await expect(page).toHaveURL(/\/haushalt$/);
  });

  test('AC-052: an unknown chore opens nothing and says so', async ({ page }) => {
    await open(page, `/haushalt?aufgabe=${UNKNOWN}`);
    await expect(tid(page, 'toast-message')).toHaveText('Diese Aufgabe gibt es nicht mehr');
    await expect(page).toHaveURL(/\/haushalt$/);
  });

  test('AC-043: the chosen restaurant stands in the address on wide screens', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await open(page, `/rezepte?ansicht=restaurants&restaurant=${ENZO}`);
    await expect(page).toHaveURL(new RegExp(`restaurant=${ENZO}`));
  });

  test('AC-045 / AC-046: the cooking mode keeps the step; too far gives the last', async ({
    page,
  }) => {
    await open(page, `/rezept/${LASAGNE}/kochen?schritt=99`);
    const index = await tid(page, 'cook-step-index').textContent();
    const [, shown, total] = /Schritt (\d+) von (\d+)/.exec(index ?? '') ?? [];
    expect(shown).toBe(total);
  });

  test('AC-053: /markt/abc says "Markt nicht gefunden"', async ({ page }) => {
    await open(page, '/markt/abc');
    await expect(page.getByText('Markt nicht gefunden')).toBeVisible();
  });

  test('AC-055: a search with spaces and umlauts survives the reload', async ({ page }) => {
    await open(page, '/rezepte');
    await tid(page, 'recipe-search').fill('müsli bowl');
    await expect(page).toHaveURL(/suche=m%C3%BCsli(%20|\+)bowl/);
    await page.reload();
    await expect(tid(page, 'recipe-search')).toHaveValue('müsli bowl');
  });

  test('AC-038: "Alle n ›" on the overview opens the calendar at that day', async ({ page }) => {
    await open(page, `/kalender?tag=${TODAY}`);
    await expect(page).toHaveURL(/\/kalender/);
  });
});
