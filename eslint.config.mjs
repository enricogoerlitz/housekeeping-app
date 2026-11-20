// Shared lint config for every workspace package. ESLint finds this file from any package dir.
import { defineConfig } from 'eslint/config';
import expoConfig from 'eslint-config-expo/flat.js';

const COLOR_LITERAL = String.raw`/^(#[0-9a-fA-F]{3,8}|rgba?\(.*\)|hsla?\(.*\))$/`;

export default defineConfig([
  expoConfig,
  {
    // Packages without React (e.g. core) cannot auto-detect the version.
    settings: { react: { version: '19.3' } },
  },
  {
    // Spec 0001: screens use only design tokens and the public data interface.
    files: ['apps/app/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: `Literal[value=${COLOR_LITERAL}]`,
          message:
            'Keine Farbwerte im App-Code: Farben kommen aus @housekeeping/ui (useTheme().colors / Bausteine).',
        },
        {
          selector: `TemplateElement[value.raw=${COLOR_LITERAL}]`,
          message: 'Keine Farbwerte im App-Code: Farben kommen aus @housekeeping/ui.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@housekeeping/api/*', '**/packages/api/**'],
              message:
                'Bildschirme nutzen nur die öffentliche Schnittstelle: import … from "@housekeeping/api".',
            },
            {
              group: ['@housekeeping/ui/*', '**/packages/ui/**'],
              message: 'Nur über "@housekeeping/ui" importieren.',
            },
            {
              group: ['lucide-react-native'],
              message: 'Symbole kommen aus @housekeeping/ui (Icon / IconButton).',
            },
          ],
        },
      ],
    },
  },
  {
    ignores: [
      '**/dist/**',
      '**/.expo/**',
      '**/node_modules/**',
      '**/coverage/**',
      'tmp/**',
      '**/playwright-report/**',
      '**/test-results/**',
    ],
  },
]);
