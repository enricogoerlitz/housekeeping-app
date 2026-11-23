import type { Page } from '@playwright/test';

import { E2E_APP_VERSION } from './global-setup';
import {
  accessToken,
  expect,
  freshSeed,
  nav,
  only,
  open,
  openSettings,
  setNetwork,
  supabaseFetch,
  test,
  tid,
  tidPrefix,
} from './helpers';
import { seedIds } from './seed-ids';

// Spec 0014, REQ-004: the app shows its version, notices a newer one and is locked for editing
// below the server's minimum version. The export of this suite is built as E2E_APP_VERSION
// (global-setup.ts); a newer release and a higher minimum are simulated by answering
// `/version.json` and the RPC `min_app_version` in the browser. AC-025 checks one item, so the
// demo starts fresh.

const OWN = E2E_APP_VERSION;
/** The next release after OWN: same month, running number + 1 (spec 0031, AC-021). */
const NEWER = OWN.replace(/\.(\d+)$/, (_, sequence: string) => `.${Number(sequence) + 1}`);

freshSeed();

/** Pretends a newer release is published: `/version.json` names it. Counts the reads. */
async function publish(page: Page, version: string): Promise<{ reads: number }> {
  const counter = { reads: 0 };
  await page.route('**/version.json', async (route) => {
    counter.reads += 1;
    await route.fulfill({ json: { version, commit: 'e2e' } });
  });
  return counter;
}

/** Pretends the server requires at least `version` (a contract migration raised it). */
async function requireMinimum(page: Page, version: string): Promise<void> {
  await page.route('**/rest/v1/rpc/min_app_version', async (route) => {
    // The real answer keeps the CORS headers of the local Supabase; only the value changes.
    const response = await route.fetch();
    await route.fulfill({ response, body: JSON.stringify(version) });
  });
}

/** The PWA comes back from the background (iOS keeps it in memory). */
async function returnToForeground(page: Page): Promise<void> {
  await page.evaluate(() =>
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true })),
  );
}

/** Open items of an article in the demo household, read as Enrico through the API. */
async function openItemsOnServer(name: string): Promise<number> {
  const token = await accessToken('enrico');
  const articles = (await (
    await supabaseFetch(
      `/rest/v1/articles?select=id&household_id=eq.${seedIds['hh-demo']}&name=eq.${encodeURIComponent(name)}`,
      { token },
    )
  ).json()) as { id: string }[];
  const ids = articles.map((article) => article.id).join(',');
  if (!ids) return 0;
  const items = (await (
    await supabaseFetch(
      `/rest/v1/shopping_items?select=id&checked=is.false&article_id=in.(${ids})`,
      { token },
    )
  ).json()) as unknown[];
  return items.length;
}

test.describe('version (spec 0014)', () => {
  test('AC-021: the personal settings show the version at the very bottom', async ({ page }) => {
    await open(page);
    await openSettings(page);
    const line = tid(page, 'settings-version');
    await line.scrollIntoViewIfNeeded();
    await expect(line).toHaveText(`Version ${OWN}`);
  });

  test('AC-022: a newer release shows "Neue Version verfügbar" on returning to the foreground; "Neu laden" reloads', async ({
    page,
  }) => {
    await open(page);
    await expect(tid(page, 'version-update')).toHaveCount(0);

    await publish(page, NEWER);
    await returnToForeground(page);
    const hint = tid(page, 'version-update');
    await expect(hint).toHaveText(/Neue Version verfügbar/);
    await expect(hint).toHaveAttribute('role', 'status');
    await expect(hint).toHaveAttribute('aria-live', 'polite');

    // By keyboard: the button takes the focus and Enter reloads the page.
    const reload = hint.getByRole('button', { name: 'Neu laden' });
    await reload.focus();
    await expect(reload).toBeFocused();
    await page.evaluate(() => {
      (window as { beforeReload?: boolean }).beforeReload = true;
    });
    // The reload loads the published build, whose own version is the one in `/version.json`.
    await page.unroute('**/version.json');
    await Promise.all([page.waitForEvent('load'), page.keyboard.press('Enter')]);
    expect(await page.evaluate(() => (window as { beforeReload?: boolean }).beforeReload)).toBe(
      undefined,
    );
    await expect(tid(page, 'today-screen')).toBeVisible();
    await returnToForeground(page);
    await expect(tid(page, 'version-update')).toHaveCount(0);
  });
});

test.describe('version without network and below the minimum (spec 0014)', () => {
  only('phone');

  test('AC-023: offline neither the version file is read nor a hint or error shown', async ({
    page,
    context,
  }) => {
    await open(page);
    const counter = await publish(page, NEWER);
    await setNetwork(context, false);
    await returnToForeground(page);
    await expect(tid(page, 'offline-banner')).toBeVisible();
    // Give a check that should not happen the time to happen.
    await page.waitForTimeout(1_000);
    expect(counter.reads).toBe(0);
    await expect(tid(page, 'version-update')).toHaveCount(0);
    await expect(tid(page, 'toast-message')).toHaveCount(0);

    // Back online, the check runs and the hint appears.
    await setNetwork(context, true);
    await expect(tid(page, 'version-update')).toBeVisible();
    expect(counter.reads).toBeGreaterThan(0);
  });

  test('AC-025: below the minimum version reading and checking go on, editing is locked, the store queue waits until the reload', async ({
    page,
  }) => {
    await requireMinimum(page, NEWER);
    await open(page);
    const banner = tid(page, 'version-unsupported');
    await expect(banner).toHaveText(/Diese Version wird nicht mehr unterstützt/);
    await expect(banner.getByRole('button', { name: 'Neu laden' })).toBeVisible();
    await expect(tid(page, 'offline-banner')).toHaveCount(0);

    // Editing is locked like offline, with its own hint (spec 0018, AC-023).
    await nav(page, 'rezepte');
    await expect(tid(page, 'recipe-offline-hint')).toHaveText('Bitte neu laden, um zu bearbeiten');

    // Checking in store mode works on the device, but waits in the store queue.
    await nav(page, 'liste');
    expect(await openItemsOnServer('Milch')).toBe(1);
    await tid(page, 'start-shopping').click();
    const milk = tidPrefix(page, 'sm-item-').locator('[role="checkbox"][aria-label="Milch"]');
    await milk.click();
    await expect(milk).toHaveAttribute('aria-checked', 'true');
    // Give a send that should not happen the time to happen.
    await page.waitForTimeout(1_500);
    expect(await openItemsOnServer('Milch')).toBe(1);

    // "Neu laden": the new version runs (the server answers its true minimum again) and sends
    // the waiting check.
    await page.unroute('**/rest/v1/rpc/min_app_version');
    await Promise.all([
      page.waitForEvent('load'),
      tid(page, 'version-unsupported').getByRole('button', { name: 'Neu laden' }).click(),
    ]);
    await expect(tid(page, 'screen-title')).toBeVisible();
    await expect(tid(page, 'version-unsupported')).toHaveCount(0);
    await expect.poll(() => openItemsOnServer('Milch')).toBe(0);
  });
});
