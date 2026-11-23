// Coverage gate (spec 0031, REQ-005, AC-015 to AC-017): core, api and ui measure every source file
// in `pnpm check` and fail below 80 % of the lines. This test keeps the gate from being dropped
// quietly: the test script measures, the threshold stays at 80 or above, and every exclusion
// carries its reason in the line above it.
//
//   node --test scripts/ci/coverage.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PACKAGES = {
  core: 'packages/core/vitest.config.ts',
  api: 'packages/api/vitest.config.mts',
  ui: 'packages/ui/vitest.config.mts',
};

/** The entries of the coverage `exclude` list with the comment lines right above each. */
function exclusions(config) {
  const block = /exclude:\s*\[([\s\S]*?)\]/.exec(config)?.[1] ?? '';
  const entries = [];
  let comment = false;
  for (const line of block.split('\n').map((text) => text.trim())) {
    if (line.startsWith('//')) comment = true;
    else if (line.startsWith("'")) {
      for (const entry of line.match(/'[^']+'/g) ?? []) entries.push({ entry, comment });
    } else if (line === '') comment = false;
  }
  return entries;
}

describe('coverage gate', () => {
  for (const [name, file] of Object.entries(PACKAGES)) {
    test(`AC-015, AC-016: ${name} measures all its source files and fails below 80 % lines`, () => {
      const pkg = JSON.parse(
        readFileSync(path.join(root, `packages/${name}/package.json`), 'utf8'),
      );
      assert.match(pkg.scripts.test, /vitest run --coverage\b/);
      const config = readFileSync(path.join(root, file), 'utf8');
      assert.match(config, /provider:\s*'v8'/);
      assert.match(config, /include:\s*\['src\/\*\*\/\*\.(ts|\{ts,tsx\})'\]/);
      const lines = Number(/thresholds:\s*\{\s*lines:\s*(\d+)/.exec(config)?.[1]);
      assert.ok(lines >= 80, `${name}: threshold ${lines} below 80`);
    });

    test(`${name}: every exclusion has its reason and is a test, a test helper or generated`, () => {
      const config = readFileSync(path.join(root, file), 'utf8');
      for (const { entry, comment } of exclusions(config)) {
        assert.ok(comment, `${name}: ${entry} without a reason`);
        assert.match(entry, /\.test\.|test-fixtures|test-helpers|transport-fake|\.gen\.ts/);
      }
    });
  }

  test('an exclusion without the comment above it is found', () => {
    const config = "exclude: [\n  // The tests.\n  'src/**/*.test.ts',\n\n  'src/app.ts',\n]";
    assert.deepEqual(exclusions(config), [
      { entry: "'src/**/*.test.ts'", comment: true },
      { entry: "'src/app.ts'", comment: false },
    ]);
  });
});
