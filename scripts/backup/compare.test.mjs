// scripts/backup/compare.mjs (spec 0014, Task 9; spec 0048): the restore test compares the restored
// throwaway database and the unpacked photos with the companion file; videos are no longer backed up
// (spec 0048), those in older backups (format 2) are passed over. Messages name tables and numbers
// only, never data. Runs against throwaway files under tmp/ (git-ignored), removed afterwards.
//
//   node --test scripts/backup/compare.test.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  checkArchive,
  compareCounts,
  countQuery,
  parseCounts,
  validateManifest,
} from './compare.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const script = path.join(root, 'scripts/backup/compare.mjs');
mkdirSync(path.join(root, 'tmp'), { recursive: true });
const dir = mkdtempSync(path.join(root, 'tmp', 'backup-compare-test-'));
after(() => rmSync(dir, { recursive: true, force: true }));

const ARCHIVE = 'age-encrypted-bytes';
/** What manifest.mjs writes since spec 0048: no videos. */
const MANIFEST = {
  format: 3,
  createdAt: '2026-12-01T02:17:00.000Z',
  tables: [
    { schema: 'auth', table: 'users', rows: 2 },
    { schema: 'public', table: 'recipes', rows: 26 },
    { schema: 'public', table: 'odd"name', rows: 0 },
  ],
  photos: 2,
  archive: {
    name: 'backup.tar.gz.age',
    bytes: ARCHIVE.length,
    sha256: createHash('sha256').update(ARCHIVE).digest('hex'),
  },
};
/** Spec 0043 until spec 0048: the archive also holds videos, the manifest counts them. */
const MANIFEST_V2 = { ...MANIFEST, format: 2, videos: 1 };
/** Before spec 0043: same fields as format 3. */
const MANIFEST_V1 = { ...MANIFEST, format: 1 };

describe('manifest', () => {
  test('AC-002: accepts the format manifest.mjs writes (3, no videos)', () => {
    assert.deepEqual(validateManifest(structuredClone(MANIFEST)), MANIFEST);
  });

  test('AC-004: still accepts older backups (format 2 with videos, format 1 without)', () => {
    assert.deepEqual(validateManifest(structuredClone(MANIFEST_V2)), MANIFEST_V2);
    assert.deepEqual(validateManifest(structuredClone(MANIFEST_V1)), MANIFEST_V1);
  });

  test('AC-005: rejects a manifest of another format or with broken fields', () => {
    const broken = [
      { ...MANIFEST, format: 4 },
      { ...MANIFEST, format: 0 },
      { ...MANIFEST, format: 2 },
      { ...MANIFEST_V2, videos: -1 },
      { ...MANIFEST, tables: [] },
      { ...MANIFEST, tables: [{ schema: 'public', table: 'x', rows: -1 }] },
      { ...MANIFEST, tables: [{ schema: '', table: 'x', rows: 1 }] },
      { ...MANIFEST, photos: 1.5 },
      { ...MANIFEST, archive: { ...MANIFEST.archive, sha256: 'xyz' } },
    ];
    for (const manifest of broken) {
      assert.throws(() => validateManifest(manifest), /Begleitdatei ungültig/);
    }
  });
});

describe('archive checksum', () => {
  test('AC-056: same checksum → no problem, another one → problem', () => {
    assert.equal(checkArchive(MANIFEST, MANIFEST.archive.sha256), null);
    assert.match(checkArchive(MANIFEST, 'b'.repeat(64)), /Prüfsumme/);
  });
});

