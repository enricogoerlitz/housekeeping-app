// The one-time exception for the new migration base of the first productive version (spec 0031,
// REQ-001; spec 0028, step 4; ADR-0012, addendum 23.11.2026). No dependencies.
//
// supabase/migrations-base.json: { "replaces": "v2026.11.1", "first": "<14-digit version>" }
// While `replaces` is the latest release tag, the migrations of that tag may be replaced by a new
// base whose files all have a version ≥ `first`: in the check "Migrationen", in the Supabase guard
// and for min_app_version. The next tag uses the exception up; the file is then deleted.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const BASE_FILE = 'supabase/migrations-base.json';
// The only tag the exception may replace (security check 0031): using it again needs a visible
// change of this line, not only a new JSON file.
const ALLOWED_REPLACES = 'v2026.11.1';
const TAG = /^v\d{4}\.(1[0-2]|[1-9])\.[1-9]\d*$/;
const VERSION = /^\d{14}$/;

/** `{ replaces, first }` from the file's text; throws with the reason when it is invalid. */
export function parseMigrationsBase(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`${BASE_FILE} ist keine JSON`);
  }
  if (typeof data?.replaces !== 'string' || !TAG.test(data.replaces)) {
    throw new Error(`${BASE_FILE}: „replaces“ muss ein Tag v<JJJJ.M.N> sein`);
  }
  if (data.replaces !== ALLOWED_REPLACES) {
    throw new Error(`${BASE_FILE}: „replaces“ darf nur ${ALLOWED_REPLACES} sein`);
  }
  if (typeof data.first !== 'string' || !VERSION.test(data.first)) {
    throw new Error(`${BASE_FILE}: „first“ muss eine Migrationsversion mit 14 Ziffern sein`);
  }
  return { replaces: data.replaces, first: data.first };
}

/** The exception of the repository at `root`, or undefined without the file. */
export function readMigrationsBase(root = process.cwd()) {
  const file = path.join(root, BASE_FILE);
  return existsSync(file) ? parseMigrationsBase(readFileSync(file, 'utf8')) : undefined;
}

/** Whether the exception applies: it names the latest release tag (AC-001, AC-003). */
export function baseApplies(base, latestTag) {
  return base !== undefined && latestTag !== undefined && base.replaces === latestTag;
}
