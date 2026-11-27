import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Locator, Page } from '@playwright/test';
import { formatLongDate } from '@housekeeping/core';

import {
  ACTIVE,
  openManaged,
  NADJA,
  PLAN_ENTRY,
  SLOT_DINNER,
  SLOT_LUNCH,
  SLOT_MORNING,
  TODAY,
  accessToken,
  back,
  createAccount,
  day,
  deleteAccount,
  expect,
  freshSeed,
  nav,
  only,
  open,
  routeUrl,
  rpc,
  secondDevice,
  setNetwork,
  settle,
  showPlanWeek,
  stubMaps,
  supabaseFetch,
  switchHousehold,
  test,
  tid,
  toastMessage,
  unique,
  dayBlock,
} from './helpers';
import { seedIds } from './seed-ids';

// Spec 0004 — activities and own photos, against the local backend. The seed has three
// activities: Eislaufen (place "Eisstadion Hohenschönhausen", today in the morning with the Zusatz
// "Hohenschönhausen"), Bouldern (12, 30 and 45 days ago and in 3 days, all in the morning, no
// ratings) and Spieleabend (no place). The tests build on each other in this order (photos are
// uploaded, entries planned), so the file starts from a fresh seed; AC-011 and AC-013 use the
// photo AC-009 uploads. Days: the AC's Saturday is today + 6 (morning and evening), its Sunday
// today + 7, and Spieleabend goes to lunch on today + 4 — all free in the seed. AC-003 (existing
// households get "Vormittag") is pgTAP: supabase/tests/meal_slots.test.sql.

only('phone');
freshSeed();

const here = path.dirname(fileURLToPath(import.meta.url));
/** 2400 × 1800 JPEG with an Exif block holding a GPS position and a camera make. */
const GPS_PHOTO = path.join(here, 'fixtures/eislaufen-gps.jpg');
const BUCKET = 'household-media';
const SYNC = { timeout: 30_000 };

const DEMO = seedIds['hh-demo'];
const EISLAUFEN = seedIds['act-eislaufen'];
const BOULDERN = seedIds['act-bouldern'];
const SPIELEABEND = seedIds['act-spieleabend'];
const EISLAUFEN_TODAY = seedIds['plan-eislaufen-1'];
const LASAGNE = seedIds['rec-lasagne'];
const BOLOGNESE = seedIds['rec-spaghetti-bolognese'];
const FREE_LUNCH = day(4);
const SATURDAY = day(6);
const SUNDAY = day(7);

// ---------- Helpers of this file ----------

/** The activity's own page in the calendar's area, on every width (spec 0010, AC-026). */
function activityRoute(_page: Page, id: string): string {
  return `/aktivitaet/${id}`;
}

/** "Aktivitäten" under "Verwalten" (spec 0024, REQ-009). */
async function openActivities(page: Page): Promise<void> {
  await nav(page, 'kalender');
  await openManaged(page, 'activities');
  await expect(tid(page, 'activities-screen')).toBeVisible();
  await settle(page);
}

/**
 * The titles of the entries in one Tageszeit (`week-slot-<date>-<slot>`), top to bottom. The
 * phone week shows only the Tageszeiten with entries (spec 0010, AC-008): none is an empty list.
 */
async function slotTitles(page: Page, date: string, slotId: string): Promise<(string | null)[]> {
  return dayBlock(page, date)
    .locator(`[data-testid="week-slot-${date}-${slotId}"]`)
    .locator(PLAN_ENTRY)
    .evaluateAll((rows) => rows.map((row) => row.getAttribute('aria-label')));
}

/**
 * Opens "+ Hinzufügen" of a day (the calendar shows the week of `date`); `pick` chooses the hit,
 * then the Tageszeit is set in the second step and the entry is saved.
 */
async function planOn(
  page: Page,
  date: string,
  slotId: string,
  pick: () => Promise<void>,
): Promise<void> {
  await tid(page, `add-${date}`).click();
  await expect(tid(page, 'add-entry-sheet')).toBeVisible();
  await pick();
  await tid(page, `add-entry-slot-${slotId}`).click();
  await tid(page, 'add-entry-save').click();
  await expect(tid(page, 'add-entry-sheet')).toBeHidden();
}

async function planRecipe(page: Page, date: string, slotId: string, search: string, id: string) {
  await planOn(page, date, slotId, async () => {
    await tid(page, 'add-entry-search').fill(search);
    await tid(page, `add-entry-recipe-${id}`).click();
  });
}

async function planRestaurant(page: Page, date: string, slotId: string, id: string) {
  await planOn(page, date, slotId, async () => {
    await tid(page, 'add-entry-tab-restaurants').click();
    await tid(page, `add-entry-restaurant-${id}`).click();
  });
}

async function planActivity(page: Page, date: string, slotId: string, id: string, note = '') {
  await planOn(page, date, slotId, async () => {
    await tid(page, 'add-entry-tab-activities').click();
    await tid(page, `add-entry-activity-${id}`).click();
    if (note) await tid(page, 'add-entry-note').fill(note);
  });
}

