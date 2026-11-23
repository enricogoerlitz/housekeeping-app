import { describe, expect, it } from 'vitest';

import { diffRows, NEVER_SENT_COLUMNS, RowDiffError } from './sync-diff';
import type { Row } from './sync-delta';

const allowedColumns = ['title', 'servings', 'tags', 'ingredients', 'notes'];
const options = { table: 'recipes', allowedColumns };

const dal: Row = {
  id: 'r1',
  household_id: 'h1',
  created_at: '2026-11-01T08:00:00Z',
  updated_at: '2026-11-20T09:00:00Z',
  title: 'Dal',
  servings: 4,
  tags: ['vegan', 'schnell'],
  ingredients: [{ id: 'i1', name: 'Linsen', amount: { qty: 200, unit: 'g' } }],
  notes: null,
};

function errorOf(run: () => unknown): RowDiffError {
  try {
    run();
  } catch (error) {
    if (error instanceof RowDiffError) return error;
    throw error;
  }
  throw new Error('expected a RowDiffError');
}

describe('diffRows', () => {
  it('returns nothing for the same row object (fast path) and for an equal copy', () => {
    expect(diffRows([dal], [dal], options)).toEqual([]);
    expect(diffRows([dal], [JSON.parse(JSON.stringify(dal)) as Row], options)).toEqual([]);
  });

  it('patches only the fields that changed, comparing arrays and objects by content', () => {
    const after = {
      ...dal,
      title: 'Linsen-Dal',
      tags: ['vegan', 'schnell'],
      ingredients: [{ id: 'i1', name: 'Linsen', amount: { qty: 300, unit: 'g' } }],
    };
    expect(diffRows([dal], [after], options)).toEqual([
      {
        kind: 'patch',
        table: 'recipes',
        id: 'r1',
        changes: { title: 'Linsen-Dal', ingredients: after.ingredients },
      },
    ]);
  });

  it('treats a missing field like null and sends null when a field is removed', () => {
    const withoutNotes: Row = { ...dal };
    delete withoutNotes.notes;
    expect(diffRows([dal], [withoutNotes], options)).toEqual([]);
    const cleared = diffRows([{ ...dal, notes: 'scharf' }], [withoutNotes], options);
    expect(cleared).toEqual([
      { kind: 'patch', table: 'recipes', id: 'r1', changes: { notes: null } },
    ]);
  });

  it('inserts new rows with their id and allowed columns only, never server-set ones', () => {
    const fresh: Row = { ...dal, id: 'r2', title: 'Curry' };
    expect(diffRows([], [fresh], options)).toEqual([
      {
        kind: 'insert',
        table: 'recipes',
        row: {
          id: 'r2',
          title: 'Curry',
          servings: 4,
          tags: ['vegan', 'schnell'],
          ingredients: dal.ingredients,
          notes: null,
        },
      },
    ]);
  });

  it('rejects an insert carrying a column that is neither allowed nor server-set', () => {
    const error = errorOf(() => diffRows([], [{ id: 'r2', secret: 'x' }], options));
    expect(error.code).toBe('column-not-allowed');
  });

  it('deletes rows that are gone', () => {
    expect(diffRows([dal], [], options)).toEqual([{ kind: 'delete', table: 'recipes', id: 'r1' }]);
  });

  it('mass-delete guard: more deletes than declared throw instead of sending', () => {
    const rows = [dal, { ...dal, id: 'r2' }, { ...dal, id: 'r3' }];
    expect(errorOf(() => diffRows(rows, [dal], options)).code).toBe('too-many-deletes');
    expect(diffRows(rows, [dal], { ...options, maxDeletes: 2 })).toHaveLength(2);
    expect(errorOf(() => diffRows(rows, [], { ...options, maxDeletes: 2 })).code).toBe(
      'too-many-deletes',
    );
  });

  it.each([
    ['household_id', 'h2'],
    ['updated_at', '2026-11-21T00:00:00Z'],
    ['checked', true],
    ['check_seq', 9],
    ['servings_hidden', 2],
  ])('a patch may never touch %s', (column, value) => {
    const error = errorOf(() => diffRows([dal], [{ ...dal, [column]: value }], options));
    expect(error.code).toBe('column-not-allowed');
    expect(error.message).toContain(column);
  });

  it('refuses an allow-list that contains a server-set or store-only column', () => {
    for (const column of NEVER_SENT_COLUMNS) {
      const error = errorOf(() =>
        diffRows([dal], [dal], { table: 'recipes', allowedColumns: ['title', column] }),
      );
      expect(error.code).toBe('column-not-allowed');
    }
  });
});

describe('spec 0031: columns members do not write', () => {
  it('REQ-026: a new recipe is inserted without its bundled sample photo', () => {
    const ops = diffRows([], [{ id: 'r1', title: 'Lasagne', photo: null }], {
      table: 'recipes',
      allowedColumns: ['title'],
    });
    expect(ops).toEqual([
      { kind: 'insert', table: 'recipes', row: { id: 'r1', title: 'Lasagne' } },
    ]);
  });

  it('REQ-026: a patch never changes the sample photo', () => {
    const lasagne = { id: 'r1', title: 'Lasagne', photo: 'lasagne.jpg' };
    const error = errorOf(() =>
      diffRows([lasagne], [{ ...lasagne, photo: null }], {
        table: 'recipes',
        allowedColumns: ['title'],
      }),
    );
    expect(error.code).toBe('column-not-allowed');
  });
});
