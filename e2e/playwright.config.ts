import { defineConfig } from '@playwright/test';

// Walk-through of spec 0001, 0002 and 0003 against the local backend (spec 0003, AC-034).
// Global setup: `pnpm db:reset`, the production web export with the developer switch (rebuilt
// when its inputs changed) and a static server on port 8790 (see global-setup.ts).
//
// One worker: all tests share one local database. Walk-throughs that assert on the pristine demo
// reset it in `beforeAll` (helpers.ts `freshSeed`); the spec 0003 cases create their own
// households or uniquely named rows.
const PORT = 8790;

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.ts$/,
  // The dev-mode smoke test has its own config and server (playwright.dev.config.ts).
  testIgnore: 'dev/**',
  outputDir: './test-results',
  globalSetup: './global-setup.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  // In CI a hanging shard stops itself and still writes its report (spec 0031, REQ-002).
  globalTimeout: process.env.CI ? 35 * 60_000 : 0,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { outputFolder: './playwright-report', open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: 'de-DE',
    // The seed is dated in Berlin time (supabase/seed.sql); the app's "today" must match it.
    timezoneId: 'Europe/Berlin',
    // The service worker would serve a cached build; only the offline-start test (AC-004) uses it.
    serviceWorkers: 'block',
    // A fake microphone for dictation (the Speech service itself is faked, helpers.ts).
    launchOptions: {
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    },
    actionTimeout: 15_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'phone',
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
      },
    },
    {
      // Only the files with width-specific criteria (layout, sidebar, split views), the
      // restaurants, which run completely at both widths, the version hint (spec 0014) and the
      // list-and-detail pages of the household (spec 0011), the articles (spec 0007), the
      // overview and the calendar at desktop width (specs 0020, 0021) and the day window of the
      // calendar beside the grid and dragging with the mouse (spec 0016), the desktop half of the
      // operating patterns (spec 0054) and the unfinished recipes beside the list (spec 0061).
      name: 'desktop',
      testMatch:
        /rundgang-(shell|restaurants|version|haushalt|artikel|uebersicht|kalender-0021|kalender-tag|kalender-ziehen|bedienmuster-0054|unfertige-rezepte-0061)\.spec\.ts$/,
      use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } },
    },
  ],
});
