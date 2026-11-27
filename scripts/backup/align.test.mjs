// scripts/backup/align.mjs (spec 0014, AC-056; spec 0028, AC-018): the restore test's throwaway
// database runs the Postgres image of the pinned CLI, whose platform schemas (auth, storage, …) can
// lag behind the hosted project. The script reads only the COPY headers of data.sql and adds what the
// throwaway database lacks there, so the data lands and the counts can be compared. Our own schemas
// are never patched: a gap there stays an error.
//
//   node --test scripts/backup/align.test.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { alignSql, copyTargets, parseColumns } from './align.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const script = path.join(root, 'scripts/backup/align.mjs');
mkdirSync(path.join(root, 'tmp'), { recursive: true });
const dir = mkdtempSync(path.join(root, 'tmp', 'backup-align-test-'));
after(() => rmSync(dir, { recursive: true, force: true }));

const DATA = [
  'SET session_replication_role = replica;',
  'COPY "auth"."audit_log_entries" ("instance_id", "id") FROM stdin;',
  '\\.',
  '',
  'COPY "auth"."custom_oauth_providers" ("id", "client_auth_method", "client_assertion_audience") FROM stdin;',
  // A data row that looks like a header must not count.
  'COPY "evil"."x" ("y") FROM stdin;\tsecret',
  '\\.',
  'COPY "auth"."new_table" ("id", "we""ird") FROM stdin;',
  '\\.',
  'COPY "public"."recipes" ("id", "new_col") FROM stdin;',
  '\\.',
].join('\n');

const EXISTING = [
  'auth.audit_log_entries.instance_id',
  'auth.audit_log_entries.id',
  'auth.custom_oauth_providers.id',
  'public.recipes.id',
].join('\n');

describe('copyTargets', () => {
  test('AC-056: reads schema, table and columns of each COPY header, never data rows', () => {
    assert.deepEqual(copyTargets(DATA), [
      { schema: 'auth', table: 'audit_log_entries', columns: ['instance_id', 'id'] },
      {
        schema: 'auth',
        table: 'custom_oauth_providers',
        columns: ['id', 'client_auth_method', 'client_assertion_audience'],
      },
      { schema: 'auth', table: 'new_table', columns: ['id', 'we"ird'] },
      { schema: 'public', table: 'recipes', columns: ['id', 'new_col'] },
    ]);
  });
});

describe('alignSql', () => {
  const existing = parseColumns(EXISTING);

  test('AC-056: adds missing platform columns and tables as text, quoted', () => {
    const { sql, added } = alignSql(copyTargets(DATA), existing);
    assert.match(
      sql,
      /ALTER TABLE "auth"\."custom_oauth_providers" ADD COLUMN IF NOT EXISTS "client_auth_method" text;/,
    );
    assert.match(sql, /ADD COLUMN IF NOT EXISTS "client_assertion_audience" text;/);
    assert.match(
      sql,
      /CREATE TABLE IF NOT EXISTS "auth"\."new_table" \("id" text, "we""ird" text\);/,
    );
    // Runs as supabase_admin; the data is copied in as postgres afterwards.
    assert.match(sql, /GRANT ALL ON TABLE "auth"\."new_table" TO postgres;/);
    assert.deepEqual(added, [
      'auth.custom_oauth_providers.client_auth_method',
      'auth.custom_oauth_providers.client_assertion_audience',
      'auth.new_table',
    ]);
  });

  test('AC-056: never patches our own schemas (public, private): a gap there stays an error', () => {
    const { sql } = alignSql(copyTargets(DATA), existing);
    assert.doesNotMatch(sql, /"public"|"private"/);
    const own = alignSql([{ schema: 'private', table: 'ai_usage', columns: ['id'] }], existing);
    assert.equal(own.sql, '');
  });

  test('nothing to do gives empty SQL', () => {
    const t = [{ schema: 'auth', table: 'audit_log_entries', columns: ['id'] }];
    assert.deepEqual(alignSql(t, existing), { sql: '', added: [] });
  });
});

describe('align.mjs CLI', () => {
  test('AC-056: SQL to stdout, only names of what was added to stderr', () => {
    const data = path.join(dir, 'data.sql');
    const cols = path.join(dir, 'columns.txt');
    writeFileSync(data, DATA);
    writeFileSync(cols, EXISTING);
    const run = spawnSync('node', [script, '--data', data, '--columns', cols], {
      encoding: 'utf8',
    });
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /ADD COLUMN IF NOT EXISTS "client_auth_method" text;/);
    assert.match(run.stderr, /auth\.custom_oauth_providers\.client_auth_method/);
    assert.doesNotMatch(run.stdout + run.stderr, /secret/);
  });

  test('missing arguments fail', () => {
    const run = spawnSync('node', [script], { encoding: 'utf8' });
    assert.notEqual(run.status, 0);
  });
});
