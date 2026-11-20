// Global setup of the dev-mode smoke test (playwright.dev.config.ts): the root .env and a fresh
// seed. The Expo dev server itself is started by the config's webServer.
import { loadEnv, resetDatabase } from './global-setup';

export default function globalSetupDev(): void {
  loadEnv();
  resetDatabase();
}
