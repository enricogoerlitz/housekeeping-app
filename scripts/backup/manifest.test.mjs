// scripts/backup/manifest.mjs (spec 0014, Task 9; spec 0043, decision 8): the companion file of a
// backup. Rows per table are counted from the COPY blocks of the data dump, photos from the media
// folder, videos from the videos folder, the checksum from the encrypted archive. Runs against throwaway files under tmp/ (git-ignored), removed
// afterwards.
//
//   node --test scripts/backup/manifest.test.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildManifest,
  countCopyRows,
  countFiles,
  parseCopyTarget,
  sha256File,
} from './manifest.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const script = path.join(root, 'scripts/backup/manifest.mjs');
mkdirSync(path.join(root, 'tmp'), { recursive: true });
const dir = mkdtempSync(path.join(root, 'tmp', 'backup-manifest-test-'));
after(() => rmSync(dir, { recursive: true, force: true }));

// The shape `supabase db dump --data-only --use-copy` writes (CLI 3.2.0, quoted identifiers).
const DUMP = [
  'SET session_replication_role = replica;',
  '',
  '--',
  '-- Data for Name: users; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin',
  '--',
  '',
  'COPY "auth"."users" ("instance_id", "id", "email") FROM stdin;',
  '00000000-0000-0000-0000-000000000000\t11111111-1111-1111-1111-111111111111\tenrico@example.com',
  '00000000-0000-0000-0000-000000000000\t22222222-2222-2222-2222-222222222222\tnadja@example.com',
  '\\.',
  '',
  'COPY "public"."recipes" ("id", "title", "description") FROM stdin;',
  '1\tLasagne\tSchicht für Schicht\\nmit Béchamel',
  '2\tSuppe\t\\\\.',
  '3\tCOPY "x"."y" FROM stdin;\t\\N',
  '\\.',
  '',
  'COPY "public"."absences" ("id") FROM stdin;',
  '\\.',
  '',
  'RESET ALL;',
  '',
].join('\n');

describe('COPY blocks', () => {
  test('parses quoted, unquoted and escaped identifiers', () => {
    assert.deepEqual(parseCopyTarget('COPY "auth"."users" ("id") FROM stdin;'), {
      schema: 'auth',
      table: 'users',
    });
    assert.deepEqual(parseCopyTarget('COPY public.recipes (id, title) FROM stdin;'), {
      schema: 'public',
      table: 'recipes',
    });
    assert.deepEqual(parseCopyTarget('COPY "public"."odd""name" FROM stdin;'), {
      schema: 'public',
      table: 'odd"name',
    });
    assert.equal(parseCopyTarget('SET session_replication_role = replica;'), null);
    assert.equal(parseCopyTarget('-- COPY "auth"."users" FROM stdin;'), null);
  });

  test('AC-052: counts rows per table from the COPY blocks, empty tables included', async () => {
    const tables = await countCopyRows(DUMP.split('\n'));
    assert.deepEqual(tables, [
      { schema: 'auth', table: 'users', rows: 2 },
      { schema: 'public', table: 'recipes', rows: 3 },
      { schema: 'public', table: 'absences', rows: 0 },
    ]);
  });

  test('a dump without COPY blocks is rejected (dumped without --use-copy?)', async () => {
    await assert.rejects(
      countCopyRows(['SET x = 1;', 'INSERT INTO "public"."a" VALUES (1);']),
      /ohne COPY-Blöcke/,
    );
  });

  test('a COPY block without its end marker is rejected, naming only the table', async () => {
    const cut = DUMP.split('\n').slice(0, 9);
    await assert.rejects(countCopyRows(cut), (error) => {
      assert.match(error.message, /unvollständig/);
      assert.match(error.message, /auth\.users/);
      assert.doesNotMatch(error.message, /example\.com/);
      return true;
    });
  });
});

