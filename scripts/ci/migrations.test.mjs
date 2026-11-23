// scripts/ci/migrations.mjs (spec 0014, Task 1): committed migrations stay unchanged once a v* tag
// exists, and a destructive migration carries the contract header and redefines
// public.min_app_version(). Pure functions plus the CLI against throwaway git repositories under
// tmp/ (git-ignored), removed afterwards.
//
//   node --test scripts/ci/migrations.test.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  CONTRACT_MISSING,
  checkChanges,
  checkNewMigration,
  contractHeader,
  isDestructive,
  minAppVersionIn,
  parseNameStatus,
} from './migrations.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const script = path.join(root, 'scripts/ci/migrations.mjs');
mkdirSync(path.join(root, 'tmp'), { recursive: true });
const dir = mkdtempSync(path.join(root, 'tmp', 'migrations-test-'));
after(() => rmSync(dir, { recursive: true, force: true }));

const MIGRATION = 'supabase/migrations/20261201000000_drop_notes.sql';

const redefine = (version) => `
create or replace function public.min_app_version()
returns text
language sql
stable
set search_path = ''
as $$ select '${version}'::text $$;
`;

describe('destructive migrations', () => {
  test('drop column, drop table and rename count outside comments only', () => {
    assert.equal(isDestructive('alter table public.recipes drop column notes;'), true);
    assert.equal(isDestructive('DROP TABLE public.old_things;'), true);
    assert.equal(isDestructive('alter table public.a rename column b to c;'), true);
    assert.equal(isDestructive('alter table public.a rename to b;'), true);
    assert.equal(isDestructive('-- we never drop table here\nselect 1;'), false);
    assert.equal(isDestructive('/* rename\n later */ create table public.x (id int);'), false);
    assert.equal(
      isDestructive('drop policy if exists "x" on public.y; drop trigger t on public.y;'),
      false,
    );
  });

  test('AC-009: drop column without the header is red with the message of the spec', () => {
    const problems = checkNewMigration(
      MIGRATION,
      'alter table public.recipes drop column notes;\n',
    );
    assert.equal(problems.length, 1);
    assert.match(problems[0], /Rückbau ohne Kennzeichnung \(expand → migrate → contract\)/);
    assert.ok(problems[0].startsWith(MIGRATION));
    assert.ok(CONTRACT_MISSING.includes('expand → migrate → contract'));
  });

  test('AC-009: header and a redefinition with the same version pass', () => {
    const sql = `-- contract: Notizen sind seit 2026.12.1 im Rezepttext; min_app_version: 2026.12.1
alter table public.recipes drop column notes;
${redefine('2026.12.1')}`;
    assert.deepEqual(contractHeader(sql), {
      reason: 'Notizen sind seit 2026.12.1 im Rezepttext',
      version: '2026.12.1',
    });
    assert.equal(minAppVersionIn(sql), '2026.12.1');
    assert.deepEqual(checkNewMigration(MIGRATION, sql), []);
  });

  test('AC-009: header without redefinition, another version, a bad version or no reason is red', () => {
    const header = (version, reason = 'Grund') =>
      `-- contract: ${reason}; min_app_version: ${version}\n`;
    const drop = 'drop table public.old_things;\n';
    assert.match(
      checkNewMigration(MIGRATION, header('2026.12.1') + drop).join('\n'),
      /definiert public\.min_app_version\(\) nicht neu/,
    );
    assert.match(
      checkNewMigration(MIGRATION, header('2026.12.1') + drop + redefine('2026.12.2')).join('\n'),
      /2026\.12\.1.*2026\.12\.2/,
    );
    assert.match(
      checkNewMigration(MIGRATION, header('2026.13.1') + drop + redefine('2026.13.1')).join('\n'),
      /Format JJJJ\.M\.N/,
    );
    assert.match(
      checkNewMigration(MIGRATION, header('2026.12.1', ' ') + drop + redefine('2026.12.1')).join(
        '\n',
      ),
      /Rückbau ohne Kennzeichnung/,
    );
  });

  test('the header must sit in the leading comment block', () => {
    const sql = `create table public.x (id int);
-- contract: zu spät; min_app_version: 2026.12.1
drop table public.y;
${redefine('2026.12.1')}`;
    assert.equal(contractHeader(sql), undefined);
  });

  test('a migration without destructive statements needs no header', () => {
    assert.deepEqual(checkNewMigration(MIGRATION, 'create table public.x (id int);\n'), []);
  });
});