/** Chooses a file in the picker the button opens. */
/**
 * Opens the window "Foto" with `opener` (spec 0039), chooses the file under "Datei wählen" and,
 * unless `apply` is false, takes it with "Übernehmen" once the preview shows it.
 */
async function pickFile(
  page: Page,
  opener: string,
  file: string | { name: string; mimeType: string; buffer: Buffer },
  options: { prefix: string; apply?: boolean },
): Promise<void> {
  await tid(page, opener).click();
  const chooser = page.waitForEvent('filechooser');
  await tid(page, `${options.prefix}-photo-window-file`).click();
  await (await chooser).setFiles(file);
  if (options.apply === false) return;
  await expect(tid(page, `${options.prefix}-photo-window-preview-new`)).toBeVisible(SYNC);
  await tid(page, `${options.prefix}-photo-window-apply`).click();
}

/** The image of an element shows an own photo (a blob: URL from the device's photo store). */
async function expectOwnPhoto(element: Locator): Promise<void> {
  await expect(element.locator('img').first()).toHaveAttribute('src', /^blob:/, SYNC);
}

async function json<T>(response: Response): Promise<T> {
  expect(response.ok, `${response.status} ${response.url}`).toBe(true);
  return (await response.json()) as T;
}

async function photoPathOf(table: 'activities' | 'recipes', id: string): Promise<string | null> {
  const token = await accessToken('enrico');
  const [row] = await json<{ photo_path: string | null }[]>(
    await supabaseFetch(`/rest/v1/${table}?select=photo_path&id=eq.${id}`, { token }),
  );
  return row?.photo_path ?? null;
}

const objectUrl = (objectPath: string) => `/storage/v1/object/${BUCKET}/${objectPath}`;

/** Downloads a stored photo through the Storage API; the status when it is refused. */
async function download(objectPath: string, token?: string): Promise<Uint8Array | number> {
  const response = await supabaseFetch(objectUrl(objectPath), { token });
  if (!response.ok) return response.status;
  return new Uint8Array(await response.arrayBuffer());
}

/** The JPEG segment markers up to the image data (APP1 = 0xe1 holds Exif and XMP). */
function jpegSegments(bytes: Uint8Array): number[] {
  const markers: number[] = [];
  let offset = 2;
  while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
    const marker = bytes[offset + 1] ?? 0;
    markers.push(marker);
    if (marker === 0xda) break;
    offset += 2 + (((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0));
  }
  return markers;
}

/** Width and height from the JPEG's frame header (SOF). */
function jpegSize(bytes: Uint8Array): { width: number; height: number } {
  let offset = 2;
  while (offset + 9 <= bytes.length && bytes[offset] === 0xff) {
    const marker = bytes[offset + 1] ?? 0;
    const length = ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return {
        height: ((bytes[offset + 5] ?? 0) << 8) | (bytes[offset + 6] ?? 0),
        width: ((bytes[offset + 7] ?? 0) << 8) | (bytes[offset + 8] ?? 0),
      };
    }
    offset += 2 + length;
  }
  throw new Error('no JPEG frame header');
}

const contains = (bytes: Uint8Array, text: string) =>
  Buffer.from(bytes).includes(text, 0, 'latin1');

test.beforeEach(async ({ context }) => {
  await stubMaps(context);
});

// ---------- REQ-001: three Tageszeiten ----------

test('AC-001: the calendar shows a day’s Tageszeiten in the order Vormittag, Mittag, Abend', async ({
  page,
}) => {
  await open(page, '/kalender');
  await expect(tid(page, 'calendar-view-week')).toHaveAttribute('aria-selected', 'true');
  // Today has Eislaufen in the morning, the leftovers at lunch and Lasagne in the evening.
  const day = dayBlock(page, TODAY);
  const tops: number[] = [];
  for (const name of ['Vormittag', 'Mittag', 'Abend']) {
    const caption = day.getByText(name, { exact: true });
    await expect(caption).toBeVisible();
    tops.push((await caption.boundingBox())?.y ?? -1);
  }
  expect(tops).toEqual([...tops].sort((a, b) => a - b));
  expect(await slotTitles(page, TODAY, SLOT_MORNING)).toEqual(['Eislaufen (Hohenschönhausen)']);
});

// ---------- REQ-002: the collection ----------

test('AC-004: "Aktivitäten" lists Eislaufen and Bouldern with picture, name and the last time', async ({
  page,
}) => {
  await open(page, '/kalender');
  await openManaged(page, 'activities');
  await expect(page).toHaveURL(/\/aktivitaeten/);
  for (const [id, name] of [
    [EISLAUFEN, 'Eislaufen'],
    [BOULDERN, 'Bouldern'],
  ] as const) {
    await expect(tid(page, `activity-${id}`)).toContainText(name);
    // No own photo yet: the placeholder symbol.
    await expect(tid(page, `activity-${id}-placeholder`)).toBeVisible();
  }
  await expect(tid(page, `activity-${BOULDERN}-last`)).toHaveText('Zuletzt: vor 12 Tagen · 3-mal');
  await expect(tid(page, `activity-${EISLAUFEN}-place`)).toHaveText('Eisstadion Hohenschönhausen');
  await expect(tid(page, 'activity-count')).toContainText('3');
  // The page has its own address: a reload keeps it.
  await page.reload();
  await expect(tid(page, `activity-${BOULDERN}`)).toBeVisible({ timeout: 30_000 });
});

