import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  expect,
  test as base,
  type Browser,
  type BrowserContext,
  type CDPSession,
  type Locator,
  type Page,
  type Route,
} from '@playwright/test';
import {
  addDays,
  AiSearchResultSchema,
  daysBetween,
  AssistantReplySchema,
  ErrorReplySchema,
  isoWeekday,
  ResolveMapsLinkReplySchema,
  SpeechTokenReplySchema,
  startOfWeek,
  weekDates,
  type ErrorCode,
  type ISODate,
} from '@housekeeping/core';

import { seedIds } from './seed-ids';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------- Days ----------

/**
 * The walk-through runs on the real day. The seed (`pnpm db:reset`) dates the demo relative to
 * the Berlin day of the reset, and the browser runs in Europe/Berlin (playwright.config.ts), so
 * "today" here is the Berlin date. A run across midnight is not supported.
 */
export const TODAY: ISODate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Berlin',
}).format(new Date());

/** ISO date `offset` days after today. */
export function day(offset: number): ISODate {
  return addDays(TODAY, offset);
}

/** ISO weekday of a date: 1 = Monday … 7 = Sunday. */
export { isoWeekday };

/** True when `date` lies in the Monday–Sunday week of today (what the plan shows first). */
export function inThisWeek(date: ISODate): boolean {
  return weekDates(TODAY).includes(date);
}

/** True when `date` lies in yesterday to today + 5, the Übersicht's first section (spec 0020). */
export function inTodaysSection(date: ISODate): boolean {
  return Array.from({ length: 7 }, (_, index) => day(index - 1)).includes(date);
}

/** The three Tageszeiten of the demo household (spec 0004, AC-001). */
export const SLOT_MORNING = seedIds['slot-vormittag'];
export const SLOT_LUNCH = seedIds['slot-mittag'];
export const SLOT_DINNER = seedIds['slot-abend'];

/** Display names of the local test accounts (packages/api/src/dev-accounts.ts). */
export const ENRICO = 'Enrico (Test)';
export const NADJA = 'Nadja (Test)';

/**
 * Id of a nested seed object (ingredient, variant, …) of the demo household, from its slug:
 * UUIDv5 in the namespace of the household id, like packages/api/src/seed/seed-sql.ts.
 */
