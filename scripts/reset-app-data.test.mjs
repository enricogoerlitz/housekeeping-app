// scripts/reset-app-data.mjs (spec 0028, REQ-005, REQ-006, decision 3 and 4; AC-013, AC-015).
//
//   node --test scripts/reset-app-data.test.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  BUCKETS,
  checkEnvironment,
  checkLinked,
  dataSql,
  mediaTargets,
  parseArgs,
  projectNameIn,
  resetSql,
} from './reset-app-data.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(root, 'scripts/reset-app-data.mjs');
mkdirSync(path.join(root, 'tmp'), { recursive: true });
const dir = mkdtempSync(path.join(root, 'tmp', 'reset-app-data-test-'));
after(() => rmSync(dir, { recursive: true, force: true }));

const REF = 'abcdefghijklmnopqrst';

describe('arguments', () => {
  test('AC-015: the project ref is required and must look like one', () => {
    assert.deepEqual(parseArgs(['--project', REF]), { project: REF, dataOnly: false });
    assert.deepEqual(parseArgs(['--project', REF, '--data-only']), {
      project: REF,
      dataOnly: true,
    });
    assert.throws(() => parseArgs([]), /--project <Projektkennung> fehlt/);
    assert.throws(() => parseArgs(['--project', 'prod']), /keine Projektkennung/);
    assert.throws(() => parseArgs(['--project', REF, '--yes']), /Unbekannte Angabe --yes/);
  });
});

describe('where it may run', () => {
  test('security check 0031: never in CI and never without a terminal', () => {
    assert.throws(
      () => checkEnvironment({ env: { CI: 'true' }, interactive: true }),
      /nur von Hand/,
    );
    assert.throws(
      () => checkEnvironment({ env: { GITHUB_ACTIONS: 'true' }, interactive: true }),
      /nur von Hand/,
    );
    assert.throws(() => checkEnvironment({ env: {}, interactive: false }), /Terminal/);
    assert.doesNotThrow(() => checkEnvironment({ env: {}, interactive: true }));
  });

  test('AC-015: a linked project other than the one named stops it', () => {
    const linked = path.join(dir, 'supabase/.temp');
    assert.doesNotThrow(() => checkLinked(dir, REF));
    mkdirSync(linked, { recursive: true });
    writeFileSync(path.join(linked, 'project-ref'), 'zzzzzzzzzzzzzzzzzzzz\n');
    assert.throws(() => checkLinked(dir, REF), /verlinkt ist zzzzzzzzzzzzzzzzzzzz/);
    writeFileSync(path.join(linked, 'project-ref'), `${REF}\n`);
    assert.doesNotThrow(() => checkLinked(dir, REF));
  });

  test('CI=true stops the command before anything else', () => {
    const result = spawnSync(process.execPath, [script, '--project', REF], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, CI: 'true' },
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /nur von Hand/);
  });
});

describe('what it deletes (AC-013, decision 3)', () => {
  const sql = resetSql();

  test('the app data, the jobs and the migration history, in one statement', () => {
    assert.equal(sql.match(/^do \$reset\$/gm)?.length, 1);
    assert.match(sql, /\$reset\$;\n$/);
    assert.match(sql, /cron\.unschedule\(jobid\) from cron\.job/);
    assert.match(sql, /drop schema if exists private cascade;/);
    assert.match(sql, /schemaname = 'public'/);
    assert.match(sql, /delete from supabase_migrations\.schema_migrations;/);
  });

  test('accounts, Vault and the auth settings stay', () => {
    assert.doesNotMatch(sql, /\b(drop|delete|truncate)\b[^;]*\b(auth|vault|storage)\./i);
    assert.doesNotMatch(sql, /drop schema (if exists )?public\b/);
  });
});

describe('the project name (supabase projects list)', () => {
  test('is read from the CLI output, which wraps the list in `projects`', () => {
    const output = { projects: [{ id: REF, name: 'housekeeping-app-test' }], message: '' };
    assert.equal(projectNameIn(output, REF), 'housekeeping-app-test');
    assert.equal(projectNameIn([{ ref: REF, name: 'alt' }], REF), 'alt');
    assert.equal(projectNameIn({ projects: [] }, REF), undefined);
  });
});

describe('--data-only (spec 0028, decision 3, way D of 23.11.2026)', () => {
  const sql = dataSql();

  test('empties every table of public and private in one statement, schema and history stay', () => {
    assert.equal(sql.match(/^do \$reset\$/gm)?.length, 1);
    assert.match(sql, /schemaname in \('public', 'private'\)/);
    assert.match(sql, /truncate table %I\.%I cascade/);
    assert.doesNotMatch(sql, /\bdrop\b/i);
    assert.doesNotMatch(sql, /schema_migrations/);
    assert.doesNotMatch(sql, /cron\./);
  });

  test('accounts with their profiles and devices stay', () => {
    assert.match(sql, /tablename not in \('profiles', 'push_subscriptions'\)/);
    assert.doesNotMatch(sql, /\b(auth|vault|storage)\./);
  });
});

describe('the photos and videos (storage)', () => {
  test('each top-level folder of the bucket is removed, never the bucket itself', () => {
    assert.deepEqual(mediaTargets({ paths: ['hh1/', 'hh2/', 'stray.jpg'] }, 'household-media'), [
      'ss:///household-media/hh1',
      'ss:///household-media/hh2',
      'ss:///household-media/stray.jpg',
    ]);
    assert.deepEqual(mediaTargets({ paths: [] }, 'household-media'), []);
    assert.deepEqual(mediaTargets({ paths: ['', '/'] }, 'household-media'), []);
  });

  test('spec 0043, decision 8: the photo and the video bucket are emptied, in this order', () => {
    assert.deepEqual(BUCKETS, ['household-media', 'household-videos']);
    assert.deepEqual(mediaTargets({ paths: ['hh1/'] }, 'household-videos'), [
      'ss:///household-videos/hh1',
    ]);
  });

  test('a bucket that does not exist yet lists nothing and removes nothing', () => {
    // `supabase storage ls` of a missing bucket answers `{ "paths": [] }` (CLI 3.2.0, local).
    assert.deepEqual(mediaTargets({ paths: [], message: '' }, 'household-videos'), []);
  });

  test('only the two app buckets, never another one', () => {
    assert.throws(() => mediaTargets({ paths: ['x/'] }, 'avatars'), /Unbekannter Bucket/);
  });
});
