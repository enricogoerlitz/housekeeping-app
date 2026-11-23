import { randomUUID } from 'node:crypto';

import type { Page } from '@playwright/test';

import {
  accessToken,
  back,
  day,
  expect,
  goOffline,
  nav,
  only,
  open,
  rpc,
  SUPABASE_URL,
  switchHousehold,
  test,
  tid,
} from './helpers';
import { seedIds } from './seed-ids';

// Spec 0031, REQ-011 (T-12): the criteria of earlier specs that had no test yet. Each test names
// its criterion and spec. Phone only; the tests create what they change (an own trip) or only
// read, so the file needs no fresh seed.

only('phone');

const ENZO = seedIds['rest-enzo'];
const HOUSEHOLD = seedIds['hh-demo'];
const OFFLINE_HINT = 'Offline – zum Bearbeiten brauchst du Netz';
const SIGN_IN_FAILED = 'Anmelden hat nicht geklappt – bitte noch einmal versuchen.';

/**
 * Samples the window `id` on every frame for `ms` after `start` ran: its CSS transform and the
 * opacity of the window and its scrim (spec 0029, REQ-001).
 */
async function sampleSheet(
  page: Page,
  id: string,
  ms: number,
): Promise<{ transform: string; opacity: number; scrim: number }[]> {
  return page.evaluate(
    ([testId, duration]) =>
      new Promise<{ transform: string; opacity: number; scrim: number }[]>((resolve) => {
        const samples: { transform: string; opacity: number; scrim: number }[] = [];
        const end = performance.now() + duration;
        const opacityOf = (node: Element | null) => {
          let value = 1;
          for (let at = node; at; at = at.parentElement) {
            value *= Number(getComputedStyle(at).opacity);
          }
          return value;
        };
        const frame = () => {
          const sheet = document.querySelector(`[data-testid="${testId}"]`);
          const scrim = document.querySelector(`[data-testid="${testId}-scrim"]`);
          if (sheet) {
            samples.push({
              transform: getComputedStyle(sheet).transform,
              opacity: opacityOf(sheet),
              scrim: opacityOf(scrim),
            });
          }
          if (performance.now() < end) requestAnimationFrame(frame);
          else resolve(samples);
        };
        requestAnimationFrame(frame);
      }),
    [id, ms] as const,
  );
}

/** The bottom edge of the window `id`, in px from the top of the page. */
async function sheetBottom(page: Page, id: string): Promise<number> {
  const box = await page.locator(`[data-testid="${id}"]`).boundingBox();
  return (box?.y ?? 0) + (box?.height ?? 0);
}

test('AC-041 (0019): a reload keeps "Neue Aufgabe" open, with an empty name', async ({ page }) => {
  await open(page, '/haushalt');
  await tid(page, 'chore-new').click();
  await expect(tid(page, 'chore-new-sheet')).toBeVisible();
  await tid(page, 'chore-title').fill('Fenster Bad');
  await expect(page).toHaveURL(/\/haushalt\?fenster=neu-aufgabe$/);
  await page.reload();
  await expect(tid(page, 'chore-new-sheet')).toBeVisible();
  await expect(tid(page, 'chore-title')).toHaveValue('');
});

test('AC-044 (0019): the address of a restaurant opens its page on the phone; "Zurück" shows the list', async ({
  page,
}) => {
  await open(page, `/rezepte?ansicht=restaurants&restaurant=${ENZO}`);
  await expect(page).toHaveURL(new RegExp(`/restaurant/${ENZO}$`));
  await expect(tid(page, 'restaurant-screen')).toContainText('Trattoria Da Enzo');
  await back(page);
  await expect(page).toHaveURL(/\/rezepte\?ansicht=restaurants$/);
  await expect(tid(page, `restaurant-${ENZO}`)).toBeVisible();
});

test('AC-049 (0019): a failed sign-in says so, and the next attempt still returns to the address', async ({
  page,
}) => {
  const address = '/kalender?ansicht=monat&tag=2026-12-09';
  let attempts = 0;
  // Google is not reachable in the walk-through: the authorize call comes back with an error.
  await page.route(`${SUPABASE_URL()}/auth/v1/authorize**`, (route) => {
    attempts += 1;
    return route.fulfill({
      status: 302,
      headers: { location: '/?error=server_error&error_description=Unable+to+exchange+code' },
    });
  });
  await page.goto(address);
  await expect(tid(page, 'login-screen')).toBeVisible();
  await tid(page, 'login-google').click();
  await expect(tid(page, 'login-error')).toHaveText(SIGN_IN_FAILED);
  await expect(page).not.toHaveURL(/error=/);

  // The next attempt starts on the overview and keeps the address from before.
  await tid(page, 'login-google').click();
  await expect.poll(() => attempts).toBe(2);
  await expect(tid(page, 'login-error')).toHaveText(SIGN_IN_FAILED);
  await page.unroute(`${SUPABASE_URL()}/auth/v1/authorize**`);
  await tid(page, 'login-dev-enrico').click();
  await expect(page).toHaveURL(/\/kalender\?(.*&)?ansicht=monat/);
  await expect(page).toHaveURL(/tag=2026-12-09/);
  await expect(tid(page, 'calendar-title')).toContainText('Dezember');
});

