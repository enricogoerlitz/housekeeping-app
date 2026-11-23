// Version of a release (spec 0014, Task 6; AC-018, AC-020, AC-026, AC-033; plan decisions 10, 11,
// 13). No dependencies: runs in jobs that install no packages.
//
// Release (job "version" of release.yml, on main):
//   node scripts/release/version.mjs [--now <ISO>] [--force]
//   - next version JJJJ.M.N from `git tag -l 'v*'` (month in Europe/Berlin, packages/core);
//   - release=false when nothing but docs/, .agents/, .claude/ or Markdown changed since the
//     latest tag (AC-020; the same rule as the job "Änderungen" of checks.yml); --force (the input
//     of a release started by hand, e.g. after a disaster restore into a new Supabase project)
//     makes it a release anyway;
//   - the last definition of public.min_app_version() in supabase/migrations must be at most the
//     latest published version (before the first release: at most the new one), otherwise exit 1
//     with „Mindestversion X ist noch nicht veröffentlicht“ and no outputs (AC-026). With the
//     exception of the new migration base (supabase/migrations-base.json naming the latest tag,
//     spec 0031, REQ-001) at most the new version: the base locks the devices of the old one.
//   Outputs (GITHUB_OUTPUT): version, tag, previous (empty before the first release), release.
//
// Redeploy of an earlier web version (redeploy-web.yml):
//   SUPABASE_PUBLISHABLE_KEY=… node scripts/release/version.mjs --redeploy <tag> --supabase-url <url>
//   - reads public.min_app_version() of that project over the API with the publishable key and
//     refuses a tag below it (AC-033). Outputs: version, tag.
import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import {
  compareAppVersions,
  nextAppVersion,
  parseAppVersion,
} from '../../packages/core/src/app-version.ts';
import { minAppVersionIn } from '../ci/migrations.mjs';
import { baseApplies, readMigrationsBase } from './migrations-base.mjs';

const MIGRATIONS = 'supabase/migrations';
const TAG = /^v(.+)$/;
/** Documentation paths; the same pattern as the job "Änderungen" in .github/workflows/checks.yml. */
const DOCS = /^(docs\/|\.agents\/|\.claude\/)|\.md$/;

/** The version of a release tag `v<JJJJ.M.N>`, or undefined. */
export function tagVersion(tag) {
  const version = TAG.exec(tag)?.[1];
  return version !== undefined && parseAppVersion(version) ? version : undefined;
}

/** The release tag with the highest version, or undefined when there is none. */
export function latestReleaseTag(tags) {
  let latest;
  for (const tag of tags) {
    const version = tagVersion(tag);
    if (version && (!latest || compareAppVersions(version, tagVersion(latest)) > 0)) latest = tag;
  }
  return latest;
}

/** Whether the files changed since the latest tag make a release (AC-020). */
export function releaseDecision(files, { force = false } = {}) {
  if (force) {
    const code = files.filter((file) => !DOCS.test(file)).length;
    return {
      release: true,
      reason: `erzwungen von Hand (${code} Datei(en) außerhalb der Dokumentation seit dem letzten Tag)`,
    };
  }
  if (files.length === 0)
    return { release: false, reason: 'Keine Änderungen seit dem letzten Tag' };
  const code = files.filter((file) => !DOCS.test(file));
  if (code.length === 0) {
    return {
      release: false,
      reason: `nur Dokumentation geändert (${files.length} Datei(en)), keine Veröffentlichung`,
    };
  }
  return { release: true, reason: `${code.length} Datei(en) außerhalb der Dokumentation geändert` };
}

/** The version the last definition of public.min_app_version() returns ([{ file, sql }]). */
export function lastMinAppVersion(migrations) {
  const sorted = [...migrations].sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
  let version;
  for (const { sql } of sorted) version = minAppVersionIn(sql) ?? version;
  if (!version) throw new Error(`${MIGRATIONS} definiert keine public.min_app_version()`);
  return version;
}

/**
 * The AC-026 message, or undefined when the minimum version blocks no device. `newBase`: the
 * exception of the new migration base applies; then the limit is the new version (AC-005).
 */
export function checkMinAppVersion({ min, published, next, newBase = false }) {
  if (!parseAppVersion(min)) throw new Error(`Ungültige Mindestversion „${min}“`);
  const limit = newBase ? next : (published ?? next);
  return compareAppVersions(min, limit) > 0
    ? `Mindestversion ${min} ist noch nicht veröffentlicht`
    : undefined;
}