describe('row counts', () => {
  test('one count per table, identifiers quoted, rows numbered by manifest position', () => {
    assert.equal(
      countQuery(MANIFEST),
      [
        'select 0, count(*) from "auth"."users"',
        'union all select 1, count(*) from "public"."recipes"',
        'union all select 2, count(*) from "public"."odd""name"',
        ';',
      ].join('\n'),
    );
  });

  test('parses the unaligned psql output (index|count)', () => {
    assert.deepEqual(
      parseCounts('0|2\n1|26\n2|0\n'),
      new Map([
        [0, 2],
        [1, 26],
        [2, 0],
      ]),
    );
    assert.throws(() => parseCounts('0|2\nkaputt\n'), /Zählung unlesbar/);
  });

  test('AC-056, AC-003: everything equal → green', () => {
    const counts = parseCounts('0|2\n1|26\n2|0\n');
    assert.equal(compareCounts(MANIFEST, counts, 2), null);
  });

  test('AC-004: older backups compare rows and photos; videos of format 2 are passed over', () => {
    const counts = parseCounts('0|2\n1|26\n2|0\n');
    assert.equal(compareCounts(MANIFEST_V2, counts, 2), null);
    assert.equal(compareCounts(MANIFEST_V1, counts, 2), null);
    assert.match(compareCounts(MANIFEST_V2, counts, 1), /Abweichung bei den Fotos/);
  });

  test('AC-056: one table short → the first deviation, tables and numbers only', () => {
    const counts = parseCounts('0|2\n1|25\n2|7\n');
    assert.equal(
      compareCounts(MANIFEST, counts, 2),
      'Abweichung in public.recipes: Begleitdatei 26 Zeilen, Wiederherstellung 25',
    );
  });

  test('AC-056: a table missing from the count and a photo deviation are reported', () => {
    assert.equal(
      compareCounts(MANIFEST, parseCounts('0|2\n2|0\n'), 2),
      'Abweichung in public.recipes: nicht gezählt',
    );
    assert.equal(
      compareCounts(MANIFEST, parseCounts('0|2\n1|26\n2|0\n'), 1),
      'Abweichung bei den Fotos: Begleitdatei 2, Archiv 1',
    );
  });
});

function run(...args) {
  const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
  return {
    status: result.status,
    stdout: result.stdout,
    output: `${result.stdout}${result.stderr}`,
  };
}

describe('CLI', () => {
  const manifest = path.join(dir, 'manifest.json');
  const archive = path.join(dir, 'backup.tar.gz.age');
  const media = path.join(dir, 'media');
  const manifestV2 = path.join(dir, 'manifest-v2.json');
  writeFileSync(manifest, JSON.stringify(MANIFEST));
  writeFileSync(manifestV2, JSON.stringify(MANIFEST_V2));
  writeFileSync(archive, ARCHIVE);
  mkdirSync(path.join(media, 'h'), { recursive: true });
  writeFileSync(path.join(media, 'h', '1.jpg'), '1');
  writeFileSync(path.join(media, 'h', '2.jpg'), '2');

  test('AC-056: checksum of the downloaded archive', () => {
    assert.equal(run('checksum', '--manifest', manifest, '--archive', archive).status, 0);
    const other = path.join(dir, 'other.age');
    writeFileSync(other, 'tampered');
    const bad = run('checksum', '--manifest', manifest, '--archive', other);
    assert.equal(bad.status, 1);
    assert.match(bad.output, /::error::.*Prüfsumme/);
  });

  test('query prints the count SQL', () => {
    const result = run('query', '--manifest', manifest);
    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), countQuery(MANIFEST));
  });

  test('AC-056, AC-003: counts → green with a summary of numbers, red with the first deviation', () => {
    const good = path.join(dir, 'good.txt');
    const bad = path.join(dir, 'bad.txt');
    writeFileSync(good, '0|2\n1|26\n2|0\n');
    writeFileSync(bad, '0|1\n1|25\n2|0\n');

    const counts = (file, list) => [
      'counts',
      ...['--manifest', file, '--counts', list, '--media', media],
    ];
    const ok = run(...counts(manifest, good));
    assert.equal(ok.status, 0, ok.output);
    assert.match(ok.output, /3 Tabellen, 28 Zeilen, 2 Fotos$/m);

    const red = run(...counts(manifest, bad));
    assert.equal(red.status, 1);
    assert.match(
      red.output,
      /::error::Abweichung in auth\.users: Begleitdatei 2 Zeilen, Wiederherstellung 1/,
    );
    assert.doesNotMatch(red.output, /public\.recipes/);
  });

  test('AC-004: a format-2 backup is green without a videos folder, its videos passed over', () => {
    const good = path.join(dir, 'good-v2.txt');
    writeFileSync(good, '0|2\n1|26\n2|0\n');
    const old = run('counts', '--manifest', manifestV2, '--counts', good, '--media', media);
    assert.equal(old.status, 0, old.output);
    assert.match(old.output, /3 Tabellen, 28 Zeilen, 2 Fotos$/m);
  });

  test('AC-003: counts needs no videos folder; its usage line names none', () => {
    const result = run('counts', '--manifest', manifest);
    assert.equal(result.status, 2);
    assert.match(result.output, /counts --manifest <datei> --counts <datei> --media <ordner>$/m);
  });

  test('an unknown mode fails with a usage line', () => {
    const result = run('restore');
    assert.equal(result.status, 2);
    assert.match(result.output, /checksum|query|counts/);
  });
});