test('AC-004 (0022): Nadja deletes the open trip; the window says so and drops the unsaved note', async ({
  page,
}) => {
  const tripId = randomUUID();
  const enrico = await accessToken('enrico');
  await rpc(enrico, 'apply_changes', {
    p_household_id: HOUSEHOLD,
    p_ops: [
      {
        kind: 'insert',
        table: 'trips',
        row: { id: tripId, from_on: day(40), to_on: day(43), note: 'Wanderung Harz' },
      },
      {
        kind: 'insert',
        table: 'trip_members',
        row: { id: randomUUID(), trip_id: tripId, member_id: seedIds['m-enrico'] },
      },
    ],
  });
  await open(page, `/reisen?reise=${tripId}`);
  await expect(tid(page, 'trip-window-title')).toHaveText('Wanderung Harz');
  await tid(page, 'trip-note').fill('Wanderung Harz mit Zelt');
  await expect(tid(page, 'trip-save')).toBeVisible();

  await rpc(await accessToken('nadja'), 'apply_changes', {
    p_household_id: HOUSEHOLD,
    p_ops: [{ kind: 'delete', table: 'trips', id: tripId }],
  });
  await expect(tid(page, 'trip-not-found')).toContainText('Diese Reise gibt es nicht mehr');
  await expect(tid(page, 'trip-save')).toHaveCount(0);
  await tid(page, 'trip-not-found-close').click();
  await expect(tid(page, 'trip-window')).toHaveCount(0);
  await expect(page).toHaveURL(/\/reisen$/);
});

test('AC-048 (0023): offline without recipes both buttons are greyed out with the offline hint', async ({
  page,
}) => {
  await open(page, '/');
  await switchHousehold(page, seedIds['hh-test']);
  await nav(page, 'rezepte');
  await expect(tid(page, 'recipes-empty')).toContainText('Noch keine Rezepte');
  await goOffline(page);
  for (const id of ['empty-recipe-new', 'empty-collection-new']) {
    await expect(tid(page, id)).toBeDisabled();
    await expect(tid(page, id)).toHaveAccessibleDescription(OFFLINE_HINT);
  }
});

test.describe('reduced motion (0029, REQ-001)', () => {
  test.use({ reducedMotion: 'reduce' });

  test('AC-003 (0029): with "Bewegung reduzieren" the window only fades in and out, nothing moves', async ({
    page,
  }) => {
    await open(page, '/liste');
    const opening = sampleSheet(page, 'pantry-check-sheet', 400);
    await tid(page, 'list-from-plan').click();
    const opened = await opening;
    expect(opened.length).toBeGreaterThan(3);
    expect(opened.every((sample) => sample.transform === 'none')).toBe(true);
    expect(opened[0]?.opacity ?? 1).toBeLessThan(1);
    expect(opened.at(-1)?.opacity).toBe(1);

    const closing = sampleSheet(page, 'pantry-check-sheet', 300);
    await tid(page, 'pantry-check-sheet-close').click();
    const closed = await closing;
    expect(closed.every((sample) => sample.transform === 'none')).toBe(true);
    expect(closed.some((sample) => sample.opacity < 1)).toBe(true);
    await expect(page.locator('[data-testid="pantry-check-sheet"]')).toHaveCount(0);
  });
});

test('AC-004 (0029): closed and at once opened again (Back, Forward), the window stands and stays open', async ({
  page,
}) => {
  await open(page, '/liste');
  await tid(page, 'list-from-plan').click();
  const height = page.viewportSize()?.height ?? 0;
  await expect.poll(() => sheetBottom(page, 'pantry-check-sheet')).toBeCloseTo(height, 0);
  await page.goBack();
  await page.goForward();
  await expect(page).not.toHaveURL(/\/liste$/);
  await expect.poll(() => sheetBottom(page, 'pantry-check-sheet')).toBeCloseTo(height, 0);
  // Longer than the fade-out (200 ms): it neither unmounts nor moves.
  const after = await sampleSheet(page, 'pantry-check-sheet', 400);
  expect(after.length).toBeGreaterThan(3);
  expect(after.every((sample) => sample.opacity === 1)).toBe(true);
  await expect(tid(page, 'pantry-check-sheet')).toContainText('Was soll auf die Liste?');
  await expect.poll(() => sheetBottom(page, 'pantry-check-sheet')).toBeCloseTo(height, 0);
});

// AC-006 (0029) has no walk-through: Chromium has no home bar (safe area 0), where the footers
// stay as they were (AC-008, checked in rundgang-handy). The 8 pt above a home bar are pinned by
// `bottom-inset.test.ts` in packages/ui, which Einkaufsmodus and Kochmodus use.
