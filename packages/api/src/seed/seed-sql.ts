// The local seed (`supabase/seed.sql`, spec 0003 AC-033): the demo households of spec 0001 as
// database rows, owned by the two local test accounts. Written by `pnpm db:seed:gen`
// (scripts/gen-seed.ts); runs only in the local stack, as postgres, after the migrations.
//
// The preview seed (`supabase/preview-seed.sql`, spec 0014 AC-014) has the same households, but
// its members are accounts without password and without identity on @vorschau.invalid: nobody can
// sign in with them, and cooks, raters and assignees of the demo stay valid. The preview workflow
// loads it after the reset of the preview project.
//
// Ids: deterministic UUIDv5 from the demo's readable slug ids. Households and members come from
// SEED_NAMESPACE; everything else from its household's id, so the slugs the "Test" household
// shares with the demo ("slot-abend", "area-brot", …) still get different ids.
//
// Dates: the demo is built for a base day, and every date becomes an offset from the Berlin day
// the seed runs on; timestamps become offsets from the seed's now(). Values derived from a date
// (weekday of a weekly chore, "first of next month", the weekday in a shopping label) are computed
// in SQL too, so the output does not depend on the day it was generated.
import {
  daysBetween,
  weekdayShortName,
  type ISODate,
  type Member,
  type Row,
} from '@housekeeping/core';

import { householdToRows, membersToRows } from '../db/mapping';
import { TEST_ACCOUNTS, TEST_PASSWORD } from '../dev-accounts';
import type { HouseholdData } from '../store';
import {
  createInitialState,
  DEMO_HOUSEHOLD_ID,
  NEXT_SATURDAY_ENTRY_IDS,
  nextSaturday,
  TEST_HOUSEHOLD_ID,
} from './demo';

/** Root namespace of every seed id. Changing it changes every id in the seed and in e2e. */
export const SEED_NAMESPACE = 'c672c897-2501-4bbd-8841-7e385c35f7e8';

