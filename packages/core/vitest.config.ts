import { defineConfig } from 'vitest/config';

// Coverage (spec 0031, REQ-005): `pnpm test` measures every source file, also those no test
// loads, and fails below 80 % of the lines. Single test files run without it.
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        // The tests themselves.
        'src/**/*.test.ts',
        // Shared test data of the tests, not product code.
        'src/test-fixtures.ts',
      ],
      reporter: ['text-summary'],
      thresholds: { lines: 80 },
    },
  },
});
