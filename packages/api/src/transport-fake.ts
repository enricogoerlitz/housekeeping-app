// An in-memory server that implements the RPC contracts of spec 0003 for unit tests: membership
// checks, the apply_changes allowlist with all-or-nothing, "Abhaken gewinnt" with check_seq, the
// add merge (core queueEffect has the same rules as the server), deletion log and sync_pull, the
// photo bucket with its policies and limits (spec 0004), the household's shopping list with its
// editing RPCs (spec 0006, ADR-0012: no list rows, one open item per article and household), and
// the article catalog (spec 0007: ingredients point to an article, unique names, delete_article,
// merge_articles with replaced_by, merge_areas), chore entries only through complete_chore
// and remove_chore_event with the checks of the database (spec 0011), and recipes deleted only
// through delete_recipe with a snapshot for restore_recipe (spec 0008, E2 to E4), collections
// (spec 0009: the immutable kind and the fields a collection lacks, collection_recipes with the
// kind check, once per collection and at most 50, cascades and the rows in the snapshot), and
// Reisetaschen and Packlisten (spec 0012: grants and allowlist, cascades and set null, "je Tag"
// computed on insert and after a change of the duration, set_packing_items_packed with
// "Abhaken gewinnt" via pack_seq, restore_packing_items), and notifications (spec 0013: one
// settings row per member created on joining, readable and patchable only by herself, the
// five-minute times and the reservation only on restaurant entries; the push subscriptions of a
// person with the checks, limits and errors of the device RPCs, ADR-0014). Several transports
// (users, devices) can share one server.
import {
  absenceDays,
  addDays,
  compareTimestamps,
  isHalfStar,
  isReminderPast,
  packQuantity,
  PROFILE_COLORS,
  queueEffect,
  RECIPE_LIMITS,
  type AiSearchRequest,
  type AiSearchResult,
  type AssistantReply,
  type AssistantRequest,
  type ResolveMapsLinkReply,
  type SpeechTokenReply,
  type PullRequest,
  type Row,
  type SmallRow,
  type TableRows,
  type Tombstone,
} from '@housekeeping/core';

import {
  CASCADE_CHILDREN,
  COMPOSITE_TABLES,
  ID_TABLES,
  NO_DELETE_TABLES,
  NO_INSERT_TABLES,
  PATCH_COLUMNS,
  WRITABLE_COLUMNS,
  compositeId,
  withCompositeIds,
  type WritableTable,
} from './db/tables';
import {
  AdjustResultSchema,
  TransportError,
  type ChoreCompletion,
  type AddEntry,
  type AddResult,
  type ChangeOp,
  type ClearedItems,
  type PackChange,
  type PackResult,
  type RawPullResult,
  type Transport,
} from './transport';

type RpcName =
  | 'apply_changes'
  | 'set_shopping_item_checked'
  | 'set_shopping_item_not_available'
  | 'add_shopping_contributions'
  | 'assign_article_area'
  | 'set_packing_items_packed'
  | 'clear_checked_items'
  | 'clear_shopping_list'
  | 'adjust_item_count'
  | 'remove_contributions'
  | 'restore_cleared_items'
  | 'delete_article'
  | 'merge_articles'
  | 'merge_areas'
  | 'delete_recipe'
  | 'restore_recipe'
  | 'set_recipe_favorite'
  | 'set_recipe_rating'
  | 'set_restaurant_favorite'
  | 'set_restaurant_rating'
  | 'set_activity_favorite'
  | 'set_activity_rating'
  | 'set_feedback_vote'
  | 'create_household'
  | 'invite_member'
  | 'accept_invitation'
  | 'decline_invitation'
  | 'remove_member'
  | 'withdraw_invitation'
  | 'update_profile'
  | 'household_media_names'
  | 'delete_household'
  | 'register_push_subscription'
  | 'set_push_subscription_enabled'
  | 'unregister_push_subscription'
  | 'remove_push_subscription'
  | 'list_push_subscriptions'
  | 'send_test_push'
  | 'resolve-maps-link'
  | 'ai-assistant'
  | 'ai-search'
  | 'speech-token'
  | 'storage_upload'
  | 'storage_download'
  | 'storage_remove'
  | 'sync_pull';

/** How the fake AI edge functions answer; an unset one answers `ai_unavailable` (503). */
export interface FakeAi {
  assistant?: (request: AssistantRequest) => AssistantReply;
  search?: (request: AiSearchRequest) => AiSearchResult;
  speechToken?: () => SpeechTokenReply;
}

interface FailureRule {
  fn: RpcName;
  error: TransportError;
  /** The server applied the call, but the answer got lost (unknown outcome). */
  afterApply: boolean;
}

export interface FakeServer {
  transport(userId: string): Transport;
  addProfile(profile: {
    id: string;
    name: string;
    email: string;
    color?: string;
    diet_preference?: string;
    dislikes?: string[];
  }): void;
  addHousehold(household: Row, memberIds: string[]): void;
  /** Writes rows as an administrator would: no checks, server columns set. */
  insertRows(householdId: string, rows: Record<string, Row[]>): void;
  /** Deletes a row as an administrator would, with its tombstone. */
  deleteRow(householdId: string, table: string, id: string): void;
  rows(householdId: string, table: string): Row[];
  row(householdId: string, table: string, id: string): Row | undefined;
  /** The next call of `fn` fails with `error`. */
  failNext(fn: RpcName, error: TransportError, options?: { afterApply?: boolean }): void;
  /** Like pg_cron: forgets deletions older than `before`. */
  purgeDeletionsBefore(before: string): void;
  /** The place the edge function `resolve-maps-link` answers for a short link. */
  setMapsLink(url: string, reply: ResolveMapsLinkReply): void;
  /** The answers of the AI edge functions. */
  setAi(ai: FakeAi): void;
  /** A stored photo (bucket household-media). */
  media(path: string): Blob | undefined;
  /** Like the Vault entries push_send_url and push_send_secret (spec 0013); unset by default. */
  setPushConfigured(configured: boolean): void;
  /** The push service answered 404/410 for this address: the subscription is unreachable. */
  markPushGone(endpoint: string): void;
  /** The probes sent so far ("Probe senden"), oldest first. */
  testPushes(): { subscriptionId: string; profileId: string }[];
  calls: { userId: string; fn: string }[];
}

const SYNCED_TABLES = [...ID_TABLES, ...Object.keys(COMPOSITE_TABLES)];

/** Rows depending on a deleted row through `on delete cascade`. */
const CASCADES: Record<string, { table: string; column: string }[]> = {
  shopping_items: [{ table: 'shopping_contributions', column: 'item_id' }],
  recipes: [
    { table: 'recipe_favorites', column: 'recipe_id' },
    { table: 'recipe_ratings', column: 'recipe_id' },
    { table: 'collection_recipes', column: 'collection_id' },
    { table: 'collection_recipes', column: 'recipe_id' },
  ],
  restaurants: [
    { table: 'restaurant_favorites', column: 'restaurant_id' },
    { table: 'restaurant_ratings', column: 'restaurant_id' },
  ],
  activities: [
    { table: 'activity_favorites', column: 'activity_id' },
    { table: 'activity_ratings', column: 'activity_id' },
  ],
  feedback: [{ table: 'feedback_votes', column: 'feedback_id' }],
  // Spec 0012: the same table as the diff uses (db/tables.ts).
  ...Object.fromEntries(
    Object.entries(CASCADE_CHILDREN).map(([table, children]) => [table, [...(children ?? [])]]),
  ),
};

/**
 * Foreign keys the commands must respect (supabase/migrations, T3): a reference must exist, and a
 * referenced row is protected (restrict) or the reference is cleared (set null).
 */
const REFERENCES: {
  table: string;
  column: string;
  target: string;
  /** cascade: the reference must exist; deleting is in CASCADES. */
  onDelete: 'restrict' | 'set null' | 'cascade';
}[] = [
  { table: 'meal_plan_entries', column: 'recipe_id', target: 'recipes', onDelete: 'restrict' },
  {
    table: 'collection_recipes',
    column: 'collection_id',
    target: 'recipes',
    onDelete: 'cascade',
  },
  { table: 'collection_recipes', column: 'recipe_id', target: 'recipes', onDelete: 'cascade' },
  {
    table: 'meal_plan_entries',
    column: 'restaurant_id',
    target: 'restaurants',
    onDelete: 'restrict',
  },
  { table: 'meal_plan_entries', column: 'activity_id', target: 'activities', onDelete: 'restrict' },
  {
    table: 'meal_plan_entries',
    column: 'leftovers_of_entry_id',
    target: 'meal_plan_entries',
    onDelete: 'set null',
  },
  { table: 'shopping_items', column: 'article_id', target: 'articles', onDelete: 'restrict' },
  { table: 'chore_events', column: 'chore_id', target: 'chores', onDelete: 'set null' },
  { table: 'articles', column: 'area_id', target: 'areas', onDelete: 'set null' },
  { table: 'packing_bag_items', column: 'bag_id', target: 'packing_bags', onDelete: 'cascade' },
  { table: 'packing_list_bags', column: 'absence_id', target: 'absences', onDelete: 'cascade' },
  { table: 'packing_list_bags', column: 'bag_id', target: 'packing_bags', onDelete: 'set null' },
  {
    table: 'packing_items',
    column: 'list_bag_id',
    target: 'packing_list_bags',
    onDelete: 'cascade',
  },
];

/** Columns of the packing tables that point to a member of the household (set null on leave). */
const PACKING_MEMBER_COLUMNS: { table: string; column: string; constraint: string }[] = [
  { table: 'packing_bags', column: 'member_id', constraint: 'packing_bags_member_fkey' },
  { table: 'packing_list_bags', column: 'member_id', constraint: 'packing_list_bags_member_fkey' },
  { table: 'packing_items', column: 'packed_by', constraint: 'packing_items_packed_by_fkey' },
];

/** The open state of a Packstück: what an insert by a member always starts with. */
const OPEN_PACKING_ITEM = { packed: false, packed_at: null, packed_by: null, pack_seq: 0 };

const PACK_CHANGE_KEYS = ['item_id', 'packed', 'seen_pack_seq'].join(',');
const RESTORE_KEYS = new Set([
  'id',
  'list_bag_id',
  'name',
  'quantity',
  'per_day',
  'sort',
  'packed',
  'packed_at',
  'packed_by',
  'pack_seq',
]);

const isTrimmedName = (value: unknown, max: number) =>
  typeof value === 'string' &&
  value.length >= 1 &&
  Array.from(value).length <= max &&
  value === value.trim();
const inRange = (value: unknown, min: number, max: number) =>
  value === null ||
  value === undefined ||
  (typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max);

/** The check constraints of the packing tables (spec 0012, packing migration). */
function checkPackingRow(table: string, row: Row, tables: TableRows): void {
  const invalid = () => new TransportError('permanent', '23514', 400);
  if (table === 'packing_bags') {
    if (!isTrimmedName(row.name, 60)) throw invalid();
    const name = String(row.name).toLowerCase();
    const clash = Object.values(tables.packing_bags ?? {}).some(
      (other) => other.id !== row.id && String(other.name).toLowerCase() === name,
    );
    if (clash) throw conflict('23505');
  } else if (table === 'packing_bag_items') {
    if (!isTrimmedName(row.name, 120) || !inRange(row.quantity, 1, 99)) throw invalid();
    if (row.per_day === true && row.quantity == null) throw invalid();
  } else if (table === 'packing_list_bags') {
    if (!isTrimmedName(row.name, 60)) throw invalid();
    const clash =
      row.bag_id != null &&
      Object.values(tables.packing_list_bags ?? {}).some(
        (other) =>
          other.id !== row.id && other.absence_id === row.absence_id && other.bag_id === row.bag_id,
      );
    if (clash) throw conflict('23505');
  } else if (table === 'packing_items') {
    if (
      !isTrimmedName(row.name, 120) ||
      !inRange(row.quantity, 1, 9999) ||
      !inRange(row.per_day, 1, 99) ||
      (row.per_day != null && row.quantity == null)
    ) {
      throw invalid();
    }
  }
}

/** "Je Tag" like the database: per day × days of the absence of its bag, at most 9999. */
function perDayQuantity(tables: TableRows, row: Row): unknown {
  if (row.per_day == null) return row.quantity;
  const listBag = tables.packing_list_bags?.[String(row.list_bag_id)];
  const absence = listBag ? tables.absences?.[String(listBag.absence_id)] : undefined;
  if (!absence) return row.quantity;
  return packQuantity(
    Number(row.per_day),
    absenceDays(String(absence.from_on), String(absence.to_on)),
  );
}

/** private.recalc_packing_quantities: the open "je Tag" Packstücke of one absence (AC-037). */
function recalcPacking(tables: TableRows, absenceId: string): TableRows {
  let next = tables;
  const bagIds = new Set(
    Object.values(tables.packing_list_bags ?? {})
      .filter((bag) => bag.absence_id === absenceId)
      .map((bag) => bag.id),
  );
  for (const item of Object.values(tables.packing_items ?? {})) {
    if (!bagIds.has(String(item.list_bag_id)) || item.per_day == null || item.packed === true) {
      continue;
    }
    const quantity = perDayQuantity(next, item);
    if (quantity !== item.quantity) {
      next = {
        ...next,
        packing_items: { ...next.packing_items, [item.id]: { ...item, quantity } },
      };
    }
  }
  return next;
}

