import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Locator, Page } from '@playwright/test';
import { formatLongDate } from '@housekeeping/core';

import {
  ACTIVE,
  NADJA,
  PLAN_ENTRY,
  SLOT_DINNER,
  SLOT_LUNCH,
  SLOT_MORNING,
  TODAY,
  accessToken,
  createAccount,
  day,
  deleteAccount,
  expect,
  freshSeed,
  isPhone,
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
  tidPrefix,
  toastMessage,
  unique,
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

/** Phone: the activity's own page in the plan tab; wider: collection and activity side by side. */
function activityRoute(page: Page, id: string): string {
  return isPhone(page) ? `/plan/aktivitaet/${id}` : `/plan?view=activities&aid=${id}`;
}

async function openActivities(page: Page): Promise<void> {
  await nav(page, 'plan');
  await tid(page, 'plan-view-activities').click();
  await expect(tid(page, 'activities-screen')).toBeVisible();
  await settle(page);
}

/** Everything one Tageszeit of one day shows: its label, its entries and "hinzufügen". */
function slotBox(page: Page, date: string, slotId: string): Locator {
  return tid(page, `add-${date}-${slotId}`).locator(isPhone(page) ? 'xpath=../..' : 'xpath=..');
}

/** The titles of the entries in one Tageszeit, top to bottom. */
function slotTitles(page: Page, date: string, slotId: string): Promise<(string | null)[]> {
  return slotBox(page, date, slotId)
    .locator(PLAN_ENTRY)
    .evaluateAll((rows) => rows.map((row) => row.getAttribute('aria-label')));
}

/** Opens the add sheet of one Tageszeit (the plan shows the week of `date`). */
async function addTo(page: Page, date: string, slotId: string): Promise<void> {
  await tid(page, `add-${date}-${slotId}`).click();
  await expect(tid(page, 'add-entry-sheet')).toBeVisible();
}

async function chooseMode(page: Page, mode: 'recipe' | 'restaurant' | 'activity'): Promise<void> {
  await tid(page, `add-entry-mode-${mode}`).click();
  await expect(tid(page, `add-entry-mode-${mode}`)).toHaveAttribute('aria-pressed', 'true');
}

async function planRecipe(page: Page, date: string, slotId: string, search: string, id: string) {
  await addTo(page, date, slotId);
  await tid(page, 'add-entry-search').fill(search);
  await tid(page, `add-entry-recipe-${id}`).click();
  await tid(page, 'add-entry-save').click();
  await expect(tid(page, 'add-entry-sheet')).toBeHidden();
}

async function planRestaurant(page: Page, date: string, slotId: string, id: string) {
  await addTo(page, date, slotId);
  await chooseMode(page, 'restaurant');
  await tid(page, `add-entry-restaurant-${id}`).click();
  await tid(page, 'add-entry-restaurant-save').click();
  await expect(tid(page, 'add-entry-sheet')).toBeHidden();
}

async function planActivity(page: Page, date: string, slotId: string, id: string, note = '') {
  await addTo(page, date, slotId);
  await chooseMode(page, 'activity');
  await tid(page, `add-entry-activity-${id}`).click();
  if (note) await tid(page, 'add-entry-activity-note').fill(note);
  await tid(page, 'add-entry-activity-save').click();
  await expect(tid(page, 'add-entry-sheet')).toBeHidden();
}

/** Chooses a file in the picker the button opens. */
async function pickFile(
  page: Page,
  button: string,
  file: string | { name: string; mimeType: string; buffer: Buffer },
): Promise<void> {
  const chooser = page.waitForEvent('filechooser');
  await tid(page, button).click();
  await (await chooser).setFiles(file);
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

test('AC-001: "Plan" shows each day with Vormittag, Mittag and Abend in this order', async ({
  page,
}) => {
  await open(page, '/plan');
  await expect(tid(page, 'screen-title')).toHaveText('Plan');
  await expect(tid(page, 'plan-view-week')).toHaveAttribute('aria-checked', 'true');
  await expect(tid(page, 'plan-view-activities')).toHaveText('Aktivitäten');
  const tops: number[] = [];
  for (const [slotId, name] of [
    [SLOT_MORNING, 'Vormittag'],
    [SLOT_LUNCH, 'Mittag'],
    [SLOT_DINNER, 'Abend'],
  ] as const) {
    await expect(slotBox(page, TODAY, slotId)).toContainText(name);
    tops.push((await tid(page, `add-${TODAY}-${slotId}`).boundingBox())?.y ?? -1);
  }
  expect(tops).toEqual([...tops].sort((a, b) => a - b));
  expect(await slotTitles(page, TODAY, SLOT_MORNING)).toEqual(['Eislaufen (Hohenschönhausen)']);
});

// ---------- REQ-002: the collection ----------

test('AC-004: "Aktivitäten" lists Eislaufen and Bouldern with picture, name and the last time', async ({
  page,
}) => {
  await open(page, '/plan');
  await tid(page, 'plan-view-activities').click();
  await expect(page).toHaveURL(/view=activities/);
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
  // The side lives in the URL: a reload keeps it.
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
  await open(page, '/plan?view=activities');
  await tid(page, `activity-${BOULDERN}`).click();
  // On the phone the activity has its own page inside the tabs: the tab bar stays.
  await expect(page).toHaveURL(new RegExp(`/plan/aktivitaet/${BOULDERN}$`));
  await expect(tid(page, 'tab-plan')).toBeVisible();
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
  await open(page, '/plan?view=activities');
  await tid(page, 'activity-add').click();
  await expect(tid(page, 'activity-sheet')).toBeVisible();
  await tid(page, 'activity-link').fill(
    'https://www.google.com/maps/place/Eisstadion+Hohensch%C3%B6nhausen/@52.55,13.5,17z',
  );
  await expect(tid(page, 'activity-place-name')).toHaveValue('Eisstadion Hohenschönhausen');
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
  await open(page, '/plan?view=activities');
  const count = tid(page, 'activity-count');
  const before = await count.innerText();
  await tid(page, 'activity-add').click();
  await tid(page, 'activity-save').click();
  await expect(tid(page, 'activity-name-error')).toHaveText('Name fehlt');
  await expect(tid(page, 'activity-sheet')).toBeVisible();
  await tid(page, 'activity-sheet-close').click();
  await expect(count).toHaveText(before);
});

test('AC-008: "bouldern" offers "Gibt es schon: Bouldern" with "Öffnen" instead of a copy', async ({
  page,
}) => {
  await open(page, '/plan?view=activities');
  const before = await tid(page, 'activity-count').innerText();
  await tid(page, 'activity-add').click();
  await tid(page, 'activity-name').fill('bouldern');
  await expect(tid(page, 'activity-duplicate')).toContainText('Gibt es schon: Bouldern');
  await expect(tid(page, 'activity-duplicate-open')).toHaveText(/Öffnen/);
  await tid(page, 'activity-duplicate-open').click();
  await expect(tid(page, 'activity-title')).toHaveText('Bouldern');
  await nav(page, 'plan');
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
  await pickFile(page, 'activity-photo-change', GPS_PHOTO);
  await expect(toastMessage(page)).toHaveText('Foto gespeichert', SYNC);
  // The photo appears once it is loaded (usePhoto with the React Compiler on).
  await expectOwnPhoto(tid(page, 'activity-image-photo'));
  await expect(tid(page, 'activity-photo-change')).toHaveText(/Foto ändern/);

  const nadja = await secondDevice(browser, 'nadja');
  await nadja.page.goto('/plan?view=activities');
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
  for (const file of [
    { name: 'notiz.txt', mimeType: 'text/plain', buffer: Buffer.from('Das ist kein Bild.') },
    {
      name: 'riesig.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.alloc(15 * 1024 * 1024 + 1, 0xff),
    },
  ]) {
    await pickFile(page, 'activity-photo-change', file);
    await expect(tid(page, 'activity-photo-error')).toHaveText(
      'Dieses Bild können wir nicht verwenden',
    );
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
    await open(page, '/plan?view=activities');
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

test('AC-013: "Eislaufen (Hohenschönhausen)" on a free Saturday morning, with its photo; the pantry check takes nothing', async ({
  page,
}) => {
  await open(page, '/plan');
  await showPlanWeek(page, SATURDAY);
  expect(await slotTitles(page, SATURDAY, SLOT_MORNING)).toEqual([]);
  await planActivity(page, SATURDAY, SLOT_MORNING, EISLAUFEN, 'Hohenschönhausen');
  await expect(toastMessage(page)).toContainText('Eislaufen (Hohenschönhausen)');

  const row = slotBox(page, SATURDAY, SLOT_MORNING).locator(PLAN_ENTRY);
  await expect(row).toHaveCount(1);
  await expect(row).toHaveAttribute('aria-label', 'Eislaufen (Hohenschönhausen)');
  await expect(row).toContainText('Aktivität');
  // The photo of AC-009.
  await expectOwnPhoto(row);

  await tid(page, 'plan-to-list').click();
  for (const chip of await tidPrefix(page, 'pc-day-').all()) {
    const id = await chip.getAttribute('data-testid');
    const selected = (await chip.getAttribute('aria-selected')) === 'true';
    if ((id === `pc-day-${SATURDAY}`) !== selected) await chip.click();
  }
  await expect(tid(page, `pc-day-${SATURDAY}`)).toHaveAttribute('aria-selected', 'true');
  await expect(tid(page, 'pc-dishes')).toHaveText('Noch kein Gericht gewählt.');
  await expect(tid(page, 'pc-next')).toBeDisabled();
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

  await nav(page, 'plan');
  await tid(page, 'plan-view-week').click();
  await showPlanWeek(page, FREE_LUNCH);
  await planActivity(page, FREE_LUNCH, SLOT_LUNCH, SPIELEABEND);
  await slotBox(page, FREE_LUNCH, SLOT_LUNCH)
    .locator(PLAN_ENTRY)
    .filter({ hasText: 'Spieleabend' })
    .click();
  await expect(tid(page, 'entry-sheet')).toBeVisible();
  await expect(tid(page, 'entry-open-activity')).toBeVisible();
  await expect(tid(page, 'entry-route')).toHaveCount(0);
  await tid(page, 'entry-sheet-close').click();

  // With a place there is one (Eislaufen this morning).
  await tid(page, 'week-today').click();
  await slotBox(page, TODAY, SLOT_MORNING).locator(PLAN_ENTRY).first().click();
  await expect(tid(page, 'entry-route')).toBeVisible();
});

test('AC-019: "Heute geplant" shows Eislaufen, Lasagne and Trattoria Da Enzo in the order of the day, each with its kind', async ({
  page,
}) => {
  await open(page, '/plan');
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

test('AC-017: Nadja’s photo of Spaghetti Bolognese shows on Enrico’s device in the recipes, the recipe, "Heute" and the plan', async ({
  page,
  browser,
}) => {
  await open(page, '/plan');
  await planRecipe(page, TODAY, SLOT_LUNCH, 'Bolognese', BOLOGNESE);
  expect(await photoPathOf('recipes', BOLOGNESE)).toBeNull();

  const nadja = await secondDevice(browser, 'nadja');
  await nadja.page.goto(`/rezept/${BOLOGNESE}`);
  await expect(tid(nadja.page, 'recipe-detail')).toBeVisible({ timeout: 30_000 });
  await pickFile(nadja.page, 'recipe-photo-change', GPS_PHOTO);
  await expect(tid(nadja.page, 'recipe-photo-remove')).toBeVisible(SYNC);
  await expectOwnPhoto(tid(nadja.page, 'recipe-detail'));
  await nadja.context.close();
  await page.bringToFront();
  expect(await photoPathOf('recipes', BOLOGNESE)).toMatch(new RegExp(`^${DEMO}/recipes/`));

  // Enrico's device learns the photo with the next sync.
  const lunch = slotBox(page, TODAY, SLOT_LUNCH)
    .locator(PLAN_ENTRY)
    .filter({ hasText: 'Spaghetti Bolognese' });
  await expectOwnPhoto(lunch);
  await nav(page, 'index');
  await expectOwnPhoto(
    tid(page, 'today-meals')
      .locator('[data-testid^="today-meal-"]')
      .filter({ hasText: 'Spaghetti Bolognese' }),
  );
  await nav(page, 'rezepte');
  await expectOwnPhoto(tid(page, `recipe-card-${BOLOGNESE}`));
  await tid(page, `recipe-card-${BOLOGNESE}`).click();
  await expectOwnPhoto(tid(page, 'recipe-detail'));
});

test('AC-018: "Foto entfernen" on Lasagne shows the sample photo again and deletes the upload', async ({
  page,
}) => {
  await open(page, `/rezept/${LASAGNE}`);
  const image = tid(page, 'recipe-detail').locator('img').first();
  const sample = await image.getAttribute('src');
  expect(sample).not.toMatch(/^blob:/);
  await pickFile(page, 'recipe-photo-change', GPS_PHOTO);
  await expect(tid(page, 'recipe-photo-remove')).toBeVisible(SYNC);
  await expectOwnPhoto(tid(page, 'recipe-detail'));
  const objectPath = await photoPathOf('recipes', LASAGNE);
  const enrico = await accessToken('enrico');
  expect(typeof (await download(objectPath ?? '', enrico))).not.toBe('number');

  await tid(page, 'recipe-photo-remove').click();
  await expect(tid(page, 'recipe-photo-remove')).toHaveCount(0, SYNC);
  await expect(image).toHaveAttribute('src', sample ?? '');
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
  await nadja.page.goto('/plan?view=activities');
  await expect(tid(nadja.page, `activity-${BOULDERN}-stars`)).toHaveAttribute(
    'aria-label',
    '4 von 5 Sternen',
  );
  await expect(tid(nadja.page, `activity-${BOULDERN}-favorite`)).toBeVisible();
  await nadja.context.close();

  await page.bringToFront();
  await open(page, '/plan?view=activities');
  await expect(tid(page, `activity-${BOULDERN}`)).toBeVisible();
  await expect(tid(page, `activity-${BOULDERN}-favorite`)).toHaveCount(0);
  await expect(tid(page, `activity-${BOULDERN}-stars`)).toHaveCount(0);
  await tid(page, `activity-${BOULDERN}`).click();
  const ofNadja = tid(page, `activity-rating-${seedIds['m-nadja']}`);
  await expect(ofNadja).toContainText(NADJA);
  await expect(ofNadja.locator('[aria-label="4 von 5 Sternen"]')).toBeVisible(SYNC);
  await expect(ofNadja).toContainText('Favorit');
  await expect(tid(page, `activity-rating-${seedIds['m-enrico']}`)).toContainText('noch keine');
});

// ---------- REQ-001 order and REQ-008: create while planning ----------

test('AC-002: in one Tageszeit activities come first, then recipes, then restaurants', async ({
  page,
}) => {
  await open(page, '/plan');
  await showPlanWeek(page, SATURDAY);
  expect(await slotTitles(page, SATURDAY, SLOT_DINNER)).toEqual([]);
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
    .poll(() => slotTitles(page, SATURDAY, SLOT_DINNER))
    .toEqual(['Bouldern', 'Lasagne', 'Gemischter Salat', 'Trattoria Da Enzo']);
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
  await open(page, '/plan');
  await showPlanWeek(page, SATURDAY);
  const planned = await slotTitles(page, SATURDAY, SLOT_MORNING);

  await addTo(page, SATURDAY, SLOT_MORNING);
  await chooseMode(page, 'activity');
  await tid(page, 'add-entry-new-activity').click();
  await tid(page, 'add-entry-new-activity-save').click();
  await expect(tid(page, 'activity-name-error')).toHaveText('Name fehlt');
  await expect(tid(page, 'add-entry-sheet')).toBeVisible();
  expect(await activityCount()).toBe(before);
  expect(await slotTitles(page, SATURDAY, SLOT_MORNING)).toEqual(planned);

  await tid(page, 'activity-name').fill(name);
  await tid(page, 'add-entry-new-activity-save').click();
  await expect(toastMessage(page)).toHaveText(`„${name}“ angelegt und eingeplant`);
  await expect.poll(() => slotTitles(page, SATURDAY, SLOT_MORNING)).toEqual([...planned, name]);
  expect(await activityCount()).toBe(before + 1);
  await tid(page, 'plan-view-activities').click();
  await expect(tid(page, 'activities-screen')).toContainText(name);
});

test('AC-022: a new recipe and a new restaurant from a map link, created on Sunday evening', async ({
  page,
}) => {
  const soup = `Kürbissuppe ${unique()}`;
  const place = { name: 'Café Kurzlink' };
  await open(page, '/plan');
  await showPlanWeek(page, SUNDAY);

  await addTo(page, SUNDAY, SLOT_DINNER);
  await tid(page, 'add-entry-new-recipe').click();
  await tid(page, 'new-recipe-title').fill(soup);
  await tid(page, 'add-entry-new-recipe-save').click();
  await expect(toastMessage(page)).toHaveText(`„${soup}“ angelegt und eingeplant`);
  const dinner = slotBox(page, SUNDAY, SLOT_DINNER);
  await expect(dinner.locator(PLAN_ENTRY).filter({ hasText: soup })).toHaveCount(1);
  // Nothing is known about its diet yet: no "Passt nicht für …".
  await expect(dinner.locator('[data-testid^="entry-misfit-"]')).toHaveCount(0);

  // A short link, resolved by the (stubbed) edge function before saving.
  await addTo(page, SUNDAY, SLOT_DINNER);
  await chooseMode(page, 'restaurant');
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
    await open(page, '/plan');
    const tops: number[] = [];
    for (const slotId of [SLOT_MORNING, SLOT_LUNCH, SLOT_DINNER]) {
      tops.push((await tid(page, `add-${TODAY}-${slotId}`).boundingBox())?.y ?? -1);
    }
    expect(tops).toEqual([...tops].sort((a, b) => a - b));
    for (const name of ['Vormittag', 'Mittag', 'Abend']) {
      await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
    }
    await expect(slotBox(page, TODAY, SLOT_MORNING)).toContainText('Eislaufen (Hohenschönhausen)');
  });

  test('AC-004, AC-016: collection and activity side by side; a deep link keeps the sidebar', async ({
    page,
  }) => {
    await open(page, '/plan?view=activities');
    await tid(page, `activity-${BOULDERN}`).click();
    await expect(page).toHaveURL(new RegExp(`aid=${BOULDERN}`));
    await expect(tid(page, 'activity-visits')).toHaveText('Zuletzt: vor 12 Tagen · 3-mal');
    const list = await tid(page, `activity-${BOULDERN}`).boundingBox();
    const detail = await tid(page, 'activity-detail').boundingBox();
    expect(list && detail && list.x + list.width <= detail.x, 'list left of detail').toBe(true);
    await tid(page, 'activity-close').click();
    await expect(tid(page, 'activity-detail')).toHaveCount(0);

    await page.goto(`/plan/aktivitaet/${EISLAUFEN}`);
    await expect(tid(page, 'activity-title')).toHaveText('Eislaufen', SYNC);
    await expect(tid(page, 'nav-plan')).toBeVisible();
  });
});