test('AC-005: the household "Test" shows "Noch keine Aktivitäten" with "Aktivität anlegen"', async ({
  page,
}) => {
  await open(page, '/');
  await switchHousehold(page, seedIds['hh-test']);
  await openActivities(page);
  await expect(tid(page, 'activities-empty')).toContainText('Noch keine Aktivitäten');
  await expect(tid(page, 'activity-add')).toHaveText('Aktivität anlegen');
});

// ---------- REQ-006: what was done ----------

test('AC-016: Bouldern shows "Zuletzt: vor 12 Tagen · 3-mal" and the three past days in "Verlauf"', async ({
  page,
}) => {
  await open(page, '/aktivitaeten');
  await tid(page, `activity-${BOULDERN}`).click();
  // On the phone the activity has its own page inside the tabs: the tab bar stays.
  await expect(page).toHaveURL(new RegExp(`/aktivitaet/${BOULDERN}$`));
  await expect(tid(page, 'tab-kalender')).toBeVisible();
  await expect(tid(page, 'activity-title')).toHaveText('Bouldern');
  await expect(tid(page, 'activity-visits')).toHaveText('Zuletzt: vor 12 Tagen · 3-mal');
  for (const [index, ago] of [12, 30, 45].entries()) {
    const row = tid(page, `activity-history-${index}`);
    await expect(row).toContainText(formatLongDate(day(-ago)));
    await expect(row).toContainText(`vor ${ago} Tagen`);
  }
  // The planned day in three days is not "gemacht" yet.
  await expect(tid(page, 'activity-history-3')).toHaveCount(0);
});

// ---------- REQ-003: creating and editing ----------

test('AC-006: a Google Maps link fills in the place with coordinates; the name stays free', async ({
  page,
}) => {
  const name = `Eislaufen mit Freunden ${unique()}`;
  await open(page, '/aktivitaeten');
  await tid(page, 'activity-add').click();
  await tid(page, 'activity-start-path-create').click();
  await expect(tid(page, 'activity-sheet')).toBeVisible();
  await tid(page, 'activity-link').fill(
    'https://www.google.com/maps/place/Eisstadion+Hohensch%C3%B6nhausen/@52.55,13.5,17z',
  );
  await expect(tid(page, 'activity-search-name')).toHaveValue('Eisstadion Hohenschönhausen');
  await expect(tid(page, 'activity-link-ok')).toContainText('Koordinaten übernommen');
  await expect(tid(page, 'activity-name')).toHaveValue('');
  await tid(page, 'activity-name').fill(name);
  await tid(page, 'activity-save').click();

  await expect(tid(page, 'activity-title')).toHaveText(name);
  await expect(tid(page, 'activity-place')).toContainText('Eisstadion Hohenschönhausen');
  await tid(page, 'activity-route').click();
  expect(await routeUrl(page, 'route-google')).toContain('destination=52.55,13.5');
});

test('AC-007: saving without a name creates nothing and shows "Name fehlt"', async ({ page }) => {
  await open(page, '/aktivitaeten');
  const count = tid(page, 'activity-count');
  const before = await count.innerText();
  await tid(page, 'activity-add').click();
  await tid(page, 'activity-start-path-create').click();
  await tid(page, 'activity-save').click();
  await expect(tid(page, 'activity-name-error')).toHaveText('Name fehlt');
  await expect(tid(page, 'activity-sheet')).toBeVisible();
  await tid(page, 'activity-sheet-close').click();
  await expect(count).toHaveText(before);
});

test('AC-008: "bouldern" offers "Gibt es schon: Bouldern" with "Öffnen" instead of a copy', async ({
  page,
}) => {
  await open(page, '/aktivitaeten');
  const before = await tid(page, 'activity-count').innerText();
  await tid(page, 'activity-add').click();
  await tid(page, 'activity-start-path-create').click();
  await tid(page, 'activity-name').fill('bouldern');
  await expect(tid(page, 'activity-duplicate')).toContainText('Gibt es schon: Bouldern');
  await expect(tid(page, 'activity-duplicate-open')).toHaveText(/Öffnen/);
  await tid(page, 'activity-duplicate-open').click();
  await expect(tid(page, 'activity-title')).toHaveText('Bouldern');
  await back(page);
  await expect(tid(page, 'activity-count')).toHaveText(before);
});

// ---------- REQ-004: own photos ----------

