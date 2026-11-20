// Records the walk-through of spec 0001 (REQ-005 to REQ-009) and spec 0002 as videos with German
// captions: tmp/demo/rundgang.webm (phone, 390 px) and tmp/demo/rundgang-desktop.webm (1440 px).
//
// DEMO-ONLY, OUT OF DATE since spec 0003: the script drives the in-memory demo of spec 0001/0002
// (no sign-in, slug ids, a fixed Monday, sample AI answers). The app now always runs against
// Supabase, so the script stops with a message until it is rewritten like the e2e walk-through
// (login, e2e/seed-ids.ts, relative days, stubbed edge functions, faked dictation).
//
// Usage (repository root): pnpm demo:video
// Uses apps/app/dist; exports the web build first if it is missing.
// A failing step ends the run with exit code 1 and names the step (spec 0001, AC-045).
//
// Playwright records WebM. For an MP4 (e.g. for iMessage), convert it with ffmpeg:
//   ffmpeg -i tmp/demo/rundgang.webm -c:v libx264 -pix_fmt yuv420p tmp/demo/rundgang.mp4
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const dist = path.join(repo, 'apps/app/dist');
const outDir = path.join(repo, 'tmp/demo');
const PORT = 8792;
const BASE = `http://127.0.0.1:${PORT}`;

