// App version JJJJ.M.N (calendar version, spec 0014 REQ-004): year, month without a leading zero,
// running number within the month from 1. Release tags are `v` + version.
//
// No imports: scripts/release/version.mjs loads this file directly with Node's type stripping,
// which resolves neither extensionless imports nor TypeScript-only syntax.

/** Local builds: no hint, never locked. */
export const APP_VERSION_DEV = 'dev';
/** Preview builds (`/version.json` there says so): no hint, never locked. */
export const APP_VERSION_PREVIEW = 'vorschau';

export type AppVersion = { year: number; month: number; sequence: number };

/** aktuell: nothing to show · neu-verfuegbar: a newer version is published · nicht-unterstuetzt:
 * the server's minimum version is above the own one, editing is locked. */
export type AppVersionState = 'aktuell' | 'neu-verfuegbar' | 'nicht-unterstuetzt';

// Same pattern as the pgTAP test of public.min_app_version().
const VERSION_PATTERN = /^(\d{4})\.(1[0-2]|[1-9])\.([1-9]\d*)$/;
const TAG_PREFIX = 'v';
const RELEASE_TIME_ZONE = 'Europe/Berlin';

export function parseAppVersion(value: string): AppVersion | null {
  const match = VERSION_PATTERN.exec(value);
  if (!match) return null;
  const sequence = Number(match[3]);
  if (!Number.isSafeInteger(sequence)) return null;
  return { year: Number(match[1]), month: Number(match[2]), sequence };
}

export function formatAppVersion(version: AppVersion): string {
  return `${version.year}.${version.month}.${version.sequence}`;
}

function compareParsed(a: AppVersion, b: AppVersion): number {
  return a.year - b.year || a.month - b.month || a.sequence - b.sequence;
}

function parseOrThrow(value: string): AppVersion {
  const version = parseAppVersion(value);
  if (!version) throw new Error(`Ungültige Version „${value}“`);
  return version;
}

/** Negative when a is older than b, 0 when equal, positive when newer. Throws on an invalid
 * version: the release guard must not guess an order. */
export function compareAppVersions(a: string, b: string): number {
  return compareParsed(parseOrThrow(a), parseOrThrow(b));
}

function berlinYearMonth(now: Date): { year: number; month: number } {
  if (Number.isNaN(now.getTime())) throw new Error('Ungültiges Datum');
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: RELEASE_TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(now);
  const part = (type: 'year' | 'month') => Number(parts.find((p) => p.type === type)?.value);
  return { year: part('year'), month: part('month') };
}

/** The version of the next release from the existing git tags, month in Berlin time. Tags that are
 * not `v<JJJJ.M.N>` are ignored. */
export function nextAppVersion(tags: readonly string[], now: Date): string {
  const { year, month } = berlinYearMonth(now);
  let sequence = 0;
  for (const tag of tags) {
    if (!tag.startsWith(TAG_PREFIX)) continue;
    const version = parseAppVersion(tag.slice(TAG_PREFIX.length));
    if (!version) continue;
    if (compareParsed(version, { year, month, sequence: Number.MAX_SAFE_INTEGER }) > 0) {
      throw new Error(
        `Version ${formatAppVersion(version)} liegt nach dem aktuellen Monat ${year}.${month}`,
      );
    }
    if (version.year === year && version.month === month) {
      sequence = Math.max(sequence, version.sequence);
    }
  }
  return formatAppVersion({ year, month, sequence: sequence + 1 });
}

/** What the app shows. `latest` (from `/version.json`) and `min` (from `min_app_version`) are null
 * when not read — offline there is neither hint nor lock. Values that are not a version are
 * ignored, and dev, vorschau or an unreadable own version are never hinted or locked. */
export function appVersionState(input: {
  own: string;
  latest: string | null;
  min: string | null;
}): AppVersionState {
  const own = parseAppVersion(input.own);
  if (!own) return 'aktuell';
  const min = input.min === null ? null : parseAppVersion(input.min);
  if (min && compareParsed(own, min) < 0) return 'nicht-unterstuetzt';
  const latest = input.latest === null ? null : parseAppVersion(input.latest);
  if (latest && compareParsed(latest, own) > 0) return 'neu-verfuegbar';
  return 'aktuell';
}

/**
 * Why edit actions are greyed out (spec 0018, AC-023): `writesLocked` covers both causes, so a
 * lock with network and an unsupported version is the version ("Bitte neu laden"); without
 * network it stays offline, the hint the app always had.
 */
export function editLockReason(input: {
  writesLocked: boolean;
  networkOffline: boolean;
  version: AppVersionState;
}): 'offline' | 'version' | undefined {
  if (!input.writesLocked) return undefined;
  if (!input.networkOffline && input.version === 'nicht-unterstuetzt') return 'version';
  return 'offline';
}