test('AC-009: Enrico’s photo of Eislaufen shows on Nadja’s device; it is stored smaller and without location', async ({
  page,
  browser,
}) => {
  const original = new Uint8Array(readFileSync(GPS_PHOTO));
  // The fixture really carries the location the upload must drop.
  expect(jpegSegments(original)).toContain(0xe1);
  expect(contains(original, 'Exif')).toBe(true);
  expect(jpegSize(original)).toEqual({ width: 2400, height: 1800 });

  await open(page, activityRoute(page, EISLAUFEN));
  await expect(tid(page, 'activity-title')).toHaveText('Eislaufen');
  await expect(tid(page, 'activity-image-placeholder')).toBeVisible();
  await expect(tid(page, 'activity-photo-change')).toHaveText(/Foto hinzufügen/);
  await pickFile(page, 'activity-photo-change', GPS_PHOTO, { prefix: 'activity' });
  await expect(toastMessage(page)).toHaveText('Foto gespeichert', SYNC);
  // The photo appears once it is loaded (usePhoto with the React Compiler on).
  await expectOwnPhoto(tid(page, 'activity-image-photo'));
  await expect(tid(page, 'activity-photo-change')).toHaveText(/Foto ändern/);

  const nadja = await secondDevice(browser, 'nadja');
  await nadja.page.goto('/aktivitaeten');
  await expectOwnPhoto(tid(nadja.page, `activity-${EISLAUFEN}-photo`));
  await nadja.context.close();
  await page.bringToFront();

  // What is stored, downloaded with Nadja's session.
  const objectPath = await photoPathOf('activities', EISLAUFEN);
  expect(objectPath).toMatch(new RegExp(`^${DEMO}/activities/${EISLAUFEN}/[0-9a-f-]{36}\\.jpg$`));
  const stored = await download(objectPath ?? '', await accessToken('nadja'));
  if (typeof stored === 'number') throw new Error(`download refused: ${stored}`);
  expect(stored[0]).toBe(0xff);
  expect(stored[1]).toBe(0xd8);
  expect(jpegSegments(stored)).not.toContain(0xe1);
  expect(jpegSegments(stored)).not.toContain(0xed);
  expect(contains(stored, 'Exif')).toBe(false);
  expect(contains(stored, 'E2ECam')).toBe(false);
  expect(jpegSize(stored)).toEqual({ width: 1600, height: 1200 });
});

test('AC-010: a file that is no image or larger than 15 MB is not uploaded', async ({ page }) => {
  const uploads: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET' && request.url().includes('/storage/v1/object/')) {
      uploads.push(`${request.method()} ${request.url()}`);
    }
  });
  await open(page, activityRoute(page, BOULDERN));
  await expect(tid(page, 'activity-title')).toHaveText('Bouldern');
  for (const [file, message] of [
    [
      { name: 'notiz.txt', mimeType: 'text/plain', buffer: Buffer.from('Das ist kein Bild.') },
      'Das ist kein Bild',
    ],
    [
      {
        name: 'riesig.jpg',
        mimeType: 'image/jpeg',
        buffer: Buffer.alloc(15 * 1024 * 1024 + 1, 0xff),
      },
      'Dieses Bild können wir nicht verwenden',
    ],
  ] as const) {
    await pickFile(page, 'activity-photo-change', file, { prefix: 'activity', apply: false });
    await expect(tid(page, 'activity-photo-window-error')).toHaveText(message);
    await expect(tid(page, 'activity-photo-window-apply')).toBeDisabled();
    await tid(page, 'activity-photo-window-cancel').click();
  }
  await expect(tid(page, 'activity-image-placeholder')).toBeVisible();
  expect(uploads).toEqual([]);
  expect(await photoPathOf('activities', BOULDERN)).toBeNull();
});

test.describe('with the service worker', () => {
  test.use({ serviceWorkers: 'allow' });

  test('AC-011: offline the photos seen before still show; "Foto ändern" is greyed out', async ({
    page,
    context,
  }) => {
    await open(page, '/aktivitaeten');
    await expectOwnPhoto(tid(page, `activity-${EISLAUFEN}-photo`));
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    await expect
      .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
      .toBe(true);

    await setNetwork(context, false);
    await page.reload();
    await expect(tid(page, 'activities-screen')).toBeVisible({ timeout: 20_000 });
    await expectOwnPhoto(tid(page, `activity-${EISLAUFEN}-photo`));
    await tid(page, `activity-${EISLAUFEN}`).click();
    await expectOwnPhoto(tid(page, 'activity-image-photo'));
    await expect(tid(page, 'activity-photo-change')).toHaveText(/Foto ändern/);
    await expect(tid(page, 'activity-photo-change')).toBeDisabled();
    await expect(tid(page, 'activity-offline-hint')).toHaveText(
      'Offline – zum Bearbeiten brauchst du Netz',
    );
  });
});