/** UUID version 5 (SHA-1, RFC 9562) of `name` in `namespace`. Web Crypto: Node and browsers. */
export async function uuidV5(name: string, namespace: string): Promise<string> {
  const space = (namespace.replace(/-/g, '').match(/../g) ?? []).map((byte) => parseInt(byte, 16));
  const input = new Uint8Array([...space, ...new TextEncoder().encode(name)]);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-1', input)).slice(0, 16);
  hash[6] = ((hash[6] ?? 0) & 0x0f) | 0x50;
  hash[8] = ((hash[8] ?? 0) & 0x3f) | 0x80;
  const hex = [...hash].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Id of a household or a member (profile): global across households. */
export const seedHouseholdId = (slug: string): Promise<string> => uuidV5(slug, SEED_NAMESPACE);

/** Id of anything that lives in a household. */
export const seedId = async (householdSlug: string, slug: string): Promise<string> =>
  uuidV5(slug, await seedHouseholdId(householdSlug));

/** Who the demo members are: the local test accounts, or the preview's accounts without sign-in. */
export type SeedAccounts = 'test' | 'preview';

/** The demo members in the preview project (spec 0014, plan decision 7). */
const PREVIEW_ACCOUNTS: readonly { key: string; email: string; name: string }[] = [
  { key: 'enrico', email: 'enrico@vorschau.invalid', name: 'Beispiel-Enrico' },
  { key: 'nadja', email: 'nadja@vorschau.invalid', name: 'Beispiel-Nadja' },
];

/** Slug → UUID per household slug; each map includes the household and the members. */
export type SeedIds = Record<string, Record<string, string>>;

export interface Seed {
  sql: string;
  ids: SeedIds;
  /** Ids e2e tests address by slug: households, members, top-level entities of the demo. */
  e2eIds: Record<string, string>;
  /** Top-level entity ids of the "Test" household. */
  e2eTestIds: Record<string, string>;
}

// ---------------------------------------------------------------------------------------------
// SQL values
// ---------------------------------------------------------------------------------------------

/** A raw SQL expression, emitted as is. */
interface Expr {
  sql: string;
}
const expr = (sql: string): Expr => ({ sql });
const isExpr = (value: unknown): value is Expr =>
  typeof value === 'object' && value !== null && 'sql' in value && Object.keys(value).length === 1;

const JSON_COLUMNS = new Set([
  'meal_slots',
  'variants',
  'ingredients',
  'steps',
  'lead_time',
  'links',
  'source',
  'recurrence',
  'assignment',
]);
const DATE_COLUMNS = new Set([
  'last_cooked_on',
  'date',
  'next_due_on',
  'last_done_on',
  'done_on',
  'from_on',
  'to_on',
]);
const TIMESTAMP_COLUMNS = new Set(['created_at', 'checked_at', 'packed_at']);
/** Tables the app lists newest first: ties in created_at must keep the demo's order there too. */
const NEWEST_FIRST = new Set(['recipes', 'restaurants', 'activities', 'feedback']);
/**
 * Ratings count from `updated_at` (ratedAt, spec 0011): the seed's were given when they were
 * created, long before the recent plan entries, so „Wie war's?“ asks for those again (AC-020).
 */
const RATING_TABLES = new Set(['recipe_ratings', 'restaurant_ratings', 'activity_ratings']);
/** Rows the demo gives no creation time: the household was "set up" this long before the seed. */
const SETUP_DAYS_AGO = 120;

const quote = (text: string): string => `'${text.replace(/'/g, "''")}'`;

function arrayLiteral(values: readonly unknown[]): string {
  const items = values.map((value) =>
    typeof value === 'number' ? String(value) : `"${String(value).replace(/["\\]/g, '\\$&')}"`,
  );
  return quote(`{${items.join(',')}}`);
}

function literal(column: string, value: unknown): string {
  if (isExpr(value)) return value.sql;
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  if (typeof value === 'string') return quote(value);
  if (JSON_COLUMNS.has(column)) return `${quote(JSON.stringify(value))}::jsonb`;
  if (Array.isArray(value)) return arrayLiteral(value);
  throw new Error(`No SQL literal for column ${column}`);
}

const BERLIN_TODAY = "(now() at time zone 'Europe/Berlin')::date";

function signed(n: number): string {
  return n < 0 ? ` - ${-n}` : ` + ${n}`;
}

/** The Berlin day `offset` days after the seed run. */
const dayExpr = (offset: number): string => `(${BERLIN_TODAY}${signed(offset)})`;

const WEEKDAYS_SQL = `(array[${[1, 2, 3, 4, 5, 6, 7].map((day) => quote(weekdayShortName(day))).join(', ')}])`;

// ---------------------------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------------------------

interface Context {
  base: ISODate;
  /** Plan entries (UUIDs) on the coming Saturday: their day depends on the weekday of the run. */
  nextSaturdayIds: ReadonlySet<string>;
}

function daysFromBase(context: Context, iso: string): number {
  return daysBetween(context.base, iso);
}

/** now() shifted like `timestamp` is from the base day's noon (UTC), plus a tie-breaker. */
function timestampExpr(context: Context, timestamp: string, tieMicros: number): Expr {
  const deltaMs = Date.parse(timestamp) - Date.parse(`${context.base}T12:00:00.000Z`);
  const days = Math.trunc(deltaMs / 86_400_000);
  const seconds = (deltaMs - days * 86_400_000) / 1000 + tieMicros / 1_000_000;
  return expr(`now() + make_interval(days => ${days}, secs => ${seconds.toFixed(6)})`);
}

/** Replaces every slug id in a value (strings, keys like rating member ids) by its UUID. */
export function mapIds(value: unknown, ids: Readonly<Record<string, string>>): unknown {
  if (typeof value === 'string') return ids[value] ?? value;
  if (Array.isArray(value)) return value.map((item) => mapIds(item, ids));
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [ids[key] ?? key, mapIds(item, ids)]),
    );
  }
  return value;
}

