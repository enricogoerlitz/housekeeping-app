// The Änderungsansicht (spec 0049, REQ-005): what a proposal (web search or AI draft) would change
// on an item that exists, as plain data. Every change is active until the person takes it back:
// ↺ on a field keeps its old value, "↺ behalten" keeps a removed row, × drops a new row.
// "Speichern" applies what is still active (applyFields, applyRows).

export type FieldStatus = 'new' | 'changed';
export type RowStatus = 'same' | 'new' | 'changed' | 'removed';

export interface FieldChange {
  /** Stable within the proposal; also the key of the field in its record. */
  id: string;
  label: string;
  /** "" when the field was empty ("neu"). */
  before: string;
  after: string;
  status: FieldStatus;
  /** How the values read when they are no text, e.g. "Hauptgericht" for `main`. */
  beforeLabel?: string;
  afterLabel?: string;
}

export interface RowChange<T = unknown> {
  /** Stable within the proposal: `<group>:b<index>` for rows there were, `<group>:a<index>` for new. */
  id: string;
  status: RowStatus;
  /** The row as shown: the proposed one, or the old one when removed. */
  label: string;
  /** "geändert": the old row as shown, struck through. */
  beforeLabel?: string;
  before?: T;
  after?: T;
}

export interface RowGroup<T = unknown> {
  id: string;
  label: string;
  rows: RowChange<T>[];
}

export interface Proposal {
  fields: FieldChange[];
  groups: RowGroup[];
}

/** The ids of the changes the person took back. */
export type Rejected = ReadonlySet<string>;

/**
 * The fields of `labels` (in their order) whose proposed value differs from the old one. A
 * proposal without a value for a field says nothing about it: it never clears one.
 */
export function diffFields<K extends string>(
  labels: Record<K, string>,
  before: Partial<Record<K, string>>,
  after: Partial<Record<K, string | undefined>>,
  /** Fields whose values are shown otherwise (a course as its name). */
  show: Partial<Record<K, (value: string) => string>> = {},
): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const id of Object.keys(labels) as K[]) {
    const proposed = after[id]?.trim() ?? '';
    const old = before[id]?.trim() ?? '';
    if (proposed === '' || proposed === old) continue;
    const format = show[id];
    changes.push({
      id,
      label: labels[id],
      before: old,
      after: proposed,
      status: old === '' ? 'new' : 'changed',
      ...(format ? { beforeLabel: old === '' ? '' : format(old), afterLabel: format(proposed) } : {}),
    });
  }
  return changes;
}

/** The record with every active field change applied. */
export function applyFields<R extends Record<string, string>>(
  before: R,
  fields: readonly FieldChange[],
  rejected: Rejected,
): R {
  const next: Record<string, string> = { ...before };
  for (const field of fields) if (!rejected.has(field.id)) next[field.id] = field.after;
  return next as R;
}

export interface RowRules<T> {
  /** Rows with the same key are the same row (an ingredient's article, a step's text). */
  key: (row: T) => string;
  label: (row: T) => string;
  /** Same key but `false` here: "geändert" (another amount). Default: always the same. */
  same?: (before: T, after: T) => boolean;
}

/**
 * The rows of a list before and after the proposal, in the proposed order; a removed row stands
 * where it stood, before the rows that replace it. A key that is there twice matches twice.
 */
export function diffRows<T>(
  group: string,
  before: readonly T[],
  after: readonly T[],
  rules: RowRules<T>,
): RowChange<T>[] {
  const beforeKeys = before.map(rules.key);
  const matched = new Set<number>();
  const matchOf = after.map((row) => {
    const key = rules.key(row);
    const index = beforeKeys.findIndex((candidate, at) => candidate === key && !matched.has(at));
    if (index === -1) return undefined;
    matched.add(index);
    return index;
  });
  const rows: RowChange<T>[] = [];
  const flushed = new Set<number>();
  const flushRemovedBelow = (limit: number) => {
    for (let index = 0; index < Math.min(limit, before.length); index += 1) {
      const row = before[index];
      if (matched.has(index) || flushed.has(index) || row === undefined) continue;
      flushed.add(index);
      rows.push({ id: `${group}:b${index}`, status: 'removed', label: rules.label(row), before: row });
    }
  };
  after.forEach((row, at) => {
    const index = matchOf[at];
    if (index === undefined) {
      const next = matchOf.slice(at + 1).find((candidate) => candidate !== undefined);
      flushRemovedBelow(next ?? before.length);
      rows.push({ id: `${group}:a${at}`, status: 'new', label: rules.label(row), after: row });
      return;
    }
    flushRemovedBelow(index);
    const old = before[index] as T;
    const same = rules.same ? rules.same(old, row) : true;
    rows.push({
      id: `${group}:b${index}`,
      status: same ? 'same' : 'changed',
      label: rules.label(row),
      ...(same ? {} : { beforeLabel: rules.label(old) }),
      before: old,
      after: row,
    });
  });
  flushRemovedBelow(before.length);
  return rows;
}

/**
 * The list with every active change applied. A row that stays keeps its old version; an
 * accepted "geändert" row is the new one, or `merge(old, new)` to keep what only the old one has.
 */
export function applyRows<T>(
  rows: readonly RowChange<T>[],
  rejected: Rejected,
  merge?: (before: T, after: T) => T,
): T[] {
  return rows.flatMap((row): T[] => {
    const { before, after } = row;
    const active = !rejected.has(row.id);
    switch (row.status) {
      case 'same':
        return before === undefined ? [] : [before];
      case 'changed':
        if (before === undefined || after === undefined) return [];
        if (!active) return [before];
        return [merge ? merge(before, after) : after];
      case 'new':
        return active && after !== undefined ? [after] : [];
      case 'removed':
        return !active && before !== undefined ? [before] : [];
    }
  });
}

export interface ProposalSummary {
  added: number;
  changed: number;
  removed: number;
}

/** What "Speichern" would still change. */
export function proposalSummary(proposal: Proposal, rejected: Rejected): ProposalSummary {
  const summary: ProposalSummary = { added: 0, changed: 0, removed: 0 };
  const count = (id: string, status: RowStatus) => {
    if (rejected.has(id) || status === 'same') return;
    if (status === 'new') summary.added += 1;
    else if (status === 'changed') summary.changed += 1;
    else summary.removed += 1;
  };
  for (const field of proposal.fields) count(field.id, field.status);
  for (const group of proposal.groups) for (const row of group.rows) count(row.id, row.status);
  return summary;
}

/** The sticky bar: "Vorschlag: 4 neu · 2 geändert · 1 entfernt". */
export function proposalSummaryText(summary: ProposalSummary): string {
  const parts = [
    summary.added > 0 ? `${summary.added} neu` : '',
    summary.changed > 0 ? `${summary.changed} geändert` : '',
    summary.removed > 0 ? `${summary.removed} entfernt` : '',
  ].filter(Boolean);
  return parts.length === 0 ? 'Vorschlag: keine Änderung mehr' : `Vorschlag: ${parts.join(' · ')}`;
}

/** True when the proposal changes nothing at all (then no Änderungsansicht is needed). */
export function proposalIsEmpty(proposal: Proposal): boolean {
  const summary = proposalSummary(proposal, new Set());
  return summary.added + summary.changed + summary.removed === 0;
}
