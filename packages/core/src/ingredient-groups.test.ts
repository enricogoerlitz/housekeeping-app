import { describe, expect, it } from 'vitest';

import {
  groupIngredients,
  groupProblem,
  groupSuggestions,
  ingredientSections,
} from './ingredient-groups';

const row = (id: string, group?: string) => ({ id, group });

describe('groupIngredients', () => {
  it('AC-013: ingredients without group first without heading, then each group', () => {
    expect(
      groupIngredients([
        row('linsen'),
        row('zwiebeln'),
        row('butter', 'Béchamel'),
        row('mehl', 'Béchamel'),
        row('milch', 'Béchamel'),
      ]),
    ).toEqual([
      { items: [row('linsen'), row('zwiebeln')] },
      {
        group: 'Béchamel',
        items: [row('butter', 'Béchamel'), row('mehl', 'Béchamel'), row('milch', 'Béchamel')],
      },
    ]);
  });

  it('AC-014: the same name in other case or with spaces is one group, written as first', () => {
    expect(
      groupIngredients([row('butter', 'Béchamel'), row('salz'), row('milch', 'béchamel ')]),
    ).toEqual([
      { items: [row('salz')] },
      { group: 'Béchamel', items: [row('butter', 'Béchamel'), row('milch', 'béchamel ')] },
    ]);
  });

  it('keeps groups in the order of their first ingredient; a blank group is no group', () => {
    expect(
      groupIngredients([row('a', 'Teig'), row('b', 'Füllung'), row('c', '  '), row('d', 'teig')]),
    ).toEqual([
      { items: [row('c', '  ')] },
      { group: 'Teig', items: [row('a', 'Teig'), row('d', 'teig')] },
      { group: 'Füllung', items: [row('b', 'Füllung')] },
    ]);
  });

  it('gives no part without ingredients', () => {
    expect(groupIngredients([])).toEqual([]);
    expect(groupIngredients([row('a', 'Teig')])).toEqual([
      { group: 'Teig', items: [row('a', 'Teig')] },
    ]);
  });
});

describe('groupSuggestions and groupProblem', () => {
  it('AC-006: the groups of the recipe, each once, as first written', () => {
    expect(
      groupSuggestions([row('a', 'Béchamel'), row('b'), row('c', 'béchamel'), row('d', 'Teig')]),
    ).toEqual(['Béchamel', 'Teig']);
  });

  it('REQ-004: a group has at most 60 characters', () => {
    expect(groupProblem('x'.repeat(60))).toBeUndefined();
    expect(groupProblem(` ${'x'.repeat(60)} `)).toBeUndefined();
    expect(groupProblem('x'.repeat(61))).toBe('Höchstens 60 Zeichen');
  });
});

describe('ingredientSections (Nachklick 27.11., N-01)', () => {
  const line = (id: string, variantId?: string, group?: string) => ({ id, variantId, group });
  const variants = [
    { id: 'v-orig', name: 'Original' },
    { id: 'v-vegan', name: 'Vegan' },
  ];

  it('N-01: without variants one part without heading, split by group like the recipe page', () => {
    expect(ingredientSections([line('salz'), line('butter', undefined, 'Béchamel')], [])).toEqual([
      {
        groups: [
          { items: [line('salz')] },
          { group: 'Béchamel', items: [line('butter', undefined, 'Béchamel')] },
        ],
      },
    ]);
  });

  it('N-01: with variants „Alle Varianten“ first, then each variant in its order; empty parts are left out', () => {
    const rows = [
      line('tofu', 'v-vegan'),
      line('tomaten'),
      line('eier', 'v-orig'),
      line('feta', 'v-orig', 'Topping'),
    ];
    expect(ingredientSections(rows, [...variants, { id: 'v-leer', name: 'Leer' }])).toEqual([
      { title: 'Alle Varianten', groups: [{ items: [line('tomaten')] }] },
      {
        variantId: 'v-orig',
        title: 'Original',
        groups: [
          { items: [line('eier', 'v-orig')] },
          { group: 'Topping', items: [line('feta', 'v-orig', 'Topping')] },
        ],
      },
      { variantId: 'v-vegan', title: 'Vegan', groups: [{ items: [line('tofu', 'v-vegan')] }] },
    ]);
  });

  it('a row of a variant that is gone counts for all variants; a variant without name reads so', () => {
    expect(
      ingredientSections([line('salz', 'v-weg'), line('tofu', 'v-x')], [{ id: 'v-x', name: ' ' }]),
    ).toEqual([
      { title: 'Alle Varianten', groups: [{ items: [line('salz', 'v-weg')] }] },
      { variantId: 'v-x', title: 'Ohne Namen', groups: [{ items: [line('tofu', 'v-x')] }] },
    ]);
  });
});