/** Collects every `id` in the household's data; an id used twice is a bug in the demo. */
function collectIds(value: unknown, found: string[]): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectIds(item, found);
  } else if (typeof value === 'object' && value !== null) {
    for (const [key, item] of Object.entries(value)) {
      if (key === 'id' && typeof item === 'string') found.push(item);
      else collectIds(item, found);
    }
  }
  return found;
}

async function householdIds(
  slug: string,
  data: HouseholdData,
  members: Member[],
): Promise<Record<string, string>> {
  const ids: Record<string, string> = {};
  for (const member of members) ids[member.id] = await seedHouseholdId(member.id);
  for (const id of collectIds(data, [])) {
    if (Object.hasOwn(ids, id)) throw new Error(`Seed id "${id}" is used twice in ${slug}`);
    ids[id] = id === slug ? await seedHouseholdId(slug) : await seedId(slug, id);
  }
  return ids;
}

/** Weekly chores repeat on the weekday they are next due (demo: weekdayIn(offset)). */
function choreRow(row: Row, context: Context): Row {
  const recurrence = row.recurrence as { type: string; weekdays?: number[]; day?: number };
  const nextDue = row.next_due_on as string | null;
  const out: Row = { ...row };
  if (recurrence.type === 'weekly') {
    if (!nextDue || recurrence.weekdays?.length !== 1) {
      throw new Error(`Weekly seed chore ${row.id} needs one weekday and a due day`);
    }
    out.recurrence = expr(
      `jsonb_set(${literal('recurrence', { ...recurrence, weekdays: undefined })}, '{weekdays}', ` +
        `jsonb_build_array(extract(isodow from ${dayExpr(daysFromBase(context, nextDue))})::int))`,
    );
  }
  if (recurrence.type === 'monthly' && nextDue) {
    const base = new Date(`${context.base}T12:00:00Z`);
    const expected = new Date(
      Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, recurrence.day ?? 1),
    )
      .toISOString()
      .slice(0, 10);
    if (nextDue !== expected) throw new Error(`Monthly seed chore ${row.id} is not due next month`);
    out.next_due_on = expr(
      `((date_trunc('month', ${BERLIN_TODAY}::timestamp) + interval '1 month')::date` +
        `${signed((recurrence.day ?? 1) - 1)})`,
    );
  }
  return out;
}

/** Labels of planned recipes name the weekday of their plan entry, e.g. "Lasagne (Fr)". */
function contributionRow(row: Row, context: Context, data: HouseholdData): Row {
  const source = row.source as { kind: string; entryId?: string; label?: string };
  if (source.kind !== 'recipe' || !source.entryId) return row;
  const entry = data.planEntries.find((candidate) => candidate.id === source.entryId);
  const recipe = data.recipes.find((candidate) => candidate.id === entry?.recipeId);
  if (!entry?.date || !recipe) throw new Error(`Contribution ${row.id} has no dated plan entry`);
  const prefix = `${recipe.title} (`;
  if (!source.label?.startsWith(prefix)) {
    throw new Error(`Contribution ${row.id} has an unexpected label`);
  }
  const weekday = `extract(isodow from ${dayExpr(daysFromBase(context, entry.date))})::int`;
  return {
    ...row,
    source: expr(
      `jsonb_set(${literal('source', { ...source, label: undefined })}, '{label}', ` +
        `to_jsonb(${quote(prefix)} || ${WEEKDAYS_SQL}[${weekday}] || ')'))`,
    ),
  };
}