/** articles_synonyms_size (spec 0007): at most 30 synonyms with 2000 characters in all. */
const MAX_SYNONYMS = 30;
const MAX_SYNONYMS_LENGTH = 2000;
const totalLength = (texts: readonly string[]) =>
  texts.reduce((sum, text) => sum + Array.from(text).length, 0);
const conflict = (code: string) => new TransportError('permanent', code, 409);

const reject = (code: string) => new TransportError('permanent', code, 400);

/** What one restore_cleared_items call takes; a clear returning more is refused (like the RPCs). */
function assertRestorableSize(items: ClearedItems): void {
  const contributions = items.reduce((sum, entry) => sum + (entry.contributions?.length ?? 0), 0);
  if (items.length > 1000 || contributions > 5000) throw reject('too_many_changes');
}
/** A foreign key error names its constraint, like Postgres (`meal_plan_entries_recipe_fkey`). */
const foreignKey = (constraint: string) =>
  new TransportError('permanent', '23503', 409, undefined, constraint);
const constraintOf = (reference: { table: string; column: string }) =>
  `${reference.table}_${reference.column.replace(/_id$/, '')}_fkey`;

/** private.recipe_deletions (spec 0008, E4): what restore_recipe brings back. */
interface RecipeDeletion {
  householdId: string;
  recipeId: string;
  deletedBy: string;
  /** Milliseconds, like the server clock. */
  deletedAt: number;
  recipe: Row;
  ratings: { member_id: string; stars: unknown }[];
  favorites: string[];
  /** The old values of the entries that became free text, and the text written. */
  converted: {
    id: string;
    kind: unknown;
    recipe_id: unknown;
    text: unknown;
    variants: unknown;
    new_text: string;
  }[];
  removed: Row[];
  /** Spec 0009: its rows as a collection and as a contained recipe, in full. */
  collectionRecipes: Row[];
}
/** A snapshot can be restored for 1 hour. */
const RESTORABLE_MS = 60 * 60 * 1000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A row as an insert without its timestamps writes it: the server sets them anew. */
function withoutTimestamps(row: Row): Row {
  const copy = { ...row };
  delete copy.created_at;
  delete copy.updated_at;
  delete copy.household_id;
  return copy;
}

/** meal_plan_entries_kind_complete, for the case a cleared reference can break. */
function checkPlanEntry(row: Row): void {
  if (row.kind === 'leftovers' && row.recipe_id == null && row.leftovers_of_entry_id == null) {
    throw new TransportError('permanent', '23514', 400);
  }
}

/** Folders of the photo bucket per table (activities_photo_path_valid, recipes_photo_path_valid). */
const PHOTO_FOLDERS: Record<string, string> = { activities: 'activities', recipes: 'recipes' };
/** The file name of a photo: a new lower-case uuid per upload, always .jpg. */
const PHOTO_FILE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/;
/** <household>/<activities|recipes>/<row id>/<uuid>.jpg, like private.media_household_id. */
const MEDIA_PATH = /^([^/]+)\/(activities|recipes)\/[^/]+\/([^/]+)$/;
/** The bucket's limits: image/jpeg only, at most 2 MiB. */
const MEDIA_MAX_BYTES = 2 * 1024 * 1024;

/** shopping_contributions_note_length (spec 0006, AC-022). */
const NOTE_MAX_LENGTH = 200;

const isManual = (row: Row) =>
  typeof row.source === 'object' &&
  row.source !== null &&
  (row.source as { kind?: unknown }).kind === 'manual';

const keysOf = (row: Row): string[] =>
  Array.isArray(row.synonym_keys) ? row.synonym_keys.map(String) : [];

/**
 * articles_keys_unique, articles_household_id_name_key_key and articles_name_key_not_synonym
 * (spec 0007, E6): no name or synonym of an article is the name or a synonym of another.
 */
function checkArticleKeys(row: Row, tables: TableRows): void {
  const others = Object.values(tables.articles ?? {}).filter((other) => other.id !== row.id);
  const own = keysOf(row);
  const taken = others.some(
    (other) =>
      own.includes(String(other.name_key)) ||
      keysOf(other).some((key) => key === row.name_key || own.includes(key)),
  );
  if (taken) throw conflict('name_taken');
  if (own.includes(String(row.name_key))) throw new TransportError('permanent', '23514', 400);
  if (others.some((other) => other.name_key === row.name_key)) throw conflict('23505');
}

/**
 * recipes_check_ingredients (spec 0007, REQ-001): every ingredient is an object pointing to an
 * article of the household, with an optional Hinweis of at most 200 characters. (The database
 * also wants a lower-case UUID; the test data use readable ids.)
 */
function checkIngredients(ingredients: unknown, tables: TableRows): void {
  const invalid = () => conflict('ingredient_article_invalid');
  if (ingredients == null) return;
  if (!Array.isArray(ingredients)) throw invalid();
  for (const ingredient of ingredients as unknown[]) {
    if (typeof ingredient !== 'object' || ingredient === null || Array.isArray(ingredient)) {
      throw invalid();
    }
    const { articleId, prepNote } = ingredient as Record<string, unknown>;
    if (typeof articleId !== 'string' || !tables.articles?.[articleId]) throw invalid();
    if (
      'prepNote' in ingredient &&
      (typeof prepNote !== 'string' || Array.from(prepNote).length > RECIPE_LIMITS.prepNote)
    ) {
      throw invalid();
    }
  }
}

const isAsNeeded = (chore: Row) =>
  typeof chore.recurrence === 'object' &&
  chore.recurrence !== null &&
  (chore.recurrence as { type?: unknown }).type === 'asNeeded';

const COMPLETION_KEYS = new Set([
  'chore_id',
  'event_id',
  'kind',
  'done_on',
  'done_by',
  'seen',
  'next_due_on',
  'next_assignee_id',
]);
const SEEN_KEYS = new Set(['next_due_on', 'last_done_on', 'next_assignee_id', 'latest_event_id']);
const isText = (value: unknown): value is string => typeof value === 'string';
const isTextOrNull = (value: unknown) => value === undefined || value === null || isText(value);
const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The shape private.complete_chore accepts; anything else is invalid_change (spec 0011). */
function validCompletion(value: unknown): value is ChoreCompletion {
  if (!isPlainObject(value)) return false;
  const { seen } = value;
  return (
    Object.keys(value).every((key) => COMPLETION_KEYS.has(key) && value[key] !== undefined) &&
    isText(value.chore_id) &&
    isText(value.event_id) &&
    isText(value.done_on) &&
    isText(value.done_by) &&
    isTextOrNull(value.next_due_on) &&
    isTextOrNull(value.next_assignee_id) &&
    isPlainObject(seen) &&
    Object.keys(seen).every((key) => SEEN_KEYS.has(key)) &&
    isTextOrNull(seen.latest_event_id) &&
    (value.kind === 'done' || value.kind === 'skipped')
  );
}

/** (created_at, id) as the database orders bookings; a row without created_at is newest. */
function bookedAfter(a: Row, b: Row): boolean {
  if (a.created_at === undefined || b.created_at === undefined) {
    return a.created_at === undefined && b.created_at !== undefined;
  }
  const order = compareTimestamps(String(a.created_at), String(b.created_at));
  return order > 0 || (order === 0 && a.id > b.id);
}

/** recipes.kind, its default 'recipe' when a row carries none (spec 0009, E2). */
const kindOf = (row: Row | undefined) => row?.kind ?? 'recipe';

/** recipes_kind_valid and recipes_kind_fields (spec 0009, E2, E3). */
function checkRecipeKind(row: Row): void {
  const kind = kindOf(row);
  if (kind !== 'recipe' && kind !== 'collection')
    throw new TransportError('permanent', '23514', 400);
  const empty = (value: unknown) => value == null || (Array.isArray(value) && value.length === 0);
  const ownVariant =
    Array.isArray(row.ingredients) &&
    (row.ingredients as { variantId?: unknown }[]).some(
      (ingredient) => ingredient.variantId != null,
    );
  const fits =
    kind === 'recipe'
      ? row.course != null
      : row.course == null &&
        row.total_minutes == null &&
        row.cuisine == null &&
        row.lead_time == null &&
        empty(row.tags) &&
        empty(row.variants) &&
        empty(row.steps) &&
        !ownVariant;
  if (!fits) throw new TransportError('permanent', '23514', 400);
}

/** A contained recipe (spec 0009, E4): servings 1–100, variant 1–64 characters, once each. */
function checkCollectionRecipe(row: Row, tables: TableRows): void {
  const servingsOk = row.servings == null || inRange(row.servings, 1, 100);
  const variantOk =
    row.variant_id == null ||
    (typeof row.variant_id === 'string' &&
      row.variant_id.length >= 1 &&
      row.variant_id.length <= 64);
  if (!servingsOk || !variantOk) throw new TransportError('permanent', '23514', 400);
  const twice = Object.values(tables.collection_recipes ?? {}).some(
    (other) =>
      other.id !== row.id &&
      other.collection_id === row.collection_id &&
      other.recipe_id === row.recipe_id,
  );
  if (twice) throw conflict('23505');
}

/**
 * The trigger collection_recipes_check before insert (spec 0009, E4): the container is a
 * collection and the contained row a recipe (AC-009), and a collection holds at most 50 (E15). A
 * row missing in the household leaves it to the foreign key (23503).
 */
function checkCollectionRecipeInsert(row: Row, tables: TableRows): void {
  const collection = tables.recipes?.[String(row.collection_id)];
  const recipe = tables.recipes?.[String(row.recipe_id)];
  if (!collection || !recipe) return;
  if (kindOf(collection) !== 'collection' || kindOf(recipe) !== 'recipe') {
    throw reject('collection_recipe_kind_invalid');
  }
  const count = Object.values(tables.collection_recipes ?? {}).filter(
    (other) => other.collection_id === row.collection_id,
  ).length;
  if (count >= 50) throw reject('too_many_collection_recipes');
}

// ---------- spec 0013: times, reservation, notification settings ----------

/** private.is_five_minute_time: "HH:MM" or "HH:MM:SS" with seconds 0, minutes in steps of 5. */
const FIVE_MINUTE_TIME = /^([01]\d|2[0-3]):[0-5][05](:00)?$/;
const TIME_COLUMNS: Record<string, readonly string[]> = {
  chores: ['due_time'],
  meal_plan_entries: ['reserved_at', 'reminder_at'],
  notification_settings: ['daily_summary_at', 'activities_eve_at'],
};
const REMIND_MINUTES = new Set([30, 60, 120, 180, 240]);
const SUMMARY_PARTS = new Set(['meals', 'activities', 'chores', 'prep']);

/** A row as Postgres keeps it: a `time` reads back as "HH:MM:SS"; an invalid one is 23514. */
function withDbTimes(table: string, row: Row): Row {
  const columns = TIME_COLUMNS[table];
  if (!columns) return row;
  let next = row;
  for (const column of columns) {
    const value = row[column];
    if (value === null || value === undefined) continue;
    if (typeof value !== 'string' || !FIVE_MINUTE_TIME.test(value)) {
      throw new TransportError('permanent', '23514', 400);
    }
    if (value.length === 5) next = { ...next, [column]: `${value}:00` };
  }
  return next;
}

/** meal_plan_entries_remind_minutes_before_valid, _reservation_only_restaurant, the parts check. */
function checkNotificationColumns(table: string, row: Row): void {
  const violated = () => new TransportError('permanent', '23514', 400);
  if (table === 'meal_plan_entries') {
    if (row.remind_minutes_before != null && !REMIND_MINUTES.has(Number(row.remind_minutes_before)))
      throw violated();
    if (row.reserved_at != null && row.kind !== 'restaurant') throw violated();
    checkReminderColumns(row);
  }
  if (table === 'notification_settings') {
    const parts = row.daily_summary_parts;
    if (
      !Array.isArray(parts) ||
      parts.length < 1 ||
      parts.length > 4 ||
      new Set(parts).size !== parts.length ||
      parts.some((part) => !SUMMARY_PARTS.has(String(part)))
    ) {
      throw violated();
    }
  }
}

// C0, DEL, C1 and invisible or direction-changing characters, as the check
// `meal_plan_entries_reminder_text_valid` refuses them.
const CONTROL_CHARACTER =
  /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/;

/**
 * Spec 0017: meal_plan_entries_reminder_day_offset_valid, _reminder_text_valid,
 * _reminder_complete, _reminder_text_needs_time and _reminder_needs_date.
 */
function checkReminderColumns(row: Row): void {
  const violated = () => new TransportError('permanent', '23514', 400);
  const offset = row.reminder_day_offset;
  const text = row.reminder_text;
  if (offset != null && !(Number.isInteger(offset) && Number(offset) >= 0 && Number(offset) <= 366))
    throw violated();
  if (
    text != null &&
    (typeof text !== 'string' ||
      [...text].length < 1 ||
      [...text].length > 80 ||
      text !== text.trim() ||
      CONTROL_CHARACTER.test(text))
  )
    throw violated();
  if ((offset == null) !== (row.reminder_at == null)) throw violated();
  if (text != null && row.reminder_at == null) throw violated();
  if (row.reminder_at != null && row.date == null) throw violated();
}

/**
 * meal_plan_entries_clear_reminder and meal_plan_entries_check_reminder (spec 0017): back to
 * "Vorgemerkt" clears the reminder; on insert, and on a change of the reminder on the same day,
 * its moment must lie in the future in the household's zone (`reminder_in_past`). Moving the
 * entry is never refused.
 */
