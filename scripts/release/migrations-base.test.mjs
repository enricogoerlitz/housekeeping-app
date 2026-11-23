// scripts/release/migrations-base.mjs (spec 0031, REQ-001): the one-time exception for the new
// migration base of the first productive version, read from supabase/migrations-base.json.
//
//   node --test scripts/release/migrations-base.test.mjs
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { baseApplies, parseMigrationsBase, readMigrationsBase } from './migrations-base.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
mkdirSync(path.join(root, 'tmp'), { recursive: true });
const dir = mkdtempSync(path.join(root, 'tmp', 'migrations-base-test-'));
after(() => rmSync(dir, { recursive: true, force: true }));

const BASE = { replaces: 'v2026.11.1', first: '20261124000000' };

describe('migrations-base.json', () => {
  test('is read with the tag it replaces and the first version of the new base', () => {
    assert.deepEqual(parseMigrationsBase(JSON.stringify(BASE)), BASE);
  });

  test('a broken file is an error, never a silent exception', () => {
    assert.throws(() => parseMigrationsBase('{'), /migrations-base\.json ist keine JSON/);
    assert.throws(
      () => parseMigrationsBase(JSON.stringify({ ...BASE, replaces: '2026.11.1' })),
      /replaces.*v<JJJJ\.M\.N>/,
    );
    assert.throws(
      () => parseMigrationsBase(JSON.stringify({ ...BASE, first: '2026-11-24' })),
      /first.*14 Ziffern/,
    );
    assert.throws(() => parseMigrationsBase(JSON.stringify({ first: BASE.first })), /replaces/);
  });

  test('security check 0031: only the one tag of the first productive version may be replaced', () => {
    assert.throws(
      () => parseMigrationsBase(JSON.stringify({ ...BASE, replaces: 'v2026.12.1' })),
      /„replaces“ darf nur v2026\.11\.1 sein/,
    );
  });

  test('without the file there is no exception', () => {
    assert.equal(readMigrationsBase(dir), undefined);
    mkdirSync(path.join(dir, 'supabase'), { recursive: true });
    writeFileSync(path.join(dir, 'supabase/migrations-base.json'), JSON.stringify(BASE));
    assert.deepEqual(readMigrationsBase(dir), BASE);
  });

  test('AC-001, AC-003: it applies only while `replaces` is the latest release tag', () => {
    assert.equal(baseApplies(BASE, 'v2026.11.1'), true);
    assert.equal(baseApplies(BASE, 'v2026.12.1'), false);
    assert.equal(baseApplies(BASE, undefined), false);
    assert.equal(baseApplies(undefined, 'v2026.11.1'), false);
  });
});
