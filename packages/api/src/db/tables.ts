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
  'collection_recipes',
  'restaurants',
  'activities',
  'absences',
  'feedback',
  'chores',
  'chore_events',
  'meal_plan_entries',
  'shopping_items',
  'shopping_contributions',
  'packing_bags',
  'packing_bag_items',
  'packing_list_bags',
  'packing_items',
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
  // kind ("Rezept" or "Sammlung", spec 0009, E2) only on insert: see PATCH_COLUMNS.
  recipes: [
    'kind',
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
  // Spec 0009, E4: a contained recipe keeps its collection and its recipe (see PATCH_COLUMNS).
  collection_recipes: ['collection_id', 'recipe_id', 'servings', 'variant_id', 'sort'],
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
  // Spec 0012: the packed state (packed, packed_at, packed_by, pack_seq) is never here; it goes
  // through set_packing_items_packed and restore_packing_items.
  packing_bags: ['name', 'member_id', 'sort'],
  packing_bag_items: ['bag_id', 'name', 'quantity', 'per_day', 'sort'],
  packing_list_bags: ['absence_id', 'bag_id', 'name', 'member_id', 'sort'],
  packing_items: ['list_bag_id', 'name', 'quantity', 'per_day', 'sort'],
} as const satisfies Record<IdTable | 'households', readonly string[]>;

export type WritableTable = keyof typeof WRITABLE_COLUMNS;

/**
 * Tables whose patch allowlist is narrower than their insert columns (spec 0012): a bag of a
 * packing list keeps its name and person as a copy, a Packstück of a packing list is never patched
 * (only its "je Tag" quantity changes, by the server, see DERIVED_COLUMNS). Spec 0009: the kind of
 * a recipe never changes, nor the collection and recipe of a contained recipe.
 */
export const PATCH_COLUMNS: Partial<Record<WritableTable, readonly string[]>> = {
  recipes: WRITABLE_COLUMNS.recipes.filter((column) => column !== 'kind'),
  collection_recipes: ['servings', 'variant_id', 'sort'],
  packing_list_bags: ['absence_id', 'bag_id', 'sort'],
  packing_items: [],
};

/**
 * Columns the server computes itself after another change (spec 0012, decision 3: "je Tag" after
 * a change of the duration or of the absence of a bag). A diff shows the new value at once but
 * never sends a patch of them.
 */
export const DERIVED_COLUMNS: Partial<Record<WritableTable, readonly string[]>> = {
  packing_items: ['quantity'],
};

/** A reference to a parent row that the database follows on delete. */
export interface ChildReference {
  table: WritableTable;
  column: string;
}

/**
 * `on delete cascade` (spec 0012, decision 7): deleting the parent deletes these children, each
 * with its tombstone, so a diff sends only the parent's delete. The fake server cascades the same.
 */
export const CASCADE_CHILDREN: Partial<Record<WritableTable, readonly ChildReference[]>> = {
  absences: [{ table: 'packing_list_bags', column: 'absence_id' }],
  packing_list_bags: [{ table: 'packing_items', column: 'list_bag_id' }],
  packing_bags: [{ table: 'packing_bag_items', column: 'bag_id' }],
};

/** `on delete set null`: deleting the parent clears the reference; the diff does not send it. */
export const SET_NULL_CHILDREN: Partial<Record<WritableTable, readonly ChildReference[]>> = {
  packing_bags: [{ table: 'packing_list_bags', column: 'bag_id' }],
};

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
