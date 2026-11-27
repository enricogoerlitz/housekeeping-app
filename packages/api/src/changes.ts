// A command's change as row operations: the household before and after, mapped to rows and
// diffed per table (core diffRows). Pure; the engine decides where the operations go.
import {
  diffRows,
  isReminderPast,
  NEVER_SENT_COLUMNS,
  type Row,
  type RowOp,
  type TableRows,
} from '@housekeeping/core';

import { householdToRows } from './db/mapping';
import {
  CASCADE_CHILDREN,
  COMPOSITE_TABLES,
  DERIVED_COLUMNS,
  NO_DELETE_TABLES,
  NO_INSERT_TABLES,
  PATCH_COLUMNS,
  SET_NULL_CHILDREN,
  WRITABLE_COLUMNS,
  type WritableTable,
} from './db/tables';
import type { HouseholdData } from './store';

/** Parents before children: inserts and patches run in this order, deletes in reverse. */
const TABLE_ORDER = [
  'areas',
  'articles',
  'stores',
  'households',
  'recipes',
  // A new collection before its rows (spec 0009).
  'collection_recipes',
  'restaurants',
  // Spec 0041: a kind before its activities, a series after its activity, exceptions after it.
  'activity_kinds',
  'activities',
  'activity_series',
  'activity_series_exceptions',
  'meal_plan_entries',
  // Spec 0060: a Dauerposten after its article.
  'recurring_items',
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
  'notification_settings',
  'ai_chats',
  ...Object.keys(COMPOSITE_TABLES),
  'household_members',
];

/** Tables only dedicated RPCs write (`apply_changes` refuses them). */
const RPC_ONLY = new Set([
  ...Object.keys(COMPOSITE_TABLES),
  'household_members',
  // Spec 0066: only ai-agent writes them (create_ai_chat, record_ai_chat_turn, delete_ai_chat).
  'ai_chats',
]);
const NEVER_SENT = new Set<string>(NEVER_SENT_COLUMNS);

export interface HouseholdChange {
  /** Operations that turn before into after (inserts carry `created_at` for the local view). */
  ops: RowOp[];
  /** Operations that turn after back into before ("Rückgängig"). */
  inverse: RowOp[];
  /**
   * What of `ops` goes to the server (mode 'send'): without what the database does itself —
   * deleting the children of a deleted row (cascade), clearing a reference to it (set null) and
   * recalculating derived columns (spec 0012, decisions 3 and 7). Mode 'local': `ops`.
   */
  send: RowOp[];
  /** The same for `inverse`. */
  sendInverse: RowOp[];
}

/** Ids of rows that are in `before` but not in `after`, per table. */
function deletedIds(before: Record<string, Row[]>, after: Record<string, Row[]>) {
  const deleted = new Map<string, Set<string>>();
  for (const [table, rows] of Object.entries(before)) {
    const kept = new Set((after[table] ?? []).map((row) => row.id));
    const gone = rows.filter((row) => !kept.has(row.id)).map((row) => row.id);
    if (gone.length > 0) deleted.set(table, new Set(gone));
  }
  return deleted;
}

/**
 * Rows the database deletes itself because their parent goes in the same change (recursively:
 * a trip takes its people and the bags of its packing list, they take their Packstücke).
 */
function cascadedIds(
  before: Record<string, Row[]>,
  deleted: Map<string, Set<string>>,
): Map<string, Set<string>> {
  const cascaded = new Map<string, Set<string>>();
  const visit = (parent: string, ids: ReadonlySet<string>) => {
    for (const child of CASCADE_CHILDREN[parent as WritableTable] ?? []) {
      const gone = deleted.get(child.table);
      const found = (before[child.table] ?? []).filter(
        (row) => gone?.has(row.id) && ids.has(String(row[child.column])),
      );
      if (found.length === 0) continue;
      const own = cascaded.get(child.table) ?? new Set<string>();
      for (const row of found) own.add(row.id);
      cascaded.set(child.table, own);
      visit(child.table, new Set(found.map((row) => row.id)));
    }
  };
  for (const [table, ids] of deleted) visit(table, ids);
  return cascaded;
}