/** Column values of one row (ids already UUIDs): relative dates and times, check_seq. */
function prepareRow(
  table: string,
  row: Row,
  index: number,
  context: Context,
  data: HouseholdData,
): Record<string, unknown> {
  let prepared: Row = row;
  if (table === 'chores') prepared = choreRow(prepared, context);
  if (table === 'shopping_contributions') prepared = contributionRow(prepared, context, data);
  if (table === 'meal_plan_entries' && context.nextSaturdayIds.has(String(row.id))) {
    if (row.date !== nextSaturday(context.base)) {
      throw new Error(`Plan entry ${row.id} is not on the coming Saturday`);
    }
    prepared = {
      ...prepared,
      date: expr(`(${BERLIN_TODAY} + (13 - extract(isodow from ${BERLIN_TODAY})::int) % 7)`),
    };
  }
  const tie = NEWEST_FIRST.has(table) ? -index : index;
  const out: Record<string, unknown> = {};
  for (const [column, value] of Object.entries(prepared)) {
    if (isExpr(value)) {
      out[column] = value;
    } else if (DATE_COLUMNS.has(column) && typeof value === 'string') {
      out[column] = expr(dayExpr(daysFromBase(context, value)));
    } else if (TIMESTAMP_COLUMNS.has(column) && typeof value === 'string') {
      out[column] = timestampExpr(context, value, column === 'created_at' ? tie : 0);
    } else {
      out[column] = value;
    }
  }
  out.created_at ??= expr(
    `now() + make_interval(days => -${SETUP_DAYS_AGO}, secs => ${(tie / 1_000_000).toFixed(6)})`,
  );
  if (RATING_TABLES.has(table)) out.updated_at = out.created_at;
  if (table === 'shopping_items') out.check_seq = row.checked === true ? 1 : 0;
  return out;
}

function insert(table: string, rows: Record<string, unknown>[]): string {
  const first = rows[0];
  if (!first) return '';
  const columns = Object.keys(first);
  const values = rows.map((row) => {
    if (Object.keys(row).length !== columns.length) {
      throw new Error(`Rows of ${table} have different columns`);
    }
    return `  (${columns.map((column) => literal(column, row[column])).join(', ')})`;
  });
  return `insert into public.${table} (${columns.join(', ')}) values\n${values.join(',\n')};\n`;
}

/** Tables without an id column: the mapping's "a:b" id is only the cache key. */
const NO_ID_TABLES = new Set([
  'household_members',
  'recipe_favorites',
  'recipe_ratings',
  'restaurant_favorites',
  'restaurant_ratings',
  'activity_favorites',
  'activity_ratings',
  'feedback_votes',
]);

/** `data` already carries UUIDs; its dates are still those of the base day. */
function householdSql(householdId: string, data: HouseholdData, context: Context): string {
  const rows = householdToRows(data);
  const parts = [`-- Household "${data.household.name}"\n`];
  for (const [table, list] of Object.entries(rows)) {
    const prepared = list.map((row, index) => {
      const copy: Row = { ...row };
      if (NO_ID_TABLES.has(table)) delete (copy as Partial<Row>).id;
      if (table === 'households') delete copy.default_store_id;
      return prepareRow(table, copy, index, context, data);
    });
    parts.push(insert(table, prepared));
    if (table === 'stores') {
      // The default store exists now (composite foreign key).
      const household = rows.households?.[0];
      parts.push(
        `update public.households set default_store_id = ${literal('', household?.default_store_id)} ` +
          `where id = ${quote(householdId)};\n`,
      );
    }
  }
  return parts.join('\n');
}

// ---------------------------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------------------------

