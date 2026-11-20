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
import { COMPOSITE_TABLES, WRITABLE_COLUMNS, type WritableTable } from './db/tables';
import type { HouseholdData } from './store';

/** Parents before children: inserts and patches run in this order, deletes in reverse. */
const TABLE_ORDER = [
  'areas',
  'articles',
  'stores',
  'shopping_lists',
  'households',
  'recipes',
  'restaurants',
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
      allowedColumns = columnsOf([...old, ...next]);
      maxDeletes = Number.POSITIVE_INFINITY;
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
    forward.set(table, withCreatedAt(ops, next));
    backward.set(
      table,
      withCreatedAt(
        diffRows(next, old, {
          table,
          allowedColumns,
          maxDeletes: Number.POSITIVE_INFINITY,
        }),
        old,
      ),
    );
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