/** Whether the server does this operation itself (set null of a deleted parent, derived columns). */
function doneByServer(
  op: RowOp,
  before: Map<string, Row>,
  deleted: Map<string, Set<string>>,
  parentOf: (table: string, column: string) => string | undefined,
): boolean {
  if (op.kind !== 'patch') return false;
  const derived = DERIVED_COLUMNS[op.table as WritableTable] ?? [];
  return Object.entries(op.changes).every(([column, value]) => {
    if (derived.includes(column)) return true;
    const parent = parentOf(op.table, column);
    const old = before.get(op.id)?.[column];
    return (
      parent !== undefined &&
      value === null &&
      typeof old === 'string' &&
      deleted.get(parent)?.has(old) === true
    );
  });
}

function setNullParent(table: string, column: string): string | undefined {
  for (const [parent, children] of Object.entries(SET_NULL_CHILDREN)) {
    if (children.some((child) => child.table === table && child.column === column)) return parent;
  }
  return undefined;
}

/** The ops of one direction without what the server does itself (see HouseholdChange.send). */
function toSend(
  ops: readonly RowOp[],
  before: Record<string, Row[]>,
  deleted: Map<string, Set<string>>,
  cascaded: Map<string, Set<string>>,
): RowOp[] {
  const rows = new Map<string, Map<string, Row>>();
  const rowsOf = (table: string) => {
    let byId = rows.get(table);
    if (!byId) {
      byId = new Map((before[table] ?? []).map((row) => [row.id, row]));
      rows.set(table, byId);
    }
    return byId;
  };
  return ops.filter((op) => {
    if (op.kind === 'delete') return cascaded.get(op.table)?.has(op.id) !== true;
    return !doneByServer(op, rowsOf(op.table), deleted, setNullParent);
  });
}

/**
 * The local effect of an RPC: every column, store-only and server columns included (the RPC sets
 * them on the server, e.g. reopening a checked item). Only shown, never sent.
 */
function localDiff(table: string, before: readonly Row[], after: readonly Row[]): RowOp[] {
  const beforeById = new Map(before.map((row) => [row.id, row]));
  const afterIds = new Set(after.map((row) => row.id));
  const ops: RowOp[] = [];
  for (const row of after) {
    const previous = beforeById.get(row.id);
    if (previous === row) continue;
    if (!previous) {
      ops.push({ kind: 'insert', table, row });
      continue;
    }
    const changes: Record<string, unknown> = {};
    for (const column of new Set([...Object.keys(previous), ...Object.keys(row)])) {
      if (!sameJson(previous[column], row[column])) changes[column] = row[column] ?? null;
    }
    if (Object.keys(changes).length > 0) ops.push({ kind: 'patch', table, id: row.id, changes });
  }
  for (const row of before) {
    if (!afterIds.has(row.id)) ops.push({ kind: 'delete', table, id: row.id });
  }
  return selfReferencesFirst(ops, [...before, ...after]);
}

function columnsOf(rows: readonly Row[]): string[] {
  const columns = new Set<string>();
  for (const row of rows) for (const column of Object.keys(row)) columns.add(column);
  return [...columns].filter((column) => !NEVER_SENT.has(column));
}

function ordered(byTable: Map<string, RowOp[]>): RowOp[] {
  const tables = [...byTable.keys()].sort(
    (a, b) => TABLE_ORDER.indexOf(a) - TABLE_ORDER.indexOf(b),
  );
  const writes = tables.flatMap((table) =>
    (byTable.get(table) ?? []).filter((op) => op.kind !== 'delete'),
  );
  const deletes = [...tables]
    .reverse()
    .flatMap((table) => (byTable.get(table) ?? []).filter((op) => op.kind === 'delete'));
  return [...writes, ...deletes];
}

/**
 * Rows of one table that point to each other (leftovers → their dish): inserts put the referenced
 * row first and deletes remove the referencing row first, as foreign keys are checked per row.
 */
