// Delta sync, local side (docs/architecture/sync.md, "Nachtrag Spec 0003"): how a pull from the
// server changes the device's cache. Pure data in, data out; storage and network live in api.

/** Any row the app keeps locally. Column names are the database's (snake_case). */
export interface Row {
  id: string;
  [column: string]: unknown;
}

/** A row of a household-scoped table as the server sends it. */
export interface SyncRow extends Row {
  updated_at: string;
}

/** Rows of one household, by table name and then by id. */
export type TableRows = Record<string, Record<string, Row>>;

/** A row of a small table; household_members has no id of its own. */
export type SmallRow = Record<string, unknown>;

/** An entry of the server's deletion log (`deleted_records`). */
export interface Tombstone {
  table: string;
  id: string;
  deletedAt: string;
}

/**
 * Tables whose visibility changes without their `updated_at` changing (joining or leaving a
 * household). The server sends them in full with every pull.
 */
export const SMALL_TABLES = [
  'profiles',
  'households',
  'household_members',
  'household_invitations',
] as const;

/** Overlap of every delta query, so transactions that commit later than their timestamp count. */
export const SAFETY_WINDOW_MS = 2 * 60 * 1000;

export interface HouseholdCache {
  /** `server_time` of the last pull applied to this household; undefined = never loaded. */
  pulledAt?: string;
  tables: Record<string, Record<string, SyncRow>>;
  /** Per table: the latest `updated_at` / `deleted_at` received. */
  cursors: Record<string, string>;
  /** Per table and id: the latest deletion time, kept while a delayed row could contradict it. */
  tombstones: Record<string, Record<string, string>>;
}

export interface SyncCache {
  version: number;
  /** The households the user belongs to, as last reported by the server. */
  householdIds: string[];
  small: Record<string, SmallRow[]>;
  households: Record<string, HouseholdCache>;
}

export interface HouseholdDelta {
  /** True when this is a full load: it replaces everything cached for the household. */
  full: boolean;
  rows: Record<string, SyncRow[]>;
  tombstones: Tombstone[];
}

export interface PullResult {
  serverTime: string;
  /** Full snapshots, replacing what is cached for each table present. */
  small: Record<string, SmallRow[]>;
  /** One entry per household that was pulled, also when nothing changed. */
  households: Record<string, HouseholdDelta>;
}

/** Per table the time to fetch changes from; a table without an entry is fetched in full. */
export type HouseholdPullRequest = { full: true } | { full: false; since: Record<string, string> };

export interface PullRequest {
  households: Record<string, HouseholdPullRequest>;
}

export interface FullLoadDecision {
  /** Throw the whole cache away first (first start or a new cache version). */
  reset: boolean;
  /** Households to load in full, leaving the others alone. */
  householdIds: string[];
}

export function createSyncCache(version: number): SyncCache {
  return { version, householdIds: [], small: {}, households: {} };
}

const TIMESTAMP =
  /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}(?::?\d{2})?)$/i;

/** Microseconds since the epoch. Postgres keeps microseconds, which `Date` would cut off. */
function toMicros(timestamp: string): number {
  const match = TIMESTAMP.exec(timestamp.trim());
  const [, date, time, fraction = '', zone = ''] = match ?? [];
  let offset = zone.toUpperCase();
  if (offset !== 'Z')
    offset = offset.length === 3 ? `${offset}:00` : offset.replace(/^(.\d{2})(\d{2})$/, '$1:$2');
  const seconds = match ? Date.parse(`${date}T${time}${offset}`) : Number.NaN;
  if (Number.isNaN(seconds)) throw new Error(`Not a timestamp: ${timestamp}`);
  return seconds * 1000 + Number(fraction.padEnd(6, '0'));
}

/** Negative when a is earlier than b, 0 for the same instant, positive when later. */
export function compareTimestamps(a: string, b: string): number {
  return toMicros(a) - toMicros(b);
}

function later(a: string | undefined, b: string): string {
  return a === undefined || compareTimestamps(b, a) > 0 ? b : a;
}

function minus(timestamp: string, ms: number): string {
  return new Date(Math.floor(toMicros(timestamp) / 1000) - ms).toISOString();
}

function emptyHousehold(): HouseholdCache {
  return { tables: {}, cursors: {}, tombstones: {} };
}

function applyTable(
  rowsById: Record<string, SyncRow>,
  tombstonesById: Record<string, string>,
  incomingRows: SyncRow[],
  incomingTombstones: Tombstone[],
): { rows: Record<string, SyncRow>; tombstones: Record<string, string> } {
  const rows = { ...rowsById };
  const tombstones = { ...tombstonesById };

  // Tombstones first, then rows, each checked against the other: the later event wins whatever
  // order they arrive in. On a tie the deletion wins (insert and delete in one transaction).
  for (const tombstone of incomingTombstones) {
    tombstones[tombstone.id] = later(tombstones[tombstone.id], tombstone.deletedAt);
    const cached = rows[tombstone.id];
    if (cached && compareTimestamps(cached.updated_at, tombstone.deletedAt) <= 0) {
      delete rows[tombstone.id];
    }
  }
  for (const row of incomingRows) {
    const deletedAt = tombstones[row.id];
    if (deletedAt !== undefined && compareTimestamps(row.updated_at, deletedAt) <= 0) continue;
    const cached = rows[row.id];
    if (cached && compareTimestamps(cached.updated_at, row.updated_at) > 0) continue;
    rows[row.id] = row;
  }
  return { rows, tombstones };
}