/** `{ version }` when `tag` may be delivered again, otherwise `{ error }` (AC-033). */
export function checkRedeploy({ tag, min }) {
  const version = tagVersion(tag);
  if (!version) return { error: `„${tag}“ ist kein Tag einer Veröffentlichung (v<JJJJ.M.N>)` };
  if (compareAppVersions(version, min) < 0) {
    return { error: `${tag} liegt unter der Mindestversion ${min} und wird nicht ausgeliefert` };
  }
  return { version };
}

export function git(args, cwd = process.cwd()) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args[0]} failed: ${result.stderr.trim()}`);
  return result.stdout;
}

export const lines = (text) => text.split('\n').filter(Boolean);

/** Tags v* of the repository in `cwd`. */
export function releaseTags(cwd = process.cwd()) {
  return lines(git(['tag', '-l', 'v*'], cwd));
}

/**
 * Tags v* on the first-parent history of HEAD (the release branch `main` in release.yml). A tag
 * set elsewhere, e.g. by a workflow on a feature branch, does not count (security check 0031).
 */
export function mainReleaseTags(cwd = process.cwd()) {
  const history = new Set(lines(git(['rev-list', '--first-parent', 'HEAD'], cwd)));
  return releaseTags(cwd).filter((tag) =>
    history.has(git(['rev-list', '-n', '1', tag], cwd).trim()),
  );
}

function readMigrations() {
  return readdirSync(MIGRATIONS)
    .filter((file) => file.endsWith('.sql'))
    .map((file) => ({ file, sql: readFileSync(path.join(MIGRATIONS, file), 'utf8') }));
}

function writeOutputs(values) {
  const file = process.env.GITHUB_OUTPUT;
  const text = Object.entries(values)
    .map(([key, value]) => `${key}=${value}\n`)
    .join('');
  if (file) appendFileSync(file, text);
}

function fail(message) {
  // Workflow commands (::error::) are read from stdout.
  if (process.env.GITHUB_ACTIONS === 'true') console.log(`::error::${message}`);
  else console.error(`FEHLER: ${message}`);
  return 1;
}

function release(now, force) {
  const tags = mainReleaseTags();
  const latest = latestReleaseTag(tags);
  const previous = latest ? tagVersion(latest) : undefined;
  const version = nextAppVersion(tags, now);
  const min = lastMinAppVersion(readMigrations());
  const newBase = baseApplies(readMigrationsBase(), latest);
  const problem = checkMinAppVersion({ min, published: previous, next: version, newBase });
  if (problem) return fail(problem);

  const files = latest
    ? lines(git(['diff', '--name-only', `${latest}`, 'HEAD']))
    : lines(git(['ls-files']));
  const decision = releaseDecision(files, { force });
  console.log(
    `Version ${version} (zuletzt veröffentlicht: ${previous ?? 'noch nichts'}), Mindestversion ${min}.`,
  );
  console.log(`Veröffentlichung: ${decision.release ? 'ja' : 'nein'}, ${decision.reason}.`);
  writeOutputs({
    version,
    tag: `v${version}`,
    previous: previous ?? '',
    release: decision.release,
  });
  return 0;
}

async function readMinAppVersion(supabaseUrl) {
  const key = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!key) throw new Error('SUPABASE_PUBLISHABLE_KEY ist nicht gesetzt');
  const response = await fetch(new URL('/rest/v1/rpc/min_app_version', supabaseUrl), {
    method: 'POST',
    headers: { apikey: key, 'content-type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.text();
  let value;
  try {
    value = JSON.parse(body);
  } catch {
    value = undefined;
  }
  if (!response.ok || typeof value !== 'string' || !parseAppVersion(value)) {
    throw new Error(
      `Mindestversion der Produktion ließ sich nicht lesen (HTTP ${response.status}); nichts wird ausgeliefert`,
    );
  }
  return value;
}

async function redeploy(tag, supabaseUrl) {
  if (!supabaseUrl) return fail('--redeploy braucht --supabase-url <url>');
  let min;
  try {
    min = await readMinAppVersion(supabaseUrl);
  } catch (error) {
    return fail(error.message);
  }
  const result = checkRedeploy({ tag, min });
  if (result.error) return fail(result.error);
  console.log(`${tag} darf erneut ausgeliefert werden (Mindestversion ${min}).`);
  writeOutputs({ version: result.version, tag });
  return 0;
}

async function main(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      now: { type: 'string' },
      force: { type: 'boolean', default: false },
      redeploy: { type: 'string' },
      'supabase-url': { type: 'string' },
    },
  });
  try {
    if (values.redeploy !== undefined)
      return await redeploy(values.redeploy, values['supabase-url']);
    const now = values.now ? new Date(values.now) : new Date();
    return release(now, values.force);
  } catch (error) {
    return fail(error.message);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
