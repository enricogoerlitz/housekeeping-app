import { describe, expect, it } from 'vitest';

import { groupIngredients, groupProblem, groupSuggestions } from './ingredient-groups';

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
