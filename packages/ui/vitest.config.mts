import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const mock = (name: string) => fileURLToPath(new URL(`./test/mocks/${name}`, import.meta.url));

export default defineConfig({
  test: {
    // Coverage (spec 0031, REQ-005): `pnpm test` measures every source file of both projects, also
    // those no test loads, and fails below 80 % of the lines. Single test files run without it.
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        // The tests themselves; the stand-ins under test/ are outside `include`.
        'src/**/*.test.{ts,tsx}',
      ],
      reporter: ['text-summary'],
      thresholds: { lines: 80 },
    },
    projects: [
      {
        // Pure logic next to the components: plain Node.
        test: { name: 'logic', include: ['src/**/*.test.ts'], environment: 'node' },
      },
      {
        // Components (spec 0031, REQ-010): rendered with react-native-web in jsdom, as on the web.
        // Native modules without a web build in jsdom get a stand-in from test/mocks.
        resolve: {
          alias: [
            { find: /^react-native$/, replacement: 'react-native-web' },
            { find: /^react-native-reanimated$/, replacement: mock('reanimated.tsx') },
            { find: /^react-native-worklets$/, replacement: mock('worklets.ts') },
            { find: /^react-native-safe-area-context$/, replacement: mock('safe-area.tsx') },
            { find: /^expo-image$/, replacement: mock('expo-image.tsx') },
            { find: /^expo-haptics$/, replacement: mock('expo-haptics.ts') },
            {
              find: /^@react-native\/assets-registry\/registry$/,
              replacement: mock('assets-registry.ts'),
            },
          ],
          // The ES builds, which go through Vite and the aliases (react-native-svg's CommonJS build
          // requires the real `react-native`). Metro picks `.web` files on the web; so do the tests.
          mainFields: ['module', 'main'],
          extensions: ['.web.tsx', '.web.ts', '.web.js', '.tsx', '.ts', '.mjs', '.js', '.json'],
        },
        test: {
          name: 'components',
          include: ['src/**/*.test.tsx'],
          environment: 'jsdom',
          setupFiles: ['test/setup.ts'],
          server: { deps: { inline: ['lucide-react-native', 'react-native-svg'] } },
        },
      },
    ],
  },
});