export function nestedSeedId(slug: string, householdId: string = seedIds['hh-demo']): string {
  const namespace = Buffer.from(householdId.replace(/-/g, ''), 'hex');
  const hash = createHash('sha1')
    .update(Buffer.concat([namespace, Buffer.from(slug, 'utf8')]))
    .digest()
    .subarray(0, 16);
  hash[6] = ((hash[6] ?? 0) & 0x0f) | 0x50;
  hash[8] = ((hash[8] ?? 0) & 0x3f) | 0x80;
  const hex = hash.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** A short unique suffix for names a test creates, so reruns never collide. */
export function unique(): string {
  return randomUUID().slice(0, 6);
}

// ---------- Locators ----------

/**
 * Tabs and stack screens keep inactive screens mounted: they stay in the layout behind the active
 * one, marked `inert`. Only elements outside an inert subtree belong to the screen the user sees.
 */
export const ACTIVE = ':not([inert] *):visible';

/** The element with this test id on the active screen. */
export function tid(page: Page, id: string): Locator {
  return page.locator(`[data-testid="${id}"]${ACTIVE}`).first();
}

/** Chooses "19:30" in a time field (spec 0027, REQ-007), or "–" (no time) with undefined. */
export async function chooseTime(page: Page, id: string, time: string | undefined): Promise<void> {
  const [hour = '', minute = ''] = time === undefined ? [] : time.split(':');
  await tid(page, `${id}-hour`).selectOption(hour === '' ? '' : hour.padStart(2, '0'));
  if (minute !== '') await tid(page, `${id}-minute`).selectOption(minute);
}

/** The time a time field shows: "19:30", or "" for "–". */
export async function expectTime(page: Page, id: string, time: string): Promise<void> {
  const [hour = '', minute = ''] = time === '' ? [] : time.split(':');
  await expect(tid(page, `${id}-hour`)).toHaveValue(hour === '' ? '' : hour.padStart(2, '0'));
  await expect(tid(page, `${id}-minute`)).toHaveValue(minute);
}

/**
 * One day of the phone week (`day-block-<date>`, spec 0031 AC-022): its head, the trips
 * starting there, the household row and every Tageszeit with its entries.
 */
export function dayBlock(page: Page, date: string): Locator {
  return tid(page, `day-block-${date}`);
}

/** All elements on the active screen whose test id starts with `prefix`. */
export function tidPrefix(page: Page, prefix: string): Locator {
  return page.locator(`[data-testid^="${prefix}"]${ACTIVE}`);
}

export function isPhone(page: Page): boolean {
  return (page.viewportSize()?.width ?? 0) < 700;
}

export type TabKey = 'index' | 'rezepte' | 'kalender' | 'liste' | 'haushalt';

/**
 * Lets a navigation settle: the screen left behind is marked `inert` a frame after the click,
 * and a locator resolved before that would keep pointing at its (then inert) element.
 */
export async function settle(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

/** Switches the main area with the tab bar (phone) or the sidebar (wider). */
export async function nav(page: Page, key: TabKey): Promise<void> {
  await tid(page, isPhone(page) ? `tab-${key}` : `nav-${key}`).click();
  await settle(page);
}

/** Selector of the calendar rows (`entry-<uuid>`, not the parts of the entry sheet). */
export const PLAN_ENTRY = [
  '[data-testid^="entry-"]',
  ...[
    'done',
    'move',
    'note',
    'people-',
    'open-',
    'remind',
    'remove',
    'reserved',
    'route',
    'sheet',
    'slot-',
  ].map((part) => `:not([data-testid^="entry-${part}"])`),
  ACTIVE,
].join('');

/**
 * Shopping list rows (open and done) of the article `name`: the press area is labelled with the
 * name, plus „(Zusatz)“ or „, 500 g“ when the row shows them (spec 0006, AC-008).
 */
export function itemRows(page: Page, name: string): Locator {
  const base = `[data-testid^="item-"][role="button"]`;
  return page.locator(
    [`[aria-label="${name}"]`, `[aria-label^="${name} ("]`, `[aria-label^="${name}, "]`]
      .map((label) => `${base}${label}${ACTIVE}`)
      .join(', '),
  );
}

/** The item id of a list row found with `itemRows` (`item-<id>` or its press area `-open`). */
export async function itemIdOf(row: Locator): Promise<string> {
  const testId = (await row.first().getAttribute('data-testid')) ?? '';
  return testId.replace(/^item-/, '').replace(/-open$/, '');
}

/** The open row of `name` on the list screen (not under „Erledigt“). */
export function openItem(page: Page, name: string): Locator {
  return itemRows(page, name).and(page.locator(':not([data-testid="done-section"] *)'));
}

/** Unfolds „Erledigt (n)“ on the list screen (it starts folded, spec 0006). */
export async function showDone(page: Page): Promise<void> {
  const rows = tid(page, 'done-section').locator('[data-testid^="item-"]');
  if ((await rows.count()) === 0) await tid(page, 'done-toggle').click();
  await expect(rows.first()).toBeVisible();
}

/** The checked row of `name` in "Erledigt" on the list screen (unfold it with `showDone`). */
export function doneItem(page: Page, name: string): Locator {
  return tid(page, 'done-section').locator(`[aria-label="${name}"][role="button"]`);
}

/** The checkbox of the article `name` in „Einkaufen“ (`sm-item-<id>-check`). */
export function shoppingCheck(page: Page, name: string): Locator {
  return page.locator(
    `[data-testid^="sm-item-"][data-testid$="-check"][aria-label="${name}"]${ACTIVE}`,
  );
}

/** The toast message currently shown. */
export function toastMessage(page: Page): Locator {
  return tid(page, 'toast-message');
}

// ---------- Signing in and navigating ----------

export type Account = 'enrico' | 'nadja';

const signedIn = new WeakMap<Page, Account>();

/** The app has rendered past the auth gate's splash. */
async function appReady(page: Page): Promise<void> {
  await expect(
    page.locator('[data-testid]:not([data-testid="auth-splash"]):visible').first(),
  ).toBeVisible({ timeout: 30_000 });
}

/**
 * Waits until the app has loaded and shows its content: no request for half a second. A gesture
 * right after `open` would start on a screen that is still being replaced by its loaded content,
 * and its touch would reach no responder.
 */
export async function contentReady(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  await settle(page);
}

/** Signs in with a local test account (dev buttons) and waits for "Heute" after the first pull. */
export async function login(page: Page, who: Account = 'enrico'): Promise<void> {
  await page.goto('/');
  await tid(page, `login-dev-${who}`).click();
  await expect(tid(page, 'today-screen')).toBeVisible({ timeout: 30_000 });
  signedIn.set(page, who);
}

/**
 * Loads a route as `who` (signing in first when this page has no session yet) and waits until
 * the app has rendered. Data comes from the local backend and persists across reloads; use client
 * navigation afterwards to stay on the same page load.
 */
export async function open(page: Page, route = '/', who: Account = 'enrico'): Promise<void> {
  if (signedIn.get(page) !== who) {
    await login(page, who);
    if (route === '/') return;
  }
  await page.goto(route);
  await appReady(page);
}

/**
 * A second, independent device (own context, own storage) signed in as `who`. Headless Chromium
 * throttles animation frames of the page that is not in front, and screen transitions wait for
 * them: call `page.bringToFront()` before acting on the other device again.
 */
export async function secondDevice(
  browser: Browser,
  who: Account,
  options: {
    viewport?: { width: number; height: number };
    /** The service worker registers (push, spec 0013); blocked by default like the main page. */
    serviceWorkers?: 'allow' | 'block';
    /** Runs before the first page load, e.g. `page.addInitScript` for a faked browser API. */
    beforeLoad?: (page: Page) => Promise<void>;
  } = {},
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    serviceWorkers: options.serviceWorkers ?? 'block',
    viewport: options.viewport ?? { width: 390, height: 844 },
  });
  await stubEdgeFunctions(context);
  const page = await context.newPage();
  watchConsole(page);
  await options.beforeLoad?.(page);
  await login(page, who);
  return { context, page };
}