test('AC-012: a member of another household cannot read, overwrite or delete a photo; nor can anyone signed out', async () => {
  const photo = new Uint8Array(readFileSync(GPS_PHOTO));
  const jpeg = { 'content-type': 'image/jpeg' };
  const enrico = await accessToken('enrico');
  const objectPath = `${DEMO}/activities/${SPIELEABEND}/${randomUUID()}.jpg`;
  const upload = (target: string, token?: string, method = 'POST', upsert = false) =>
    supabaseFetch(objectUrl(target), {
      method,
      token,
      body: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
      headers: { ...jpeg, ...(upsert ? { 'x-upsert': 'true' } : {}) },
    });
  const removeAll = async (target: string, token?: string) => {
    const response = await supabaseFetch(`/storage/v1/object/${BUCKET}`, {
      method: 'DELETE',
      token,
      body: { prefixes: [target] },
    });
    return response.ok ? ((await response.json()) as unknown[]).length : 0;
  };

  const stored = await supabaseFetch(objectUrl(objectPath), {
    method: 'POST',
    token: enrico,
    body: photo,
    headers: jpeg,
  });
  expect(stored.status, await stored.clone().text()).toBe(200);

  const email = `fremd-${unique()}@example.com`;
  const accountId = createAccount(email, 'Fremd (Test)');
  try {
    const foreign = await accessToken({ email });
    await rpc(foreign, 'create_household', {
      name: `Fremd ${unique()}`,
      starter: { areas: [], articles: [] },
    });
    for (const [who, token] of [
      ['member of another household', foreign],
      ['signed out', undefined],
    ] as const) {
      expect(typeof (await download(objectPath, token)), `${who}: read`).toBe('number');
      expect((await upload(objectPath, token, 'POST', true)).ok, `${who}: overwrite`).toBe(false);
      expect((await upload(objectPath, token, 'PUT')).ok, `${who}: replace`).toBe(false);
      expect(
        (await upload(`${DEMO}/activities/${SPIELEABEND}/${randomUUID()}.jpg`, token)).ok,
        `${who}: new file in the household's folder`,
      ).toBe(false);
      expect(await removeAll(objectPath, token), `${who}: delete`).toBe(0);
      const single = await supabaseFetch(objectUrl(objectPath), { method: 'DELETE', token });
      expect(single.ok, `${who}: delete one`).toBe(false);
    }
    // Still there, unchanged, for the household.
    expect(await download(objectPath, await accessToken('nadja'))).toEqual(photo);
  } finally {
    deleteAccount(accountId);
    await removeAll(objectPath, enrico);
  }
  expect(await download(objectPath, enrico)).not.toEqual(photo);
});

// ---------- REQ-005: in the plan ----------

test('AC-013: "Eislaufen (Hohenschönhausen)" on a free Saturday morning; the pantry check does not offer it', async ({
  page,
}) => {
  await open(page, '/kalender');
  await showPlanWeek(page, SATURDAY);
  expect(await slotTitles(page, SATURDAY, SLOT_MORNING)).toEqual([]);
  await planActivity(page, SATURDAY, SLOT_MORNING, EISLAUFEN, 'Hohenschönhausen');

  const row = dayBlock(page, SATURDAY)
    .locator(PLAN_ENTRY)
    .filter({ hasText: 'Eislaufen (Hohenschönhausen)' });
  await expect(row).toHaveCount(1);
  expect(await slotTitles(page, SATURDAY, SLOT_MORNING)).toEqual(['Eislaufen (Hohenschönhausen)']);
  const entryId = ((await row.getAttribute('data-testid')) ?? '').replace(/^entry-/, '');

  // Activities never appear in "Was soll auf die Liste?" (spec 0006, AC-049).
  await tid(page, 'plan-to-list').click();
  await expect(tid(page, 'pantry-check-sheet')).toContainText('Was soll auf die Liste?');
  await expect(page.locator(`[data-testid="pick-entry-${entryId}"]${ACTIVE}`)).toHaveCount(0);
});

test('AC-014: "Route" at Eislaufen on "Heute" opens Apple Karten or Google Maps at the place', async ({
  page,
}) => {
  await open(page, '/');
  const route = tid(page, `today-route-${EISLAUFEN_TODAY}`);
  await route.click();
  await expect(tid(page, 'route-sheet')).toContainText('Eisstadion Hohenschönhausen');
  await expect(tid(page, 'route-apple')).toHaveText(/Apple Karten/);
  await expect(tid(page, 'route-google')).toHaveText(/Google Maps/);
  expect(await routeUrl(page, 'route-apple')).toContain('daddr=52.55,13.5');
  await route.click();
  expect(await routeUrl(page, 'route-google')).toContain('destination=52.55,13.5');
});

test('AC-015: Spieleabend has no place, so neither its page nor its plan entry has "Route"', async ({
  page,
}) => {
  await open(page, activityRoute(page, SPIELEABEND));
  await expect(tid(page, 'activity-title')).toHaveText('Spieleabend');
  await expect(tid(page, 'activity-plan')).toBeVisible();
  await expect(tid(page, 'activity-route')).toHaveCount(0);

  await nav(page, 'kalender');
  await showPlanWeek(page, FREE_LUNCH);
  await planActivity(page, FREE_LUNCH, SLOT_LUNCH, SPIELEABEND);
  await dayBlock(page, FREE_LUNCH).locator(PLAN_ENTRY).filter({ hasText: 'Spieleabend' }).click();
  await expect(tid(page, 'entry-sheet')).toBeVisible();
  await expect(tid(page, 'entry-open-activity')).toBeVisible();
  await expect(tid(page, 'entry-route')).toHaveCount(0);
  await tid(page, 'entry-done').click();

  // With a place there is one (Eislaufen this morning).
  await expect(page.locator('[data-testid^="day-2"]:visible').first()).toBeVisible();
  if (!(await tid(page, `day-${TODAY}`).isVisible())) await tid(page, 'week-today').click();
  await tid(page, `entry-${EISLAUFEN_TODAY}`).click();
  await expect(tid(page, 'entry-route')).toBeVisible();
});

