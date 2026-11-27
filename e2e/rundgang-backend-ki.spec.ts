import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Page } from '@playwright/test';

import {
  accessToken,
  aiFixtures,
  expect,
  fakeSpeech,
  fulfilError,
  only,
  open,
  secondDevice,
  supabaseFetch,
  test,
  tid,
  tidPrefix,
} from './helpers';
import { seedIds } from './seed-ids';

// Spec 0003 — the real AI through edge functions (REQ-008) and short links (REQ-009). The edge
// functions are stubbed with contract-shaped replies (helpers.ts, validated with the core zod
// schemas), so the normal run never reaches Foundry; the quota and "no Foundry call" parts are
// pinned by pgTAP (consume_ai_quota) and the edge function tests. One live test runs only with
// E2E_LIVE_AI=1 (the local stack must have been started with the Foundry values loaded).

only('phone');

const MANGO = seedIds['rec-mango-curry'];
const VEGAN = 'Mach das vegan und für 6 Personen';
const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, '../apps/app/dist');
/**
 * The AI switch of the build (spec 0005, REQ-008, `apps/app/src/lib/features.ts`). While it is
 * off, no way into the AI is shown (AC-044, rundgang-shell.spec.ts); the AI cases run only in a
 * build with the switch on (AC-048).
 */
const AI_ON = /\bai:\s*true\b/.test(
  readFileSync(path.resolve(here, '../apps/app/src/lib/features.ts'), 'utf8'),
);

function needsAi(): void {
  test.skip(!AI_ON, 'AI switch is off (spec 0005, AC-044): runs only with features.ai = true');
}

async function recipeServings(recipeId: string): Promise<number | undefined> {
  const [recipe] = (await (
    await supabaseFetch(`/rest/v1/recipes?select=servings&id=eq.${recipeId}`, {
      token: await accessToken('enrico'),
    })
  ).json()) as { servings: number }[];
  return recipe?.servings;
}

async function askAssistant(page: Page, text: string): Promise<void> {
  await tid(page, 'recipe-assistant').click();
  await expect(tid(page, 'assistant-context')).toContainText('Mango-Curry');
  await tid(page, 'assistant-input').fill(text);
  await tid(page, 'assistant-send').click();
}

function filesIn(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const file = path.join(dir, name);
    return statSync(file).isDirectory() ? filesIn(file) : [file];
  });
}

test('AC-029: the AI does not answer; "Der Assistent ist gerade nicht erreichbar", nothing changes', async ({
  page,
  allowConsoleError,
}) => {
  needsAi();
  allowConsoleError(/^Failed to load resource: the server responded with a status of 503/);
  await page.route('**/functions/v1/ai-assistant', (route) => fulfilError(route, 'ai_unavailable'));
  await open(page, `/rezept/${MANGO}`);
  await askAssistant(page, VEGAN);
  await expect(tid(page, 'assistant-answer')).toHaveText(
    'Der Assistent ist gerade nicht erreichbar',
  );
  await expect(tid(page, 'proposal')).toHaveCount(0);
  expect(await recipeServings(MANGO)).toBe(4);
});

test('AC-030: the quota is used up; "Für heute ist das KI-Kontingent aufgebraucht"', async ({
  page,
  allowConsoleError,
}) => {
  needsAi();
  allowConsoleError(/^Failed to load resource: the server responded with a status of 429/);
  await page.route('**/functions/v1/ai-assistant', (route) => fulfilError(route, 'quota_exceeded'));
  await open(page, `/rezept/${MANGO}`);
  await askAssistant(page, VEGAN);
  await expect(tid(page, 'assistant-answer')).toHaveText(
    'Für heute ist das KI-Kontingent aufgebraucht',
  );
  expect(await recipeServings(MANGO)).toBe(4);
});