describe('photos and checksum', () => {
  test('AC-052: counts every file below the media folder, nested folders included', () => {
    const media = path.join(dir, 'media');
    mkdirSync(path.join(media, 'household-a', 'recipes'), { recursive: true });
    mkdirSync(path.join(media, 'household-b'), { recursive: true });
    mkdirSync(path.join(media, 'empty'), { recursive: true });
    writeFileSync(path.join(media, 'household-a', 'recipes', '1.jpg'), 'a');
    writeFileSync(path.join(media, 'household-a', 'recipes', '2.jpg'), 'b');
    writeFileSync(path.join(media, 'household-b', '3.webp'), 'c');
    assert.equal(countFiles(media), 3);
    assert.equal(countFiles(path.join(media, 'empty')), 0);
  });

  test('a missing media folder is an error, not zero photos', () => {
    assert.throws(() => countFiles(path.join(dir, 'missing')), /Fotoordner fehlt/);
  });

  test('spec 0043, decision 8: a missing videos folder is an error named as such', () => {
    assert.throws(() => countFiles(path.join(dir, 'missing'), 'Videoordner'), /Videoordner fehlt/);
  });

  test('AC-052: SHA-256 of the archive', async () => {
    const file = path.join(dir, 'archive.age');
    writeFileSync(file, 'verschlüsselt');
    const expected = createHash('sha256').update('verschlüsselt').digest('hex');
    assert.equal(await sha256File(file), expected);
  });
});

describe('manifest', () => {
  test('AC-052, spec 0043: names rows per table, photo and video count and checksum, nothing else', () => {
    const manifest = buildManifest({
      tables: [{ schema: 'public', table: 'recipes', rows: 3 }],
      photos: 2,
      videos: 1,
      archive: { name: 'backup.tar.gz.age', bytes: 123, sha256: 'a'.repeat(64) },
      createdAt: new Date('2026-12-01T02:17:00Z'),
    });
    assert.deepEqual(manifest, {
      format: 2,
      createdAt: '2026-12-01T02:17:00.000Z',
      tables: [{ schema: 'public', table: 'recipes', rows: 3 }],
      photos: 2,
      videos: 1,
      archive: { name: 'backup.tar.gz.age', bytes: 123, sha256: 'a'.repeat(64) },
    });
  });

  test('AC-052: the CLI writes manifest.json and prints only numbers, never data', () => {
    const data = path.join(dir, 'data.sql');
    const media = path.join(dir, 'cli-media');
    const videos = path.join(dir, 'cli-videos');
    const archive = path.join(dir, 'backup.tar.gz.age');
    const out = path.join(dir, 'manifest.json');
    writeFileSync(data, DUMP);
    mkdirSync(media, { recursive: true });
    writeFileSync(path.join(media, 'foto.jpg'), 'x');
    mkdirSync(path.join(videos, 'hh', 'recipes', 'r'), { recursive: true });
    writeFileSync(path.join(videos, 'hh', 'recipes', 'r', 'v.mp4'), 'v');
    writeFileSync(path.join(videos, 'hh', 'recipes', 'r', 'w.mp4'), 'w');
    writeFileSync(archive, 'age-encrypted');

    const result = spawnSync(
      process.execPath,
      [
        script,
        ...['--data', data, '--media', media, '--videos', videos],
        ...['--archive', archive, '--out', out],
      ],
      { encoding: 'utf8' },
    );
    const output = `${result.stdout}${result.stderr}`;
    assert.equal(result.status, 0, output);
    assert.match(output, /3 Tabellen, 5 Zeilen, 1 Fotos, 2 Videos/);
    assert.doesNotMatch(output, /example\.com|Lasagne|recipes/);

    const manifest = JSON.parse(readFileSync(out, 'utf8'));
    assert.equal(manifest.photos, 1);
    assert.equal(manifest.videos, 2);
    assert.equal(manifest.tables.length, 3);
    assert.equal(manifest.archive.name, 'backup.tar.gz.age');
    assert.equal(manifest.archive.bytes, 'age-encrypted'.length);
    assert.equal(
      manifest.archive.sha256,
      createHash('sha256').update('age-encrypted').digest('hex'),
    );
    assert.doesNotMatch(JSON.stringify(manifest), /example\.com|Lasagne/);
  });

  test('the CLI fails with a usage line when an argument is missing', () => {
    const result = spawnSync(process.execPath, [script, '--data', 'x'], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /--data <datei> --media <ordner> --videos <ordner> --archive <datei> --out <datei>/,
    );
  });
});