function reminderTriggers(previous: Row | undefined, next: Row, timeZone: string): Row {
  let row = next;
  if (previous && previous.date != null && row.date == null) {
    row = { ...row, reminder_day_offset: null, reminder_at: null, reminder_text: null };
  }
  if (row.reminder_at == null || row.reminder_day_offset == null || row.date == null) return row;
  if (
    previous &&
    (row.date !== previous.date ||
      (row.reminder_day_offset === previous.reminder_day_offset &&
        row.reminder_at === previous.reminder_at))
  ) {
    return row;
  }
  const reminder = {
    offsetDays: Number(row.reminder_day_offset),
    at: String(row.reminder_at).slice(0, 5),
  };
  if (isReminderPast(String(row.date), reminder, new Date(), timeZone)) {
    throw new TransportError('permanent', 'reminder_in_past', 400);
  }
  return row;
}

/** private.is_push_endpoint: https, a known push service, no port, no credentials (AC-044). */
const PUSH_ENDPOINT = new RegExp(
  '^https://(fcm\\.googleapis\\.com|updates\\.push\\.services\\.mozilla\\.com|web\\.push\\.apple\\.com' +
    '|[a-z0-9]([a-z0-9-]*[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\\.notify\\.windows\\.com)' +
    "/[A-Za-z0-9._~:/?@!$&'()*+,;=%-]*$",
);
const PUSH_P256DH = /^B[A-Za-z0-9_-]{86}$/;
const PUSH_AUTH = /^[A-Za-z0-9_-]{22}$/;
/** Decision 20: at most 10 devices per person, 3 probes in 10 minutes. */
const MAX_PUSH_DEVICES = 10;
const MAX_TEST_PUSHES = 3;
const TEST_PUSH_WINDOW_MS = 10 * 60 * 1000;

interface PushSubscriptionRecord {
  id: string;
  profileId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  deviceLabel: string;
  enabled: boolean;
  goneAt: string | null;
  lastSuccessAt: string | null;
  createdAt: string;
}

function validPushSubscription(
  endpoint: string,
  p256dh: string,
  auth: string,
  label: string,
): boolean {
  return (
    endpoint.length <= 1024 &&
    PUSH_ENDPOINT.test(endpoint) &&
    PUSH_P256DH.test(p256dh) &&
    PUSH_AUTH.test(auth) &&
    label.length >= 1 &&
    label.length <= 60 &&
    !/[\u0000-\u001f\u007f]/.test(label)
  );
}

/** Row checks of the database that a client bug could break (spec 0004, 0006, 0007). */
function checkRow(householdId: string, table: string, row: Row, tables: TableRows): void {
  checkNotificationColumns(table, row);
  if (table === 'recipes') checkRecipeKind(row);
  if (table === 'collection_recipes') checkCollectionRecipe(row, tables);
  if (
    table === 'shopping_contributions' &&
    typeof row.note === 'string' &&
    row.note.length > NOTE_MAX_LENGTH
  ) {
    throw new TransportError('permanent', '23514', 400);
  }
  const folder = PHOTO_FOLDERS[table];
  if (folder && row.photo_path != null) {
    const prefix = `${householdId}/${folder}/${row.id}/`;
    const path = String(row.photo_path);
    if (!path.startsWith(prefix) || !PHOTO_FILE.test(path.slice(prefix.length))) {
      throw new TransportError('permanent', '23514', 400);
    }
  }
  if (table === 'activities') {
    const clash = Object.values(tables.activities ?? {}).some(
      (other) => other.id !== row.id && other.name_key === row.name_key,
    );
    if (clash) throw new TransportError('permanent', '23505', 409);
  }
  // chores_as_needed_never_due (spec 0011, AC-043).
  if (table === 'chores' && isAsNeeded(row) && row.next_due_on != null) {
    throw new TransportError('permanent', '23514', 400);
  }
  // areas_household_id_name_idx (spec 0007, AC-052).
  if (table === 'areas') {
    const name = String(row.name).toLowerCase();
    const clash = Object.values(tables.areas ?? {}).some(
      (other) => other.id !== row.id && String(other.name).toLowerCase() === name,
    );
    if (clash) throw conflict('23505');
  }
  // shopping_items_open_article_idx: one open item per article and household.
  if (table === 'shopping_items' && row.checked !== true) {
    const clash = Object.values(tables.shopping_items ?? {}).some(
      (other) =>
        other.id !== row.id && other.article_id === row.article_id && other.checked !== true,
    );
    if (clash) throw new TransportError('permanent', '23505', 409);
  }
}