describe('changes to committed migrations', () => {
  const entries = parseNameStatus(
    [
      'M\tsupabase/migrations/20261121062343_foundation.sql',
      'D\tsupabase/migrations/20261121062344_identity.sql',
      'R100\tsupabase/migrations/20261121062346_catalog.sql\tsupabase/migrations/20261121062347_catalog.sql',
      `A\t${MIGRATION}`,
      'A\tsupabase/migrations/README.md',
    ].join('\n'),
  );

  test('git diff --name-status is parsed, renames with both paths', () => {
    assert.deepEqual(entries[2], {
      status: 'R',
      path: 'supabase/migrations/20261121062347_catalog.sql',
      oldPath: 'supabase/migrations/20261121062346_catalog.sql',
    });
  });

  test('AC-009: before the first v* tag a changed migration is only a note', () => {
    const { errors, notes } = checkChanges(entries, {
      released: false,
      read: () => 'create table public.x (id int);',
    });
    assert.deepEqual(errors, []);
    assert.equal(notes.length, 3);
    assert.match(notes[0], /Noch kein Tag v\*/);
  });

  test('AC-009: after the first v* tag a changed, deleted or renamed migration is red', () => {
    const { errors } = checkChanges(entries, {
      released: true,
      read: () => 'create table public.x (id int);',
    });
    assert.equal(errors.length, 3);
    assert.match(errors[0], /20261121062343_foundation\.sql.*geändert/);
    assert.match(errors[1], /20261121062344_identity\.sql.*gelöscht/);
    assert.match(errors[2], /20261121062346_catalog\.sql.*umbenannt/);
  });

  test('AC-009: new migrations are checked for the contract header before and after the tag', () => {
    for (const released of [false, true]) {
      const { errors } = checkChanges([{ status: 'A', path: MIGRATION }], {
        released,
        read: () => 'alter table public.recipes drop column notes;',
      });
      assert.equal(errors.length, 1, String(released));
      assert.match(errors[0], /Rückbau ohne Kennzeichnung/);
    }
  });
});

describe('new migration base (spec 0031, REQ-001)', () => {
  const BASE = { replaces: 'v2026.11.1', first: '20261124000000' };
  const OLD = [
    'supabase/migrations/20261121062343_foundation.sql',
    'supabase/migrations/20261123070918_schema_cleanup.sql',
  ];
  const NEW = [
    'supabase/migrations/20261124000000_foundation.sql',
    'supabase/migrations/20261124000001_identity.sql',
  ];
  const replace = (files) =>
    parseNameStatus(
      [...OLD.map((file) => `D\t${file}`), ...files.map((f) => `A\t${f}`)].join('\n'),
    );
  const check = (entries, options = {}) =>
    checkChanges(entries, {
      released: true,
      read: () => 'create table public.x (id int);',
      base: BASE,
      latestTag: 'v2026.11.1',
      files: NEW,
      ...options,
    });

  test('AC-001: deleting every old migration for a base at or after `first` is green', () => {
    const { errors, notes } = check(replace(NEW));
    assert.deepEqual(errors, []);
    assert.match(notes.join('\n'), /Neue Basis ersetzt v2026\.11\.1/);
  });

  test('AC-002: an old migration left beside the new base is red and named', () => {
    const entries = parseNameStatus(
      [`D\t${OLD[0]}`, ...NEW.map((file) => `A\t${file}`)].join('\n'),
    );
    const { errors } = check(entries, { files: [OLD[1], ...NEW] });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /20261123070918_schema_cleanup\.sql/);
  });

  test('AC-002: a new migration before `first` is red and named', () => {
    const early = 'supabase/migrations/20261123999999_late.sql';
    const { errors } = check(replace([...NEW, early]), { files: [...NEW, early] });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /20261123999999_late\.sql.*20261124000000/);
  });

  test('AC-002: `replaces` must name the latest tag; the deletions stay red then', () => {
    const { errors } = check(replace(NEW), { base: { ...BASE, replaces: 'v2026.10.1' } });
    assert.match(errors[0], /v2026\.10\.1.*v2026\.11\.1/);
    assert.equal(errors.filter((error) => /wurde gelöscht/.test(error)).length, 2);
  });

  test('AC-003: after the next tag the exception is used up', () => {
    const { errors } = check(replace(NEW), { latestTag: 'v2026.12.1' });
    assert.match(errors[0], /v2026\.11\.1.*v2026\.12\.1/);
    assert.equal(errors.filter((error) => /nie geändert/.test(error)).length, 2);
  });

  test('a migration of the new base is never changed once committed', () => {
    const { errors } = check(parseNameStatus(`M\t${NEW[0]}`));
    assert.equal(errors.length, 1);
    assert.match(errors[0], /20261124000000_foundation\.sql.*geändert/);
  });

  test('the new base is checked for the contract header too', () => {
    const { errors } = check(replace(NEW), {
      read: () => 'alter table public.recipes drop column notes;',
    });
    assert.equal(errors.length, 2);
    assert.match(errors[0], /Rückbau ohne Kennzeichnung/);
  });
});