test('AC-026: a proposal without "Beispielantwort" changes nothing until "Übernehmen"; then 6 portions, also at Nadja', async ({
  page,
  browser,
  requests,
}) => {
  needsAi();
  await open(page, `/rezept/${MANGO}`);
  await expect(tid(page, 'servings-value')).toHaveText('4');
  await askAssistant(page, VEGAN);
  const proposal = tid(page, 'proposal');
  await expect(proposal).toBeVisible();
  await expect(proposal).toContainText('Portionen');
  await expect(proposal).not.toContainText('Beispielantwort');
  const stub = aiFixtures.assistant({ context: { recipeId: MANGO } });
  await expect(tid(page, 'proposal-note')).toHaveText(stub.proposal?.note ?? '');
  expect(requests.filter((url) => url.endsWith('/functions/v1/ai-assistant'))).toHaveLength(1);
  // Nothing is changed by the proposal itself.
  expect(await recipeServings(MANGO)).toBe(4);

  await tid(page, 'proposal-accept').click();
  await tid(page, 'assistant-sheet-close').click();
  await expect(tid(page, 'servings-value')).toHaveText('6');
  await expect.poll(() => recipeServings(MANGO)).toBe(6);

  const nadja = await secondDevice(browser, 'nadja');
  await nadja.page.goto(`/rezept/${MANGO}`);
  await expect(tid(nadja.page, 'servings-value')).toHaveText('6');
  await nadja.context.close();
});

test('AC-027: AI search sends nothing while switched off; switched on it shows chips and reasons', async ({
  page,
  requests,
}) => {
  needsAi();
  const aiSearchCalls = () => requests.filter((url) => url.endsWith('/functions/v1/ai-search'));
  await open(page, '/rezepte');
  const toggle = tid(page, 'ai-search-toggle');
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await tid(page, 'recipe-search').fill('was Schnelles mit Tofu');
  await expect(tid(page, 'recipe-count')).toBeVisible();
  // The search waits 600 ms for a pause in typing; a request would have started by now.
  await page.waitForTimeout(1_500);
  expect(aiSearchCalls()).toEqual([]);
  await expect(tid(page, 'ai-search-results')).toBeHidden();

  await toggle.click();
  const results = tid(page, 'ai-search-results');
  await expect(results).toBeVisible();
  for (const chip of aiFixtures.aiSearch().chips) {
    await expect(tid(page, `ai-chip-${chip.id}`)).toContainText(chip.label);
  }
  await expect(results.locator('[data-testid^="ai-result-"]')).toHaveCount(1);
  await expect(results.locator('[data-testid^="ai-result-"]')).toContainText(
    'Mit Räuchertofu, in 25 Minuten fertig',
  );
  expect(aiSearchCalls()).toHaveLength(1);
});

test('AC-028: dictation gives three proposal rows; the Foundry key is nowhere in the browser', async ({
  page,
}) => {
  needsAi();
  const tokens: unknown[] = [];
  page.on('response', async (response) => {
    if (response.url().endsWith('/functions/v1/speech-token') && response.ok()) {
      tokens.push(await response.json());
    }
  });
  await fakeSpeech(page, 'Milch, sechs Eier und Brot.');
  await open(page, '/liste');
  await tid(page, 'dictate').click();
  await expect(tid(page, 'dictation-live')).toContainText('Milch, sechs Eier und Brot');
  await tid(page, 'dictation-stop').click();
  const ghosts = page.locator(
    '[data-testid^="ghost-"]:not([data-testid*="-a"]):not([data-testid*="-d"]):visible',
  );
  await expect(ghosts).toHaveCount(3);
  await expect(tid(page, 'ghost-0')).toContainText('Milch');
  await expect(tid(page, 'ghost-1')).toContainText('Eier');
  await expect(tid(page, 'ghost-2')).toContainText('Brot');
  await tid(page, 'ghost-discard-all').click();
  await expect(ghosts).toHaveCount(0);

  // Only a short-lived token reached the browser.
  expect(tokens).toHaveLength(1);
  expect(Object.keys(tokens[0] as object).sort()).toEqual(
    ['expiresAt', 'language', 'region', 'token'].sort(),
  );

  // Bundle scan: neither the Foundry key nor a service key is part of the web build. The key is
  // compared in-process and never printed.
  const key = process.env.FOUNDRY_API_KEY?.trim();
  const leaks: string[] = [];
  for (const file of filesIn(dist)) {
    const text = readFileSync(file, 'latin1');
    if (key && text.includes(key)) leaks.push(`${path.relative(dist, file)}: Foundry key`);
    // A secret key value or a service_role JWT (base64 of "service_role"); supabase-js itself
    // only contains the prefix "sb_secret_" in a check of the key type.
    if (/sb_secret_[A-Za-z0-9_-]{16,}|c2VydmljZV9yb2xl|"role":\s*"service_role"/.test(text)) {
      leaks.push(`${path.relative(dist, file)}: service key`);
    }
    if (text.includes('FOUNDRY_')) leaks.push(`${path.relative(dist, file)}: FOUNDRY_ name`);
  }
  expect(leaks).toEqual([]);
  const html = await page.content();
  expect(key ? html.includes(key) : false).toBe(false);
});