export function createFakeServer(): FakeServer {
  let lastMicros = 0;
  const profiles = new Map<string, SmallRow>();
  const households = new Map<string, SmallRow>();
  let members: SmallRow[] = [];
  let invitations: SmallRow[] = [];
  const data = new Map<string, TableRows>();
  /** `replacedBy`: deleted_records.replaced_by, set by merge_articles (spec 0007, E5). */
  let deletions: (Tombstone & { householdId: string; replacedBy?: string })[] = [];
  const subscribers = new Map<string, Set<() => void>>();
  const failures: FailureRule[] = [];
  const calls: { userId: string; fn: string }[] = [];
  const mapsLinks = new Map<string, ResolveMapsLinkReply>();
  const media = new Map<string, Blob>();
  let ai: FakeAi = {};
  /** private.recipe_deletions, one snapshot per household and recipe. */
  const recipeDeletions = new Map<string, RecipeDeletion>();
  const aiUnavailable = () => new TransportError('transient', 'ai_unavailable', 503);
  /** private.push_subscriptions (spec 0013): never synced, reached only through the RPCs. */
  let pushSubscriptions: PushSubscriptionRecord[] = [];
  /** The probes of private.notification_deliveries (kind 'test'), for the rate limit. */
  const testDeliveries: { subscriptionId: string; profileId: string; at: number }[] = [];
  let pushConfigured = false;

  /** Server clock with microseconds, strictly increasing like `now()` in separate transactions. */
  function now(): string {
    lastMicros = Math.max(lastMicros + 1, Date.now() * 1000);
    const ms = Math.floor(lastMicros / 1000);
    const micros = String(lastMicros % 1000).padStart(3, '0');
    return new Date(ms).toISOString().replace('Z', `${micros}Z`);
  }

  const isMember = (userId: string, householdId: string) =>
    members.some((member) => member.household_id === householdId && member.profile_id === userId);
  const memberIdsOf = (householdId: string) =>
    members
      .filter((member) => member.household_id === householdId)
      .map((m) => String(m.profile_id));
  const householdsOf = (userId: string) =>
    members.filter((member) => member.profile_id === userId).map((m) => String(m.household_id));

  /**
   * household_members_create_notification_settings (spec 0013, Decision 3): a new member gets her
   * row with the column defaults; an existing one is kept.
   */
  function createNotificationSettings(householdId: string, profileId: string): void {
    const exists = Object.values(data.get(householdId)?.notification_settings ?? {}).some(
      (row) => row.member_id === profileId,
    );
    if (exists) return;
    transaction(householdId, (tables) => [
      withRow(tables, 'notification_settings', {
        id: crypto.randomUUID(),
        member_id: profileId,
        daily_summary_enabled: false,
        daily_summary_at: '07:30:00',
        daily_summary_parts: ['meals', 'activities', 'chores', 'prep'],
        activities_eve_enabled: false,
        activities_eve_at: '19:00:00',
        chore_reminders_enabled: true,
        reservation_reminders_enabled: true,
        entry_reminders_enabled: true,
      }),
      undefined,
    ]);
  }

  /** Every device RPC: `not_authenticated` (42501) without a signed-in user. */
  function requireUser(userId: string): void {
    if (!userId || !profiles.has(userId)) {
      throw new TransportError('permanent', 'not_authenticated', 401);
    }
  }

  const ownSubscription = (userId: string, endpoint: string) =>
    pushSubscriptions.find(
      (subscription) => subscription.endpoint === endpoint && subscription.profileId === userId,
    );

  /** private.register_push_subscription: upsert by address for the caller (Decision 19, 20). */
  function registerPushSubscription(
    userId: string,
    endpoint: string,
    p256dh: string,
    auth: string,
    deviceLabel: string,
  ): string {
    requireUser(userId);
    const label = deviceLabel.trim();
    if (!validPushSubscription(endpoint, p256dh, auth, label)) {
      throw reject('invalid_subscription');
    }
    const existing = pushSubscriptions.find((subscription) => subscription.endpoint === endpoint);
    const own = pushSubscriptions.filter((subscription) => subscription.profileId === userId);
    if (existing?.profileId !== userId && own.length >= MAX_PUSH_DEVICES) {
      throw reject('too_many_devices');
    }
    const record: PushSubscriptionRecord = {
      id: existing?.id ?? crypto.randomUUID(),
      profileId: userId,
      endpoint,
      p256dh,
      auth,
      deviceLabel: label,
      enabled: true,
      goneAt: null,
      lastSuccessAt: existing?.lastSuccessAt ?? null,
      createdAt: existing?.createdAt ?? now(),
    };
    pushSubscriptions = existing
      ? pushSubscriptions.map((subscription) => (subscription === existing ? record : subscription))
      : [...pushSubscriptions, record];
    return record.id;
  }

  function notify(householdId: string): void {
    for (const listener of subscribers.get(householdId) ?? []) queueMicrotask(listener);
  }

  /**
   * Stores the outcome of a transaction: new or changed rows get their timestamps, removed rows a
   * tombstone. Rows are compared by identity, as every change creates a new row object.
   */
  function commit(householdId: string, before: TableRows, after: TableRows): void {
    const time = now();
    const next: TableRows = {};
    for (const table of new Set([...Object.keys(before), ...Object.keys(after)])) {
      const old = before[table] ?? {};
      const rows: Record<string, Row> = {};
      for (const [id, row] of Object.entries(after[table] ?? {})) {
        if (old[id] === row) rows[id] = row;
        else
          rows[id] = {
            ...row,
            household_id: householdId,
            created_at: old[id]?.created_at ?? row.created_at ?? time,
            updated_at: time,
          };
      }
      for (const id of Object.keys(old)) {
        if (!(id in rows)) deletions.push({ householdId, table, id, deletedAt: time });
      }
      next[table] = rows;
    }
    data.set(householdId, next);
    notify(householdId);
  }

  /** Runs a write on a copy of the household's tables; nothing is stored when it throws. */
  function transaction<T>(householdId: string, write: (tables: TableRows) => [TableRows, T]): T {
    const before = data.get(householdId) ?? {};
    const [after, result] = write(before);
    commit(householdId, before, after);
    return result;
  }

  function failure(fn: RpcName): FailureRule | undefined {
    const index = failures.findIndex((rule) => rule.fn === fn);
    return index < 0 ? undefined : failures.splice(index, 1)[0];
  }

  async function run<T>(userId: string, fn: RpcName, body: () => T): Promise<T> {
    calls.push({ userId, fn });
    await Promise.resolve();
    const rule = failure(fn);
    if (rule && !rule.afterApply) throw rule.error;
    const result = body();
    if (rule) throw rule.error;
    return result;
  }

  function withRow(tables: TableRows, table: string, row: Row): TableRows {
    return { ...tables, [table]: { ...tables[table], [row.id]: row } };
  }

  /** Deletes rows like the database; `enforce` false = an administrator ignoring restrict. */
  function withoutRows(
    tables: TableRows,
    table: string,
    ids: Iterable<string>,
    enforce = true,
  ): TableRows {
    let next = tables;
    for (const id of ids) {
      if (!next[table]?.[id]) continue;
      const kept = { ...next[table] };
      delete kept[id];
      next = { ...next, [table]: kept };
      for (const reference of REFERENCES.filter((candidate) => candidate.target === table)) {
        for (const row of Object.values(next[reference.table] ?? {})) {
          if (row[reference.column] !== id || reference.onDelete === 'cascade') continue;
          if (reference.onDelete === 'restrict') {
            if (enforce) throw foreignKey(constraintOf(reference));
            continue;
          }
          const cleared = { ...row, [reference.column]: null };
          if (enforce && reference.table === 'meal_plan_entries') checkPlanEntry(cleared);
          next = withRow(next, reference.table, cleared);
        }
      }
      for (const cascade of CASCADES[table] ?? []) {
        const dependent = Object.values(next[cascade.table] ?? {})
          .filter((row) => row[cascade.column] === id)
          .map((row) => row.id);
        next = withoutRows(next, cascade.table, dependent, enforce);
      }
    }
    return next;
  }

  /** The household holding a row the user can see (RLS), or undefined. */
  function locate(userId: string, table: string, id: string): string | undefined {
    return householdsOf(userId).find((householdId) => data.get(householdId)?.[table]?.[id]);
  }

  /**
   * private.resolve_store_item: the item itself, else the item that replaced it after a merge
   * (at most 5 references, only inside the tombstone's household, which must be the caller's).
   */
  function resolveStoreItem(
    userId: string,
    itemId: string,
  ): { householdId: string; itemId: string; replaced: boolean } | undefined {
    const direct = locate(userId, 'shopping_items', itemId);
    if (direct) return { householdId: direct, itemId, replaced: false };
    const mine = new Set(householdsOf(userId));
    let id = itemId;
    for (let step = 0; step < 5; step++) {
      const tombstone = [...deletions]
        .reverse()
        .find(
          (deletion) =>
            deletion.table === 'shopping_items' &&
            deletion.id === id &&
            deletion.replacedBy !== undefined &&
            mine.has(deletion.householdId),
        );
      if (!tombstone?.replacedBy) return undefined;
      id = tombstone.replacedBy;
      if (data.get(tombstone.householdId)?.shopping_items?.[id]) {
        return { householdId: tombstone.householdId, itemId: id, replaced: true };
      }
    }
    return undefined;
  }

  /** The list actions take the household id: a foreign one is refused, never answered empty. */
  function memberOf(userId: string, householdId: string): string {
    if (!isMember(userId, householdId)) throw new TransportError('permanent', 'not_member', 403);
    return householdId;
  }

  /** The packing tables point to members with composite foreign keys (spec 0012). */
  function checkPackingMembers(
    householdId: string,
    table: string,
    row: Record<string, unknown>,
  ): void {
    const memberIds = new Set(memberIdsOf(householdId));
    for (const reference of PACKING_MEMBER_COLUMNS) {
      const value = row[reference.column];
      if (reference.table === table && value != null && !memberIds.has(String(value))) {
        throw foreignKey(reference.constraint);
      }
    }
  }

  /** private.restore_packing_items (spec 0012, AC-034, AC-035): Packstücke with their state. */
  function restorePackingItems(
    tables: TableRows,
    householdId: string,
    items: unknown,
  ): [TableRows, { restored: number }] {
    if (!Array.isArray(items) || items.length === 0) throw reject('invalid_change');
    if (items.length > 200) throw reject('too_many_changes');
    let next = tables;
    for (const element of items as unknown[]) {
      if (!isPlainObject(element) || Object.keys(element).some((key) => !RESTORE_KEYS.has(key))) {
        throw reject('invalid_change');
      }
      if (!isText(element.id) || !isText(element.list_bag_id) || !isText(element.name)) {
        throw reject('invalid_change');
      }
      if (next.packing_items?.[element.id]) throw conflict('23505');
      const packed = element.packed === true;
      const time = now();
      const at = isText(element.packed_at) ? element.packed_at : time;
      const row: Row = {
        id: element.id,
        list_bag_id: element.list_bag_id,
        name: element.name,
        quantity: element.quantity ?? null,
        per_day: element.per_day ?? null,
        sort: element.sort ?? 0,
        packed,
        packed_at: packed ? (compareTimestamps(at, time) > 0 ? time : at) : null,
        packed_by: packed ? (element.packed_by ?? null) : null,
        pack_seq: Math.min(Math.max(Number(element.pack_seq ?? 0), 0), 999_000),
      };
      row.quantity = perDayQuantity(next, row);
      next = withRow(next, 'packing_items', row);
      checkReferences(next, 'packing_items', row);
      checkPackingRow('packing_items', row, next);
      checkPackingMembers(householdId, 'packing_items', row);
    }
    return [next, { restored: items.length }];
  }

  /** private.set_packing_items_packed (ADR-0013): the rule table per Packstück, one transaction. */
  function setPackingItemsPacked(
    userId: string,
    householdId: string,
    changes: readonly PackChange[],
  ): PackResult {
    memberOf(userId, householdId);
    const list = changes as unknown;
    if (!Array.isArray(list) || list.length === 0) throw reject('invalid_change');
    if (list.length > 200) throw reject('too_many_changes');
    // The database also wants a lower-case UUID; the test data use readable ids.
    for (const candidate of list as unknown[]) {
      if (!isPlainObject(candidate)) throw reject('invalid_change');
      const { item_id: itemId, packed, seen_pack_seq: seen } = candidate;
      if (
        Object.keys(candidate).sort().join(',') !== PACK_CHANGE_KEYS ||
        !isText(itemId) ||
        typeof packed !== 'boolean' ||
        typeof seen !== 'number' ||
        !Number.isInteger(seen) ||
        seen < 0 ||
        seen > 1_000_000
      ) {
        throw reject('invalid_change');
      }
    }
    const byId = new Map(changes.map((change) => [change.item_id.toLowerCase(), change]));
    if (byId.size !== changes.length) throw reject('invalid_change');
    return transaction(householdId, (tables) => {
      let next = tables;
      const answer: PackResult = [];
      const found = Object.values(tables.packing_items ?? {})
        .filter((item) => byId.has(item.id.toLowerCase()))
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      for (const item of found) {
        const change = byId.get(item.id.toLowerCase());
        if (!change) continue;
        let row = item;
        const seq = Number(item.pack_seq ?? 0);
        if (change.packed && item.packed !== true) {
          row = { ...item, packed: true, packed_at: now(), packed_by: userId, pack_seq: seq + 1 };
        } else if (!change.packed && item.packed === true && seq === change.seen_pack_seq) {
          row = { ...item, packed: false, packed_at: null, packed_by: null, pack_seq: seq + 1 };
        }
        if (row !== item) next = withRow(next, 'packing_items', row);
        answer.push({
          item_id: row.id,
          packed: row.packed === true,
          pack_seq: Number(row.pack_seq ?? 0),
        });
      }
      return [next, answer];
    });
  }

  /** Newest first by created_at, then id (the database's `order by created_at desc, id desc`). */
  const newestFirst = (a: Row, b: Row) =>
    compareTimestamps(String(b.created_at), String(a.created_at)) ||
    (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

  /** adjust_item_count: one tap on + or − (spec 0006, REQ-003). */
  function adjustCount(tables: TableRows, itemId: string, delta: number): [TableRows, unknown] {
    const item = tables.shopping_items?.[itemId];
    if (!item) return [tables, null];
    const own = Object.values(tables.shopping_contributions ?? {}).filter(
      (row) => row.item_id === itemId,
    );
    const total = own.reduce(
      (sum, row) => sum + (typeof row.count === 'number' ? row.count : 0),
      0,
    );
    if (total + delta < 0 || (delta > 0 && total + delta > 99)) throw reject('invalid_value');
    const counted = own.filter((row) => typeof row.count === 'number');

    if (delta > 0) {
      const manual = counted.filter(isManual).sort(newestFirst)[0];
      const next = manual
        ? withRow(tables, 'shopping_contributions', {
            ...manual,
            count: Number(manual.count) + delta,
          })
        : withRow(tables, 'shopping_contributions', {
            id: crypto.randomUUID(),
            item_id: itemId,
            source: { kind: 'manual' },
            count: delta,
            qty: null,
            unit: null,
            note: null,
          });
      return [next, { item_id: itemId, count: total + delta, removed: false }];
    }

    // "von Hand" first, then the most recently added contribution.
    const order = [...counted].sort(
      (a, b) => Number(isManual(b)) - Number(isManual(a)) || newestFirst(a, b),
    );
    let left = -delta;
    let next = tables;
    for (const row of order) {
      if (left === 0) break;
      const count = Number(row.count);
      if (count <= left) {
        left -= count;
        next =
          row.qty == null
            ? withoutRows(next, 'shopping_contributions', [row.id])
            : withRow(next, 'shopping_contributions', { ...row, count: null });
      } else {
        next = withRow(next, 'shopping_contributions', { ...row, count: count - left });
        left = 0;
      }
    }
    const remains = Object.values(next.shopping_contributions ?? {}).some(
      (row) => row.item_id === itemId,
    );
    if (remains) return [next, { item_id: itemId, count: total + delta, removed: false }];
    const before = [...own].sort((a, b) => newestFirst(b, a));
    return [
      withoutRows(next, 'shopping_items', [itemId]),
      { item_id: itemId, count: 0, removed: true, item, contributions: before },
    ];
  }

  // ---------- apply_changes ----------

  function checkReferences(
    tables: TableRows,
    table: string,
    written: Row | Record<string, unknown>,
  ) {
    for (const reference of REFERENCES.filter((candidate) => candidate.table === table)) {
      const value = written[reference.column];
      if (value == null) continue;
      if (!tables[reference.target]?.[String(value)]) throw foreignKey(constraintOf(reference));
    }
  }

  function checkColumns(table: string, columns: string[], insert: boolean): void {
    if (!Object.hasOwn(WRITABLE_COLUMNS, table)) throw reject('invalid_change');
    if (insert && NO_INSERT_TABLES.has(table)) throw reject('invalid_change');
    const allowed = new Set<string>(
      (!insert && PATCH_COLUMNS[table as WritableTable]) ||
        WRITABLE_COLUMNS[table as WritableTable],
    );
    if (insert) {
      allowed.add('id');
      allowed.add('household_id');
    }
    if (columns.some((column) => !allowed.has(column))) throw reject('invalid_change');
  }

  function addContributions(
    tables: TableRows,
    householdId: string,
    entries: readonly AddEntry[],
  ): [TableRows, AddResult] {
    let next = tables;
    const results: AddResult = [];
    for (const entry of entries) {
      const fresh = entry.contributions.filter(
        (contribution) => !next.shopping_contributions?.[contribution.id],
      );
      const before = next;
      if (fresh.length > 0) {
        next = queueEffect(
          {
            kind: 'add',
            householdId,
            clientItemId: entry.client_item_id,
            clientArticleId: entry.client_article_id,
            contributions: fresh.map((contribution) => ({
              clientContributionId: contribution.id,
              articleName: entry.article_name,
              nameKey: entry.name_key,
              count: contribution.count ?? undefined,
              qty: contribution.qty ?? undefined,
              unit: contribution.unit ?? undefined,
              note: contribution.note ?? undefined,
            })),
          },
          next,
          householdId,
        );
        for (const contribution of fresh) {
          const row = next.shopping_contributions?.[contribution.id];
          if (row)
            next = withRow(next, 'shopping_contributions', { ...row, source: contribution.source });
        }
        // Reopening a checked item is a change of `checked`: count it like the server does.
        for (const [id, item] of Object.entries(next.shopping_items ?? {})) {
          const old = before.shopping_items?.[id];
          if (old?.checked === true && item.checked === false) {
            next = withRow(next, 'shopping_items', {
              ...item,
              check_seq: Number(old.check_seq ?? 0) + 1,
            });
          }
        }
        const article = next.articles?.[entry.client_article_id];
        if (article && !before.articles?.[entry.client_article_id]) {
          next = withRow(next, 'articles', {
            ...article,
            synonyms: [],
            diet: 'unknown',
            is_pantry: false,
          });
        }
      }
      const article = Object.values(next.articles ?? {}).find(
        (candidate) =>
          candidate.name_key === entry.name_key ||
          (Array.isArray(candidate.synonym_keys) &&
            candidate.synonym_keys.includes(entry.name_key)),
      );
      const firstContribution = entry.contributions[0];
      const itemId = firstContribution
        ? String(next.shopping_contributions?.[firstContribution.id]?.item_id)
        : entry.client_item_id;
      results.push({
        client_item_id: entry.client_item_id,
        item_id: itemId,
        client_article_id: entry.client_article_id,
        article_id: article?.id ?? entry.client_article_id,
      });
    }
    return [next, results];
  }

  function removeContributionRows(tables: TableRows, ids: readonly string[]): [TableRows, number] {
    const existing = ids.filter((id) => tables.shopping_contributions?.[id]);
    const itemIds = new Set(
      existing.map((id) => String(tables.shopping_contributions?.[id]?.item_id)),
    );
    let next = withoutRows(tables, 'shopping_contributions', existing);
    const empty = [...itemIds].filter(
      (itemId) =>
        !Object.values(next.shopping_contributions ?? {}).some((row) => row.item_id === itemId),
    );
    next = withoutRows(next, 'shopping_items', empty);
    return [next, existing.length];
  }

  /**
   * chore_events_keep_chore (spec 0011): an entry keeps its chore. The link is set again only
   * after the chore was deleted („Rückgängig“, AC-053); it is cleared only by deleting the chore.
   */
  function checkChoreLink(tables: TableRows, event: Row, choreId: unknown): void {
    const current = typeof event.chore_id === 'string' ? event.chore_id : null;
    const target = choreId ?? null;
    if (current === null || target === current) return;
    if (target === null && !tables.chores?.[current]) return;
    throw reject('invalid_change');
  }

  /**
   * private.complete_chore (spec 0011): books only while the chore still shows the seen state;
   * the title comes from the chore, the state before from the stored row. A day outside today − 3
   * … today + 1 (server date, UTC), a date not after the day, or a date for "bei Bedarf" is
   * invalid_change.
   */
  function completeChore(
    tables: TableRows,
    householdId: string,
    completion: unknown,
  ): [TableRows, { event_id: string }] {
    if (!validCompletion(completion)) throw reject('invalid_change');
    const today = new Date().toISOString().slice(0, 10);
    const nextDueOn = completion.next_due_on ?? null;
    if (
      completion.done_on < addDays(today, -3) ||
      completion.done_on > addDays(today, 1) ||
      (nextDueOn !== null && nextDueOn <= completion.done_on)
    ) {
      throw reject('invalid_change');
    }
    const chore = tables.chores?.[completion.chore_id];
    if (!chore) throw new TransportError('permanent', 'chore_not_found', 404);
    const { seen } = completion;
    const same = (column: string) =>
      (seen[column as keyof typeof seen] ?? null) === (chore[column] ?? null);
    // The latest booked entry as well: a second booking of a flexible chore for anyone on the
    // same day leaves the rest unchanged (AC-031).
    const latest = Object.values(tables.chore_events ?? {})
      .filter((row) => row.chore_id === chore.id)
      .sort(newestFirst)[0];
    if (
      !same('next_due_on') ||
      !same('last_done_on') ||
      !same('next_assignee_id') ||
      (seen.latest_event_id ?? null) !== (latest?.id ?? null)
    ) {
      const faster = Object.values(tables.chore_events ?? {})
        .filter(
          (row) =>
            row.chore_id === chore.id && row.kind === 'done' && row.done_on === completion.done_on,
        )
        .sort(newestFirst)[0];
      if (faster) {
        throw new TransportError('permanent', 'already_done', 400, {
          done_by: faster.done_by,
          done_at: faster.created_at,
        });
      }
      throw reject('chore_changed');
    }
    if (isAsNeeded(chore) && nextDueOn !== null) throw reject('invalid_change');
    const members = new Set(memberIdsOf(householdId));
    if (!members.has(completion.done_by)) throw foreignKey('chore_events_done_by_fkey');
    const assignee = completion.next_assignee_id ?? null;
    if (assignee !== null && !members.has(assignee)) throw foreignKey('chores_next_assignee_fkey');
    if (tables.chore_events?.[completion.event_id]) throw conflict('23505');

    let next = withRow(tables, 'chore_events', {
      id: completion.event_id,
      chore_id: chore.id,
      title: chore.title,
      kind: completion.kind,
      done_on: completion.done_on,
      done_by: completion.done_by,
      prev_next_due_on: chore.next_due_on ?? null,
      prev_last_done_on: chore.last_done_on ?? null,
      prev_next_assignee_id: chore.next_assignee_id ?? null,
      prev_recorded: true,
      // clock_timestamp() of chore_events_stamp_booking: two bookings in one call keep their order.
      created_at: now(),
    });
    const once =
      typeof chore.recurrence === 'object' &&
      chore.recurrence !== null &&
      (chore.recurrence as { type?: unknown }).type === 'once';
    if (completion.kind === 'done' && once) {
      next = withoutRows(next, 'chores', [chore.id]);
    } else if (completion.kind === 'done') {
      const last = chore.last_done_on == null ? null : String(chore.last_done_on);
      next = withRow(next, 'chores', {
        ...chore,
        last_done_on: last !== null && last > completion.done_on ? last : completion.done_on,
        next_due_on: nextDueOn,
        next_assignee_id: assignee,
      });
    } else {
      next = withRow(next, 'chores', { ...chore, next_due_on: nextDueOn });
    }
    return [next, { event_id: completion.event_id }];
  }

  /**
   * private.remove_chore_event (spec 0011): removing the latest booked entry of a chore that still
   * exists brings back the recorded state before it (no date for a chore that is "bei Bedarf" by
   * now); an older entry only goes.
   */
  function removeChoreEvent(
    tables: TableRows,
    eventId: string,
  ): [TableRows, { restored: boolean }] {
    const event = tables.chore_events?.[eventId];
    if (!event) throw new TransportError('permanent', 'chore_event_not_found', 404);
    let next = tables;
    let restored = false;
    const chore = typeof event.chore_id === 'string' ? tables.chores?.[event.chore_id] : undefined;
    if (chore && event.prev_recorded === true) {
      const later = Object.values(tables.chore_events ?? {}).some(
        (row) => row.chore_id === chore.id && row.id !== event.id && bookedAfter(row, event),
      );
      if (!later) {
        next = withRow(next, 'chores', {
          ...chore,
          next_due_on: isAsNeeded(chore) ? null : (event.prev_next_due_on ?? null),
          last_done_on: event.prev_last_done_on ?? null,
          next_assignee_id: event.prev_next_assignee_id ?? null,
        });
        restored = true;
      }
    }
    next = withoutRows(next, 'chore_events', [eventId]);
    return [next, { restored }];
  }

  function applyChanges(userId: string, householdId: string, ops: readonly ChangeOp[]) {
    if (!isMember(userId, householdId)) throw new TransportError('permanent', 'not_member', 403);
    // Like apply_changes: a domain op counts as its elements — every id of remove_contributions
    // is a delete and an op, every entry of add_contributions an op; at most 500 contributions.
    const sum = (count: (op: ChangeOp) => number) =>
      ops.reduce((total, op) => total + count(op), 0);
    const opCount = sum((op) =>
      op.kind === 'remove_contributions'
        ? Math.max(op.ids.length, 1)
        : op.kind === 'add_contributions'
          ? Math.max(op.entries.length, 1)
          : op.kind === 'restore_packing_items'
            ? Math.max(Array.isArray(op.items) ? op.items.length : 1, 1)
            : 1,
    );
    const deletes = sum((op) =>
      // complete_chore too: done of a one-off chore deletes it, known only under the lock.
      op.kind === 'delete' || op.kind === 'complete_chore' || op.kind === 'remove_chore_event'
        ? 1
        : op.kind === 'remove_contributions'
          ? op.ids.length
          : 0,
    );
    const contributions = sum((op) =>
      op.kind === 'add_contributions'
        ? op.entries.reduce((total, entry) => total + entry.contributions.length, 0)
        : 0,
    );
    if (opCount > 200 || deletes > 20 || contributions > 500) throw reject('too_many_changes');

    let householdPatch: Record<string, unknown> | undefined;
    const timeZone = String(households.get(householdId)?.timezone ?? 'Europe/Berlin');
    const result = transaction(householdId, (before) => {
      let tables = before;
      const results: unknown[] = [];
      for (const op of ops) {
        if (op.kind === 'add_contributions') {
          const [next, added] = addContributions(tables, householdId, op.entries);
          tables = next;
          results.push(added);
        } else if (op.kind === 'remove_contributions') {
          const [next, removed] = removeContributionRows(tables, op.ids);
          tables = next;
          results.push(removed);
        } else if (op.kind === 'complete_chore') {
          const [next, booked] = completeChore(tables, householdId, op.completion);
          tables = next;
          results.push(booked);
        } else if (op.kind === 'remove_chore_event') {
          const [next, removed] = removeChoreEvent(tables, op.id);
          tables = next;
          results.push(removed);
        } else if (op.kind === 'restore_packing_items') {
          const [next, restored] = restorePackingItems(tables, householdId, op.items);
          tables = next;
          results.push(restored);
        } else if (op.kind === 'insert') {
          checkColumns(op.table, Object.keys(op.row), true);
          if (op.row.household_id !== undefined && op.row.household_id !== householdId) {
            throw reject('invalid_change');
          }
          if (tables[op.table]?.[op.row.id])
            throw new TransportError('permanent', 'duplicate', 409);
          const defaults =
            op.table === 'shopping_items'
              ? {
                  checked: false,
                  checked_at: null,
                  checked_by: null,
                  check_seq: 0,
                  not_available: false,
                }
              : op.table === 'packing_items'
                ? OPEN_PACKING_ITEM
                : op.table === 'recipes'
                  ? // Column defaults: a collection must send course null (spec 0009, T1).
                    { kind: 'recipe', course: 'main', tags: [], variants: [], steps: [] }
                  : op.table === 'meal_plan_entries'
                    ? {
                        reserved_at: null,
                        remind_minutes_before: 120,
                        reminder_day_offset: null,
                        reminder_at: null,
                        reminder_text: null,
                      }
                    : op.table === 'chores'
                      ? { due_time: null }
                      : {};
          if (op.table === 'collection_recipes') checkCollectionRecipeInsert(op.row, tables);
          tables = withRow(
            tables,
            op.table,
            withDbTimes(op.table, {
              ...defaults,
              ...op.row,
              ...(op.table === 'feedback' ? { author_id: userId } : {}),
              ...(op.table === 'activities' ? { created_by: userId } : {}),
            }),
          );
          // packing_items_before_insert: "je Tag" from the absence, whatever the device sent.
          const inserted = tables[op.table]?.[op.row.id];
          if (op.table === 'meal_plan_entries' && inserted) {
            tables = withRow(tables, op.table, reminderTriggers(undefined, inserted, timeZone));
          }
          if (op.table === 'packing_items' && inserted) {
            tables = withRow(tables, op.table, {
              ...inserted,
              quantity: perDayQuantity(tables, inserted),
            });
          }
          if (op.table === 'recipes') checkIngredients(op.row.ingredients, tables);
          if (op.table === 'articles')
            checkArticleKeys(tables.articles?.[op.row.id] ?? op.row, tables);
          checkReferences(tables, op.table, op.row);
          checkRow(householdId, op.table, tables[op.table]?.[op.row.id] ?? op.row, tables);
          checkPackingRow(op.table, tables[op.table]?.[op.row.id] ?? op.row, tables);
          checkPackingMembers(householdId, op.table, op.row);
        } else if (op.kind === 'patch') {
          checkColumns(op.table, Object.keys(op.changes), false);
          if (op.table === 'households') {
            if (op.id !== householdId) throw new TransportError('permanent', 'row_not_found', 404);
            const storeId = op.changes.default_store_id;
            if (typeof storeId === 'string' && !tables.stores?.[storeId]) {
              throw foreignKey('households_default_store_fkey');
            }
            householdPatch = { ...householdPatch, ...op.changes };
            continue;
          }
          const row = tables[op.table]?.[op.id];
          // notification_settings: RLS lets a member update only her own row (spec 0013, AC-013).
          if (!row || (op.table === 'notification_settings' && row.member_id !== userId)) {
            throw new TransportError('permanent', 'row_not_found', 404);
          }
          if (op.table === 'chore_events' && 'chore_id' in op.changes)
            checkChoreLink(tables, row, op.changes.chore_id);
          const patched = withDbTimes(op.table, { ...row, ...op.changes });
          tables = withRow(
            tables,
            op.table,
            op.table === 'meal_plan_entries' ? reminderTriggers(row, patched, timeZone) : patched,
          );
          if (op.table === 'recipes' && 'ingredients' in op.changes) {
            checkIngredients(op.changes.ingredients, tables);
          }
          if (
            op.table === 'articles' &&
            ('name_key' in op.changes || 'synonym_keys' in op.changes)
          ) {
            checkArticleKeys(tables.articles?.[op.id] ?? row, tables);
          }
          checkReferences(tables, op.table, op.changes);
          checkRow(householdId, op.table, tables[op.table]?.[op.id] ?? row, tables);
          checkPackingRow(op.table, tables[op.table]?.[op.id] ?? row, tables);
          checkPackingMembers(householdId, op.table, op.changes);
          // absences_recalc_packing and packing_list_bags_recalc (AC-037).
          const changed = (column: string) =>
            column in op.changes && op.changes[column] !== row[column];
          if (op.table === 'absences' && (changed('from_on') || changed('to_on'))) {
            tables = recalcPacking(tables, op.id);
          }
          if (op.table === 'packing_list_bags' && changed('absence_id')) {
            tables = recalcPacking(tables, String(op.changes.absence_id));
          }
        } else {
          if (!Object.hasOwn(WRITABLE_COLUMNS, op.table) || NO_DELETE_TABLES.has(op.table)) {
            throw reject('invalid_change');
          }
          tables = withoutRows(tables, op.table, [op.id]);
        }
      }
      return [tables, { applied: ops.length, results }];
    });
    const household = households.get(householdId);
    const patched = household && householdPatch ? { ...household, ...householdPatch } : household;
    // households_default_store_fkey: a deleted default store is cleared (on delete set null).
    const storeGone =
      typeof patched?.default_store_id === 'string' &&
      !data.get(householdId)?.stores?.[patched.default_store_id];
    if (patched && (householdPatch || storeGone)) {
      households.set(householdId, {
        ...patched,
        ...(storeGone ? { default_store_id: null } : {}),
        updated_at: now(),
      });
    }
    return result;
  }

  // ---------- sync_pull ----------

  function syncPull(userId: string, request: PullRequest): RawPullResult {
    const serverTime = now();
    const mine = new Set(householdsOf(userId));
    const email = profiles.get(userId)?.email;
    const openInvitations = invitations.filter((invitation) => invitation.email === email);
    const visibleHouseholds = new Set([
      ...mine,
      ...openInvitations.map((invitation) => String(invitation.household_id)),
    ]);
    const coMembers = new Set(
      members.filter((m) => mine.has(String(m.household_id))).map((m) => String(m.profile_id)),
    );
    coMembers.add(userId);

    const answer: RawPullResult['households'] = {};
    for (const [householdId, wanted] of Object.entries(request.households)) {
      if (!mine.has(householdId)) continue;
      const tables = data.get(householdId) ?? {};
      const rows: Record<string, (Row & { updated_at: string })[]> = {};
      const tombstones: Tombstone[] = [];
      for (const table of SYNCED_TABLES) {
        const since = wanted.full ? undefined : wanted.since[table];
        rows[table] = Object.values(tables[table] ?? {})
          .filter(
            (row) => since === undefined || compareTimestamps(String(row.updated_at), since) > 0,
          )
          // RLS of notification_settings: only the caller's own row (spec 0013, AC-013).
          .filter((row) => table !== 'notification_settings' || row.member_id === userId)
          .map((row) => {
            const copy = { ...row, updated_at: String(row.updated_at) };
            // The database has no id column for composite keys; the client builds it.
            if (Object.hasOwn(COMPOSITE_TABLES, table)) delete (copy as Partial<Row>).id;
            return copy;
          });
        for (const deletion of deletions) {
          if (deletion.householdId !== householdId || deletion.table !== table) continue;
          if (since !== undefined && compareTimestamps(deletion.deletedAt, since) <= 0) continue;
          tombstones.push({ table, id: deletion.id, deletedAt: deletion.deletedAt });
        }
      }
      answer[householdId] = { full: wanted.full, rows, tombstones };
    }
    return {
      serverTime,
      small: {
        profiles: [...profiles.values()].filter((profile) => coMembers.has(String(profile.id))),
        households: [...households.values()].filter((h) => visibleHouseholds.has(String(h.id))),
        household_members: members.filter((m) => mine.has(String(m.household_id))),
        household_invitations: invitations.filter(
          (invitation) => mine.has(String(invitation.household_id)) || invitation.email === email,
        ),
      },
      households: answer,
    };
  }

  // ---------- per-member rows ----------

  function setMemberRow(
    userId: string,
    table: keyof typeof COMPOSITE_TABLES,
    parentTable: string,
    parentId: string,
    notFound: string,
    row: Record<string, unknown> | undefined,
  ): void {
    const householdId = locate(userId, parentTable, parentId);
    if (!householdId) throw new TransportError('permanent', notFound, 404);
    const [parentColumn] = COMPOSITE_TABLES[table];
    const id = compositeId(table, { [parentColumn]: parentId, member_id: userId });
    transaction(householdId, (tables) => [
      row
        ? withRow(tables, table, { id, [parentColumn]: parentId, member_id: userId, ...row })
        : withoutRows(tables, table, [id]),
      undefined,
    ]);
  }

  /** 0.5 … 5 in half steps, checked unrounded (spec 0011, AC-026); null deletes. Always writes. */
  function rating(stars: number | null): Record<string, unknown> | undefined {
    if (stars === null) return undefined;
    if (!isHalfStar(stars)) throw reject('invalid_stars');
    return { stars };
  }

  // ---------- delete_recipe and restore_recipe (spec 0008, E3 to E6) ----------

  function deleteRecipe(userId: string, recipeId: string, today: string) {
    const householdId = locate(userId, 'recipes', recipeId);
    if (!householdId) throw new TransportError('permanent', 'recipe_not_found', 500);
    const current = new Date(Date.now()).toISOString().slice(0, 10);
    if (!ISO_DATE.test(today) || today < addDays(current, -1) || today > addDays(current, 1)) {
      throw reject('invalid_value');
    }
    let deletion: RecipeDeletion | undefined;
    const result = transaction(householdId, (before) => {
      const recipe = before.recipes?.[recipeId];
      if (!recipe) throw new TransportError('permanent', 'recipe_not_found', 500);
      const title = String(recipe.title);
      const entries = Object.values(before.meal_plan_entries ?? {})
        .filter((entry) => entry.recipe_id === recipeId)
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      const past = entries.filter((entry) => entry.date != null && String(entry.date) <= today);
      // Later and noted entries, and leftovers without a recipe of those (recursively).
      // In the order found: deleted in reverse, leftovers before their dish.
      const found = entries
        .filter((entry) => entry.date == null || String(entry.date) > today)
        .map((entry) => entry.id);
      const removedIds = new Set(found);
      for (let index = 0; index < found.length; index++) {
        for (const entry of Object.values(before.meal_plan_entries ?? {})) {
          if (
            entry.kind === 'leftovers' &&
            entry.recipe_id == null &&
            entry.leftovers_of_entry_id === found[index] &&
            !removedIds.has(entry.id)
          ) {
            removedIds.add(entry.id);
            found.push(entry.id);
          }
        }
      }
      const later = Object.values(before.meal_plan_entries ?? {})
        .filter((entry) => removedIds.has(entry.id))
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      const converted = past.map((entry) => ({
        id: entry.id,
        kind: entry.kind,
        recipe_id: entry.recipe_id,
        text: entry.text ?? null,
        variants: entry.variants,
        new_text: entry.kind === 'leftovers' ? `Reste von ${title}` : title,
      }));
      const parentRows = (table: string) =>
        Object.values(before[table] ?? {}).filter((row) => row.recipe_id === recipeId);
      const collectionRecipes = Object.values(before.collection_recipes ?? {})
        .filter((row) => row.collection_id === recipeId || row.recipe_id === recipeId)
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      deletion = {
        householdId,
        recipeId,
        deletedBy: userId,
        deletedAt: Date.now(),
        recipe,
        ratings: parentRows('recipe_ratings').map((row) => ({
          member_id: String(row.member_id),
          stars: row.stars,
        })),
        favorites: parentRows('recipe_favorites').map((row) => String(row.member_id)),
        converted,
        removed: later,
        collectionRecipes,
      };
      let tables = before;
      for (const entry of converted) {
        const row = tables.meal_plan_entries?.[entry.id];
        if (!row) continue;
        tables = withRow(tables, 'meal_plan_entries', {
          ...row,
          kind: 'text',
          recipe_id: null,
          variants: [],
          text: entry.new_text,
        });
      }
      tables = withoutRows(tables, 'meal_plan_entries', [...found].reverse());
      tables = withoutRows(tables, 'recipes', [recipeId]);
      return [
        tables,
        {
          converted: past.length,
          removed: later.length,
          collections: collectionRecipes.filter((row) => row.recipe_id === recipeId).length,
        },
      ];
    });
    for (const [key, kept] of recipeDeletions) {
      if (kept.householdId === householdId && kept.deletedAt <= Date.now() - RESTORABLE_MS) {
        recipeDeletions.delete(key);
      }
    }
    if (deletion) recipeDeletions.set(`${householdId}:${recipeId}`, deletion);
    return result;
  }

  function restoreRecipe(userId: string, recipeId: string): boolean {
    const deletion = [...recipeDeletions.values()].find(
      (candidate) =>
        candidate.recipeId === recipeId &&
        candidate.deletedBy === userId &&
        isMember(userId, candidate.householdId) &&
        candidate.deletedAt > Date.now() - RESTORABLE_MS,
    );
    if (!deletion) throw new TransportError('permanent', 'recipe_not_restorable', 500);
    const { householdId } = deletion;
    if (data.get(householdId)?.recipes?.[recipeId]) return false;
    if ([...data.values()].some((tables) => tables.recipes?.[recipeId])) {
      throw new TransportError('permanent', 'recipe_not_restorable', 500);
    }
    const current = new Set(memberIdsOf(householdId));
    transaction(householdId, (before) => {
      const recipe: Row = { ...withoutTimestamps(deletion.recipe), id: recipeId };
      let tables = withRow(before, 'recipes', recipe);
      checkIngredients(recipe.ingredients, tables);
      checkRow(householdId, 'recipes', recipe, tables);
      for (const rating of deletion.ratings) {
        if (!current.has(rating.member_id)) continue;
        const id = compositeId('recipe_ratings', { recipe_id: recipeId, ...rating });
        tables = withRow(tables, 'recipe_ratings', { id, recipe_id: recipeId, ...rating });
      }
      for (const memberId of deletion.favorites) {
        if (!current.has(memberId)) continue;
        const row = { recipe_id: recipeId, member_id: memberId };
        tables = withRow(tables, 'recipe_favorites', {
          id: compositeId('recipe_favorites', row),
          ...row,
        });
      }
      // Spec 0009, E11: the rows whose other side still exists, in order; the trigger runs again.
      const rows = [...deletion.collectionRecipes].sort(
        (a, b) =>
          String(a.collection_id).localeCompare(String(b.collection_id)) ||
          Number(a.sort) - Number(b.sort) ||
          (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      );
      for (const row of rows) {
        const other = row.collection_id === recipeId ? row.recipe_id : row.collection_id;
        if (!tables.recipes?.[String(other)] || tables.collection_recipes?.[row.id]) continue;
        const restored = { ...withoutTimestamps(row) };
        const twice = Object.values(tables.collection_recipes ?? {}).some(
          (existing) =>
            existing.collection_id === row.collection_id && existing.recipe_id === row.recipe_id,
        );
        if (twice) continue;
        checkCollectionRecipeInsert(restored, tables);
        tables = withRow(tables, 'collection_recipes', restored);
      }
      const removedIds = new Set(deletion.removed.map((entry) => entry.id));
      for (const entry of deletion.removed) {
        if (tables.meal_plan_entries?.[entry.id]) continue;
        const source = entry.leftovers_of_entry_id;
        const keepSource =
          source == null ||
          Boolean(before.meal_plan_entries?.[String(source)]) ||
          removedIds.has(String(source));
        const eaters = Array.isArray(entry.eater_ids) ? entry.eater_ids.map(String) : [];
        tables = withRow(tables, 'meal_plan_entries', {
          ...withoutTimestamps(entry),
          leftovers_of_entry_id: keepSource ? (source ?? null) : null,
          eater_ids: eaters.filter((id) => current.has(id)),
          cook_id: current.has(String(entry.cook_id)) ? entry.cook_id : null,
        });
      }
      for (const entry of deletion.converted) {
        const row = tables.meal_plan_entries?.[entry.id];
        if (!row || row.kind !== 'text' || row.recipe_id != null || row.text !== entry.new_text) {
          continue;
        }
        tables = withRow(tables, 'meal_plan_entries', {
          ...row,
          kind: entry.kind,
          recipe_id: entry.recipe_id,
          text: entry.text,
          variants: entry.variants,
        });
      }
      return [tables, undefined];
    });
    recipeDeletions.delete(`${householdId}:${recipeId}`);
    return true;
  }

  // ---------- photo bucket (policies of storage.objects) ----------

  /** The household of a photo path the user may use, or undefined (wrong shape, foreign). */
  function mediaHousehold(userId: string, path: string): string | undefined {
    const [, householdId, , file] = MEDIA_PATH.exec(path) ?? [];
    if (!householdId || !file || !PHOTO_FILE.test(file)) return undefined;
    return isMember(userId, householdId) ? householdId : undefined;
  }

  // ---------- the transport per user ----------

  function transport(userId: string): Transport {
    return {
      applyChanges: (householdId, ops) =>
        run(userId, 'apply_changes', () => applyChanges(userId, householdId, ops)),

      setItemChecked: (requestedItemId, checked, seenCheckSeq) =>
        run(userId, 'set_shopping_item_checked', () => {
          const resolved = resolveStoreItem(userId, requestedItemId);
          if (!resolved) return null;
          const { householdId, itemId, replaced } = resolved;
          return transaction(householdId, (tables) => {
            const item = tables.shopping_items?.[itemId];
            if (!item) return [tables, null];
            const seq = Number(item.check_seq ?? 0);
            const answer = (row: Row) => ({
              item_id: row.id,
              checked: row.checked === true,
              check_seq: Number(row.check_seq ?? 0),
            });
            if (checked) {
              if (item.checked === true) return [tables, answer(item)];
              const next = {
                ...item,
                checked: true,
                checked_at: now(),
                checked_by: userId,
                check_seq: seq + 1,
                not_available: false,
              };
              return [withRow(tables, 'shopping_items', next), answer(next)];
            }
            // Checking wins: unchecking only applies to the state the device has seen; the seq
            // seen for a merged-away item is the old item's.
            if (replaced || item.checked !== true || seq !== seenCheckSeq) {
              return [tables, answer(item)];
            }
            const open = Object.values(tables.shopping_items ?? {}).find(
              (other) =>
                other.id !== itemId &&
                other.article_id === item.article_id &&
                other.checked !== true,
            );
            if (open) {
              let next = tables;
              for (const contribution of Object.values(tables.shopping_contributions ?? {})) {
                if (contribution.item_id === itemId) {
                  next = withRow(next, 'shopping_contributions', {
                    ...contribution,
                    item_id: open.id,
                  });
                }
              }
              next = withoutRows(next, 'shopping_items', [itemId]);
              return [next, answer(open)];
            }
            const next = {
              ...item,
              checked: false,
              checked_at: null,
              checked_by: null,
              check_seq: seq + 1,
            };
            return [withRow(tables, 'shopping_items', next), answer(next)];
          });
        }),

      setItemNotAvailable: (requestedItemId, value) =>
        run(userId, 'set_shopping_item_not_available', () => {
          const resolved = resolveStoreItem(userId, requestedItemId);
          if (!resolved) return null;
          const { householdId, itemId } = resolved;
          return transaction(householdId, (tables) => {
            const item = tables.shopping_items?.[itemId];
            if (!item) return [tables, null];
            return [
              withRow(tables, 'shopping_items', { ...item, not_available: value }),
              { item_id: itemId, not_available: value },
            ];
          });
        }),

      addShoppingContributions: (requestedHouseholdId, entries) =>
        run(userId, 'add_shopping_contributions', () => {
          const householdId = memberOf(userId, requestedHouseholdId);
          // Like the RPC: ≤ 200 entries, ≤ 1000 contributions (what one call adds, one call removes).
          const contributions = entries.reduce((sum, entry) => sum + entry.contributions.length, 0);
          if (entries.length > 200 || contributions > 1000) throw reject('too_many_changes');
          return transaction(householdId, (tables) =>
            addContributions(tables, householdId, entries),
          );
        }),

      setPackingItemsPacked: (householdId, changes) =>
        run(userId, 'set_packing_items_packed', () =>
          setPackingItemsPacked(userId, householdId, changes),
        ),

      assignArticleArea: (articleId, areaId) =>
        run(userId, 'assign_article_area', () => {
          const householdId = locate(userId, 'articles', articleId);
          if (!householdId) return null;
          return transaction(householdId, (tables) => {
            const article = tables.articles?.[articleId];
            if (!article || (areaId !== null && !tables.areas?.[areaId])) return [tables, null];
            return [
              withRow(tables, 'articles', { ...article, area_id: areaId }),
              { article_id: articleId, area_id: areaId },
            ];
          });
        }),

      clearCheckedItems: (requestedHouseholdId) =>
        run(userId, 'clear_checked_items', () => {
          const householdId = memberOf(userId, requestedHouseholdId);
          return transaction(householdId, (tables) => {
            const checked = Object.values(tables.shopping_items ?? {}).filter(
              (item) => item.checked === true,
            );
            const cleared = checked.map((item) => ({
              item,
              contributions: Object.values(tables.shopping_contributions ?? {}).filter(
                (contribution) => contribution.item_id === item.id,
              ),
            }));
            assertRestorableSize(cleared);
            return [
              withoutRows(
                tables,
                'shopping_items',
                checked.map((item) => item.id),
              ),
              cleared,
            ];
          });
        }),

      clearShoppingList: (requestedHouseholdId) =>
        run(userId, 'clear_shopping_list', () => {
          const householdId = memberOf(userId, requestedHouseholdId);
          return transaction(householdId, (tables) => {
            const oldestFirst = (a: Row, b: Row) => newestFirst(b, a);
            const items = Object.values(tables.shopping_items ?? {}).sort(oldestFirst);
            const cleared = items.map((item) => ({
              item,
              contributions: Object.values(tables.shopping_contributions ?? {})
                .filter((contribution) => contribution.item_id === item.id)
                .sort(oldestFirst),
            }));
            assertRestorableSize(cleared);
            return [
              withoutRows(
                tables,
                'shopping_items',
                items.map((item) => item.id),
              ),
              cleared,
            ];
          });
        }),

      adjustItemCount: (itemId, delta) =>
        run(userId, 'adjust_item_count', () => {
          if (!Number.isInteger(delta) || delta === 0 || delta < -99 || delta > 99) {
            throw reject('invalid_value');
          }
          const householdId = locate(userId, 'shopping_items', itemId);
          if (!householdId) return null;
          return AdjustResultSchema.parse(
            transaction(householdId, (tables) => adjustCount(tables, itemId, delta)),
          );
        }),

      restoreClearedItems: (requestedHouseholdId, items) =>
        run(userId, 'restore_cleared_items', () => {
          const householdId = memberOf(userId, requestedHouseholdId);
          assertRestorableSize(items);
          return transaction(householdId, (tables) => {
            let next = tables;
            let restored = 0;
            for (const { item, contributions } of items) {
              const id = String(item.id);
              if (item.household_id !== householdId || item.article_id == null) {
                throw reject('invalid_entries');
              }
              // Missing = checked (like the RPC).
              const checked = item.checked == null ? true : item.checked === true;
              // An open item joins one that is open on the list again meanwhile (AC-037).
              let targetId = checked
                ? undefined
                : Object.values(next.shopping_items ?? {}).find(
                    (other) => other.article_id === item.article_id && other.checked !== true,
                  )?.id;
              let inserted = false;
              if (targetId === undefined) {
                if (!next.shopping_items?.[id]) {
                  next = withRow(next, 'shopping_items', {
                    ...item,
                    id,
                    checked,
                    checked_at: checked ? (item.checked_at ?? now()) : null,
                    checked_by: checked ? (item.checked_by ?? null) : null,
                    check_seq: item.check_seq ?? 0,
                    not_available: item.not_available ?? false,
                  });
                  inserted = true;
                }
                targetId = id;
              }
              let added = 0;
              for (const contribution of contributions ?? []) {
                const contributionId = String(contribution.id);
                if (next.shopping_contributions?.[contributionId]) continue;
                next = withRow(next, 'shopping_contributions', {
                  ...contribution,
                  id: contributionId,
                  item_id: targetId,
                });
                added += 1;
              }
              if (inserted || (targetId !== id && added > 0)) restored += 1;
            }
            return [next, restored];
          });
        }),

      removeContributions: (ids) =>
        run(userId, 'remove_contributions', () => {
          if (ids.length > 1000) throw reject('too_many_changes');
          let removed = 0;
          for (const householdId of householdsOf(userId)) {
            const mineIds = ids.filter((id) => data.get(householdId)?.shopping_contributions?.[id]);
            if (mineIds.length === 0) continue;
            removed += transaction(householdId, (tables) =>
              removeContributionRows(tables, mineIds),
            );
          }
          return removed;
        }),

      deleteArticle: (articleId) =>
        run(userId, 'delete_article', () => {
          const householdId = locate(userId, 'articles', articleId);
          if (!householdId) throw new TransportError('permanent', 'article_not_found', 500);
          return transaction(householdId, (tables) => {
            const article = tables.articles?.[articleId];
            if (!article) throw new TransportError('permanent', 'article_not_found', 500);
            const inRecipe = Object.values(tables.recipes ?? {}).some(
              (recipe) =>
                Array.isArray(recipe.ingredients) &&
                (recipe.ingredients as { articleId?: unknown }[]).some(
                  (ingredient) => ingredient.articleId === articleId,
                ),
            );
            const onList = Object.values(tables.shopping_items ?? {}).some(
              (item) => item.article_id === articleId,
            );
            if (inRecipe || onList) throw reject('article_in_use');
            return [withoutRows(tables, 'articles', [articleId]), { ...article }];
          });
        }),

      mergeArticles: (sourceId, targetId) =>
        run(userId, 'merge_articles', () => {
          if (!sourceId || !targetId || sourceId === targetId) throw reject('invalid_value');
          const householdId = locate(userId, 'articles', sourceId);
          const notFound = () => new TransportError('permanent', 'article_not_found', 500);
          if (!householdId || !data.get(householdId)?.articles?.[targetId]) throw notFound();
          let replaced: { from: string; to: string } | undefined;
          const result = transaction(householdId, (before) => {
            const source = before.articles?.[sourceId];
            const target = before.articles?.[targetId];
            if (!source || !target) throw notFound();
            let tables = before;
            // 1. Recipes.
            let recipes = 0;
            for (const recipe of Object.values(tables.recipes ?? {})) {
              const ingredients = Array.isArray(recipe.ingredients)
                ? (recipe.ingredients as Record<string, unknown>[])
                : [];
              if (!ingredients.some((ingredient) => ingredient.articleId === sourceId)) continue;
              recipes += 1;
              tables = withRow(tables, 'recipes', {
                ...recipe,
                ingredients: ingredients.map((ingredient) =>
                  ingredient.articleId === sourceId
                    ? { ...ingredient, articleId: targetId }
                    : ingredient,
                ),
              });
            }
            // 2. Both open on the list: one item.
            let items = 0;
            const openOf = (articleId: string) =>
              Object.values(tables.shopping_items ?? {}).find(
                (item) => item.article_id === articleId && item.checked !== true,
              );
            const sourceOpen = openOf(sourceId);
            const targetOpen = openOf(targetId);
            if (sourceOpen && targetOpen) {
              for (const row of Object.values(tables.shopping_contributions ?? {})) {
                if (row.item_id === sourceOpen.id) {
                  tables = withRow(tables, 'shopping_contributions', {
                    ...row,
                    item_id: targetOpen.id,
                  });
                }
              }
              tables = withoutRows(tables, 'shopping_items', [sourceOpen.id]);
              replaced = { from: sourceOpen.id, to: targetOpen.id };
              items += 1;
            }
            // 3. Every other item of the source.
            for (const item of Object.values(tables.shopping_items ?? {})) {
              if (item.article_id !== sourceId) continue;
              tables = withRow(tables, 'shopping_items', { ...item, article_id: targetId });
              items += 1;
            }
            // 6. Names of the source as synonyms of the target, without duplicate keys.
            const synonyms: string[] = [];
            const keys: string[] = [];
            const pairs = (row: Row): [string, string][] =>
              (Array.isArray(row.synonyms) ? row.synonyms.map(String) : []).map(
                (synonym, index) => [synonym, keysOf(row)[index] ?? ''],
              );
            for (const [synonym, key] of [
              ...pairs(target),
              [String(source.name), String(source.name_key)] as [string, string],
              ...pairs(source),
            ]) {
              if (key === '' || key === target.name_key || keys.includes(key)) continue;
              synonyms.push(synonym);
              keys.push(key);
            }
            if (
              synonyms.length > MAX_SYNONYMS ||
              totalLength(synonyms) > MAX_SYNONYMS_LENGTH ||
              totalLength(keys) > MAX_SYNONYMS_LENGTH
            ) {
              throw reject('too_many_synonyms');
            }
            // 4. and 5.: empty values of the target filled, the source deleted.
            tables = withoutRows(tables, 'articles', [sourceId]);
            tables = withRow(tables, 'articles', {
              ...target,
              area_id: target.area_id ?? source.area_id ?? null,
              diet: target.diet === 'unknown' ? source.diet : target.diet,
              default_shopping_rule:
                target.default_shopping_rule ?? source.default_shopping_rule ?? null,
              needs_review: false,
              synonyms,
              synonym_keys: keys,
            });
            return [tables, { recipes, items }];
          });
          if (replaced) {
            const { from, to } = replaced;
            deletions = deletions.map((deletion) =>
              deletion.householdId === householdId &&
              deletion.table === 'shopping_items' &&
              deletion.id === from &&
              deletion.replacedBy === undefined
                ? { ...deletion, replacedBy: to }
                : deletion,
            );
          }
          return result;
        }),

      deleteRecipe: (recipeId, today) =>
        run(userId, 'delete_recipe', () => deleteRecipe(userId, recipeId, today)),
      restoreRecipe: (recipeId) =>
        run(userId, 'restore_recipe', () => restoreRecipe(userId, recipeId)),

      mergeAreas: (sourceId, targetId) =>
        run(userId, 'merge_areas', () => {
          if (!sourceId || !targetId || sourceId === targetId) throw reject('invalid_value');
          const householdId = locate(userId, 'areas', sourceId);
          const notFound = () => new TransportError('permanent', 'area_not_found', 500);
          if (!householdId || !data.get(householdId)?.areas?.[targetId]) throw notFound();
          return transaction(householdId, (before) => {
            let tables = before;
            let moved = 0;
            for (const article of Object.values(tables.articles ?? {})) {
              if (article.area_id !== sourceId) continue;
              tables = withRow(tables, 'articles', { ...article, area_id: targetId });
              moved += 1;
            }
            for (const store of Object.values(tables.stores ?? {})) {
              const order = Array.isArray(store.area_order) ? store.area_order.map(String) : [];
              const hidden = Array.isArray(store.hidden_area_ids)
                ? store.hidden_area_ids.map(String)
                : [];
              if (!order.includes(sourceId) && !hidden.includes(sourceId)) continue;
              tables = withRow(tables, 'stores', {
                ...store,
                area_order: order.filter((id) => id !== sourceId),
                hidden_area_ids: hidden.filter((id) => id !== sourceId),
              });
            }
            return [withoutRows(tables, 'areas', [sourceId]), moved];
          });
        }),

      setRecipeFavorite: (recipeId, favorite) =>
        run(userId, 'set_recipe_favorite', () =>
          setMemberRow(
            userId,
            'recipe_favorites',
            'recipes',
            recipeId,
            'recipe_not_found',
            favorite ? {} : undefined,
          ),
        ),
      setRecipeRating: (recipeId, stars) =>
        run(userId, 'set_recipe_rating', () =>
          setMemberRow(
            userId,
            'recipe_ratings',
            'recipes',
            recipeId,
            'recipe_not_found',
            rating(stars),
          ),
        ),
      setRestaurantFavorite: (restaurantId, favorite) =>
        run(userId, 'set_restaurant_favorite', () =>
          setMemberRow(
            userId,
            'restaurant_favorites',
            'restaurants',
            restaurantId,
            'restaurant_not_found',
            favorite ? {} : undefined,
          ),
        ),
      setRestaurantRating: (restaurantId, stars) =>
        run(userId, 'set_restaurant_rating', () =>
          setMemberRow(
            userId,
            'restaurant_ratings',
            'restaurants',
            restaurantId,
            'restaurant_not_found',
            rating(stars),
          ),
        ),
      setActivityFavorite: (activityId, favorite) =>
        run(userId, 'set_activity_favorite', () =>
          setMemberRow(
            userId,
            'activity_favorites',
            'activities',
            activityId,
            'activity_not_found',
            favorite ? {} : undefined,
          ),
        ),
      setActivityRating: (activityId, stars) =>
        run(userId, 'set_activity_rating', () =>
          setMemberRow(
            userId,
            'activity_ratings',
            'activities',
            activityId,
            'activity_not_found',
            rating(stars),
          ),
        ),
      setFeedbackVote: (feedbackId, voted) =>
        run(userId, 'set_feedback_vote', () =>
          setMemberRow(
            userId,
            'feedback_votes',
            'feedback',
            feedbackId,
            'feedback_not_found',
            voted ? {} : undefined,
          ),
        ),

      createHousehold: (name) =>
        run(userId, 'create_household', () => {
          const trimmed = name.trim();
          if (!trimmed || trimmed.length > 80) throw reject('invalid_name');
          const id = crypto.randomUUID();
          const time = now();
          households.set(id, {
            id,
            name: trimmed,
            timezone: 'Europe/Berlin',
            meal_slots: [
              { id: crypto.randomUUID(), name: 'Vormittag', sort: 0 },
              { id: crypto.randomUUID(), name: 'Mittag', sort: 1 },
              { id: crypto.randomUUID(), name: 'Abend', sort: 2 },
            ],
            default_store_id: null,
            created_at: time,
            updated_at: time,
          });
          members.push({
            household_id: id,
            profile_id: userId,
            created_at: time,
            updated_at: time,
          });
          createNotificationSettings(id, userId);
          return id;
        }),

      inviteMember: (householdId, email) =>
        run(userId, 'invite_member', () => {
          if (!isMember(userId, householdId))
            throw new TransportError('permanent', 'not_member', 403);
          const address = email.trim().toLowerCase();
          if (!/^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/.test(address)) throw reject('invalid_email');
          const already = members.some(
            (m) =>
              m.household_id === householdId &&
              profiles.get(String(m.profile_id))?.email === address,
          );
          if (already) throw new TransportError('permanent', 'already_member', 409);
          const time = now();
          const id = crypto.randomUUID();
          invitations.push({
            id,
            household_id: householdId,
            email: address,
            invited_by: userId,
            created_at: time,
            updated_at: time,
          });
          notify(householdId);
          return id;
        }),

      acceptInvitation: (invitationId) =>
        run(userId, 'accept_invitation', () => {
          const email = profiles.get(userId)?.email;
          const invitation = invitations.find(
            (candidate) => candidate.id === invitationId && candidate.email === email,
          );
          if (!invitation) throw new TransportError('permanent', 'invitation_not_found', 404);
          // Spec 0027, Decision 1: accepting deletes the invitation.
          const time = now();
          invitations = invitations.filter((candidate) => candidate !== invitation);
          const householdId = String(invitation.household_id);
          members.push({
            household_id: householdId,
            profile_id: userId,
            created_at: time,
            updated_at: time,
          });
          createNotificationSettings(householdId, userId);
          notify(householdId);
          return householdId;
        }),

      declineInvitation: (invitationId) =>
        run(userId, 'decline_invitation', () => {
          const email = profiles.get(userId)?.email;
          const before = invitations.length;
          invitations = invitations.filter(
            (candidate) => !(candidate.id === invitationId && candidate.email === email),
          );
          if (invitations.length === before) {
            throw new TransportError('permanent', 'invitation_not_found', 404);
          }
        }),

      removeMember: (householdId, profileId) =>
        run(userId, 'remove_member', () => {
          if (!isMember(userId, householdId))
            throw new TransportError('permanent', 'not_member', 403);
          if (!isMember(profileId, householdId)) {
            throw new TransportError('permanent', 'member_not_found', 404);
          }
          if (members.filter((m) => m.household_id === householdId).length === 1) {
            throw new TransportError('permanent', 'last_member', 400);
          }
          members = members.filter(
            (m) => !(m.household_id === householdId && m.profile_id === profileId),
          );
          // on delete set null (member_id / packed_by) of the packing tables (spec 0012); the
          // notification settings go with the member (on delete cascade, spec 0013).
          transaction(householdId, (tables) => {
            let next = withoutRows(
              tables,
              'notification_settings',
              Object.values(tables.notification_settings ?? {})
                .filter((row) => row.member_id === profileId)
                .map((row) => row.id),
            );
            for (const reference of PACKING_MEMBER_COLUMNS) {
              for (const row of Object.values(next[reference.table] ?? {})) {
                if (row[reference.column] !== profileId) continue;
                next = withRow(next, reference.table, { ...row, [reference.column]: null });
              }
            }
            return [next, undefined];
          });
          notify(householdId);
        }),

      withdrawInvitation: (invitationId) =>
        run(userId, 'withdraw_invitation', () => {
          requireUser(userId);
          const invitation = invitations.find(
            (candidate) =>
              candidate.id === invitationId && isMember(userId, String(candidate.household_id)),
          );
          if (!invitation) throw new TransportError('permanent', 'invitation_not_found', 404);
          invitations = invitations.filter((candidate) => candidate !== invitation);
          notify(String(invitation.household_id));
        }),

      updateProfile: (profile) =>
        run(userId, 'update_profile', () => {
          requireUser(userId);
          const name = profile.name.trim();
          if (!name || [...name].length > 80) throw reject('invalid_name');
          if (!PROFILE_COLORS.some((color) => color.hex === profile.color)) {
            throw reject('invalid_color');
          }
          if (!['vegan', 'vegetarian', 'flexible'].includes(profile.dietPreference)) {
            throw reject('invalid_diet');
          }
          const keys = profile.dislikes.map((dislike) => dislike.toLowerCase());
          const dislikesValid =
            profile.dislikes.length <= 50 &&
            new Set(keys).size === keys.length &&
            profile.dislikes.every(
              (dislike) =>
                dislike === dislike.trim() && [...dislike].length >= 1 && [...dislike].length <= 40,
            );
          if (!dislikesValid) throw reject('invalid_dislikes');
          const current = profiles.get(userId);
          if (!current) throw new TransportError('permanent', 'not_authenticated', 401);
          profiles.set(userId, {
            ...current,
            name,
            color: profile.color,
            diet_preference: profile.dietPreference,
            dislikes: [...profile.dislikes],
            updated_at: now(),
          });
          for (const householdId of householdsOf(userId)) notify(householdId);
        }),

      householdMediaNames: (householdId) =>
        run(userId, 'household_media_names', () => {
          requireUser(userId);
          if (!isMember(userId, householdId)) {
            throw new TransportError('permanent', 'not_member', 403);
          }
          if (memberIdsOf(householdId).length > 1) throw reject('not_last_member');
          return [...media.keys()]
            .filter((path) => mediaHousehold(userId, path) === householdId)
            .sort();
        }),

      deleteHousehold: (householdId) =>
        run(userId, 'delete_household', () => {
          requireUser(userId);
          if (!isMember(userId, householdId)) {
            throw new TransportError('permanent', 'not_member', 403);
          }
          if (memberIdsOf(householdId).length > 1) throw reject('not_last_member');
          if ([...media.keys()].some((path) => path.startsWith(`${householdId}/`))) {
            throw reject('media_remaining');
          }
          // One transaction with the cascade: rows, members, invitations, tombstones.
          households.delete(householdId);
          members = members.filter((member) => member.household_id !== householdId);
          invitations = invitations.filter((invitation) => invitation.household_id !== householdId);
          data.delete(householdId);
          deletions = deletions.filter((tombstone) => tombstone.householdId !== householdId);
          for (const [key, deletion] of recipeDeletions) {
            if (deletion.householdId === householdId) recipeDeletions.delete(key);
          }
          notify(householdId);
        }),

      registerPushSubscription: (endpoint, p256dh, auth, deviceLabel) =>
        run(userId, 'register_push_subscription', () =>
          registerPushSubscription(userId, endpoint, p256dh, auth, deviceLabel),
        ),
      setPushSubscriptionEnabled: (endpoint, enabled) =>
        run(userId, 'set_push_subscription_enabled', () => {
          requireUser(userId);
          const own = ownSubscription(userId, endpoint);
          if (!own) throw new TransportError('permanent', 'not_found', 404);
          pushSubscriptions = pushSubscriptions.map((subscription) =>
            subscription === own ? { ...own, enabled } : subscription,
          );
        }),
      unregisterPushSubscription: (endpoint) =>
        run(userId, 'unregister_push_subscription', () => {
          requireUser(userId);
          pushSubscriptions = pushSubscriptions.filter(
            (subscription) =>
              !(subscription.endpoint === endpoint && subscription.profileId === userId),
          );
        }),
      removePushSubscription: (id) =>
        run(userId, 'remove_push_subscription', () => {
          requireUser(userId);
          const before = pushSubscriptions.length;
          pushSubscriptions = pushSubscriptions.filter(
            (subscription) => !(subscription.id === id && subscription.profileId === userId),
          );
          return pushSubscriptions.length < before;
        }),
      listPushSubscriptions: (currentEndpoint) =>
        run(userId, 'list_push_subscriptions', () => {
          requireUser(userId);
          const current = (subscription: PushSubscriptionRecord) =>
            subscription.endpoint === currentEndpoint;
          return pushSubscriptions
            .filter((subscription) => subscription.profileId === userId)
            .sort(
              (a, b) =>
                Number(current(b)) - Number(current(a)) ||
                compareTimestamps(a.createdAt, b.createdAt) ||
                (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
            )
            .map((subscription) => ({
              id: subscription.id,
              device_label: subscription.deviceLabel,
              status: subscription.goneAt
                ? ('unreachable' as const)
                : subscription.enabled
                  ? ('active' as const)
                  : ('off' as const),
              is_current: current(subscription),
              created_at: subscription.createdAt,
              last_success_at: subscription.lastSuccessAt,
            }));
        }),
      sendTestPush: (endpoint) =>
        run(userId, 'send_test_push', () => {
          requireUser(userId);
          const own = ownSubscription(userId, endpoint);
          if (!own || !own.enabled || own.goneAt !== null) {
            throw new TransportError('permanent', 'not_found', 404);
          }
          if (!pushConfigured) throw reject('push_not_configured');
          const since = Date.now() - TEST_PUSH_WINDOW_MS;
          const recent = testDeliveries.filter(
            (delivery) => delivery.profileId === userId && delivery.at > since,
          );
          if (recent.length >= MAX_TEST_PUSHES) throw reject('rate_limited');
          testDeliveries.push({ subscriptionId: own.id, profileId: userId, at: Date.now() });
        }),

      resolveMapsLink: (url) =>
        run(userId, 'resolve-maps-link', () => {
          const reply = mapsLinks.get(url);
          if (!reply) throw new TransportError('permanent', 'not_a_maps_link', 422);
          return reply;
        }),
      askAssistant: (request) =>
        run(userId, 'ai-assistant', () => {
          if (!ai.assistant) throw aiUnavailable();
          return ai.assistant(request);
        }),
      aiSearch: (request) =>
        run(userId, 'ai-search', () => {
          if (!ai.search) throw aiUnavailable();
          return ai.search(request);
        }),
      speechToken: () =>
        run(userId, 'speech-token', () => {
          if (!ai.speechToken) throw aiUnavailable();
          return ai.speechToken();
        }),

      // The Storage API answers a refused request with its status (413, 415, 403, 409).
      uploadMedia: (path, photo) =>
        run(userId, 'storage_upload', () => {
          if (photo.type !== 'image/jpeg') {
            throw new TransportError('permanent', 'invalid_mime', 415);
          }
          if (photo.size > MEDIA_MAX_BYTES) throw new TransportError('permanent', 'too_large', 413);
          if (!mediaHousehold(userId, path)) {
            throw new TransportError('permanent', 'access_denied', 403);
          }
          if (media.has(path)) throw new TransportError('permanent', 'already_exists', 409);
          media.set(path, photo);
        }),
      downloadMedia: (path, signal) =>
        run(userId, 'storage_download', () => {
          if (signal?.aborted) throw new TransportError('transient', 'aborted', 0);
          const photo = mediaHousehold(userId, path) ? media.get(path) : undefined;
          if (!photo) throw new TransportError('permanent', 'not_found', 404);
          return photo;
        }),
      removeMedia: (paths) =>
        run(userId, 'storage_remove', () => {
          for (const path of paths) if (mediaHousehold(userId, path)) media.delete(path);
        }),

      syncPull: (request) =>
        run(userId, 'sync_pull', () => withCompositeIds(syncPull(userId, request))),

      subscribe: (householdId, onSignal) => {
        const listeners = subscribers.get(householdId) ?? new Set();
        subscribers.set(householdId, listeners);
        // Realtime authorises per message (RLS on realtime.messages): no signal for non-members.
        const listener = () => {
          if (isMember(userId, householdId)) onSignal();
        };
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    };
  }

  return {
    transport,
    calls,
    addProfile(profile) {
      const time = now();
      profiles.set(profile.id, {
        color: '#3E6C8E',
        diet_preference: 'flexible',
        dislikes: [],
        ...profile,
        email: profile.email.toLowerCase(),
        created_at: time,
        updated_at: time,
      });
    },
    addHousehold(household, memberIds) {
      const time = now();
      households.set(household.id, {
        meal_slots: [],
        default_store_id: null,
        timezone: 'Europe/Berlin',
        ...household,
        created_at: time,
        updated_at: time,
      });
      for (const profileId of memberIds) {
        members.push({
          household_id: household.id,
          profile_id: profileId,
          created_at: time,
          updated_at: time,
        });
        createNotificationSettings(household.id, profileId);
      }
    },
    insertRows(householdId, rows) {
      const before = data.get(householdId) ?? {};
      let after = before;
      for (const [table, list] of Object.entries(rows)) {
        for (const row of list) {
          const defaults =
            table === 'shopping_items'
              ? {
                  checked: false,
                  checked_at: null,
                  checked_by: null,
                  check_seq: 0,
                  not_available: false,
                }
              : table === 'packing_items'
                ? OPEN_PACKING_ITEM
                : {};
          after = withRow(after, table, { ...defaults, ...row });
        }
      }
      commit(householdId, before, after);
    },
    deleteRow(householdId, table, id) {
      const before = data.get(householdId) ?? {};
      commit(householdId, before, withoutRows(before, table, [id], false));
    },
    rows: (householdId, table) => Object.values(data.get(householdId)?.[table] ?? {}),
    row: (householdId, table, id) => data.get(householdId)?.[table]?.[id],
    failNext(fn, error, options = {}) {
      failures.push({ fn, error, afterApply: options.afterApply ?? false });
    },
    setMapsLink(url, reply) {
      mapsLinks.set(url, reply);
    },
    setAi(next) {
      ai = next;
    },
    media: (path) => media.get(path),
    setPushConfigured(configured) {
      pushConfigured = configured;
    },
    markPushGone(endpoint) {
      const time = now();
      pushSubscriptions = pushSubscriptions.map((subscription) =>
        subscription.endpoint === endpoint ? { ...subscription, goneAt: time } : subscription,
      );
    },
    testPushes: () =>
      testDeliveries.map(({ subscriptionId, profileId }) => ({ subscriptionId, profileId })),
    purgeDeletionsBefore(before) {
      deletions = deletions.filter(
        (deletion) => compareTimestamps(deletion.deletedAt, before) >= 0,
      );
    },
  };
}
