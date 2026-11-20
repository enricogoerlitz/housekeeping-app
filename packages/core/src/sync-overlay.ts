// Local overlay (ADR-0011): what the screens show is
// server rows ⊕ store queue ⊕ changesets still waiting for the server.
import { applyQueue, type StoreQueueEntry } from './store-queue';
import type { Row, TableRows } from './sync-delta';

export type RowOp =
  | { kind: 'insert'; table: string; row: Row }
  /** Only the changed columns. */
  | { kind: 'patch'; table: string; id: string; changes: Record<string, unknown> }
  | { kind: 'delete'; table: string; id: string };

export interface Changeset {
  id: string;
  householdId: string;
  ops: RowOp[];
  status: 'pending' | 'sent' | 'confirmed';
  /**
   * Set on confirmation: the generation of the latest pull started by then. Pull generations
   * count up by one each time a pull starts.
   */
  confirmedAt?: number;
}

function applyOp(tables: TableRows, op: RowOp): TableRows {
  const rows = tables[op.table] ?? {};
  if (op.kind === 'insert') {
    // Merged, so that an insert the base already contains keeps its server columns.
    return { ...tables, [op.table]: { ...rows, [op.row.id]: { ...rows[op.row.id], ...op.row } } };
  }
  const current = rows[op.id];
  // A row that is gone stays gone: someone else deleted it, and the server will say so.
  if (!current) return tables;
  if (op.kind === 'patch') {
    return { ...tables, [op.table]: { ...rows, [op.id]: { ...current, ...op.changes } } };
  }
  const kept = { ...rows };
  delete kept[op.id];
  return { ...tables, [op.table]: kept };
}

/** Applies row operations in order, returning new tables; untouched tables keep their identity. */
export function applyOps(tables: TableRows, ops: readonly RowOp[]): TableRows {
  return ops.reduce(applyOp, tables);
}

/** The rows a household's screens show: base, then store queue, then its open changesets. */
export function visibleTables(
  base: TableRows,
  householdId: string,
  queue: readonly StoreQueueEntry[],
  changesets: readonly Changeset[],
): TableRows {
  const withQueue = applyQueue(base, queue);
  return changesets
    .filter((changeset) => changeset.householdId === householdId)
    .reduce((tables, changeset) => applyOps(tables, changeset.ops), withQueue);
}

/**
 * Drops changesets the base now contains: confirmed, and a pull that started after the
 * confirmation (generation greater than `confirmedAt`) has been applied.
 */
export function dropSettled(
  changesets: readonly Changeset[],
  appliedPullGeneration: number,
): Changeset[] {
  return changesets.filter(
    (changeset) =>
      changeset.status !== 'confirmed' ||
      changeset.confirmedAt === undefined ||
      changeset.confirmedAt >= appliedPullGeneration,
  );
}

/**
 * The server rejected a changeset: it and every later changeset not yet confirmed are dropped,
 * because they were computed on top of it (AC-019). Returns what was dropped for the hint.
 */
export function rejectFrom(
  changesets: readonly Changeset[],
  id: string,
): { kept: Changeset[]; dropped: Changeset[] } {
  const start = changesets.findIndex((changeset) => changeset.id === id);
  if (start < 0) return { kept: [...changesets], dropped: [] };
  const kept: Changeset[] = [];
  const dropped: Changeset[] = [];
  changesets.forEach((changeset, index) => {
    const drop = index === start || (index > start && changeset.status !== 'confirmed');
    (drop ? dropped : kept).push(changeset);
  });
  return { kept, dropped };
}
