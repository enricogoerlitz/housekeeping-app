// Shared lint config for every workspace package. ESLint finds this file from any package dir.
import comments from '@eslint-community/eslint-plugin-eslint-comments';
import { defineConfig } from 'eslint/config';
import expoConfig from 'eslint-config-expo/flat.js';

const COLOR_LITERAL = String.raw`/^(#[0-9a-fA-F]{3,8}|rgba?\(.*\)|hsla?\(.*\))$/`;

// Package boundaries (AGENTS.md, spec 0031 REQ-019): no package ever imports from an app.
const NO_APP = [
  {
    group: ['@/*', '**/apps/**'],
    message: 'Pakete importieren nie aus einer App.',
  },
];

/** no-restricted-imports for one package: the shared rule plus its own patterns. */
const restrictImports = (...patterns) => ['error', { patterns: [...NO_APP, ...patterns] }];

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
    // `core` is pure domain logic: nothing internal, no React, no Expo, no Supabase, no I/O.
    files: ['packages/core/**/*.{ts,tsx,js,mjs}'],
    rules: {
      'no-restricted-imports': restrictImports({
        group: [
          '@housekeeping/*',
          'react',
          'react-*',
          'react/*',
          'expo',
          'expo-*',
          '@expo/*',
          '@supabase/*',
          'idb-keyval',
        ],
        message:
          'core ist reine Logik: keine internen Pakete, kein React, kein Expo, kein Supabase, keine I/O.',
      }),
    },
  },
  {
    files: ['packages/ui/**/*.{ts,tsx,js,mjs}'],
    rules: {
      'no-restricted-imports': restrictImports({
        group: ['@housekeeping/*'],
        message: 'ui importiert keine internen Pakete.',
      }),
    },
  },
  {
    // `api` may import `core`.
    files: ['packages/api/**/*.{ts,tsx,js,mjs}'],
    rules: { 'no-restricted-imports': restrictImports() },
  },
  {
    // A suppressed type error needs a reason; @ts-ignore and @ts-nocheck are never allowed.
    files: ['**/*.{ts,tsx}'],
    rules: { '@typescript-eslint/ban-ts-comment': 'error' },
  },
  {
    // Every eslint-disable says why: `// eslint-disable-next-line <rule> -- <reason>`.
    plugins: { '@eslint-community/eslint-comments': comments },
    rules: { '@eslint-community/eslint-comments/require-description': 'error' },
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