function selfReferencesFirst(ops: RowOp[], rows: readonly Row[]): RowOp[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const touched = (kind: RowOp['kind']) =>
    new Set(
      ops.flatMap((op) => (op.kind !== kind ? [] : [op.kind === 'insert' ? op.row.id : op.id])),
    );
  const refersTo = (id: string, ids: Set<string>) =>
    Object.entries(byId.get(id) ?? {}).some(
      ([column, value]) =>
        column !== 'id' && typeof value === 'string' && value !== id && ids.has(value),
    );
  const inserted = touched('insert');
  const deleted = touched('delete');
  const rank = (op: RowOp) => {
    if (op.kind === 'insert') return refersTo(op.row.id, inserted) ? 1 : 0;
    if (op.kind === 'delete') return refersTo(op.id, deleted) ? 0 : 1;
    return 0;
  };
  // Array.prototype.sort is stable: the order within each rank stays.
  return [...ops].sort((a, b) => rank(a) - rank(b));
}

/** Inserts keep `created_at` locally, so the new row sorts right until the server answers. */
function withCreatedAt(ops: RowOp[], rows: readonly Row[]): RowOp[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ops.map((op) => {
    const createdAt = op.kind === 'insert' ? byId.get(op.row.id)?.created_at : undefined;
    return op.kind === 'insert' && createdAt !== undefined
      ? { ...op, row: { ...op.row, created_at: createdAt } }
      : op;
  });
}

/**
 * The change between two states of a household.
 * - mode 'send' (diff path): only writable columns, deletes as declared, and no per-member or
 *   membership rows (those have their own RPCs) — anything else throws before sending. Rows the
 *   database deletes itself with their parent do not count as deletes.
 * - mode 'local' (rpc path): any column, any number of deletes; only shown, never sent.
 */
export function diffHousehold(
  before: HouseholdData,
  after: HouseholdData,
  options: { mode: 'send' | 'local'; maxDeletes?: Partial<Record<string, number>> },
): HouseholdChange {
  const beforeRows = householdToRows(before);
  const afterRows = householdToRows(after);
  const forward = new Map<string, RowOp[]>();
  const backward = new Map<string, RowOp[]>();
  const removed = deletedIds(beforeRows, afterRows);
  const added = deletedIds(afterRows, beforeRows);
  const cascaded = cascadedIds(beforeRows, removed);
  const cascadedBack = cascadedIds(afterRows, added);

  for (const table of new Set([...Object.keys(beforeRows), ...Object.keys(afterRows)])) {
    const old = beforeRows[table] ?? [];
    const next = afterRows[table] ?? [];
    let allowedColumns: readonly string[];
    let maxDeletes: number;
    if (options.mode === 'local') {
      const ops = localDiff(table, old, next);
      if (ops.length === 0) continue;
      forward.set(table, ops);
      backward.set(table, localDiff(table, next, old));
      continue;
    } else if (RPC_ONLY.has(table)) {
      const ops = diffRows(old, next, {
        table,
        allowedColumns: columnsOf([...old, ...next]),
        maxDeletes: Number.POSITIVE_INFINITY,
      });
      if (ops.length > 0) throw new Error(`Changes to ${table} need their own RPC.`);
      continue;
    } else {
      allowedColumns = WRITABLE_COLUMNS[table as WritableTable] ?? [];
      maxDeletes = table === 'households' ? 0 : (options.maxDeletes?.[table] ?? 0);
    }
    // Children deleted with their parent are the database's deletes, not the command's.
    const withParent = cascaded.get(table);
    const declared = withParent ? old.filter((row) => !withParent.has(row.id)) : old;
    diffRows(declared, next, { table, allowedColumns, maxDeletes });
    const ops = diffRows(old, next, {
      table,
      allowedColumns,
      maxDeletes: Number.POSITIVE_INFINITY,
    });
    if (ops.length === 0) continue;
    if (NO_DELETE_TABLES.has(table) && ops.some((op) => op.kind === 'delete')) {
      const way =
        table === 'articles'
          ? 'delete_article'
          : table === 'recipes'
            ? 'delete_recipe'
            : table === 'restaurants'
              ? 'delete_restaurant'
              : table === 'activities'
                ? 'delete_activity'
                : table === 'notification_settings'
                  ? 'remove_member'
                  : 'remove_chore_event';
      throw new Error(`Deleting ${table} needs its own RPC (${way}).`);
    }
    if (NO_INSERT_TABLES.has(table) && ops.some((op) => op.kind === 'insert')) {
      const way = table === 'notification_settings' ? 'created by the server' : 'complete_chore';
      throw new Error(`Inserting into ${table} needs its own RPC (${way}).`);
    }
    assertPatchable(table, ops);
    const both = [...old, ...next];
    forward.set(table, withCreatedAt(selfReferencesFirst(ops, both), next));
    // Undo never deletes from these tables: an article created by the command stays, as when it
    // was created by a list addition; so does an activity or a restaurant created while planning.
    const undo = diffRows(next, old, {
      table,
      allowedColumns,
      maxDeletes: Number.POSITIVE_INFINITY,
    }).filter((op) => !(NO_DELETE_TABLES.has(table) && op.kind === 'delete'));
    if (undo.length > 0) {
      backward.set(table, withCreatedAt(selfReferencesFirst(undo, both), old));
    }
  }
  const ops = ordered(forward);
  const inverse = ordered(backward);
  if (options.mode === 'local') return { ops, inverse, send: ops, sendInverse: inverse };
  return {
    ops,
    inverse,
    send: toSend(ops, beforeRows, removed, cascaded),
    sendInverse: toSend(inverse, afterRows, added, cascadedBack),
  };
}

