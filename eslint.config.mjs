// Shared lint config for every workspace package. ESLint finds this file from any package dir.
import { defineConfig } from 'eslint/config';
import expoConfig from 'eslint-config-expo/flat.js';

export default defineConfig([
  expoConfig,
  {
    // Packages without React (e.g. core) cannot auto-detect the version.
    settings: { react: { version: '19.3' } },
  },
  {
    ignores: ['**/dist/**', '**/.expo/**', '**/node_modules/**', '**/coverage/**', 'tmp/**'],
  },
]);