function applyHousehold(
  current: HouseholdCache | undefined,
  delta: HouseholdDelta,
  serverTime: string,
): HouseholdCache {
  const household = delta.full || !current ? emptyHousehold() : current;
  const tableNames = new Set([
    ...Object.keys(delta.rows),
    ...delta.tombstones.map((tombstone) => tombstone.table),
  ]);

  const tables = { ...household.tables };
  const cursors = { ...household.cursors };
  const tombstones = { ...household.tombstones };
  for (const table of tableNames) {
    const incomingRows = delta.rows[table] ?? [];
    const incomingTombstones = delta.tombstones.filter((tombstone) => tombstone.table === table);
    const applied = applyTable(
      tables[table] ?? {},
      tombstones[table] ?? {},
      incomingRows,
      incomingTombstones,
    );

    let cursor = cursors[table];
    for (const row of incomingRows) cursor = later(cursor, row.updated_at);
    for (const tombstone of incomingTombstones) cursor = later(cursor, tombstone.deletedAt);
    if (cursor === undefined) continue;

    // A tombstone older than the next request's start can no longer meet an older row version.
    const horizon = minus(cursor, SAFETY_WINDOW_MS);
    const kept = Object.entries(applied.tombstones).filter(
      ([, deletedAt]) => compareTimestamps(deletedAt, horizon) >= 0,
    );
    tables[table] = applied.rows;
    cursors[table] = cursor;
    tombstones[table] = Object.fromEntries(kept);
  }
  return { pulledAt: serverTime, tables, cursors, tombstones };
}

/**
 * Applies a pull: small tables are replaced, rows are upserted and tombstones remove rows. For one
 * id the later event wins (`updated_at` against `deleted_at`), within one pull and across pulls.
 * Cursors only move forward, and only to times actually received. Applying a pull twice is
 * harmless. Households absent from the pull keep their data and object identity.
 */
export function applyPull(cache: SyncCache, pull: PullResult): SyncCache {
  const households = { ...cache.households };
  for (const [householdId, delta] of Object.entries(pull.households)) {
    households[householdId] = applyHousehold(households[householdId], delta, pull.serverTime);
  }
  return { ...cache, small: { ...cache.small, ...pull.small }, households };
}

/**
 * What to ask the server for: per household the tables' cursors minus the safety window, or a
 * full load for households never loaded and for the ones named.
 */
export function pullRequestFor(cache: SyncCache, fullHouseholdIds: string[] = []): PullRequest {
  const households: Record<string, HouseholdPullRequest> = {};
  for (const householdId of cache.householdIds) {
    const household = cache.households[householdId];
    if (!household?.pulledAt || fullHouseholdIds.includes(householdId)) {
      households[householdId] = { full: true };
      continue;
    }
    const since: Record<string, string> = {};
    for (const [table, cursor] of Object.entries(household.cursors)) {
      since[table] = minus(cursor, SAFETY_WINDOW_MS);
    }
    households[householdId] = { full: false, since };
  }
  return { households };
}

/**
 * Decides what must be loaded in full, measured against the server's clock:
 * - no cache yet, or one written by another cache version → reset everything (AC-018);
 * - a household never loaded (new, or joined again) → that household only;
 * - a household last pulled so long ago that the server may have purged deletions it has not
 *   seen yet (retention of `deleted_records`) → that household only (AC-017).
 */
export function needsFullLoad(
  cache: SyncCache | undefined,
  serverTime: string,
  options: { retentionDays: number; cacheVersion: number },
): FullLoadDecision {
  if (!cache || cache.version !== options.cacheVersion) return { reset: true, householdIds: [] };

  const purgedBefore = minus(serverTime, options.retentionDays * 24 * 60 * 60 * 1000);
  const householdIds = cache.householdIds.filter((householdId) => {
    const pulledAt = cache.households[householdId]?.pulledAt;
    if (pulledAt === undefined) return true;
    // Deletions since the last pull minus the safety window must still be in the log.
    return compareTimestamps(minus(pulledAt, SAFETY_WINDOW_MS), purgedBefore) < 0;
  });
  return { reset: false, householdIds };
}

/**
 * Records the households the user belongs to. Data of every other household is dropped from the
 * cache, including small-table rows carrying its `household_id` (AC-012).
 */
export function applyMemberships(cache: SyncCache, householdIds: string[]): SyncCache {
  const members = new Set(householdIds);
  const households: Record<string, HouseholdCache> = {};
  for (const [householdId, household] of Object.entries(cache.households)) {
    if (members.has(householdId)) households[householdId] = household;
  }
  const small: Record<string, SmallRow[]> = {};
  for (const [table, rows] of Object.entries(cache.small)) {
    small[table] = rows.filter(
      (row) => typeof row.household_id !== 'string' || members.has(row.household_id),
    );
  }
  return { ...cache, householdIds: [...members], small, households };
}