test('AC-019: "Heute geplant" shows Eislaufen, Lasagne and Trattoria Da Enzo in the order of the day, each with its kind', async ({
  page,
}) => {
  await open(page, '/kalender');
  await planRestaurant(page, TODAY, SLOT_DINNER, seedIds['rest-enzo']);
  await nav(page, 'index');
  const meals = tid(page, 'today-meals');
  await expect(meals).toContainText('Heute geplant');
  const cards = meals.locator(`[data-testid^="today-meal-"]${ACTIVE}`);
  await expect(cards.filter({ hasText: 'Trattoria Da Enzo' })).toHaveCount(1);
  const titles = await cards.allInnerTexts();
  const at = (text: string) => titles.findIndex((title) => title.includes(text));
  const order = [at('Eislaufen (Hohenschönhausen)'), at('Lasagne'), at('Trattoria Da Enzo')];
  expect(order.every((index) => index >= 0)).toBe(true);
  expect(order).toEqual([...order].sort((a, b) => a - b));

  const badgeOf = async (text: string) => {
    const id = (await cards.filter({ hasText: text }).getAttribute('data-testid'))?.replace(
      'today-meal-',
      '',
    );
    return tid(page, `today-badge-${id}`);
  };
  await expect(await badgeOf('Eislaufen (Hohenschönhausen)')).toHaveText('Aktivität');
  await expect(await badgeOf('Lasagne')).toHaveText('Rezept');
  await expect(await badgeOf('Trattoria Da Enzo')).toHaveText('Restaurant');
});

test('AC-017: Nadja’s photo of Spaghetti Bolognese shows on Enrico’s device in the recipes, the recipe and the Übersicht', async ({
  page,
  browser,
}) => {
  await open(page, '/kalender');
  await planRecipe(page, TODAY, SLOT_LUNCH, 'Bolognese', BOLOGNESE);
  expect(await photoPathOf('recipes', BOLOGNESE)).toBeNull();

  const nadja = await secondDevice(browser, 'nadja');
  await nadja.page.goto(`/rezept/${BOLOGNESE}`);
  await expect(tid(nadja.page, 'recipe-detail')).toBeVisible({ timeout: 30_000 });
  // "Foto ändern" stands under the photo (spec 0054, AC-008).
  await pickFile(nadja.page, 'recipe-photo-change', GPS_PHOTO, { prefix: 'recipe' });
  await expectOwnPhoto(tid(nadja.page, 'recipe-photo'));
  await nadja.context.close();
  await page.bringToFront();
  expect(await photoPathOf('recipes', BOLOGNESE)).toMatch(new RegExp(`^${DEMO}/recipes/`));

  // Enrico's device learns the photo with the next sync (the calendar rows have no photo).
  await nav(page, 'index');
  await expectOwnPhoto(
    tid(page, 'today-meals')
      .locator('[data-testid^="today-meal-"]')
      .filter({ hasText: 'Spaghetti Bolognese' }),
  );
  await nav(page, 'rezepte');
  await tid(page, 'recipe-search').fill('Bolognese');
  await expectOwnPhoto(tid(page, `recipe-card-${BOLOGNESE}`));
  await tid(page, `recipe-card-${BOLOGNESE}`).click();
  await expectOwnPhoto(tid(page, 'recipe-photo'));
});

test('AC-018: "Foto entfernen" on Lasagne shows the sample photo again and deletes the upload', async ({
  page,
}) => {
  await open(page, `/rezept/${LASAGNE}`);
  const image = tid(page, 'recipe-photo').locator('img').first();
  const sample = await image.getAttribute('src');
  expect(sample).not.toMatch(/^blob:/);
  await pickFile(page, 'recipe-photo-change', GPS_PHOTO, { prefix: 'recipe' });
  await expectOwnPhoto(tid(page, 'recipe-photo'));
  const objectPath = await photoPathOf('recipes', LASAGNE);
  const enrico = await accessToken('enrico');
  expect(typeof (await download(objectPath ?? '', enrico))).not.toBe('number');

  // "Foto entfernen" is in the window "Foto", not in ⋯ (spec 0054, AC-010).
  await tid(page, 'recipe-photo-change').click();
  await tid(page, 'recipe-photo-remove').click();
  await tid(page, 'confirm-remove-photo-confirm').click();
  await expect(image).toHaveAttribute('src', sample ?? '', SYNC);
  await tid(page, 'recipe-photo-change').click();
  await expect(page.locator(`[data-testid="recipe-photo-remove"]${ACTIVE}`)).toHaveCount(0);
  await page.keyboard.press('Escape');
  expect(await photoPathOf('recipes', LASAGNE)).toBeNull();
  await expect.poll(async () => typeof (await download(objectPath ?? '', enrico))).toBe('number');
});

// ---------- REQ-007: ratings and favourites ----------