/** Opens settings through the profile button. */
export async function openSettings(page: Page): Promise<void> {
  await (await single(page, 'profile-button')).click();
  await expect(tid(page, 'settings')).toBeVisible();
  await settle(page);
}

/**
 * The one element with this test id on the active phone screen, once a screen transition has
 * finished (during a push or pop both screens show theirs, and a click could hit the leaving one).
 */
async function single(page: Page, id: string): Promise<Locator> {
  await settle(page);
  if (isPhone(page)) {
    await expect(page.locator(`[data-testid="${id}"]${ACTIVE}`)).toHaveCount(1);
  }
  return tid(page, id);
}

/** Goes back with the in-app back arrow. */
export async function back(page: Page): Promise<void> {
  await (await single(page, 'back')).click();
  await settle(page);
}

/** A page under "Verwalten" (spec 0005, REQ-010): `manage-entry-<key>` / `nav-manage-<key>`. */
export type ManagedPage =
  'activities' | 'packing-bags' | 'trips' | 'articles' | 'stores' | 'members' | 'feedback';

/** The first pages of the tabs, the only ones with ⊞ in the header on phones (spec 0005, AC-054). */
const TAB_START_PAGES = new Set(['/', '/rezepte', '/kalender', '/liste', '/haushalt']);

function onTabStartPage(page: Page): boolean {
  return TAB_START_PAGES.has(new URL(page.url()).pathname);
}

/**
 * Opens a page under "Verwalten": on phones ⊞ in the header of a tab's first page (from another
 * page via "Übersicht"), then the entry; on wider screens the entry in the sidebar.
 */
export async function openManaged(page: Page, key: ManagedPage): Promise<void> {
  if (isPhone(page)) {
    // ⊞ is only on a tab's first page; from a detail page the way leads over "Übersicht".
    if (!onTabStartPage(page)) await nav(page, 'index');
    await (await single(page, 'header-manage')).click();
    await expect(tid(page, 'manage-screen')).toBeVisible();
    await settle(page);
  }
  await tid(page, isPhone(page) ? `manage-entry-${key}` : `nav-manage-${key}`).click();
  await settle(page);
}

/** Back from a page opened with `openManaged` to where it was opened (phones: via "Verwalten"). */
export async function leaveManaged(page: Page): Promise<void> {
  await back(page);
  if (isPhone(page)) await back(page);
}

/** Makes `householdId` the active household on this device (Verwalten → Haushalt & Mitglieder). */
export async function switchHousehold(page: Page, householdId: string): Promise<void> {
  await openManaged(page, 'members');
  await tid(page, `household-${householdId}`).click();
  await expect(tid(page, `household-${householdId}-active`)).toBeVisible();
  await leaveManaged(page);
}

