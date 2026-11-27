#!/usr/bin/env node
// Restore test (spec 0014, AC-056; spec 0028, AC-018): the throwaway database runs the Postgres
// image of the pinned Supabase CLI. Its platform schemas (auth, storage, …) can lag behind the
// hosted project, which Supabase updates on its own (27.11.2026: two new columns of
// auth.custom_oauth_providers broke the restore). This script reads only the COPY headers of
// data.sql and writes SQL that adds the missing platform columns and tables as `text`, so every row
// lands and the counts can be compared. The platform tables belong to their service roles
// (supabase_auth_admin, …), so the workflow applies the SQL as supabase_admin. Our own schemas (public, private) come from schema.sql and
// are never patched: a gap there stays an error. Messages name schemas, tables and columns only.
//
//   node scripts/backup/align.mjs --data <data.sql> --columns <psql -At: schema.table.column per line>
//
// No dependencies: runs in the restore-test job, which installs no packages.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

const OWN_SCHEMAS = new Set(['public', 'private']);
const NAME = /"((?:[^"]|"")*)"/g;
const unquote = (s) => s.replaceAll('""', '"');
const quote = (s) => `"${s.replaceAll('"', '""')}"`;

/** Schema, table and columns of every COPY header; data rows between header and `\.` are skipped. */
export function copyTargets(sql) {
  const targets = [];
  let inData = false;
  for (const line of sql.split('\n')) {
    if (inData) {
      if (line === '\\.') inData = false;
      continue;
    }
    const m = /^COPY "((?:[^"]|"")*)"\."((?:[^"]|"")*)" \((.*)\) FROM stdin;$/.exec(line);
    if (!m) continue;
    const columns = [...m[3].matchAll(NAME)].map((c) => unquote(c[1]));
    targets.push({ schema: unquote(m[1]), table: unquote(m[2]), columns });
    inData = true;
  }
  return targets;
}

/** `schema.table.column` lines (psql -At) as a map of table → set of columns. */
export function parseColumns(text) {
  const tables = new Map();
  for (const line of text.split('\n')) {
    const parts = line.trim().split('.');
    if (parts.length < 3) continue;
    const [schema, table, ...rest] = parts;
    const key = `${schema}.${table}`;
    if (!tables.has(key)) tables.set(key, new Set());
    tables.get(key).add(rest.join('.'));
  }
  return tables;
}

/** SQL that adds the missing platform tables and columns, and the names of what it adds. */
export function alignSql(targets, existing) {
  const lines = [];
  const added = [];
  for (const { schema, table, columns } of targets) {
    if (OWN_SCHEMAS.has(schema)) continue;
    const have = existing.get(`${schema}.${table}`);
    const name = `${quote(schema)}.${quote(table)}`;
    if (!have) {
      lines.push(
        `CREATE TABLE IF NOT EXISTS ${name} (${columns.map((c) => `${quote(c)} text`).join(', ')});`,
        // Applied as supabase_admin; the data goes in as postgres afterwards.
        `GRANT ALL ON TABLE ${name} TO postgres;`,
      );
      added.push(`${schema}.${table}`);
      continue;
    }
    for (const c of columns) {
      if (have.has(c)) continue;
      lines.push(`ALTER TABLE ${name} ADD COLUMN IF NOT EXISTS ${quote(c)} text;`);
      added.push(`${schema}.${table}.${c}`);
    }
  }
  return { sql: lines.length ? `${lines.join('\n')}\n` : '', added };
}

function main() {
  const { values } = parseArgs({
    options: { data: { type: 'string' }, columns: { type: 'string' } },
  });
  if (!values.data || !values.columns) {
    console.error('Aufruf: align.mjs --data <data.sql> --columns <Spaltenliste>');
    process.exit(2);
  }
  const targets = copyTargets(readFileSync(values.data, 'utf8'));
  const { sql, added } = alignSql(targets, parseColumns(readFileSync(values.columns, 'utf8')));
  for (const a of added)
    console.error(`Wegwerf-Datenbank ergänzt (Plattform neuer als Image): ${a}`);
  process.stdout.write(sql);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
