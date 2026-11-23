// Lint rules of eslint.config.mjs that guard the architecture (spec 0031, REQ-019): package
// boundaries, no warnings, no ts-comment, a reason for every disable. Probes lint a snippet as if
// it were a file at the given path; nothing is written to disk.
//
//   node --test scripts/ci/lint.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const eslint = new ESLint({ cwd: root });

/** The rule ids eslint reports for `code` as the file `file` (relative to the repository). */
async function ruleIds(file, code) {
  const [result] = await eslint.lintText(code, { filePath: path.join(root, file) });
  return result.messages.map((message) => message.ruleId ?? message.message);
}

const importOf = (specifier) => `import { x } from '${specifier}';\n\nexport const y = x;\n`;

describe('package boundaries (AC-047)', () => {
  const FORBIDDEN_IN_CORE = [
    'react',
    'react-native',
    'expo-router',
    '@supabase/supabase-js',
    'idb-keyval',
    '@housekeeping/ui',
    '@housekeeping/api',
    '@/lib/url-state',
    '../../../apps/app/src/lib/url-state',
  ];

  test("AC-047: `import { useState } from 'react'` in packages/core/src is red", async () => {
    const ids = await ruleIds(
      'packages/core/src/probe.ts',
      "import { useState } from 'react';\n\nexport const probe = useState;\n",
    );
    assert.deepEqual(ids, ['no-restricted-imports']);
  });

  test('AC-047: core imports nothing internal, no React, Expo, Supabase or idb-keyval', async () => {
    for (const specifier of FORBIDDEN_IN_CORE) {
      const ids = await ruleIds('packages/core/src/probe.ts', importOf(specifier));
      assert.ok(ids.includes('no-restricted-imports'), specifier);
    }
  });

  test('AC-047: ui imports nothing internal and nothing from the app; React stays allowed', async () => {
    for (const specifier of [
      '@housekeeping/core',
      '@housekeeping/api',
      '@/lib/url-state',
      '../../../apps/app/src/lib/url-state',
    ]) {
      const ids = await ruleIds('packages/ui/src/probe.tsx', importOf(specifier));
      assert.ok(ids.includes('no-restricted-imports'), specifier);
    }
    assert.deepEqual(await ruleIds('packages/ui/src/probe.tsx', importOf('react-native')), []);
  });

  test('AC-047: api may import core, never the app', async () => {
    assert.deepEqual(
      await ruleIds('packages/api/src/probe.ts', importOf('@housekeeping/core')),
      [],
    );
    for (const specifier of ['@/lib/url-state', '../../../apps/app/src/lib/url-state']) {
      const ids = await ruleIds('packages/api/src/probe.ts', importOf(specifier));
      assert.ok(ids.includes('no-restricted-imports'), specifier);
    }
  });

  test('the app keeps its own rules: only the public interface of api and ui', async () => {
    const ids = await ruleIds('apps/app/src/probe.ts', importOf('@housekeeping/api/src/backend'));
    assert.deepEqual(ids, ['no-restricted-imports']);
    assert.deepEqual(await ruleIds('apps/app/src/probe.ts', importOf('@housekeeping/api')), []);
  });
});

describe('comments and warnings (AC-048)', () => {
  test('AC-048: an eslint-disable without "-- reason" is red, with a reason it is not', async () => {
    const code = (comment) =>
      `export function probe(value: number) {\n  // ${comment}\n  return value == 1;\n}\n`;
    assert.deepEqual(
      await ruleIds('packages/core/src/probe.ts', code('eslint-disable-next-line eqeqeq')),
      ['@eslint-community/eslint-comments/require-description'],
    );
    assert.deepEqual(
      await ruleIds(
        'apps/app/src/probe.ts',
        code('eslint-disable-next-line eqeqeq -- the probe compares loosely'),
      ),
      [],
    );
  });

  test('AC-048: @ts-ignore and @ts-nocheck are red, @ts-expect-error only with a reason', async () => {
    const line = (comment) => `// ${comment}\nexport const probe: number = 1;\n`;
    for (const comment of ['@ts-ignore', '@ts-nocheck', '@ts-expect-error']) {
      assert.deepEqual(
        await ruleIds('packages/api/src/probe.ts', line(comment)),
        ['@typescript-eslint/ban-ts-comment'],
        comment,
      );
    }
    assert.deepEqual(
      await ruleIds(
        'packages/api/src/probe.ts',
        line('@ts-expect-error -- the probe needs a reason'),
      ),
      [],
    );
  });

  test('AC-048: every lint script fails on a warning (--max-warnings=0)', () => {
    const packages = [
      'apps/app',
      'e2e',
      'packages/api',
      'packages/core',
      'packages/ui',
      'supabase/functions',
    ];
    for (const dir of packages) {
      const { scripts } = JSON.parse(readFileSync(path.join(root, dir, 'package.json'), 'utf8'));
      assert.equal(scripts.lint, 'eslint . --max-warnings=0', dir);
    }
  });
});
