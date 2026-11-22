// scripts/release/supabase-guard.mjs (spec 0014, Task 6; threat model „Alte Migrationshistorie im
// Cloud-Projekt“): before the first release the migration history of production is empty, after it
// a prefix of the local migrations that holds every migration of the latest tag. Pure functions
// with the JSON of `supabase migration list --output-format json` (CLI 3.2.0, recorded from the
// local stack in tmp/0014/task6-migration-list-local.json), plus the CLI against throwaway git
// repositories under tmp/.
//
//   node --test scripts/release/supabase-guard.test.mjs
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';

import { commit, git, repositories, root, runScript } from './git-fixture.mjs';
import { guardMigrations, parseMigrationList } from './supabase-guard.mjs';

const script = path.join(root, 'scripts/release/supabase-guard.mjs');
const repo = repositories('release-guard-test');

const A = '20261121062343';
const B = '20261121062344';
const C = '20261210000000';
const FOREIGN = '20250101000000';

/** The shape the CLI prints: one entry per version, the missing side as an empty string. */
const list = (entries) =>
  JSON.stringify({
    migrations: entries.map(([local, remote]) => ({ local, remote, time: '' })),
    message: 'Migrations listed',
    target: { kind: 'remote' },
  });

describe('parse', () => {
  test('reads the remote column of the CLI output, also after a leading line', () => {
    assert.deepEqual(
      parseMigrationList(
        `Target: remote\n${list([
          [A, A],
          [B, ''],
        ])}`,
      ),
      { remote: [A] },
    );
  });

  test('versions only in the remote column count', () => {
    assert.deepEqual(parseMigrationList(list([['', FOREIGN]])), { remote: [FOREIGN] });
  });

  test('an error of the CLI is reported with its code, without the message', () => {
    const text = JSON.stringify({
      _tag: 'Error',
      error: { code: 'DbConnectError', message: 'failed to connect to host=db.secret.example' },
    });
    const parsed = parseMigrationList(text);
    assert.match(parsed.error, /DbConnectError/);
    assert.doesNotMatch(parsed.error, /secret\.example/);
  });

  test('something that is not the expected JSON is an error', () => {
    assert.match(parseMigrationList('').error, /keine JSON/);
    assert.match(parseMigrationList('{"foo":1}').error, /migrations/);
  });
});

describe('guard', () => {
  test('before the first release an empty history passes', () => {
    assert.deepEqual(guardMigrations({ remote: [], local: [A, B], released: undefined }), []);
  });

  test('before the first release any history in production is red', () => {
    const errors = guardMigrations({ remote: [A], local: [A, B], released: undefined });
    assert.equal(errors.length, 2);
    assert.match(errors[0], /noch keine Veröffentlichung/);
    assert.match(errors[1], /Runbook B5/);
  });

  test('after a release a prefix of the local migrations passes', () => {
    assert.deepEqual(guardMigrations({ remote: [A, B], local: [A, B, C], released: [A, B] }), []);
    assert.deepEqual(
      guardMigrations({ remote: [A, B, C], local: [A, B, C], released: [A, B] }),
      [],
    );
  });

  test('a foreign version in production is red and named', () => {
    const errors = guardMigrations({ remote: [FOREIGN, A], local: [A, B], released: [A] });
    assert.ok(errors.some((e) => e.includes(FOREIGN)));
    assert.match(errors.at(-1), /Runbook B5/);
  });

  test('a gap is red: production has a later migration but not an earlier one', () => {
    const errors = guardMigrations({ remote: [A, C], local: [A, B, C], released: [A] });
    assert.ok(errors.some((e) => /kein Präfix/.test(e) && e.includes(B)));
  });

  test('a migration of the latest release missing in production is red (wrong or reset project)', () => {
    const errors = guardMigrations({ remote: [], local: [A, B], released: [A, B] });
    assert.ok(errors.some((e) => e.includes(A) && /veröffentlicht/.test(e)));
  });

  test('the message never suggests repairing the history by hand', () => {
    const errors = guardMigrations({ remote: [FOREIGN], local: [A], released: undefined });
    assert.match(errors.join('\n'), /nie von Hand/);
  });
});

describe('CLI', () => {
  function repoWith(migrations, { tag } = {}) {
    const cwd = repo();
    commit(
      cwd,
      'feat: Grundlage',
      Object.fromEntries(migrations.map((v) => [`supabase/migrations/${v}_m.sql`, 'select 1;\n'])),
    );
    if (tag) git(cwd, 'tag', tag);
    return cwd;
  }

  const run = (cwd, json) => {
    const file = path.join(cwd, 'migration-list.json');
    writeFileSync(file, json);
    return runScript(script, cwd, [file]);
  };

  test('green before the first release with an empty history', () => {
    const cwd = repoWith([A, B]);
    const { status, output } = run(
      cwd,
      list([
        [A, ''],
        [B, ''],
      ]),
    );
    assert.equal(status, 0, output);
    assert.match(output, /0 von 2/);
  });

  test('red before the first release with a history', () => {
    const { status, output } = run(repoWith([A]), list([[A, A]]));
    assert.equal(status, 1, output);
    assert.match(output, /noch keine Veröffentlichung/);
  });

  test('after the tag: the migrations of the tag must be in production, new ones may follow', () => {
    const cwd = repoWith([A], { tag: 'v2026.11.1' });
    commit(cwd, 'feat: neu', { [`supabase/migrations/${C}_m.sql`]: 'select 1;\n' });
    assert.equal(
      run(
        cwd,
        list([
          [A, A],
          [C, ''],
        ]),
      ).status,
      0,
    );
    const missing = run(
      cwd,
      list([
        [A, ''],
        [C, ''],
      ]),
    );
    assert.equal(missing.status, 1, missing.output);
    assert.match(missing.output, new RegExp(A));
  });

  test('a CLI error fails the guard', () => {
    const { status, output } = run(
      repoWith([A]),
      JSON.stringify({ _tag: 'Error', error: { code: 'DbConnectError', message: 'x' } }),
    );
    assert.equal(status, 1);
    assert.match(output, /DbConnectError/);
  });
});