test('AC-031: a short link is resolved by the server: name and coordinates of the shared place', async ({
  page,
  context,
}) => {
  await context.route(/^https:\/\/(maps\.apple\.com|www\.google\.com\/maps)/, (route) =>
    route.fulfill({ body: 'map stub', contentType: 'text/plain' }),
  );
  const place = aiFixtures.resolveMapsLink();
  await open(page, '/rezepte?ansicht=restaurants');
  await tid(page, 'restaurant-new').click();
  await tid(page, 'restaurant-start-path-create').click();
  await tid(page, 'restaurant-link').fill('https://maps.app.goo.gl/Kurz123');
  await expect(tid(page, 'restaurant-link-short')).toBeVisible();
  await tid(page, 'restaurant-save').click();
  await expect(tid(page, 'restaurant-title')).toHaveText(place.name);
  await tid(page, 'restaurant-route').click();
  const [popup] = await Promise.all([
    page.context().waitForEvent('page'),
    tid(page, 'route-google').click(),
  ]);
  await popup.waitForLoadState();
  expect(popup.url()).toContain(`destination=${place.location?.lat},${place.location?.lng}`);
  await popup.close();
});

test('AC-032: a link that does not lead to Google Maps: "Das ist kein Karten-Link", nothing saved', async ({
  page,
  allowConsoleError,
}) => {
  allowConsoleError(/^Failed to load resource: the server responded with a status of 422/);
  await page.route('**/functions/v1/resolve-maps-link', (route) =>
    fulfilError(route, 'not_a_maps_link'),
  );
  await open(page, '/rezepte?ansicht=restaurants');
  const count = await tid(page, 'restaurant-count').innerText();
  await tid(page, 'restaurant-new').click();
  await tid(page, 'restaurant-start-path-create').click();
  await tid(page, 'restaurant-link').fill('https://maps.app.goo.gl/Umleitung');
  await tid(page, 'restaurant-save').click();
  await expect(tid(page, 'restaurant-link-error')).toHaveText('Das ist kein Karten-Link');
  await expect(tid(page, 'restaurant-sheet')).toBeVisible();
  await tid(page, 'restaurant-sheet-close').click();
  await expect(tid(page, 'restaurant-count')).toHaveText(count);
  await expect(tidPrefix(page, 'restaurant-').filter({ hasText: 'Umleitung' })).toHaveCount(0);
});

test('live: the real assistant answers about Mango-Curry (E2E_LIVE_AI=1 only)', async ({
  page,
  context,
}) => {
  needsAi();
  test.skip(process.env.E2E_LIVE_AI !== '1', 'calls Foundry: only with E2E_LIVE_AI=1');
  test.setTimeout(120_000);
  await context.unroute('**/functions/v1/ai-assistant');
  await open(page, `/rezept/${MANGO}`);
  await askAssistant(page, 'Wie viele Portionen hat das Rezept?');
  await expect(tid(page, 'assistant-answer')).toBeVisible({ timeout: 60_000 });
  await expect(tid(page, 'assistant-answer')).not.toContainText('nicht erreichbar');
  await expect(tid(page, 'assistant-answer')).not.toContainText('Kontingent');
});