/**
 * Patches the database refuses (PATCH_COLUMNS): a Packstück of a packing list keeps its name, a bag
 * of a packing list its copy. A derived column (DERIVED_COLUMNS) is shown, never sent.
 */
function assertPatchable(table: string, ops: readonly RowOp[]): void {
  const patchable = PATCH_COLUMNS[table as WritableTable];
  if (!patchable) return;
  const derived = DERIVED_COLUMNS[table as WritableTable] ?? [];
  for (const op of ops) {
    if (op.kind !== 'patch') continue;
    const refused = Object.keys(op.changes).find(
      (column) => !patchable.includes(column) && !derived.includes(column),
    );
    if (refused) throw new Error(`${table}.${refused} cannot be changed after inserting.`);
  }
}

/** What goes over the wire: insert rows without the columns the server sets. */
export function sendable(ops: readonly RowOp[]): RowOp[] {
  return ops.map((op) => {
    if (op.kind !== 'insert') return op;
    const row: Row = { id: op.row.id };
    for (const [column, value] of Object.entries(op.row)) {
      if (!NEVER_SENT.has(column)) row[column] = value;
    }
    return { ...op, row };
  });
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** Whether the server rows already show these operations (for writes with an unknown outcome). */
export function isReflected(tables: TableRows, ops: readonly RowOp[]): boolean {
  return ops.every((op) => {
    if (op.kind === 'delete') return !tables[op.table]?.[op.id];
    const row = tables[op.table]?.[op.kind === 'insert' ? op.row.id : op.id];
    if (!row) return false;
    const changes = op.kind === 'insert' ? op.row : op.changes;
    return Object.entries(changes).every(
      ([column, value]) => NEVER_SENT.has(column) || sameJson(row[column], value),
    );
  });
}

/**
 * Undo after removing an entry inserts it again (spec 0017, REQ-006). A reminder whose moment has
 * passed by then is left out of that insert: the database refuses a past reminder on insert
 * (`reminder_in_past`), which would lose the whole undo, and it would not be sent anyway.
 */
export function withoutPassedReminders(
  ops: readonly RowOp[],
  now: Date,
  timeZone: string,
): RowOp[] {
  return ops.map((op) => {
    if (op.kind !== 'insert' || op.table !== 'meal_plan_entries') return op;
    const { date, reminder_day_offset: offsetDays, reminder_at: at } = op.row;
    if (typeof date !== 'string' || typeof offsetDays !== 'number' || typeof at !== 'string') {
      return op;
    }
    if (!isReminderPast(date, { offsetDays, at: at.slice(0, 5) }, now, timeZone)) return op;
    return {
      ...op,
      row: { ...op.row, reminder_day_offset: null, reminder_at: null, reminder_text: null },
    };
  });
}
