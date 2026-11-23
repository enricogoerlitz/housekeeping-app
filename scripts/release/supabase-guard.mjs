// Guard of the job "Supabase prüfen" (spec 0014, Task 6; threat model „Alte Migrationshistorie im
// Cloud-Projekt“). No dependencies: runs in a job with the environment `production`, which
// installs no packages.
//
//   supabase migration list --remote --output-format json > "$RUNNER_TEMP/migrations.json"
//   node scripts/release/supabase-guard.mjs "$RUNNER_TEMP/migrations.json"
//
// - Before the first release (no tag v*) the migration history of the project must be empty.
// - After it, the history must be a prefix of the local migrations (supabase/migrations) and hold
//   every migration of the latest release tag; a foreign version, a gap or a missing released
//   migration (another or a reset project) stops the release.
// - With the one-time exception of spec 0031, REQ-001 (supabase/migrations-base.json naming the
//   latest tag): the history must be empty (reset project) or a prefix of the new base; a version
//   of the replaced migrations stops the release („In Produktion …“).
// On a stop: do not deliver, follow runbook B5 in docs/specs/0014-betrieb-ci-cd-release/plan.md.
// The history is never repaired by hand. Prints versions (timestamps) and counts only.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { baseApplies, readMigrationsBase } from './migrations-base.mjs';
import { git, latestReleaseTag, lines, mainReleaseTags } from './version.mjs';

const DIR = 'supabase/migrations';
const VERSION = /^(\d+)_.*\.sql$/;
const RUNBOOK =
  'Nicht ausliefern: Runbook B5 in docs/specs/0014-betrieb-ci-cd-release/plan.md; die Migrationshistorie nie von Hand reparieren.';

/** `{ remote }` (sorted versions in the remote column) or `{ error }`, from the CLI's JSON. */
export function parseMigrationList(text) {
  const start = text.indexOf('{');
  let data;
  try {
    data = start === -1 ? undefined : JSON.parse(text.slice(start));
  } catch {
    data = undefined;
  }
  if (data === undefined) return { error: 'Die Ausgabe von migration list ist keine JSON' };
  if (data._tag === 'Error') {
    return {
      error: `supabase migration list ist fehlgeschlagen (${data.error?.code ?? 'ohne Code'})`,
    };
  }
  if (!Array.isArray(data.migrations)) {
    return { error: 'Die Ausgabe von migration list hat kein Feld „migrations“' };
  }
  const remote = data.migrations
    .map((entry) => entry?.remote)
    .filter((version) => typeof version === 'string' && version !== '')
    .sort();
  return { remote };
}

/**
 * Errors of the remote history. `local`: versions of the local migrations, `released`: versions
 * at the latest release tag, undefined before the first release. `base`: the exception of
 * migrations-base.json, only when it applies.
 */
export function guardMigrations({ remote, local, released, base }) {
  const errors = [];
  if (base !== undefined) {
    // A new base replaces every released migration (security check 0031).
    const kept = (released ?? []).filter((version) => version >= base.first);
    if (kept.length > 0) {
      errors.push(
        `Die neue Basis beginnt mit ${base.first}, die veröffentlichte Migration ${kept.join(', ')} liegt nicht davor: „first“ muss nach allen Migrationen von ${base.replaces} liegen.`,
      );
    }
    const old = local.filter((version) => version < base.first).sort();
    if (old.length > 0) {
      errors.push(
        `Neben der neuen Basis liegen noch alte Migrationen: ${old.join(', ')}. Die neue Basis ersetzt sie; die Dateien löschen.`,
      );
    }
    const sortedLocal = [...local].sort();
    const mismatch = remote.findIndex((version, index) => version !== sortedLocal[index]);
    if (mismatch !== -1) {
      errors.push(
        `In Produktion steht ${remote[mismatch]} an Stelle ${mismatch + 1}, die neue Basis (ab ${base.first}) erwartet dort ${sortedLocal[mismatch] ?? 'keine'}: das Projekt erst zurücksetzen (Spec 0028).`,
      );
    }
  } else if (released === undefined) {
    if (remote.length > 0) {
      errors.push(
        `Produktion hat schon ${remote.length} Migration(en) in der Historie (zuerst ${remote[0]}), obwohl es noch keine Veröffentlichung (Tag v*) gibt.`,
      );
    }
  } else {
    const sortedLocal = [...local].sort();
    const mismatch = remote.findIndex((version, index) => version !== sortedLocal[index]);
    if (mismatch !== -1) {
      const expected = sortedLocal[mismatch];
      errors.push(
        `Die Historie der Produktion ist kein Präfix der lokalen Migrationen: an Stelle ${mismatch + 1} steht ${remote[mismatch]}, lokal ${expected ?? 'keine'}.`,
      );
    }
    const inRemote = new Set(remote);
    const missing = released.filter((version) => !inRemote.has(version));
    if (missing.length > 0) {
      errors.push(
        `In Produktion fehlt die schon veröffentlichte Migration ${missing.join(', ')}: falsches oder zurückgesetztes Projekt?`,
      );
    }
  }
  return errors.length > 0 ? [...errors, RUNBOOK] : [];
}

const versionOf = (file) => VERSION.exec(path.posix.basename(file))?.[1];

function localVersions() {
  return readdirSync(DIR).map(versionOf).filter(Boolean);
}

function releasedVersions() {
  const latest = latestReleaseTag(mainReleaseTags());
  if (!latest) return undefined;
  return lines(git(['ls-tree', '-r', '--name-only', latest, '--', `${DIR}/`]))
    .map(versionOf)
    .filter(Boolean);
}

function main(args) {
  if (args.length !== 1) {
    console.error('Usage: node scripts/release/supabase-guard.mjs <migration-list.json>');
    return 2;
  }
  const parsed = parseMigrationList(readFileSync(args[0], 'utf8'));
  const local = localVersions();
  const released = releasedVersions();
  const candidate = readMigrationsBase();
  const base = baseApplies(candidate, latestReleaseTag(mainReleaseTags())) ? candidate : undefined;
  const errors = parsed.error
    ? [parsed.error]
    : guardMigrations({ ...parsed, local, released, base });
  if (errors.length === 0) {
    console.log(
      `Supabase-Wächter: ok (${parsed.remote.length} von ${local.length} Migrationen in Produktion, ${local.length - parsed.remote.length} neu; ${base ? `neue Basis ersetzt ${base.replaces}` : released ? 'nach der ersten Veröffentlichung' : 'vor der ersten Veröffentlichung'}).`,
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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
