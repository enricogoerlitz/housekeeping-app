#!/usr/bin/env node
// Writes the companion file of a backup (spec 0014, Task 9, AC-052; spec 0043, decision 8): rows
// per table counted from the COPY blocks of the data dump, the number of photo and video files in
// the archive and the SHA-256 of the encrypted archive. Counting from the dump, not from the live database, keeps the restore
// test independent of writes between dump and count. The file holds no data, and the CLI prints
// only numbers.
//
//   node scripts/backup/manifest.mjs --data <data.sql> --media <dir> --videos <dir> --archive <file.age> --out <manifest.json>
//
// No dependencies: runs in the backup job, which installs no packages.
import { createHash } from 'node:crypto';
import { createReadStream, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

// Format 2 (spec 0043) adds `videos`; compare.mjs still reads format 1 (backups without videos).
export const MANIFEST_FORMAT = 2;

// One identifier: "quoted ""with"" quotes" or a plain name.
const IDENT = String.raw`(?:"(?:[^"]|"")+"|[A-Za-z_][\w$]*)`;
const COPY_LINE = new RegExp(String.raw`^COPY (${IDENT})\.(${IDENT})(?: \(.*\))? FROM stdin;$`);
const END_OF_DATA = '\\.';

const unquote = (ident) =>
  ident.startsWith('"') ? ident.slice(1, -1).replaceAll('""', '"') : ident;

/** `{ schema, table }` for a `COPY … FROM stdin;` line, otherwise null. */
export function parseCopyTarget(line) {
  const match = COPY_LINE.exec(line);
  return match ? { schema: unquote(match[1]), table: unquote(match[2]) } : null;
}

/**
 * Rows per table from the lines of a data dump made with `--use-copy`. In COPY text format every
 * row is one line (newlines and backslashes inside values are escaped), and a block ends with a
 * line that is exactly `\.`.
 *
 * @param {Iterable<string> | AsyncIterable<string>} lines
 * @returns {Promise<{ schema: string, table: string, rows: number }[]>}
 */
export async function countCopyRows(lines) {
  const tables = [];
  let current = null;
  for await (const raw of lines) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (current) {
      if (line === END_OF_DATA) current = null;
      else current.rows += 1;
      continue;
    }
    const target = parseCopyTarget(line);
    if (target) {
      current = { ...target, rows: 0 };
      tables.push(current);
    }
  }
  if (current) {
    throw new Error(
      `Daten-Dump unvollständig: COPY-Block ohne Ende (${current.schema}.${current.table})`,
    );
  }
  if (tables.length === 0) {
    throw new Error('Daten-Dump ohne COPY-Blöcke – mit --data-only --use-copy erstellt?');
  }
  return tables;
}

/** Number of regular files below `dir`, nested folders included; `label` names it in errors. */
export function countFiles(dir, label = 'Fotoordner') {
  let stats;
  try {
    stats = statSync(dir);
  } catch {
    throw new Error(`${label} fehlt: ${dir}`);
  }
  if (!stats.isDirectory()) throw new Error(`${label} fehlt: ${dir}`);
  let count = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile()) count += 1;
  }
  return count;
}

/** Hex SHA-256 of a file, streamed. */
export function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(file)
      .on('error', reject)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')));
  });
}

export function buildManifest({ tables, photos, videos, archive, createdAt }) {
  return {
    format: MANIFEST_FORMAT,
    createdAt: createdAt.toISOString(),
    tables: tables.map(({ schema, table, rows }) => ({ schema, table, rows })),
    photos,
    videos,
    archive: { name: archive.name, bytes: archive.bytes, sha256: archive.sha256 },
  };
}

const USAGE =
  'Aufruf: node scripts/backup/manifest.mjs --data <datei> --media <ordner> --videos <ordner> --archive <datei> --out <datei>';

async function main() {
  const { values } = parseArgs({
    options: {
      data: { type: 'string' },
      media: { type: 'string' },
      videos: { type: 'string' },
      archive: { type: 'string' },
      out: { type: 'string' },
    },
  });
  if (!values.data || !values.media || !values.videos || !values.archive || !values.out) {
    console.error(USAGE);
    process.exit(2);
  }
  try {
    const lines = createInterface({ input: createReadStream(values.data), crlfDelay: Infinity });
    const tables = await countCopyRows(lines);
    const photos = countFiles(values.media);
    const videos = countFiles(values.videos, 'Videoordner');
    const manifest = buildManifest({
      tables,
      photos,
      videos,
      archive: {
        name: path.basename(values.archive),
        bytes: statSync(values.archive).size,
        sha256: await sha256File(values.archive),
      },
      createdAt: new Date(),
    });
    writeFileSync(values.out, `${JSON.stringify(manifest, null, 2)}\n`);
    const rows = tables.reduce((sum, t) => sum + t.rows, 0);
    console.log(
      `Begleitdatei: ${tables.length} Tabellen, ${rows} Zeilen, ${photos} Fotos, ${videos} Videos`,
    );
  } catch (error) {
    console.log(`::error::${error.message}`);
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
