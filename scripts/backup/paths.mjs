#!/usr/bin/env node
// Folders of the backups in the container `backups` (spec 0014, Task 9, plan decision 18):
// `daily/<YYYY-MM-DD>/<run>/`, on the first of the month also `monthly/<YYYY-MM>/<run>/`, before
// every release `release/v<version>/<run>/`. Dates are UTC (the backup runs at 02:17 UTC, the
// same calendar day as in Berlin). `<run>` is `<run id>-<attempt>`, so a re-run never collides
// with the blobs of an earlier attempt (uploads never overwrite).
//
//   node scripts/backup/paths.mjs targets --prefix <prefix or ''> --run-id <id-attempt> [--now <ISO>]
//   node scripts/backup/paths.mjs latest --blobs <az storage blob list JSON> [--now <ISO>]
//
// No dependencies: runs in the backup and restore-test jobs, which install no packages.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

export const ARCHIVE = 'backup.tar.gz.age';
export const MANIFEST = 'manifest.json';
/** The restore test fails if the newest daily backup is older (plan decision 19). */
export const MAX_AGE_HOURS = 36;

const DAILY = /^daily\/(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const RELEASE = /^release\/v\d{4}\.(1[0-2]|[1-9])\.[1-9]\d*$/;
const RUN_ID = /^\d+(-\d+)?$/;

/** Folders a backup is uploaded to; throws for any prefix outside daily/ and release/. */
export function uploadTargets({ prefix, runId, now }) {
  if (!RUN_ID.test(runId)) throw new Error(`Ungültige Lauf-ID „${runId}“`);
  const folder = prefix === '' ? `daily/${now.toISOString().slice(0, 10)}` : prefix;
  const daily = DAILY.exec(folder);
  if (!daily && !RELEASE.test(folder)) {
    throw new Error(
      `Ungültiges Ziel „${prefix}“: erlaubt sind daily/JJJJ-MM-TT und release/v<Version>`,
    );
  }
  const targets = [`${folder}/${runId}`];
  if (daily && daily[3] === '01') targets.push(`monthly/${daily[1]}-${daily[2]}/${runId}`);
  return targets;
}

/**
 * The newest complete backup (archive and manifest) under daily/.
 *
 * @param {{ name: string, lastModified: string }[]} blobs
 * @returns {{ folder: string, lastModified: string }}
 */
export function latestDaily(blobs, now, maxAgeHours = MAX_AGE_HOURS) {
  const folders = new Map();
  for (const { name, lastModified } of blobs) {
    const match = /^(daily\/[^/]+\/[^/]+)\/([^/]+)$/.exec(name);
    if (!match) continue;
    const entry = folders.get(match[1]) ?? {};
    entry[match[2]] = new Date(lastModified);
    folders.set(match[1], entry);
  }
  const complete = [...folders]
    .filter(([, files]) => files[ARCHIVE] && files[MANIFEST])
    .map(([folder, files]) => ({ folder, at: files[MANIFEST] }))
    .sort((a, b) => b.at - a.at);
  if (complete.length === 0) throw new Error('Keine vollständige Sicherung unter daily/ gefunden');
  const [latest] = complete;
  if (now - latest.at > maxAgeHours * 3_600_000) {
    throw new Error(
      `Sicherung zu alt: die neueste ist vom ${latest.at.toISOString()}, älter als ${maxAgeHours} Stunden – läuft schedule.yml noch?`,
    );
  }
  return { folder: latest.folder, lastModified: latest.at.toISOString() };
}

const USAGE = [
  'Aufruf:',
  "  node scripts/backup/paths.mjs targets --prefix <prefix oder ''> --run-id <id-versuch> [--now <ISO>]",
  '  node scripts/backup/paths.mjs latest --blobs <datei> [--now <ISO>]',
].join('\n');

function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      prefix: { type: 'string' },
      'run-id': { type: 'string' },
      blobs: { type: 'string' },
      now: { type: 'string' },
    },
  });
  const [mode] = positionals;
  const now = values.now ? new Date(values.now) : new Date();
  const usable =
    (mode === 'targets' && values.prefix !== undefined && values['run-id'] !== undefined) ||
    (mode === 'latest' && values.blobs !== undefined);
  if (!usable || Number.isNaN(now.getTime())) {
    console.error(USAGE);
    process.exit(2);
  }
  try {
    if (mode === 'targets') {
      for (const target of uploadTargets({ prefix: values.prefix, runId: values['run-id'], now })) {
        console.log(target);
      }
    } else {
      const blobs = JSON.parse(readFileSync(values.blobs, 'utf8'));
      console.log(latestDaily(blobs, now).folder);
    }
  } catch (error) {
    console.log(`::error::${error.message}`);
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