/** On the calendar (showing the current week): moves to the Monday–Sunday week of `date`. */
export async function showPlanWeek(page: Page, date: ISODate): Promise<void> {
  await expect(tid(page, `day-${TODAY}`)).toBeVisible();
  const weeks = daysBetween(startOfWeek(TODAY), startOfWeek(date)) / 7;
  for (let step = 0; step < Math.abs(weeks); step += 1) {
    await tid(page, weeks > 0 ? 'week-next' : 'week-prev').click();
  }
  await expect(tid(page, `day-${date}`)).toBeVisible();
}

// ---------- Offline ----------

/** ⊞ in the header of the page shown and not covered by a window; a fresh page takes a moment. */
async function headerManageReachable(page: Page): Promise<boolean> {
  const header = page.locator(`[data-testid="header-manage"]${ACTIVE}`);
  try {
    await expect(header).toHaveCount(1, { timeout: 3_000 });
    // A trial click checks that nothing lies over it, without clicking.
    await header.click({ trial: true, timeout: 1_000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Switches the developer switch "Offline simulieren" (Verwalten → Entwicklung; spec 0005,
 * AC-059): on phones on the page behind ⊞ and back, on wider screens in the sidebar. A phone page
 * without ⊞ (a detail page, or a window open above the page) cannot reach the switch without
 * leaving; there the device loses its network for real, which the app treats the same way.
 */
async function setSimulatedOffline(page: Page, offline: boolean): Promise<void> {
  const phone = isPhone(page);
  if (phone) {
    // A window above the page (e.g. an entry window) makes the header unreachable too.
    if (!onTabStartPage(page) || !(await headerManageReachable(page))) {
      await page.context().setOffline(offline);
      return;
    }
    await (await single(page, 'header-manage')).click();
    await expect(tid(page, 'manage-screen')).toBeVisible();
    await settle(page);
  }
  const toggle = tid(page, phone ? 'setting-offline' : 'nav-manage-offline');
  const input = toggle.locator('input');
  if ((await input.isChecked()) !== offline) await toggle.click();
  if (offline) await expect(input).toBeChecked();
  else await expect(input).not.toBeChecked();
  if (phone) await back(page);
}

/** Pages told once (an init script) that the screen stands upright. */
const uprightPages = new WeakSet<Page>();

/**
 * A CDP session whose touch events reach the page as a finger on an upright phone. Headless
 * Chromium reports its screen as landscape: once touch is on (no fine pointer), the app would show
 * "Bitte Handy hochkant halten" over everything (spec 0034, REQ-009), so the page is told the
 * screen stands upright (also after a reload). Chromium's own orientation override does not last:
 * the viewport emulation sets it back during a test.
 */
export async function uprightTouch(page: Page): Promise<CDPSession> {
  const upright = () => {
    Object.defineProperty(screen.orientation, 'type', {
      configurable: true,
      get: () => 'portrait-primary',
    });
    screen.orientation.dispatchEvent(new Event('change'));
  };
  if (!uprightPages.has(page)) {
    uprightPages.add(page);
    await page.addInitScript(upright);
  }
  await page.evaluate(upright);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  await expect(page.getByTestId('portrait-hint')).toHaveCount(0);
  return cdp;
}

/**
 * The row of a trip on "Reisen" (`trip-<id>`, a button; the trip window holds "Reise löschen",
 * so the row has no bin and no `-open` part since spec 0054, REQ-006).
 */
export function tripRow(page: Page, text: string): Locator {
  return page.locator(`[data-testid^="trip-"][role="button"]${ACTIVE}`).filter({ hasText: text });
}

/** Simulated offline (dev switch); kept as the old name for the walk-throughs. */
export async function goOffline(page: Page): Promise<void> {
  await setSimulatedOffline(page, true);
}

/**
 * Real network loss for a device: Playwright's `setOffline` blocks every request of the context,
 * including the local Supabase on 127.0.0.1:54321 (verified), and fires the browser's
 * offline/online events.
 */
export async function setNetwork(context: BrowserContext, online: boolean): Promise<void> {
  await context.setOffline(!online);
}

// ---------- Edge function stubs (no Foundry in the normal run) ----------

/** The request body the app sent to an edge function. */
function requestBody(route: Route): Record<string, unknown> {
  const body: unknown = route.request().postDataJSON();
  return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

/** Answers an edge function call with a reply that must match the core contract. */
async function fulfilFunction(route: Route, status: number, body: unknown): Promise<void> {
  if (route.request().method() === 'OPTIONS') {
    await route.fulfill({ status: 204, headers: CORS });
    return;
  }
  await route.fulfill({ status, headers: CORS, contentType: 'application/json', json: body });
}

/** An error reply of the edge functions, `{ error: code }` with its status. */
export async function fulfilError(route: Route, code: ErrorCode): Promise<void> {
  const status: Record<ErrorCode, number> = {
    unauthorized: 401,
    invalid_request: 400,
    forbidden: 403,
    not_a_maps_link: 422,
    not_an_image: 422,
    not_a_tiktok_link: 422,
    video_unavailable: 422,
    video_too_large: 422,
    video_exists: 409,
    payload_too_large: 413,
    quota_exceeded: 429,
    ai_unavailable: 503,
    search_unavailable: 503,
    internal: 500,
  };
  await fulfilFunction(route, status[code], ErrorReplySchema.parse({ error: code }));
}

/** Contract-shaped default replies; each is validated with the core zod schema. */
export const aiFixtures = {
  /** "Mach das vegan und für 6 Personen" on a recipe with 4 portions. */
  assistant(body: Record<string, unknown>) {
    const context = (body.context ?? {}) as { recipeId?: string };
    const recipeId = context.recipeId;
    return AssistantReplySchema.parse(
      recipeId
        ? {
            text: 'Hier ist mein Vorschlag: sechs Portionen, und das Curry bleibt mit Tofu vegan.',
            proposal: {
              id: 'proposal-e2e',
              title: 'Rezept anpassen',
              note: 'Ändert erst etwas, wenn du „Übernehmen“ wählst.',
              parts: [
                {
                  id: 'part-servings',
                  label: 'Portionen',
                  before: '4',
                  after: '6',
                  command: { type: 'setRecipeServings', recipeId, servings: 6 },
                },
              ],
            },
            consulted: 'Rezept gelesen',
          }
        : { text: 'Dazu kann ich leider nichts sagen.' },
    );
  },
  aiSearch() {
    return AiSearchResultSchema.parse({
      chips: [
        { id: 'zeit', label: 'schnell' },
        { id: 'zutat', label: 'Tofu' },
      ],
      results: [
        { recipeId: seedIds['rec-mango-curry'], reason: 'Mit Räuchertofu, in 25 Minuten fertig' },
      ],
      trace: '1 Runde · gesucht: tofu',
      note: '',
    });
  },
  speechToken() {
    return SpeechTokenReplySchema.parse({
      token: 'e2e-short-lived-token',
      region: 'westeurope',
      expiresAt: new Date(Date.now() + 9 * 60_000).toISOString(),
      language: 'de-DE',
    });
  },
  resolveMapsLink() {
    return ResolveMapsLinkReplySchema.parse({
      name: 'Café Kurzlink',
      address: 'Zülpicher Str. 1, 50674 Köln',
      location: { lat: 50.9301, lng: 6.9392 },
      mapsUrl: 'https://www.google.com/maps/place/Caf%C3%A9+Kurzlink/@50.9301,6.9392,17z',
    });
  },
};

/**
 * Routes every AI and maps edge function of a context to the fixtures above. Always on; the one
 * live test (E2E_LIVE_AI=1) removes the route for its function.
 */
async function stubEdgeFunctions(context: BrowserContext): Promise<void> {
  await context.route('**/functions/v1/ai-assistant', (route) =>
    fulfilFunction(route, 200, aiFixtures.assistant(requestBody(route))),
  );
  await context.route('**/functions/v1/ai-search', (route) =>
    fulfilFunction(route, 200, aiFixtures.aiSearch()),
  );
  await context.route('**/functions/v1/speech-token', (route) =>
    fulfilFunction(route, 200, aiFixtures.speechToken()),
  );
  await context.route('**/functions/v1/resolve-maps-link', (route) =>
    fulfilFunction(route, 200, aiFixtures.resolveMapsLink()),
  );
  // The paid services (images, drafts, web search) never run from a walk-through: a test that
  // needs one answers it with its own `page.route`, which goes first. Anything else gets "KI nicht
  // erreichbar" (and its console error fails the test unless the test expects it).
  if (process.env.E2E_LIVE_AI) return;
  for (const name of ['ai-image', 'ai-recipe-draft', 'web-search']) {
    await context.route(`**/functions/v1/${name}*`, (route) =>
      fulfilError(route, 'ai_unavailable'),
    );
  }
}

// ---------- Map apps (never really opened) ----------

/** Every request to Apple Karten or Google Maps gets a stub page. */
export async function stubMaps(context: BrowserContext): Promise<void> {
  await context.route(/^https:\/\/(maps\.apple\.com|www\.google\.com\/maps)/, (route) =>
    route.fulfill({ body: 'map stub', contentType: 'text/plain' }),
  );
}

/** Clicks a route button and returns the URL of the map page it opened. */
export async function routeUrl(page: Page, button: string): Promise<string> {
  // The map services are answered here: their redirects would change the address, and the run
  // needs no internet.
  await page
    .context()
    .route(/^https:\/\/(maps\.apple\.com|www\.google\.com\/maps)\//, (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html>' }),
    );
  const [popup] = await Promise.all([
    page.context().waitForEvent('page'),
    tid(page, button).click(),
  ]);
  await popup.waitForLoadState();
  const url = popup.url();
  await popup.close();
  return url;
}

// ---------- Dictation (Azure Speech, faked) ----------

/**
 * Fakes the Azure Speech service for dictation (spec 0003 AC-028): the browser streams the fake
 * microphone (Chromium flags in playwright.config.ts) over the WebSocket, and this answers with
 * one recognised phrase in the service's text protocol (headers, blank line, JSON body; the
 * X-RequestId must echo the SDK's). Nothing reaches Azure.
 *
 * Spec 0068: with `finalOnStop` the words of `transcript` stay interim while listening, and the
 * final phrase `finalOnStop` comes only after the stop — the last words still on their way;
 * `null` never sends it (the 1.5 s wait runs out). An empty `transcript` hears nothing.
 */
export async function fakeSpeech(
  page: Page,
  transcript: string,
  options: { finalOnStop?: string | null } = {},
): Promise<void> {
  await page.context().grantPermissions(['microphone']);
  await page.routeWebSocket(/\.stt\.speech\.microsoft\.com\//, (ws) => {
    let requestId = '';
    let listening = false;
    let ended = false;
    const duration = 20_000_000;
    const send = (pathName: string, body: object) =>
      ws.send(
        `X-RequestId:${requestId}\r\nContent-Type:application/json; charset=utf-8\r\nPath:${pathName}\r\n\r\n${JSON.stringify(body)}`,
      );
    const phrase = (text: string) =>
      send('speech.phrase', {
        RecognitionStatus: 'Success',
        DisplayText: text,
        Offset: 0,
        Duration: duration,
      });
    const idOf = (headers: string) => /X-RequestId:\s*([0-9a-f]+)/i.exec(headers)?.[1];
    ws.onMessage((message) => {
      if (typeof message === 'string') {
        requestId = idOf(message) ?? requestId;
        return;
      }
      const headerLength = message.readUInt16BE(0);
      requestId = idOf(message.subarray(2, 2 + headerLength).toString('utf8')) ?? requestId;
      const audio = message.length - 2 - headerLength > 0;
      if (audio && !listening) {
        listening = true;
        send('turn.start', { context: { serviceTag: 'e2e' } });
        if (transcript === '') return;
        send('speech.startDetected', { Offset: 0 });
        send('speech.hypothesis', { Text: transcript, Offset: 0, Duration: duration });
        if (options.finalOnStop === undefined) phrase(transcript);
      } else if (!audio && listening && !ended) {
        // End of the audio stream (the person pressed "Fertig" or send): close the turn.
        ended = true;
        if (options.finalOnStop === null) return;
        if (options.finalOnStop !== undefined) phrase(options.finalOnStop);
        send('speech.endDetected', { Offset: duration });
        send('turn.end', {});
      }
    });
  });
}

// ---------- Supabase API (REST) ----------

const BASE_URL = 'http://127.0.0.1:8790';

function supabaseEnv(): { url: string; key: string } {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('EXPO_PUBLIC_SUPABASE_URL / _PUBLISHABLE_KEY are not set');
  return { url: url.replace(/\/$/, ''), key };
}

export const SUPABASE_URL = (): string => supabaseEnv().url;

const EMAILS: Record<Account, string> = {
  enrico: 'enrico.test@example.com',
  nadja: 'nadja.test@example.com',
};
/** The fixed fake password of the local test accounts (packages/api/src/dev-accounts.ts). */
const TEST_PASSWORD = 'local-test-password';

/** A session of an account with the test password (password grant against the local Auth). */
async function passwordSession(email: string): Promise<{ access_token: string }> {
  const { url, key } = supabaseEnv();
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: key, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: TEST_PASSWORD }),
  });
  if (!response.ok) throw new Error(`password grant failed: ${response.status}`);
  return (await response.json()) as { access_token: string };
}

