// Row diff for the general write path (ADR-0011): a command's rows before and after become the
// row operations sent to `apply_changes`. The database enforces the same limits; failing here
// keeps a buggy command from even trying.
import type { Row } from './sync-delta';
import type { RowOp } from './sync-overlay';

/**
 * Columns a client never sends: set by the server (`id` is only sent on insert), writable only
 * through the store RPCs (the packed state of a Packstück: set_packing_items_packed, spec 0012),
 * or the developer's (status, reason and spec reference of feedback, spec 0027 Decision 10), or the
 * seed's (the bundled sample photo of a recipe, spec 0031, REQ-026), or only through their own
 * RPCs (a recipe's videos, spec 0046), or the scheduler's (spec 0060).
 */
export const NEVER_SENT_COLUMNS = [
  'id',
  'household_id',
  'created_at',
  'updated_at',
  'checked',
  'checked_at',
  'checked_by',
  'check_seq',
  'not_available',
  'checked_on_list',
  'packed',
  'packed_at',
  'packed_by',
  'pack_seq',
  'status',
  'reason',
  'spec_ref',
  'photo',
  'videos',
  // Spec 0060: the day a Dauerposten last came onto the list is the server's (Decision 7).
  'last_added_on',
] as const;

const NEVER_SENT = new Set<string>(NEVER_SENT_COLUMNS);

export class RowDiffError extends Error {
  constructor(
    readonly code: 'too-many-deletes' | 'column-not-allowed',
    message: string,
  ) {
    super(message);
    this.name = 'RowDiffError';
  }
}

export interface DiffOptions {
  table: string;
  /** Columns the command may write. */
  allowedColumns: readonly string[];
  /** Deletes the command declares; more throw. Default 1. */
  maxDeletes?: number;
}

/** Equality of JSON-like values; missing and undefined count as null. */
function sameValue(a: unknown, b: unknown): boolean {
  const left = a ?? null;
  const right = b ?? null;
  if (left === right) return true;
  if (typeof left !== 'object' || typeof right !== 'object' || left === null || right === null) {
    return false;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => sameValue(value, right[index]))
    );
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const keys = new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)]);
  return [...keys].every((key) => sameValue(leftRecord[key], rightRecord[key]));
}

function notAllowed(table: string, column: string): RowDiffError {
  return new RowDiffError('column-not-allowed', `${table}.${column} may not be written here`);
}

/**
 * Row operations that turn `before` into `after` (rows of one table):
 * inserts (id + allowed columns that are set; server-set and store-only columns are left to the server),
 * patches with only the changed columns, deletes for ids that are gone.
 * Throws RowDiffError when a patch or insert would write a column outside `allowedColumns`, or
 * when there are more deletes than `maxDeletes`.
 */
export function diffRows(
  before: readonly Row[],
  after: readonly Row[],
  options: DiffOptions,
): RowOp[] {
  const { table, allowedColumns, maxDeletes = 1 } = options;
  for (const column of allowedColumns) {
    if (NEVER_SENT.has(column)) throw notAllowed(table, column);
  }
  const allowed = new Set(allowedColumns);
  const beforeById = new Map(before.map((row) => [row.id, row]));
  const afterIds = new Set(after.map((row) => row.id));

  const ops: RowOp[] = [];
  for (const row of after) {
    const previous = beforeById.get(row.id);
    if (previous === row) continue;

    if (!previous) {
      const insert: Row = { id: row.id };
      for (const [column, value] of Object.entries(row)) {
        if (allowed.has(column)) {
          // Left out, an undefined column gets the database default.
          if (value !== undefined) insert[column] = value;
        } else if (!NEVER_SENT.has(column) && value !== undefined) throw notAllowed(table, column);
      }
      ops.push({ kind: 'insert', table, row: insert });
      continue;
    }

    const changes: Record<string, unknown> = {};
    for (const column of new Set([...Object.keys(previous), ...Object.keys(row)])) {
      if (sameValue(previous[column], row[column])) continue;
      if (!allowed.has(column)) throw notAllowed(table, column);
      changes[column] = row[column] ?? null;
    }
    if (Object.keys(changes).length > 0) ops.push({ kind: 'patch', table, id: row.id, changes });
  }

  const deletes = before.filter((row) => !afterIds.has(row.id));
  if (deletes.length > maxDeletes) {
    throw new RowDiffError(
      'too-many-deletes',
      `${deletes.length} deletes in ${table}, at most ${maxDeletes} declared`,
    );
  }
  for (const row of deletes) ops.push({ kind: 'delete', table, id: row.id });
  return ops;
}