test('AC-020: Nadja rates Bouldern 4 stars and favours it; Enrico sees her rating, his own stays empty', async ({
  page,
  browser,
}) => {
  const nadja = await secondDevice(browser, 'nadja');
  await nadja.page.goto(activityRoute(nadja.page, BOULDERN));
  await expect(tid(nadja.page, 'activity-title')).toHaveText('Bouldern', SYNC);
  await expect(tid(nadja.page, 'activity-favorite')).toHaveAttribute('aria-pressed', 'false');
  await tid(nadja.page, 'activity-stars-4').click();
  await tid(nadja.page, 'activity-favorite').click();
  await expect(tid(nadja.page, 'activity-favorite')).toHaveAttribute('aria-pressed', 'true');
  await nadja.page.goto('/aktivitaeten');
  await expect(tid(nadja.page, `activity-${BOULDERN}-stars`)).toHaveAttribute(
    'aria-label',
    '4 von 5 Sternen',
  );
  await expect(tid(nadja.page, `activity-${BOULDERN}-favorite`)).toBeVisible();
  await nadja.context.close();

  await page.bringToFront();
  await open(page, '/aktivitaeten');
  await expect(tid(page, `activity-${BOULDERN}`)).toBeVisible();
  await expect(tid(page, `activity-${BOULDERN}-favorite`)).toHaveCount(0);
  await expect(tid(page, `activity-${BOULDERN}-stars`)).toHaveCount(0);
  await tid(page, `activity-${BOULDERN}`).click();
  // Spec 0031, AC-086: the ratings as on a recipe, "Du" once and Nadja's stars to look at.
  const ratings = tid(page, 'activity-stars-all');
  await expect(ratings).toContainText(NADJA);
  await expect(tid(page, `activity-stars-member-${seedIds['m-nadja']}`)).toHaveAttribute(
    'aria-label',
    '4 von 5 Sternen',
    SYNC,
  );
  await expect(tid(page, `activity-stars-member-${seedIds['m-enrico']}`)).toHaveCount(0);
  await expect(ratings.getByText('Du', { exact: true })).toHaveCount(1);
});

// ---------- REQ-001 order and REQ-008: create while planning ----------

test('AC-002: in one Tageszeit activities come first, then recipes, then restaurants', async ({
  page,
}) => {
  await open(page, '/kalender');
  await showPlanWeek(page, SATURDAY);
  // The seed may already plan something on that evening (e.g. the collection „Grillabend“,
  // depending on today's date); only the order of the four entries planned here matters.
  const planned = ['Bouldern', 'Lasagne', 'Gemischter Salat', 'Trattoria Da Enzo'];
  await planRecipe(page, SATURDAY, SLOT_DINNER, 'Lasagne', LASAGNE);
  await planRecipe(
    page,
    SATURDAY,
    SLOT_DINNER,
    'Gemischter Salat',
    seedIds['rec-gemischter-salat'],
  );
  await planRestaurant(page, SATURDAY, SLOT_DINNER, seedIds['rest-enzo']);
  await planActivity(page, SATURDAY, SLOT_DINNER, BOULDERN);
  await expect
    .poll(async () =>
      (await slotTitles(page, SATURDAY, SLOT_DINNER)).filter(
        (title) => title !== null && planned.includes(title),
      ),
    )
    .toEqual(planned);
});

test('AC-023, AC-021: "Neue Aktivität" without a name creates nothing; "Klettern im Wald" is created and planned', async ({
  page,
}) => {
  const name = `Klettern im Wald ${unique()}`;
  const token = await accessToken('enrico');
  const activityCount = async () =>
    (
      await json<unknown[]>(
        await supabaseFetch(`/rest/v1/activities?select=id&household_id=eq.${DEMO}`, { token }),
      )
    ).length;
  const before = await activityCount();
  await open(page, '/kalender');
  await showPlanWeek(page, SATURDAY);
  const planned = await slotTitles(page, SATURDAY, SLOT_DINNER);

  await tid(page, `add-${SATURDAY}`).click();
  await tid(page, 'add-entry-tab-activities').click();
  await tid(page, 'add-entry-new-activity').click();
  await tid(page, 'add-entry-new-activity-save').click();
  await expect(tid(page, 'activity-name-error')).toHaveText('Name fehlt');
  await expect(tid(page, 'add-entry-sheet')).toBeVisible();
  expect(await activityCount()).toBe(before);

  await tid(page, 'activity-name').fill(name);
  await tid(page, 'add-entry-new-activity-save').click();
  await expect(toastMessage(page)).toHaveText(`„${name}“ angelegt und eingeplant`);
  // A day without a Tageszeit plans in the evening (spec 0010, REQ-007).
  await expect.poll(() => slotTitles(page, SATURDAY, SLOT_DINNER)).toContain(name);
  expect(await slotTitles(page, SATURDAY, SLOT_DINNER)).toHaveLength(planned.length + 1);
  expect(await activityCount()).toBe(before + 1);
  await openManaged(page, 'activities');
  await expect(tid(page, 'activities-screen')).toContainText(name);
});