/** `ids` maps the member slugs ("m-enrico") to their profile ids. */
function accountsSql(members: Member[], ids: Record<string, string>, kind: SeedAccounts): string {
  const profiles = membersToRows(members).profiles ?? [];
  const accounts = kind === 'test' ? TEST_ACCOUNTS : PREVIEW_ACCOUNTS;
  const parts = [
    kind === 'test'
      ? '-- Test accounts (spec 0003, REQ-002): email + password, confirmed.\n'
      : '-- Demo members (spec 0014, AC-014): no password, no identity, nobody signs in with them.\n',
  ];
  const users: string[] = [];
  const identities: string[] = [];
  const updates: string[] = [];
  accounts.forEach((account, index) => {
    const memberSlug = `m-${account.key}`;
    const profile = profiles.find((row) => row.id === memberSlug);
    if (!profile) throw new Error(`Demo member ${memberSlug} is missing`);
    const userId = ids[memberSlug] ?? '';
    const id = quote(userId);
    const email = quote(account.email);
    const name = quote(JSON.stringify({ full_name: account.name }));
    users.push(
      kind === 'test'
        ? `  ('00000000-0000-0000-0000-000000000000', ${id}, 'authenticated', 'authenticated', ${email},\n` +
            `   extensions.crypt(${quote(TEST_PASSWORD)}, extensions.gen_salt('bf')), now(),\n` +
            `   '{"provider": "email", "providers": ["email"]}', ${name}, now(), now(),\n` +
            `   '', '', '', '', '', '', '', '')`
        : `  ('00000000-0000-0000-0000-000000000000', ${id}, 'authenticated', 'authenticated', ${email},\n` +
            `   '{}', ${name}, now(), now(),\n` +
            `   '', '', '', '', '', '', '', '')`,
    );
    const identity = {
      sub: userId,
      email: account.email,
      email_verified: true,
    };
    identities.push(
      // One identity per user: it may share the user's id.
      `  (${id}, ${id}, ${id}, 'email', ` +
        `${quote(JSON.stringify(identity))}, now(), now(), now())`,
    );
    updates.push(
      `update public.profiles set color = ${quote(String(profile.color))}, ` +
        `diet_preference = ${quote(String(profile.diet_preference))}, ` +
        `dislikes = ${literal('dislikes', profile.dislikes)}, ` +
        `created_at = now() + make_interval(days => -${SETUP_DAYS_AGO}, secs => ${(index / 1_000_000).toFixed(6)}) ` +
        `where id = ${id};\n`,
    );
  });
  if (kind === 'test') {
    parts.push(
      'insert into auth.users (\n' +
        '  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,\n' +
        '  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,\n' +
        '  confirmation_token, recovery_token, email_change_token_new, email_change,\n' +
        '  email_change_token_current, phone_change, phone_change_token, reauthentication_token\n' +
        `) values\n${users.join(',\n')};\n`,
      'insert into auth.identities (\n' +
        '  id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at\n' +
        `) values\n${identities.join(',\n')};\n`,
    );
  } else {
    parts.push(
      'insert into auth.users (\n' +
        '  instance_id, id, aud, role, email,\n' +
        '  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,\n' +
        '  confirmation_token, recovery_token, email_change_token_new, email_change,\n' +
        '  email_change_token_current, phone_change, phone_change_token, reauthentication_token\n' +
        `) values\n${users.join(',\n')};\n`,
    );
  }
  parts.push(
    '-- The auth trigger created the profiles; colours and diets come from the demo members.\n',
    ...updates,
  );
  return parts.join('\n');
}

// ---------------------------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------------------------

/** Every table whose set_timestamps trigger would overwrite the seed's relative created_at. */
const TIMESTAMPED_TABLES = [
  'profiles',
  'households',
  'household_members',
  'areas',
  'articles',
  'stores',
  'recipes',
  'recipe_favorites',
  'recipe_ratings',
  'collection_recipes',
  'restaurants',
  'restaurant_favorites',
  'restaurant_ratings',
  'activities',
  'activity_favorites',
  'activity_ratings',
  'meal_plan_entries',
  'shopping_items',
  'shopping_contributions',
  'chores',
  'chore_events',
  'trips',
  'trip_members',
  'packing_bags',
  'packing_bag_items',
  'packing_list_bags',
  'packing_items',
  'feedback',
  'feedback_votes',
];

const TOP_LEVEL = [
  'areas',
  'articles',
  'stores',
  'recipes',
  'restaurants',
  'activities',
  'planEntries',
  'items',
  'chores',
  'choreEvents',
  'feedback',
  'trips',
  'packingBags',
] as const;

