import { expect, test as base, type Locator, type Page } from '@playwright/test';

/**
 * The walk-through runs on a fixed "today": Monday, 16 November 2026, noon local time.
 * The demo data is seeded relative to the browser's current date (packages/api/src/seed/demo.ts),
 * so a fixed Monday makes every weekday in the acceptance criteria deterministic
 * (e.g. spec 0001 AC-027 "Montag → Donnerstag", AC-036/AC-038 "Samstag").
 * Only Date is faked; timers keep running in real time (toasts, animations).
 */
export const FIXED_NOW = new Date(2026, 10, 16, 12, 0, 0);

export function isoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** ISO date `offset` days after the fixed today. */
export function day(offset: number): string {
  const date = new Date(FIXED_NOW);
  date.setDate(date.getDate() + offset);
  return isoDate(date);
}

export const TODAY = day(0);
export const SLOT_LUNCH = 'slot-mittag';
export const SLOT_DINNER = 'slot-abend';

/**
 * Tabs and stack screens keep inactive screens mounted: they stay in the layout behind the active
 * one, marked `inert`. Only elements outside an inert subtree belong to the screen the user sees.
 */
export const ACTIVE = ':not([inert] *):visible';

/** The element with this test id on the active screen. */
export function tid(page: Page, id: string): Locator {
  return page.locator(`[data-testid="${id}"]${ACTIVE}`).first();
}

/** All elements on the active screen whose test id starts with `prefix`. */
export function tidPrefix(page: Page, prefix: string): Locator {
  return page.locator(`[data-testid^="${prefix}"]${ACTIVE}`);
}

export function isPhone(page: Page): boolean {
  return (page.viewportSize()?.width ?? 0) < 700;
}

export type TabKey = 'index' | 'rezepte' | 'plan' | 'liste' | 'haushalt';

/** Switches the main area with the tab bar (phone) or the sidebar (wider). */
export async function nav(page: Page, key: TabKey): Promise<void> {
  await tid(page, isPhone(page) ? `tab-${key}` : `nav-${key}`).click();
}

/**
 * Loads a route with a fresh demo state (AC-014: every page load restores the demo data) and waits
 * until the app has rendered. Use client navigation afterwards to keep in-memory changes.
 */
export async function open(page: Page, path = '/'): Promise<void> {
  await page.goto(path);
  await expect(page.locator('[data-testid]:visible').first()).toBeVisible({ timeout: 20_000 });
}

/** Opens settings through the profile button. */
export async function openSettings(page: Page): Promise<void> {
  await tid(page, 'profile-button').click();
  await expect(tid(page, 'settings')).toBeVisible();
}

/** Goes back with the in-app back arrow. */
export async function back(page: Page): Promise<void> {
  await tid(page, 'back').click();
}

/** Switches the simulated offline mode on (settings → Demo) and returns to the previous screen. */
export async function goOffline(page: Page): Promise<void> {
  await openSettings(page);
  await tid(page, 'setting-offline').click();
  await expect(tid(page, 'setting-offline').locator('input')).toBeChecked();
  await back(page);
}

/** Shopping list rows (open and done) whose article name is exactly `name`. */
export function itemRows(page: Page, name: string): Locator {
  return page.locator(`[data-testid^="item-"][role="button"][aria-label="${name}"]${ACTIVE}`);
}

/** The toast message currently shown. */
export function toastMessage(page: Page): Locator {
  return tid(page, 'toast-message');
}

/** Parses a CSS rgb()/rgba() colour. */
export function parseRgb(value: string): [number, number, number] {
  const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) throw new Error(`Not an rgb colour: ${value}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Hue in degrees (0–360) of an rgb colour. */
export function hue([r, g, b]: [number, number, number]): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

export function hexToRgb(hex: string): string {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

/** Background colour of the app root (the themed `bg` token). */
export async function appBackground(page: Page): Promise<string> {
  return page.evaluate(() => {
    const root = document.getElementById('root');
    let element: Element | null = root;
    // The first descendant with a non-transparent background is the themed root view.
    while (element) {
      const color = getComputedStyle(element).backgroundColor;
      if (color && color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') return color;
      element = element.firstElementChild;
    }
    return getComputedStyle(document.body).backgroundColor;
  });
}

interface AppFixtures {
  /** Every request URL the page made (for "nothing leaves the host", AC-006 / AC-043). */
  requests: string[];
  /** Uncaught errors in the page. Every test fails if there is one. */
  pageErrors: string[];
}

/** The test with a fixed clock, request log and a check for uncaught page errors. */
export const test = base.extend<AppFixtures>({
  requests: async ({ page }, provide) => {
    const urls: string[] = [];
    page.on('request', (request) => urls.push(request.url()));
    await provide(urls);
  },
  pageErrors: [
    async ({ page }, provide) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await provide(errors);
      expect(errors, 'uncaught errors in the page').toEqual([]);
    },
    { auto: true },
  ],
  page: async ({ page }, provide) => {
    await page.clock.setFixedTime(FIXED_NOW);
    await provide(page);
  },
});

export { expect };

/** Skips the tests of the current file or describe block unless they run in `project`. */
export function only(project: 'phone' | 'desktop'): void {
  test.beforeEach(() => {
    test.skip(
      test.info().project.name !== project,
      `width-specific: runs in the ${project} project`,
    );
  });
}
