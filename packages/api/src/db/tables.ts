// The synced tables and what a client may write to them. Mirrors the database: the grant matrix
// (column-level grants) and the allowlist of `apply_changes` (tmp/brief/db-handoff.md, T5).
import type { PullResult, SyncRow } from '@housekeeping/core';

import type { RawPullResult } from '../transport';

/** Household-scoped tables whose rows have their own `id`. */
export const ID_TABLES = [
  'areas',
  'articles',
  'stores',
  'recipes',
  'restaurants',
  'activities',
  'absences',
  'feedback',
  'chores',
  'chore_events',
  'meal_plan_entries',
  'shopping_items',
  'shopping_contributions',
] as const;

/**
 * Per-member tables keyed by (household_id, a, b). The client builds the id "a:b" like the
 * server's `deleted_records.record_id`, so tombstones and rows meet on the same id.
 */
export const COMPOSITE_TABLES = {
  recipe_favorites: ['recipe_id', 'member_id'],
  recipe_ratings: ['recipe_id', 'member_id'],
  restaurant_favorites: ['restaurant_id', 'member_id'],
  restaurant_ratings: ['restaurant_id', 'member_id'],
  activity_favorites: ['activity_id', 'member_id'],
  activity_ratings: ['activity_id', 'member_id'],
  feedback_votes: ['feedback_id', 'member_id'],
} as const satisfies Record<string, readonly [string, string]>;

export type IdTable = (typeof ID_TABLES)[number];
export type CompositeTable = keyof typeof COMPOSITE_TABLES;
export type HouseholdTable = IdTable | CompositeTable;

/**
 * Columns `apply_changes` accepts per table (insert additionally sends `id`). Store-only columns
 * (`checked*`, `check_seq`, `not_available`) and server columns are never here.
 */
export const WRITABLE_COLUMNS = {
  areas: ['name', 'sort'],
  articles: [
    'name',
    'name_key',
    'synonyms',
    'synonym_keys',
    'area_id',
    'diet',
    'is_pantry',
    'default_shopping_rule',
    'needs_review',
  ],
  stores: ['name', 'area_order', 'hidden_area_ids'],
  recipes: [
    'title',
    'photo',
    'photo_path',
    'description',
    'servings',
    'total_minutes',
    'course',
    'cuisine',
    'tags',
    'variants',
    'ingredients',
    'steps',
    'lead_time',
    'notes',
    'last_cooked_on',
    'cooked_count',
    'source',
  ],
  restaurants: [
    'name',
    'address',
    'lat',
    'lng',
    'maps_url',
    'cuisine',
    'price_level',
    'tags',
    'notes',
  ],
  // created_by is only accepted on insert, and the server overwrites it with auth.uid().
  activities: [
    'name',
    'name_key',
    'description',
    'photo_path',
    'place_name',
    'address',
    'lat',
    'lng',
    'maps_url',
    'tags',
    'created_by',
  ],
  absences: ['member_id', 'from_on', 'to_on', 'note'],
  // author_id is only accepted on insert, and the server overwrites it with auth.uid().
  feedback: ['kind', 'text', 'status', 'screen', 'reason', 'spec_ref', 'author_id'],
  chores: [
    'title',
    'room',
    'recurrence',
    'assignment',
    'effort',
    'next_due_on',
    'next_assignee_id',
    'last_done_on',
    'active_months',
  ],
  // Entries are only patched: booked by complete_chore, removed by remove_chore_event (spec 0011).
  chore_events: ['chore_id', 'done_by'],
  meal_plan_entries: [
    'date',
    'slot_id',
    'kind',
    'recipe_id',
    'restaurant_id',
    'activity_id',
    'text',
    'note',
    'leftovers_of_entry_id',
    'eater_ids',
    'guests',
    'portions',
    'variants',
    'cook_id',
    'sort',
    'not_cooked',
  ],
  shopping_items: ['article_id'],
  shopping_contributions: ['item_id', 'source', 'count', 'qty', 'unit', 'note'],
  households: ['name', 'meal_slots', 'default_store_id'],
} as const satisfies Record<IdTable | 'households', readonly string[]>;

export type WritableTable = keyof typeof WRITABLE_COLUMNS;

/**
 * Tables `apply_changes` never inserts into (allowlist `insert: []`): the household comes from
 * create_household, chore entries from the domain op complete_chore (spec 0011).
 */
export const NO_INSERT_TABLES: ReadonlySet<string> = new Set(['households', 'chore_events']);

/**
 * Tables `apply_changes` never deletes from (allowlist `delete: false`): articles go through
 * delete_article (spec 0007, E4), recipes through delete_recipe (spec 0008, E2), chore entries
 * through remove_chore_event (spec 0011).
 */
export const NO_DELETE_TABLES: ReadonlySet<string> = new Set([
  'households',
  'articles',
  'recipes',
  'chore_events',
]);

export function compositeId(table: CompositeTable, row: Record<string, unknown>): string {
  const [first, second] = COMPOSITE_TABLES[table];
  return `${String(row[first])}:${String(row[second])}`;
}

function isCompositeTable(table: string): table is CompositeTable {
  return Object.hasOwn(COMPOSITE_TABLES, table);
}

/**
 * The pull with an `id` on every row: composite-key rows get "a:b". A row of an id table without
 * an id is a contract violation.
 */
export function withCompositeIds(pull: RawPullResult): PullResult {
  const households: PullResult['households'] = {};
  for (const [householdId, delta] of Object.entries(pull.households)) {
    const rows: Record<string, SyncRow[]> = {};
    for (const [table, list] of Object.entries(delta.rows)) {
      rows[table] = list.map((row) => {
        if (isCompositeTable(table)) return { ...row, id: compositeId(table, row) };
        if (typeof row.id !== 'string') throw new Error(`Row of ${table} without id`);
        return { ...row, id: row.id };
      });
    }
    households[householdId] = { ...delta, rows };
  }
  return { ...pull, households };
}
