import { defineConfig } from '@playwright/test';

// Walk-through of spec 0001 and 0002 against the exported web build (apps/app/dist).
// The build is created only if it is missing; delete apps/app/dist to force a fresh export.
const PORT = 8790;

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.ts$/,
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 60_000,
  expect: { timeout: 7_000 },
  reporter: [['list'], ['html', { outputFolder: './playwright-report', open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: 'de-DE',
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
      // Only the files with width-specific criteria (layout, sidebar, split views) and the
      // restaurants, which run completely at both widths.
      name: 'desktop',
      testMatch: /rundgang-(shell|restaurants)\.spec\.ts$/,
      use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: `test -f ../apps/app/dist/index.html || pnpm --filter @housekeeping/app exec expo export --platform web; node ./serve.mjs ../apps/app/dist ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    stdout: 'ignore',
  },
});