/** An access token of a test account, or of an account a test created (createAccount). */
export async function accessToken(who: Account | { email: string }): Promise<string> {
  const email = typeof who === 'string' ? EMAILS[who] : who.email;
  return (await passwordSession(email)).access_token;
}

/**
 * A request against the Supabase API with the publishable key and an optional user token. A body
 * of bytes (a file for the Storage API) goes as it is, anything else as JSON.
 */
export async function supabaseFetch(
  pathname: string,
  init: { method?: string; token?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<Response> {
  const { url, key } = supabaseEnv();
  const bytes = init.body instanceof Uint8Array ? new Uint8Array(init.body) : undefined;
  return fetch(`${url}${pathname}`, {
    method: init.method ?? 'GET',
    headers: {
      apikey: key,
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
      ...(init.body !== undefined && !bytes ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
    body: bytes ?? (init.body !== undefined ? JSON.stringify(init.body) : undefined),
  });
}

/** Calls an RPC as a user; throws with the server's message when it fails. */
export async function rpc<T>(token: string, fn: string, args: Record<string, unknown>): Promise<T> {
  const response = await supabaseFetch(`/rest/v1/rpc/${fn}`, {
    method: 'POST',
    token,
    body: args,
  });
  if (!response.ok)
    throw new Error(`rpc ${fn} failed: ${response.status} ${await response.text()}`);
  return (await response.json()) as T;
}

/** A small starter: one area and the articles the two-device cases use. */
const STARTER = {
  areas: [
    { key: 'kuehlregal', name: 'Kühlregal & Molkerei' },
    { key: 'brot', name: 'Brot & Backwaren' },
  ],
  articles: [
    { name: 'Milch', name_key: 'milch', area: 'kuehlregal', diet: 'vegetarian' },
    { name: 'Butter', name_key: 'butter', area: 'kuehlregal', diet: 'vegetarian' },
    { name: 'Eier', name_key: 'eier', area: 'kuehlregal', diet: 'vegetarian' },
    { name: 'Brot', name_key: 'brot', area: 'brot', diet: 'vegan' },
  ],
};

/**
 * A fresh household of Enrico for one test (so two-device cases never share rows with other
 * tests). With `withNadja`, Nadja is invited and accepts. Returns the household id.
 */
export async function createTestHousehold(
  name: string,
  options: { withNadja?: boolean } = {},
): Promise<string> {
  const enrico = await accessToken('enrico');
  const householdId = await rpc<string>(enrico, 'create_household', { name, starter: STARTER });
  if (options.withNadja) {
    const invitationId = await rpc<string>(enrico, 'invite_member', {
      household_id: householdId,
      email: EMAILS.nadja,
    });
    await rpc<string>(await accessToken('nadja'), 'accept_invitation', {
      invitation_id: invitationId,
    });
  }
  return householdId;
}

// ---------- Accounts created by a test ----------

function databaseContainer(): string {
  const config = readFileSync(path.join(repo, 'supabase/config.toml'), 'utf8');
  const projectId = /^project_id\s*=\s*"([^"]+)"/m.exec(config)?.[1];
  if (!projectId) throw new Error('project_id missing in supabase/config.toml');
  return `supabase_db_${projectId}`;
}

/** Runs SQL as postgres in the local database container; returns the unaligned output. */
function sql(statement: string): string {
  const result = spawnSync(
    'docker',
    [
      'exec',
      '-i',
      databaseContainer(),
      'psql',
      '-U',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
      '-q',
      '-t',
      '-A',
    ],
    { input: statement, encoding: 'utf8' },
  );
  if (result.status !== 0) throw new Error(`sql failed: ${result.stderr}`);
  return result.stdout.trim();
}

const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;

/**
 * A new account as right after its first sign-in (the auth trigger creates the profile), with the
 * test password so the test can sign in. Like the seed it bypasses the sign-up hook, which pgTAP
 * covers. Returns the account id.
 */
export function createAccount(email: string, name: string): string {
  const id = randomUUID();
  const identity = JSON.stringify({ sub: id, email, email_verified: true });
  sql(`
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
) values (
  '00000000-0000-0000-0000-000000000000', ${literal(id)}, 'authenticated', 'authenticated',
  ${literal(email)}, extensions.crypt(${literal(TEST_PASSWORD)}, extensions.gen_salt('bf')), now(),
  '{"provider": "email", "providers": ["email"]}', ${literal(JSON.stringify({ full_name: name }))},
  now(), now(), '', '', '', '', '', '', '', ''
);
insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
values (${literal(id)}, ${literal(id)}, ${literal(id)}, 'email', ${literal(identity)}, now(), now(), now());
`);
  return id;
}

/** Deletes an account as postgres (profile and memberships go with it). */
export function deleteAccount(id: string): void {
  sql(`delete from auth.users where id = ${literal(id)};`);
}

/**
 * Signs `page` in as an account a test created: the session goes where supabase-js keeps it,
 * then the app loads. Waits until the app rendered past the splash.
 */
export async function signInAs(page: Page, email: string): Promise<void> {
  const session = await passwordSession(email);
  await page.goto('/');
  await expect(tid(page, 'login-screen')).toBeVisible();
  await page.evaluate(([key, value]) => window.localStorage.setItem(key, value), [
    'housekeeping.auth',
    JSON.stringify(session),
  ] as const);
  await page.reload();
  await appReady(page);
}

// ---------- Database reset ----------

/**
 * Resets the local database to the seed (`pnpm db:reset`) before the tests of this file, for
 * walk-throughs that change the demo data and assert on its pristine state. About 12 s.
 * E2E_SKIP_RESET=1 skips it like the global setup does: an agent's worktree must never reset the
 * shared local stack (27.11.2026, it dropped the owner's local invitation).
 */
export function freshSeed(): void {
  test.beforeAll(async () => {
    if (process.env.E2E_SKIP_RESET) return;
    test.setTimeout(120_000);
    const result = spawnSync('pnpm', ['db:reset'], { cwd: repo, stdio: 'ignore' });
    if (result.status !== 0) throw new Error('pnpm db:reset failed');
  });
}

// ---------- Colours ----------

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

// ---------- The test ----------

/**
 * console.error messages every test tolerates: only the browser's own network errors of the
 * offline cases (requests failing while the context is offline, the realtime socket dropping and
 * reconnecting). Anything else, e.g. a React warning or an app error log, fails the test.
 */
const ALWAYS_ALLOWED_CONSOLE: RegExp[] = [
  /^Failed to load resource: net::ERR_INTERNET_DISCONNECTED$/,
  /^WebSocket connection to 'ws:\/\/127\.0\.0\.1:54321\/realtime\/v1\/websocket\?.*' failed/,
];

interface ConsoleWatch {
  errors: string[];
  allowed: RegExp[];
}

let watch: ConsoleWatch | undefined;

/** Collects uncaught errors and console.error of a page into the running test's check. */
function watchConsole(page: Page): void {
  const current = watch;
  if (!current) return;
  page.on('pageerror', (error) => current.errors.push(`uncaught: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    const allowed = [...ALWAYS_ALLOWED_CONSOLE, ...current.allowed];
    if (!allowed.some((pattern) => pattern.test(text))) current.errors.push(text);
  });
}

interface AppFixtures {
  /** Every request URL the page made (for "nothing leaves the host", AC-006 / AC-043). */
  requests: string[];
  /**
   * Uncaught errors and console.error messages of the test's pages (also second devices). Every
   * test fails if there is one, except the network errors in ALWAYS_ALLOWED_CONSOLE.
   */
  pageErrors: string[];
  /** Tolerates console.error messages the test provokes on purpose (e.g. a forced 400). */
  allowConsoleError: (pattern: RegExp) => void;
}

/** The test with stubbed edge functions, a request log and a check for errors in the page. */
export const test = base.extend<AppFixtures>({
  context: async ({ context }, provide) => {
    await stubEdgeFunctions(context);
    await provide(context);
  },
  requests: async ({ page }, provide) => {
    const urls: string[] = [];
    page.on('request', (request) => urls.push(request.url()));
    await provide(urls);
  },
  pageErrors: [
    async ({ page }, provide) => {
      const current: ConsoleWatch = { errors: [], allowed: [] };
      watch = current;
      watchConsole(page);
      await provide(current.errors);
      watch = undefined;
      expect(current.errors, 'uncaught errors or console.error in the page').toEqual([]);
    },
    { auto: true },
  ],
  allowConsoleError: async ({ pageErrors }, provide) => {
    void pageErrors;
    await provide((pattern) => watch?.allowed.push(pattern));
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
