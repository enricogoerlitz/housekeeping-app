#!/usr/bin/env node
// Restore test (spec 0014, Task 9, AC-056; spec 0043, decision 8): compares the downloaded
// archive, the restored throwaway database and the unpacked photos and videos with the companion
// file written by manifest.mjs. Backups of format 1 (before spec 0043) hold no videos; for them
// the videos folder is not read.
// Messages name tables and numbers only, never data from the backup.
//
//   node scripts/backup/compare.mjs checksum --manifest <manifest.json> --archive <file.age>
//   node scripts/backup/compare.mjs query    --manifest <manifest.json>            # count SQL to stdout
//   node scripts/backup/compare.mjs counts   --manifest <manifest.json> --counts <psql -At output> --media <dir> --videos <dir>
//
// No dependencies: runs in the restore-test job, which installs no packages.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

import { MANIFEST_FORMAT, countFiles, sha256File } from './manifest.mjs';

const isCount = (n) => Number.isSafeInteger(n) && n >= 0;
const isName = (s) => typeof s === 'string' && s.length > 0 && !s.includes('\0');

/** Whether the backup holds videos (format 2 on, spec 0043). */
const hasVideos = (manifest) => manifest.format >= 2;

/** The manifest if it has a format manifest.mjs writes or wrote (1, 2); throws otherwise. */
export function validateManifest(manifest) {
  const format = manifest?.format;
  const valid =
    (format === 1 || format === MANIFEST_FORMAT) &&
    (format === 1 || isCount(manifest.videos)) &&
    Array.isArray(manifest.tables) &&
    manifest.tables.length > 0 &&
    manifest.tables.every((t) => isName(t?.schema) && isName(t?.table) && isCount(t?.rows)) &&
    isCount(manifest.photos) &&
    /^[0-9a-f]{64}$/.test(manifest.archive?.sha256 ?? '');
  if (!valid) throw new Error('Begleitdatei ungültig (Format oder Felder)');
  return manifest;
}

/** null if the archive is the one the manifest describes, otherwise the problem. */
export function checkArchive(manifest, sha256) {
  return sha256 === manifest.archive.sha256
    ? null
    : 'Prüfsumme des Archivs stimmt nicht mit der Begleitdatei überein';
}

const quoteIdent = (name) => `"${name.replaceAll('"', '""')}"`;

/** One `count(*)` per table of the manifest, numbered by its position: rows `<index>|<count>`. */
export function countQuery(manifest) {
  const parts = manifest.tables.map(
    ({ schema, table }, i) =>
      `${i === 0 ? '' : 'union all '}select ${i}, count(*) from ${quoteIdent(schema)}.${quoteIdent(table)}`,
  );
  return [...parts, ';'].join('\n');
}

/** index → count from the output of `psql -At` (separator `|`). */
export function parseCounts(text) {
  const counts = new Map();
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    const match = /^(\d+)\|(\d+)$/.exec(line.trim());
    if (!match) throw new Error('Zählung unlesbar (erwartet: <Index>|<Anzahl>)');
    counts.set(Number(match[1]), Number(match[2]));
  }
  return counts;
}

/**
 * null if every table, the photos and (from format 2) the videos match, otherwise the first
 * deviation.
 */
export function compareCounts(manifest, counts, photos, videos) {
  for (const [i, { schema, table, rows }] of manifest.tables.entries()) {
    const name = `${schema}.${table}`;
    if (!counts.has(i)) return `Abweichung in ${name}: nicht gezählt`;
    const found = counts.get(i);
    if (found !== rows) {
      return `Abweichung in ${name}: Begleitdatei ${rows} Zeilen, Wiederherstellung ${found}`;
    }
  }
  if (photos !== manifest.photos) {
    return `Abweichung bei den Fotos: Begleitdatei ${manifest.photos}, Archiv ${photos}`;
  }
  if (hasVideos(manifest) && videos !== manifest.videos) {
    return `Abweichung bei den Videos: Begleitdatei ${manifest.videos}, Archiv ${videos}`;
  }
  return null;
}

const USAGE = [
  'Aufruf:',
  '  node scripts/backup/compare.mjs checksum --manifest <datei> --archive <datei>',
  '  node scripts/backup/compare.mjs query --manifest <datei>',
  '  node scripts/backup/compare.mjs counts --manifest <datei> --counts <datei> --media <ordner> --videos <ordner>',
].join('\n');

function fail(message) {
  console.log(`::error::${message}`);
  process.exit(1);
}

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      manifest: { type: 'string' },
      archive: { type: 'string' },
      counts: { type: 'string' },
      media: { type: 'string' },
      videos: { type: 'string' },
    },
  });
  const [mode] = positionals;
  const needs = { checksum: ['archive'], query: [], counts: ['counts', 'media', 'videos'] }[mode];
  if (!needs || !values.manifest || needs.some((name) => !values[name])) {
    console.error(USAGE);
    process.exit(2);
  }
  try {
    const manifest = validateManifest(JSON.parse(readFileSync(values.manifest, 'utf8')));
    if (mode === 'checksum') {
      const problem = checkArchive(manifest, await sha256File(values.archive));
      if (problem) fail(problem);
      console.log('Prüfsumme des Archivs stimmt.');
    } else if (mode === 'query') {
      console.log(countQuery(manifest));
    } else {
      const photos = countFiles(values.media);
      const videos = hasVideos(manifest) ? countFiles(values.videos, 'Videoordner') : undefined;
      const problem = compareCounts(
        manifest,
        parseCounts(readFileSync(values.counts, 'utf8')),
        photos,
        videos,
      );
      if (problem) fail(problem);
      const rows = manifest.tables.reduce((sum, t) => sum + t.rows, 0);
      const media = videos === undefined ? `${photos} Fotos` : `${photos} Fotos, ${videos} Videos`;
      console.log(
        `Wiederherstellung stimmt: ${manifest.tables.length} Tabellen, ${rows} Zeilen, ${media}`,
      );
    }
  } catch (error) {
    fail(error.message);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