test('AC-022: a new recipe and a new restaurant from a map link, created on Sunday evening', async ({
  page,
}) => {
  const soup = `Kürbissuppe ${unique()}`;
  const place = { name: 'Café Kurzlink' };
  await open(page, '/kalender');
  await showPlanWeek(page, SUNDAY);

  await tid(page, `add-${SUNDAY}`).click();
  await tid(page, 'add-entry-search').fill(soup);
  await tid(page, 'add-entry-new-recipe').click();
  await expect(tid(page, 'new-recipe-title')).toHaveValue(soup);
  await tid(page, 'add-entry-new-recipe-save').click();
  await expect(toastMessage(page)).toHaveText(`„${soup}“ angelegt und eingeplant`);
  await expect(dayBlock(page, SUNDAY).locator(PLAN_ENTRY).filter({ hasText: soup })).toHaveCount(1);

  // A short link, resolved by the (stubbed) edge function before saving.
  await tid(page, `add-${SUNDAY}`).click();
  await tid(page, 'add-entry-new-restaurant').click();
  await tid(page, 'restaurant-link').fill(`https://maps.app.goo.gl/${unique()}`);
  await expect(tid(page, 'restaurant-link-short')).toBeVisible();
  await tid(page, 'add-entry-new-restaurant-save').click();
  await expect(toastMessage(page)).toHaveText(`„${place.name}“ angelegt und eingeplant`);
  await expect.poll(() => slotTitles(page, SUNDAY, SLOT_DINNER)).toEqual([soup, place.name]);

  await nav(page, 'rezepte');
  await tid(page, 'recipe-search').fill(soup);
  await expect(tid(page, 'recipes-screen')).toContainText(soup);
  await tid(page, 'food-switch-restaurants').click();
  await expect(tid(page, 'restaurants-screen')).toContainText(place.name);
});

// ---------- Wide screens ----------

test.describe('at desktop width', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('AC-001: the week grid has one row per Tageszeit: Vormittag, Mittag, Abend', async ({
    page,
  }) => {
    await open(page, '/kalender');
    const tops: number[] = [];
    for (const slotId of [SLOT_MORNING, SLOT_LUNCH, SLOT_DINNER]) {
      tops.push((await tid(page, `add-${TODAY}-${slotId}`).boundingBox())?.y ?? -1);
    }
    expect(tops).toEqual([...tops].sort((a, b) => a - b));
    for (const name of ['Vormittag', 'Mittag', 'Abend']) {
      await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
    }
    await expect(tid(page, `entry-${EISLAUFEN_TODAY}`)).toContainText('Eislaufen');
  });

  test('AC-004, AC-016: an activity opens next to the list (spec 0024, AC-026); a deep link keeps the sidebar', async ({
    page,
  }) => {
    await open(page, '/aktivitaeten');
    await tid(page, `activity-${BOULDERN}`).click();
    await expect(page).toHaveURL(new RegExp(`/aktivitaeten\\?aktivitaet=${BOULDERN}$`));
    await expect(tid(page, 'activities-split')).toBeVisible();
    await expect(tid(page, 'activity-visits')).toHaveText('Zuletzt: vor 12 Tagen · 3-mal');

    await page.goto(`/aktivitaet/${EISLAUFEN}`);
    await expect(tid(page, 'activity-title')).toHaveText('Eislaufen', SYNC);
    await expect(tid(page, 'nav-kalender')).toBeVisible();
  });
});

// ---------- Deep links (security check of spec 0004) ----------

test('a deep link with a name of Object.prototype shows "nicht gefunden" instead of breaking the page', async ({
  page,
}) => {
  // The pageErrors fixture fails the test on any uncaught error in the page.
  for (const [route, notFound] of [
    ['/aktivitaet/constructor', 'activity-not-found'],
    ['/aktivitaet/__proto__', 'activity-not-found'],
    ['/rezept/toString', 'recipe-not-found'],
    ['/restaurant/constructor', 'restaurant-not-found'],
  ] as const) {
    await open(page, route);
    await expect(tid(page, notFound), route).toBeVisible();
  }
});

test('spec 0040 AC-015: "Aus diesem Foto" sends the own photo (a blob: URL) under the CSP of the build', async ({
  page,
}) => {
  const blocked: string[] = [];
  page.on('console', (message) => {
    if (/Content Security Policy/i.test(message.text())) blocked.push(message.text());
  });
  // The image model is replaced here: the test is about reading the shown photo, not about cost.
  const fake = readFileSync(GPS_PHOTO).toString('base64');
  let sentImage = false;
  await page.route('**/functions/v1/ai-image', async (route) => {
    const body = route.request().postDataJSON() as { image?: string };
    sentImage = typeof body.image === 'string' && body.image.length > 0;
    await route.fulfill({ json: { images: [fake], failed: 0 } });
  });

  await open(page, activityRoute(page, EISLAUFEN));
  await pickFile(page, 'activity-photo-change', GPS_PHOTO, { prefix: 'activity' });
  await expect(toastMessage(page)).toHaveText('Foto gespeichert', SYNC);
  await expectOwnPhoto(tid(page, 'activity-image-photo'));

  await tid(page, 'activity-photo-change').click();
  await page.getByRole('tab', { name: 'KI' }).click();
  await tid(page, 'activity-photo-window-ai-from-photo').click();
  await tid(page, 'activity-photo-window-ai-create').click();
  await expect(tid(page, 'activity-photo-window-ai-variant-0')).toBeVisible(SYNC);
  expect(sentImage).toBe(true);
  expect(blocked).toEqual([]);
});
