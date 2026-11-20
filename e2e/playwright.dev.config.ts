import { defineConfig } from '@playwright/test';

// Dev-mode smoke test (`pnpm e2e:dev`): the app from the Expo dev server, where React reports
// what the production export hides (nested buttons, missing keys, act warnings). It logs in,
// visits every screen and fails on any console error or React warning.
// Port 8795 is not in the edge functions' CORS list; the AI and maps functions are stubbed in
// the browser as in the main suite.
const PORT = 8795;

export default defineConfig({
  testDir: './dev',
  outputDir: './test-results/dev',
  globalSetup: './global-setup-dev.ts',
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // The dev server bundles on the first request.
  timeout: 240_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { outputFolder: './playwright-report/dev', open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    serviceWorkers: 'block',
    browserName: 'chromium',
    viewport: { width: 390, height: 844 },
    actionTimeout: 15_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    // with-env loads the root .env; the switch below wins because .env never overrides.
    command: `node ../scripts/with-env.mjs pnpm --filter @housekeeping/app exec expo start --web --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    env: { EXPO_PUBLIC_DEV_LOGIN: '1', CI: '1', BROWSER: 'none' },
    reuseExistingServer: false,
    timeout: 240_000,
    stdout: 'ignore',
  },
});
