import { describe, expect, it } from 'vitest';

import type { StoreQueueEntry } from './store-queue';
import type { TableRows } from './sync-delta';
import {
  applyOps,
  dropSettled,
  rejectFrom,
  visibleTables,
  type Changeset,
  type RowOp,
} from './sync-overlay';

const base: TableRows = {
  recipes: {
    r1: { id: 'r1', household_id: 'h1', updated_at: '2026-11-20T09:00:00Z', title: 'Dal' },
  },
  areas: { a1: { id: 'a1', name: 'Obst' } },
};

function changeset(id: string, ops: RowOp[], rest: Partial<Changeset> = {}): Changeset {
  return { id, householdId: 'h1', ops, status: 'pending', ...rest };
}

const rename: RowOp = {
  kind: 'patch',
  table: 'recipes',
  id: 'r1',
  changes: { title: 'Linsen-Dal' },
};

describe('applyOps', () => {
  it('inserts, patches and deletes rows of the named tables without touching the input', () => {
    const next = applyOps(base, [
      { kind: 'insert', table: 'recipes', row: { id: 'r2', title: 'Curry' } },
      rename,
      { kind: 'delete', table: 'areas', id: 'a1' },
    ]);
    expect(next.recipes?.r1?.title).toBe('Linsen-Dal');
    expect(next.recipes?.r2).toEqual({ id: 'r2', title: 'Curry' });
    expect(next.areas).toEqual({});
    expect(base.recipes?.r1?.title).toBe('Dal');
    expect(base.areas?.a1).toBeDefined();
  });

  it('a patch or delete of a row that is gone does nothing (never resurrects it)', () => {
    const next = applyOps(base, [
      { kind: 'patch', table: 'recipes', id: 'gone', changes: { title: 'x' } },
      { kind: 'delete', table: 'stores', id: 'gone' },
    ]);
    expect(next).toEqual(base);
  });

  it('re-applying ops the base already contains is harmless and keeps server columns', () => {
    const confirmed = applyOps(base, [
      { kind: 'insert', table: 'recipes', row: { id: 'r1', title: 'Dal' } },
      { kind: 'patch', table: 'recipes', id: 'r1', changes: { title: 'Dal' } },
    ]);
    expect(confirmed).toEqual(base);
  });

  it('applying the same ops twice gives the same rows as once', () => {
    const ops: RowOp[] = [
      { kind: 'insert', table: 'recipes', row: { id: 'r2', title: 'Curry' } },
      rename,
      { kind: 'delete', table: 'areas', id: 'a1' },
    ];
    const once = applyOps(base, ops);
    expect(applyOps(once, ops)).toEqual(once);
  });

  it('keeps untouched tables by reference', () => {
    expect(applyOps(base, [rename]).areas).toBe(base.areas);
  });
});

describe('visibleTables', () => {
  it('shows base rows overlaid by the store queue and then by pending changesets', () => {
    const shop: TableRows = {
      shopping_items: {
        i1: { id: 'i1', household_id: 'h1', article_id: 'milk', checked: false, check_seq: 0 },
      },
    };
    const queue: StoreQueueEntry[] = [
      { kind: 'check', itemId: 'i1', checked: true, seenCheckSeq: 0 },
    ];
    const note: RowOp = {
      kind: 'patch',
      table: 'shopping_items',
      id: 'i1',
      changes: { note: 'x' },
    };
    const visible = visibleTables(shop, 'h1', queue, [changeset('c1', [note])]);
    expect(visible.shopping_items?.i1).toMatchObject({ checked: true, note: 'x' });
  });

  it('ignores changesets of another household', () => {
    const visible = visibleTables(
      base,
      'h1',
      [],
      [changeset('c1', [rename], { householdId: 'h2' })],
    );
    expect(visible.recipes?.r1?.title).toBe('Dal');
  });
});

describe('rejectFrom', () => {
  it('AC-019: a rejected rename disappears and the old name is visible again', () => {
    const pending = [changeset('c1', [rename], { status: 'sent' })];
    expect(visibleTables(base, 'h1', [], pending).recipes?.r1?.title).toBe('Linsen-Dal');

    const { kept, dropped } = rejectFrom(pending, 'c1');
    expect(dropped.map((c) => c.id)).toEqual(['c1']);
    expect(visibleTables(base, 'h1', [], kept).recipes?.r1?.title).toBe('Dal');
  });

  it('AC-019: drops every later online changeset too, keeps earlier and confirmed ones', () => {
    const changesets = [
      changeset('c0', [], { status: 'confirmed', confirmedAt: 3 }),
      changeset('c1', [rename], { status: 'sent' }),
      changeset('c2', [], { status: 'pending' }),
      changeset('c3', [], { status: 'pending', householdId: 'h2' }),
    ];
    const { kept, dropped } = rejectFrom(changesets, 'c1');
    expect(kept.map((c) => c.id)).toEqual(['c0']);
    expect(dropped.map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);
  });

  it('an unknown id drops nothing', () => {
    const changesets = [changeset('c1', [rename])];
    expect(rejectFrom(changesets, 'nope')).toEqual({ kept: changesets, dropped: [] });
  });
});

describe('dropSettled', () => {
  it('removes changesets confirmed before a pull that started after the confirmation', () => {
    const changesets = [
      changeset('settled', [], { status: 'confirmed', confirmedAt: 4 }),
      changeset('same-pull', [], { status: 'confirmed', confirmedAt: 5 }),
      changeset('sent', [], { status: 'sent' }),
      changeset('pending', [], { status: 'pending' }),
    ];
    expect(dropSettled(changesets, 5).map((c) => c.id)).toEqual(['same-pull', 'sent', 'pending']);
  });
});