// Same fixed Monday as the tests (e2e/helpers.ts), so the plan steps always find the same days.
const FIXED_NOW = new Date(2026, 10, 16, 12, 0, 0);
const day = (offset) => {
  const date = new Date(FIXED_NOW);
  date.setDate(date.getDate() + offset);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${String(date.getDate()).padStart(2, '0')}`;
};
const TODAY = day(0);
const THURSDAY = day(3);
const CURRY_DAY = day(2);

// Pacing of the video: how long a caption or a result stays on screen.
const READ = 2200;
const LOOK = 1100;

class StepError extends Error {
  constructor(step, detail = '') {
    super(detail ? `${step}: ${detail}` : step);
    this.step = step;
    this.detail = detail;
  }
}

function ensureBuild() {
  if (fs.existsSync(path.join(dist, 'index.html'))) return;
  console.log('Web-Build fehlt – exportiere apps/app …');
  const result = spawnSync(
    'pnpm',
    ['--filter', '@housekeeping/app', 'exec', 'expo', 'export', '--platform', 'web'],
    { cwd: repo, stdio: 'inherit' },
  );
  if (result.status !== 0) throw new StepError('Web-Build exportieren');
}

async function startServer() {
  const server = spawn(process.execPath, [path.join(here, 'serve.mjs'), dist, String(PORT)], {
    stdio: 'ignore',
  });
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(BASE);
      if (response.ok) return server;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  server.kill();
  throw new StepError('Server starten');
}

/** A caption bar at the top of the page; not part of the app, so plain inline styles. */
async function caption(page, title, text) {
  await page.evaluate(
    ([title, text]) => {
      let bar = document.getElementById('demo-caption');
      if (!bar) {
        bar = document.createElement('div');
        bar.id = 'demo-caption';
        bar.setAttribute('aria-hidden', 'true');
        Object.assign(bar.style, {
          position: 'fixed',
          top: '0',
          left: '0',
          right: '0',
          zIndex: '2147483647',
          padding: '10px 16px 12px',
          background: 'rgba(20, 20, 20, 0.86)',
          color: '#fff',
          font: '15px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          pointerEvents: 'none',
        });
        document.body.appendChild(bar);
      }
      bar.innerHTML = '';
      const strong = document.createElement('div');
      strong.textContent = title;
      strong.style.fontWeight = '700';
      const small = document.createElement('div');
      small.textContent = text;
      small.style.opacity = '0.9';
      bar.append(strong, small);
    },
    [title, text],
  );
  await page.waitForTimeout(READ);
}

/** The element with this test id on the active screen (inactive screens stay mounted, inert). */
const tid = (page, id) => page.locator(`[data-testid="${id}"]:not([inert] *):visible`).first();

async function step(name, action) {
  try {
    await action();
    console.log(`  ✓ ${name}`);
  } catch (error) {
    throw new StepError(name, String(error?.message ?? error).split('\n')[0]);
  }
}

async function record(browser, options) {
  const rawDir = path.join(outDir, `raw-${options.name}`);
  fs.rmSync(rawDir, { recursive: true, force: true });
  const context = await browser.newContext({
    viewport: options.viewport,
    deviceScaleFactor: 1,
    locale: 'de-DE',
    recordVideo: { dir: rawDir, size: options.viewport },
  });
  await context.route(/^https:\/\/(maps\.apple\.com|www\.google\.com\/maps)/, (route) =>
    route.fulfill({
      body: '<body style="font:20px sans-serif;padding:40px">Karten-App (im Rundgang simuliert)</body>',
      contentType: 'text/html',
    }),
  );
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  await page.clock.setFixedTime(FIXED_NOW);
  const video = page.video();
  let failed;
  try {
    await options.run(page);
  } catch (error) {
    failed = error;
  } finally {
    await context.close();
  }
  const target = path.join(outDir, options.file);
  if (!failed && video) {
    fs.renameSync(await video.path(), target);
    console.log(`Video: ${path.relative(repo, target)}`);
  }
  fs.rmSync(rawDir, { recursive: true, force: true });
  if (failed) throw failed;
}

async function phoneTour(page) {
  const tab = (key) => tid(page, `tab-${key}`).click();

  await step('Heute öffnen', async () => {
    await page.goto(`${BASE}/`);
    await tid(page, 'today-screen').waitFor();
    await caption(
      page,
      'Heute',
      'Was es heute zu essen gibt, die Vorbereitung für morgen, fällige Aufgaben und der Einkauf.',
    );
    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(LOOK);
  });

  await step('Rezept mit Portionen und Varianten', async () => {
    await tab('rezepte');
    await caption(page, 'Essen · Rezepte', 'Suchen, filtern, sortieren – und ein Rezept öffnen.');
    await tid(page, 'recipe-card-rec-mango-curry').click();
    await tid(page, 'recipe-title').waitFor();
    await page.waitForTimeout(LOOK);
    await tid(page, 'recipe-ingredients').scrollIntoViewIfNeeded();
    await caption(
      page,
      'Portionen und Varianten',
      'Aus 4 werden 6 Portionen, die Mengen rechnen mit.',
    );
    await tid(page, 'servings-plus').click();
    await tid(page, 'servings-plus').click();
    await page.waitForTimeout(LOOK);
    await caption(
      page,
      'Variante wählen',
      '„mit Hähnchen“ statt „mit Tofu“ – Zutaten und Ernährungsform wechseln.',
    );
    await tid(page, 'variant-mango-curry-v2').click();
    await page.waitForTimeout(LOOK);
  });

  await step('Assistent schlägt eine Änderung vor', async () => {
    await page.mouse.wheel(0, -2000);
    await tid(page, 'recipe-assistant').click();
    await caption(
      page,
      'Assistent (Beispielantwort)',
      'Er schlägt nur vor und zeigt die Änderungen – übernehmen tust du.',
    );
    await tid(page, 'assistant-example-0').click();
    await tid(page, 'proposal').waitFor();
    await page.waitForTimeout(READ);
    await tid(page, 'assistant-sheet-close').click();
    await tid(page, 'back').click();
  });

  await step('Wochenplan: Rezept hinzufügen', async () => {
    await tab('plan');
    await caption(page, 'Wochenplan', 'Am Donnerstagabend ist noch nichts geplant.');
    await tid(page, `add-${THURSDAY}-slot-abend`).scrollIntoViewIfNeeded();
    await tid(page, `add-${THURSDAY}-slot-abend`).click();
    await tid(page, 'add-entry-search').fill('Mango');
    await tid(page, 'add-entry-recipe-rec-mango-curry').click();
    await caption(
      page,
      'Wer isst mit?',
      'Enrico und Nadja sind vorausgewählt; die Varianten teilen sich passend auf.',
    );
    await tid(page, 'add-entry-save').click();
    await page.waitForTimeout(LOOK);
  });

  await step('Liste: Smart-Eingabe', async () => {
    await tab('liste');
    await caption(page, 'Einkaufsliste', 'Menge, Artikel und Zusatz in einer Zeile.');
    await tid(page, 'smart-input').click();
    await tid(page, 'smart-input').pressSequentially('2 Käse (Gouda oder Emmentaler)', {
      delay: 45,
    });
    await page.waitForTimeout(LOOK);
    await tid(page, 'smart-input').press('Enter');
    await page.waitForTimeout(LOOK);
  });

  await step('Liste: Vorratscheck aus dem Plan', async () => {
    await tid(page, 'list-from-plan').click();
    for (const chip of await page
      .locator('[data-testid^="pc-day-"]:not([inert] *):visible')
      .all()) {
      const id = await chip.getAttribute('data-testid');
      const selected = (await chip.getAttribute('aria-selected')) === 'true';
      if ((id === `pc-day-${CURRY_DAY}`) !== selected) await chip.click();
    }
    await caption(
      page,
      'Vorratscheck',
      'Die Zutaten des Mango-Currys – Reis und Gewürze sind meist da.',
    );
    await tid(page, 'pc-next').click();
    await page.waitForTimeout(LOOK);
    await tid(page, 'pc-pantry-toggle').click();
    await page.waitForTimeout(READ);
    await tid(page, 'pc-apply').click();
    await page.waitForTimeout(LOOK);
  });

  await step('Einkaufsmodus nach Laufweg', async () => {
    await tid(page, 'store-chip').click();
    await tid(page, 'store-option-store-rewe').click();
    await tid(page, 'start-shopping').click();
    await tid(page, 'shopping-progress').waitFor();
    await caption(
      page,
      'Einkaufsmodus · Rewe Südstadt',
      'Sortiert nach dem Laufweg im Markt, mit Fortschritt.',
    );
    const checks = page.locator(
      '[data-testid^="sm-item-"][data-testid$="-check"]:not([inert] *):visible',
    );
    await checks.nth(0).click();
    await page.waitForTimeout(500);
    await checks.nth(0).click();
    await page.waitForTimeout(READ);
    await tid(page, 'shopping-close').click();
  });

  await step('Haushalt: Aufgabe abhaken', async () => {
    await tab('haushalt');
    await caption(
      page,
      'Haushalt',
      '„Bad putzen“ ist heute dran – abhaken, und bei Bedarf auf Nadja umbuchen.',
    );
    await tid(page, 'chore-chore-bad-check').click();
    await page.waitForTimeout(READ);
    await tid(page, 'chores-tab-history').click();
    await caption(page, 'Verlauf', 'Wer hat wann was erledigt.');
  });

  await step('Restaurant im Plan und Route', async () => {
    await tab('plan');
    await tid(page, `add-${TODAY}-slot-mittag`).click();
    await tid(page, 'add-entry-mode-restaurant').click();
    await caption(
      page,
      'Restaurant einplanen',
      'Statt eines Rezepts geht es heute Mittag zum Italiener.',
    );
    await tid(page, 'add-entry-restaurant-rest-enzo').click();
    await tid(page, 'add-entry-restaurant-save').click();
    await tab('index');
    const route = page.locator('[data-testid^="today-route-"]:not([inert] *):visible').first();
    await route.scrollIntoViewIfNeeded();
    await caption(page, 'Route', 'Mit einem Tipp in Apple Karten oder Google Maps.');
    await route.click();
    await tid(page, 'route-sheet').waitFor();
    await page.waitForTimeout(LOOK);
    const [popup] = await Promise.all([
      page.context().waitForEvent('page'),
      tid(page, 'route-apple').click(),
    ]);
    await popup.close();
  });

  await step('Restaurants in „Essen“', async () => {
    await tab('rezepte');
    await tid(page, 'food-switch-restaurants').click();
    await caption(
      page,
      'Essen · Restaurants',
      'Eigene Bewertung, Favorit und Notiz – angelegt aus einem Karten-Link.',
    );
    await tid(page, 'restaurant-rest-pho').click();
    await tid(page, 'restaurant-visits').waitFor();
    await caption(page, 'Pho Saigon', 'Wann wart ihr zuletzt da? Das weiß der Plan.');
  });
}

async function desktopTour(page) {
  const nav = (key) => tid(page, `nav-${key}`).click();
  await step('Desktop: Heute', async () => {
    await page.goto(`${BASE}/`);
    await tid(page, 'today-screen').waitFor();
    await caption(page, 'Am Desktop', 'Navigation an der Seite, Inhalte in mehreren Spalten.');
  });
  await step('Desktop: Rezeptliste und Rezept nebeneinander', async () => {
    await nav('rezepte');
    await tid(page, 'recipe-card-rec-mango-curry').click();
    await tid(page, 'recipe-detail').waitFor();
    await caption(page, 'Essen', 'Liste links, Rezept rechts.');
  });
  await step('Desktop: Wochenplan', async () => {
    await nav('plan');
    await caption(page, 'Wochenplan', 'Die ganze Woche auf einen Blick.');
  });
  await step('Desktop: Liste', async () => {
    await nav('liste');
    await caption(page, 'Einkaufsliste', 'Bereiche in zwei Spalten.');
  });
  await step('Desktop: Restaurants', async () => {
    await nav('rezepte');
    await tid(page, 'food-switch-restaurants').click();
    await tid(page, 'restaurant-rest-enzo').click();
    await tid(page, 'restaurant-detail').waitFor();
    await caption(page, 'Restaurants', 'Liste und Restaurant nebeneinander.');
  });
}

async function main() {
  console.error(
    'record-video.mjs ist noch auf die Demo von Spec 0001/0002 ausgelegt und läuft nicht gegen das Backend (Spec 0003).',
  );
  process.exit(1);
  fs.mkdirSync(outDir, { recursive: true });
  ensureBuild();
  const server = await startServer();
  const browser = await chromium.launch({ slowMo: 120 });
  try {
    console.log('Rundgang (Handy, 390 px):');
    await record(browser, {
      name: 'phone',
      file: 'rundgang.webm',
      viewport: { width: 390, height: 844 },
      run: phoneTour,
    });
    console.log('Rundgang (Desktop, 1440 px):');
    await record(browser, {
      name: 'desktop',
      file: 'rundgang-desktop.webm',
      viewport: { width: 1440, height: 900 },
      run: desktopTour,
    });
  } finally {
    await browser.close();
    server.kill();
  }
}

main().catch((error) => {
  if (error instanceof StepError) {
    console.error(`\nRundgang fehlgeschlagen im Schritt „${error.step}“`);
    if (error.detail) console.error(error.detail);
  } else {
    console.error('\nRundgang fehlgeschlagen:', error);
  }
  process.exit(1);
});