function topLevelIds(data: HouseholdData, ids: Record<string, string>): Record<string, string> {
  const slugs = [
    ...data.household.mealSlots.map((slot) => slot.id),
    ...TOP_LEVEL.flatMap((key) => (data[key] as { id: string }[]).map((entity) => entity.id)),
  ];
  return Object.fromEntries(slugs.map((slug) => [slug, ids[slug] ?? '']));
}

const HEADERS: Record<SeedAccounts, string> = {
  test:
    '-- Generated by `pnpm db:seed:gen` (packages/api/src/seed/seed-sql.ts) — do not edit.\n' +
    '-- LOCAL ONLY (spec 0003, AC-033): test accounts with a fixed fake password and the demo\n' +
    '-- households of spec 0001. Runs after the migrations on `supabase db reset`, as postgres.\n' +
    '-- Dates are relative to the Berlin day of the reset, timestamps to its now().\n',
  preview:
    '-- Generated by `pnpm db:seed:gen` (packages/api/src/seed/seed-sql.ts) — do not edit.\n' +
    '-- PREVIEW ONLY (spec 0014, AC-014): the demo households of spec 0001 for the preview project.\n' +
    '-- Their members are accounts without password and identity on @vorschau.invalid; nobody can\n' +
    '-- sign in with them. .github/workflows/preview.yml loads it after the reset, as postgres.\n' +
    '-- Dates are relative to the Berlin day of the run, timestamps to its now().\n',
};

/** The seed for the demo built on `base`. The SQL is the same for every base day. */
export async function generateSeed(
  base: ISODate,
  { accounts = 'test' }: { accounts?: SeedAccounts } = {},
): Promise<Seed> {
  const state = createInitialState(base);
  const households: [string, HouseholdData][] = [DEMO_HOUSEHOLD_ID, TEST_HOUSEHOLD_ID].map(
    (slug) => {
      const data = state.households[slug];
      if (!data) throw new Error(`Demo household ${slug} is missing`);
      return [slug, data];
    },
  );
  const ids: SeedIds = {};
  for (const [slug, data] of households) ids[slug] = await householdIds(slug, data, state.members);
  const demoIds = ids[DEMO_HOUSEHOLD_ID] ?? {};
  const testIds = ids[TEST_HOUSEHOLD_ID] ?? {};
  const toggle = (action: 'disable' | 'enable') =>
    TIMESTAMPED_TABLES.map(
      (table) => `alter table public.${table} ${action} trigger ${table}_set_timestamps;\n`,
    ).join('');

  const sql = [
    HEADERS[accounts],
    '-- created_at is set explicitly (relative, and ordered like the demo), so the timestamp\n' +
      '-- triggers are off while seeding. Everything else (foreign keys, member checks) applies.\n' +
      toggle('disable'),
    accountsSql(state.members, demoIds, accounts),
    ...households.map(([slug, data]) => {
      const householdIdMap = ids[slug] ?? {};
      return householdSql(
        householdIdMap[slug] ?? '',
        mapIds(data, householdIdMap) as HouseholdData,
        {
          base,
          nextSaturdayIds: new Set(
            NEXT_SATURDAY_ENTRY_IDS.flatMap((id) => householdIdMap[id] ?? []),
          ),
        },
      );
    }),
    // The deferred checks of trips (spec 0022) run before the triggers go back on.
    'set constraints all immediate;\n' + toggle('enable'),
  ].join('\n');

  const demo = households[0]?.[1];
  const test = households[1]?.[1];
  if (!demo || !test) throw new Error('Demo households are missing');
  return {
    sql,
    ids,
    e2eIds: {
      [DEMO_HOUSEHOLD_ID]: demoIds[DEMO_HOUSEHOLD_ID] ?? '',
      [TEST_HOUSEHOLD_ID]: testIds[TEST_HOUSEHOLD_ID] ?? '',
      ...Object.fromEntries(state.members.map((member) => [member.id, demoIds[member.id] ?? ''])),
      ...topLevelIds(demo, demoIds),
    },
    e2eTestIds: topLevelIds(test, testIds),
  };
}
