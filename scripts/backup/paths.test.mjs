// scripts/backup/paths.mjs (spec 0014, Task 9): where a backup is stored in the container
// `backups`, and which backup the restore test takes. Pure functions plus the CLI against
// throwaway files under tmp/ (git-ignored), removed afterwards.
//
//   node --test scripts/backup/paths.test.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { latestDaily, uploadTargets } from './paths.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const script = path.join(root, 'scripts/backup/paths.mjs');
mkdirSync(path.join(root, 'tmp'), { recursive: true });
const dir = mkdtempSync(path.join(root, 'tmp', 'backup-paths-test-'));
after(() => rmSync(dir, { recursive: true, force: true }));

describe('upload targets', () => {
  test('AC-052: without a prefix the backup goes to daily/<UTC date>/<run>', () => {
    assert.deepEqual(
      uploadTargets({ prefix: '', runId: '123-1', now: new Date('2026-12-14T02:17:00Z') }),
      ['daily/2026-12-14/123-1'],
    );
  });

  test('AC-054: on the first of the month also monthly/<YYYY-MM>/<run>', () => {
    assert.deepEqual(
      uploadTargets({ prefix: '', runId: '123-1', now: new Date('2027-01-01T02:17:00Z') }),
      ['daily/2027-01-01/123-1', 'monthly/2027-01/123-1'],
    );
    assert.deepEqual(
      uploadTargets({ prefix: 'daily/2026-12-01', runId: '9-2', now: new Date('2026-12-02') }),
      ['daily/2026-12-01/9-2', 'monthly/2026-12/9-2'],
    );
  });

  test('a release backup goes to release/v<version>/<run> only, even on the first', () => {
    assert.deepEqual(
      uploadTargets({
        prefix: 'release/v2026.12.1',
        runId: '77-1',
        now: new Date('2026-12-01T10:00:00Z'),
      }),
      ['release/v2026.12.1/77-1'],
    );
  });

  test('any other prefix or run id is rejected (no writing outside the three folders)', () => {
    const now = new Date('2026-12-14T02:17:00Z');
    for (const prefix of [
      'monthly/2026-12',
      'daily/2026-12-14/../monthly',
      'daily/2026-13-01',
      'release/v2026.13.1',
      'release/latest',
      '/daily/2026-12-14',
      'daily/2026-12-14/',
    ]) {
      assert.throws(() => uploadTargets({ prefix, runId: '1-1', now }), /Ungültiges Ziel/, prefix);
    }
    for (const runId of ['', '../1', '1/2', 'abc']) {
      assert.throws(() => uploadTargets({ prefix: '', runId, now }), /Ungültige Lauf-ID/, runId);
    }
  });
});

const blob = (name, lastModified) => ({ name, lastModified });
const complete = (folder, at) => [
  blob(`${folder}/backup.tar.gz.age`, at),
  blob(`${folder}/manifest.json`, at),
];

describe('latest daily backup', () => {
  const now = new Date('2026-12-14T04:47:00Z');

  test('AC-056: picks the newest complete backup under daily/', () => {
    const blobs = [
      ...complete('daily/2026-12-12/100-1', '2026-12-12T02:20:00+00:00'),
      ...complete('daily/2026-12-13/200-1', '2026-12-13T02:21:00+00:00'),
      // newer, but the manifest is missing (the run failed after the archive upload)
      blob('daily/2026-12-14/300-1/backup.tar.gz.age', '2026-12-14T02:20:00+00:00'),
      ...complete('release/v2026.12.1/400-1', '2026-12-14T03:00:00+00:00'),
    ];
    assert.deepEqual(latestDaily(blobs, now), {
      folder: 'daily/2026-12-13/200-1',
      lastModified: '2026-12-13T02:21:00.000Z',
    });
  });

  test('a backup older than 36 hours fails with „Sicherung zu alt“', () => {
    const blobs = complete('daily/2026-12-12/100-1', '2026-12-12T16:46:00Z');
    assert.throws(() => latestDaily(blobs, now), /Sicherung zu alt/);
    const fresh = complete('daily/2026-12-12/100-1', '2026-12-12T16:48:00Z');
    assert.equal(latestDaily(fresh, now).folder, 'daily/2026-12-12/100-1');
  });

  test('no complete backup at all fails with a clear message', () => {
    assert.throws(() => latestDaily([], now), /Keine vollständige Sicherung unter daily\//);
    assert.throws(
      () => latestDaily([blob('daily/x/manifest.json', '2026-12-14T00:00:00Z')], now),
      /Keine vollständige Sicherung/,
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
  test('targets prints one folder per line', () => {
    const result = run(
      'targets',
      '--prefix',
      '',
      '--run-id',
      '5-1',
      '--now',
      '2027-01-01T02:17:00Z',
    );
    assert.equal(result.status, 0, result.output);
    assert.equal(result.stdout, 'daily/2027-01-01/5-1\nmonthly/2027-01/5-1\n');
  });

  test('targets with an invalid prefix fails as an annotation', () => {
    const result = run('targets', '--prefix', 'monthly/x', '--run-id', '5-1');
    assert.equal(result.status, 1);
    assert.match(result.output, /::error::Ungültiges Ziel/);
  });

  test('latest reads the JSON of `az storage blob list` and prints the folder', () => {
    const file = path.join(dir, 'blobs.json');
    writeFileSync(file, JSON.stringify(complete('daily/2026-12-13/200-1', '2026-12-13T02:21:00Z')));
    const ok = run('latest', '--blobs', file, '--now', '2026-12-14T04:47:00Z');
    assert.equal(ok.status, 0, ok.output);
    assert.equal(ok.stdout, 'daily/2026-12-13/200-1\n');

    const old = run('latest', '--blobs', file, '--now', '2026-12-20T04:47:00Z');
    assert.equal(old.status, 1);
    assert.match(old.output, /::error::Sicherung zu alt/);
  });
});
