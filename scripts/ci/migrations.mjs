// Check "Migrationen" (spec 0014, Task 1; AC-009, plan decision 25). No dependencies.
//
// - Compares `git diff --name-status <base>...HEAD -- supabase/migrations`. Before the first tag
//   v* the baseline may still change (ADR-0012): a changed, deleted or renamed migration is only a
//   note. From the first tag on it is red: a committed migration is never changed.
// - A new migration with `drop column`, `drop table` or `rename` outside comments needs the
//   contract header `-- contract: <Begründung>; min_app_version: <Version>` in its leading comment
//   block and a new definition of public.min_app_version() returning that same version.
//
//   node scripts/ci/migrations.mjs --base <rev>
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DIR = 'supabase/migrations';
export const CONTRACT_MISSING =
  'Rückbau ohne Kennzeichnung (expand → migrate → contract): Kopf „-- contract: <Begründung>; min_app_version: <Version>“ fehlt';
// Calendar version JJJJ.M.N, the same pattern as supabase/tests/app_version.test.sql.
const VERSION = /^\d{4}\.(1[0-2]|[1-9])\.[1-9]\d*$/;

/** SQL without `--` line comments and `/* … *\/` block comments. */
export function stripSqlComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, '');
}

/** Whether the statements drop a table or column or rename anything. */
export function isDestructive(sql) {
  return /\bdrop\s+(?:table|column)\b|\brename\b/i.test(stripSqlComments(sql));
}

/** The contract header from the leading comment block, or undefined. */
export function contractHeader(sql) {
  for (const line of sql.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    if (!trimmed.startsWith('--')) return undefined;
    const match = /^--\s*contract:\s*(.*?);\s*min_app_version:\s*(\S+)\s*$/.exec(trimmed);
    if (match) return { reason: match[1].trim(), version: match[2] };
  }
  return undefined;
}

/** The version a definition of public.min_app_version() in `sql` returns, or undefined. */
export function minAppVersionIn(sql) {
  const match = /function\s+public\.min_app_version\s*\(\s*\)[\s\S]*?'(\d+\.\d+\.\d+)'/i.exec(
    stripSqlComments(sql),
  );
  return match?.[1];
}

/** Problems of a new migration file. */
export function checkNewMigration(file, sql) {
  if (!isDestructive(sql)) return [];
  const header = contractHeader(sql);
  if (!header || header.reason === '') return [`${file}: ${CONTRACT_MISSING}`];
  if (!VERSION.test(header.version)) {
    return [`${file}: min_app_version „${header.version}“ hat nicht das Format JJJJ.M.N`];
  }
  const defined = minAppVersionIn(sql);
  if (!defined) {
    return [
      `${file}: Rückbau nennt min_app_version ${header.version}, definiert public.min_app_version() nicht neu`,
    ];
  }
  if (defined !== header.version) {
    return [
      `${file}: Kopf nennt min_app_version ${header.version}, public.min_app_version() liefert ${defined}`,
    ];
  }
  return [];
}

/** Entries of `git diff --name-status` ([{ status, path, oldPath? }]); R and C keep both paths. */
export function parseNameStatus(text) {
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [code, first, second] = line.split('\t');
      const status = code[0];
      return second ? { status, path: second, oldPath: first } : { status, path: first };
    });
}

const VERB = { M: 'geändert', T: 'geändert', D: 'gelöscht', R: 'umbenannt' };

/**
 * Errors and notes for the migration changes of a pull request. `released`: a tag v* exists.
 * `read(path)` returns the content of a new file.
 */
export function checkChanges(entries, { released, read }) {
  const errors = [];
  const notes = [];
  for (const entry of entries) {
    if (!entry.path.endsWith('.sql') && !entry.oldPath?.endsWith('.sql')) continue;
    if (entry.status === 'A' || entry.status === 'C') {
      errors.push(...checkNewMigration(entry.path, read(entry.path)));
      continue;
    }
    const verb = VERB[entry.status];
    if (!verb) continue;
    const file = entry.oldPath ?? entry.path;
    const what = entry.status === 'R' ? `${verb} nach ${entry.path}` : verb;
    if (released) {
      errors.push(
        `${file}: Migration liegt schon auf der Basis und wurde ${what}. Veröffentlichte Migrationen werden nie geändert; eine neue Migration anlegen.`,
      );
    } else {
      notes.push(
        `Noch kein Tag v*: ${file} ${what}, erlaubt bis zur ersten Veröffentlichung (ADR-0012).`,
      );
    }
  }
  return { errors, notes };
}

function git(args) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args[0]} failed: ${result.stderr.trim()}`);
  return result.stdout;
}

function main(args) {
  const index = args.indexOf('--base');
  const base = index === -1 ? undefined : args[index + 1];
  if (!base) {
    console.error('Usage: node scripts/ci/migrations.mjs --base <rev>');
    return 2;
  }
  const entries = parseNameStatus(
    git(['diff', '--name-status', '-M', `${base}...HEAD`, '--', DIR]),
  );
  const released = git(['tag', '-l', 'v*']).trim() !== '';
  const { errors, notes } = checkChanges(entries, {
    released,
    read: (file) => readFileSync(file, 'utf8'),
  });
  for (const note of notes) console.log(`Hinweis: ${note}`);
  if (errors.length === 0) {
    console.log(
      `Migrationen: ok (${entries.length} geänderte Datei(en) unter ${DIR}, ${released ? 'nach' : 'vor'} der ersten Veröffentlichung).`,
    );
    return 0;
  }
  // Workflow commands (::error::) are read from stdout.
  const inActions = process.env.GITHUB_ACTIONS === 'true';
  for (const error of errors) {
    if (inActions) console.log(`::error::${error}`);
    else console.error(`FEHLER: ${error}`);
  }
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