describe('CLI', () => {
  const git = (cwd, ...args) => {
    const result = spawnSync(
      'git',
      ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', ...args],
      { cwd, encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };

  let counter = 0;
  /** A repository with one committed migration on main, optionally tagged v2026.11.1. */
  function repo({ tagged }) {
    counter += 1;
    const cwd = path.join(dir, `repo-${counter}`);
    mkdirSync(path.join(cwd, 'supabase/migrations'), { recursive: true });
    git(cwd, 'init', '-q', '-b', 'main');
    writeFileSync(
      path.join(cwd, 'supabase/migrations/20261121062343_foundation.sql'),
      'create table public.recipes (id int, notes text);\n',
    );
    git(cwd, 'add', '.');
    git(cwd, 'commit', '-q', '-m', 'feat: Grundlage');
    if (tagged) git(cwd, 'tag', 'v2026.11.1');
    git(cwd, 'checkout', '-q', '-b', 'feat/x');
    return cwd;
  }

  const run = (cwd, ...args) => {
    const result = spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8' });
    return { status: result.status, output: `${result.stdout}${result.stderr}` };
  };

  test('AC-009: a changed migration is red with a tag and a note without one', () => {
    for (const tagged of [false, true]) {
      const cwd = repo({ tagged });
      writeFileSync(
        path.join(cwd, 'supabase/migrations/20261121062343_foundation.sql'),
        'create table public.recipes (id int);\n',
      );
      git(cwd, 'commit', '-q', '-am', 'fix: x');
      const { status, output } = run(cwd, '--base', 'main');
      assert.equal(status, tagged ? 1 : 0, output);
      assert.match(output, tagged ? /geändert/ : /Noch kein Tag v\*/);
    }
  });

  test('AC-009: a renamed migration is red after the tag', () => {
    const cwd = repo({ tagged: true });
    renameSync(
      path.join(cwd, 'supabase/migrations/20261121062343_foundation.sql'),
      path.join(cwd, 'supabase/migrations/20261121062399_foundation.sql'),
    );
    git(cwd, 'add', '-A');
    git(cwd, 'commit', '-q', '-m', 'refactor: x');
    const { status, output } = run(cwd, '--base', 'main');
    assert.equal(status, 1, output);
    assert.match(output, /umbenannt/);
  });

  test('AC-009: a new drop column without header is red, with header green', () => {
    const cwd = repo({ tagged: true });
    const file = path.join(cwd, MIGRATION);
    writeFileSync(file, 'alter table public.recipes drop column notes;\n');
    git(cwd, 'add', '.');
    git(cwd, 'commit', '-q', '-m', 'feat: x');
    const red = run(cwd, '--base', 'main');
    assert.equal(red.status, 1, red.output);
    assert.match(red.output, /Rückbau ohne Kennzeichnung \(expand → migrate → contract\)/);

    writeFileSync(
      file,
      `-- contract: Notizen entfallen; min_app_version: 2026.11.1\nalter table public.recipes drop column notes;\n${redefine('2026.11.1')}`,
    );
    git(cwd, 'commit', '-q', '-am', 'fix: Kopf');
    const green = run(cwd, '--base', 'main');
    assert.equal(green.status, 0, green.output);
    assert.match(green.output, /Migrationen: ok/);
  });

  test('AC-001, AC-002: the CLI replaces the tagged migrations with a new base', () => {
    const cwd = repo({ tagged: true });
    rmSync(path.join(cwd, 'supabase/migrations/20261121062343_foundation.sql'));
    writeFileSync(
      path.join(cwd, 'supabase/migrations/20261124000000_foundation.sql'),
      'create table public.recipes (id int);\n',
    );
    writeFileSync(
      path.join(cwd, 'supabase/migrations-base.json'),
      JSON.stringify({ replaces: 'v2026.11.1', first: '20261124000000' }),
    );
    git(cwd, 'add', '-A');
    git(cwd, 'commit', '-q', '-m', 'feat: neue Basis');
    const green = run(cwd, '--base', 'main');
    assert.equal(green.status, 0, green.output);
    assert.match(green.output, /Neue Basis ersetzt v2026\.11\.1/);

    writeFileSync(
      path.join(cwd, 'supabase/migrations/20261121062343_foundation.sql'),
      'create table public.recipes (id int, notes text);\n',
    );
    git(cwd, 'add', '-A');
    git(cwd, 'commit', '-q', '-m', 'fix: alte Datei zurück');
    const red = run(cwd, '--base', 'main');
    assert.equal(red.status, 1, red.output);
    assert.match(red.output, /20261121062343_foundation\.sql/);
  });

  test('without --base the CLI refuses to guess', () => {
    const cwd = repo({ tagged: false });
    const { status, output } = run(cwd);
    assert.equal(status, 2, output);
    assert.match(output, /--base/);
  });
});
