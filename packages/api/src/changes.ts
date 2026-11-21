// A command's change as row operations: the household before and after, mapped to rows and
// diffed per table (core diffRows). Pure; the engine decides where the operations go.
import {
  diffRows,
  NEVER_SENT_COLUMNS,
  type Row,
  type RowOp,
  type TableRows,
} from '@housekeeping/core';

import { householdToRows } from './db/mapping';
import {
  COMPOSITE_TABLES,
  NO_DELETE_TABLES,
  NO_INSERT_TABLES,
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
  'restaurants',
  'activities',
  'meal_plan_entries',
  'shopping_items',
  'shopping_contributions',
  'chores',
  'chore_events',
  'absences',
  'feedback',
  ...Object.keys(COMPOSITE_TABLES),
  'household_members',
];

/** Tables only dedicated RPCs write (`apply_changes` refuses them). */
const RPC_ONLY = new Set([...Object.keys(COMPOSITE_TABLES), 'household_members']);
const NEVER_SENT = new Set<string>(NEVER_SENT_COLUMNS);

export interface HouseholdChange {
  /** Operations that turn before into after (inserts carry `created_at` for the local view). */
  ops: RowOp[];
  /** Operations that turn after back into before ("Rückgängig"). */
  inverse: RowOp[];
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
 *   membership rows (those have their own RPCs) — anything else throws before sending.
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
    const ops = diffRows(old, next, { table, allowedColumns, maxDeletes });
    if (ops.length === 0) continue;
    if (NO_DELETE_TABLES.has(table) && ops.some((op) => op.kind === 'delete')) {
      const way =
        table === 'articles'
          ? 'delete_article'
          : table === 'recipes'
            ? 'delete_recipe'
            : 'remove_chore_event';
      throw new Error(`Deleting ${table} needs its own RPC (${way}).`);
    }
    if (NO_INSERT_TABLES.has(table) && ops.some((op) => op.kind === 'insert')) {
      throw new Error(`Inserting into ${table} needs its own RPC (complete_chore).`);
    }
    const both = [...old, ...next];
    forward.set(table, withCreatedAt(selfReferencesFirst(ops, both), next));
    // Undo never deletes from these tables: an article created by the command stays, as when it
    // was created by a list addition.
    const undo = diffRows(next, old, {
      table,
      allowedColumns,
      maxDeletes: Number.POSITIVE_INFINITY,
    }).filter((op) => !(NO_DELETE_TABLES.has(table) && op.kind === 'delete'));
    if (undo.length > 0) {
      backward.set(table, withCreatedAt(selfReferencesFirst(undo, both), old));
    }
  }
  return { ops: ordered(forward), inverse: ordered(backward) };
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
