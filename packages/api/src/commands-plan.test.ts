import { addDays, entriesForDay, isoWeekday } from '@housekeeping/core';
import { describe, expect, it } from 'vitest';

import { addAbsence } from './commands-household';
import { addPlanEntry, defaultEaterIds, movePlanEntry } from './commands-plan';
import { pantryCheckRows } from './commands-shopping';
import { ENRICO, NADJA, SLOT_DINNER } from './seed/demo';
import { getData } from './store';
import { TODAY, withDemoHousehold } from './test-helpers';

withDemoHousehold();

describe('meal plan commands', () => {
  it('AC-024: Mango-Curry on an empty evening is split "mit Tofu 1 · mit Hähnchen 1"', () => {
    const date = addDays(TODAY, 3);
    expect(
      getData().planEntries.filter((e) => e.date === date && e.slotId === SLOT_DINNER),
    ).toEqual([]);
    const eaterIds = defaultEaterIds(date);
    expect(eaterIds).toEqual([ENRICO, NADJA]);
    const id = addPlanEntry({
      date,
      slotId: SLOT_DINNER,
      kind: 'recipe',
      recipeId: 'rec-mango-curry',
      eaterIds,
    });
    const entry = getData().planEntries.find((candidate) => candidate.id === id);
    expect(entry?.portions).toBe(2);
    expect(entry?.variants).toEqual([
      { variantId: 'mango-curry-v1', portions: 1 },
      { variantId: 'mango-curry-v2', portions: 1 },
    ]);
  });

  it('AC-038: with Enrico away on Saturday only Nadja is preselected', () => {
    const saturday = addDays(TODAY, 1);
    expect(isoWeekday(saturday)).toBe(6);
    addAbsence({ memberId: ENRICO, from: saturday, to: addDays(saturday, 2) });
    expect(defaultEaterIds(saturday)).toEqual([NADJA]);
    expect(defaultEaterIds(TODAY)).toEqual([ENRICO, NADJA]);
  });

  it('rejects an absence that ends before it starts', () => {
    expect(() => addAbsence({ memberId: ENRICO, from: TODAY, to: addDays(TODAY, -1) })).toThrow(
      'Das Ende liegt vor dem Anfang.',
    );
  });

  it('AC-048: a second dish joins the same meal with its own cook', () => {
    addPlanEntry({
      date: TODAY,
      slotId: SLOT_DINNER,
      kind: 'recipe',
      recipeId: 'rec-gemischter-salat',
      eaterIds: [ENRICO, NADJA],
      cookId: NADJA,
    });
    const dinner = entriesForDay(getData().planEntries, TODAY, ['slot-mittag', SLOT_DINNER]).filter(
      (entry) => entry.slotId === SLOT_DINNER,
    );
    expect(dinner.map((entry) => [entry.recipeId, entry.cookId, entry.sort])).toEqual([
      ['rec-lasagne', ENRICO, 0],
      ['rec-gemischter-salat', NADJA, 1],
    ]);
  });

  it('AC-027: a moved entry is on the new day and no longer on the old one', () => {
    const lasagne = getData().planEntries.find((entry) => entry.recipeId === 'rec-lasagne');
    if (!lasagne) throw new Error('lasagne missing');
    const target = addDays(TODAY, 3);
    movePlanEntry(lasagne.id, target);
    const entries = getData().planEntries;
    expect(entries.filter((e) => e.date === TODAY).map((e) => e.id)).not.toContain(lasagne.id);
    expect(entries.find((e) => e.id === lasagne.id)).toMatchObject({
      date: target,
      slotId: SLOT_DINNER,
      sort: 0,
    });
  });

  it('AC-011: a restaurant can be planned and puts nothing on the shopping list', () => {
    const id = addPlanEntry({
      date: addDays(TODAY, 3),
      slotId: SLOT_DINNER,
      kind: 'restaurant',
      restaurantId: 'rest-enzo',
      eaterIds: [ENRICO, NADJA],
    });
    expect(getData().planEntries.find((entry) => entry.id === id)).toMatchObject({
      kind: 'restaurant',
      restaurantId: 'rest-enzo',
      portions: 2,
      variants: [],
    });
    expect(pantryCheckRows([id])).toEqual([]);
  });

  it('rejects an unknown restaurant, an unknown recipe and an empty text', () => {
    const base = { date: TODAY, slotId: SLOT_DINNER, eaterIds: [ENRICO] };
    const before = getData().planEntries.length;
    expect(() => addPlanEntry({ ...base, kind: 'restaurant', restaurantId: 'rest-weg' })).toThrow(
      'Restaurant nicht gefunden',
    );
    expect(() => addPlanEntry({ ...base, kind: 'restaurant' })).toThrow(
      'Restaurant nicht gefunden',
    );
    expect(() => addPlanEntry({ ...base, kind: 'recipe', recipeId: 'rec-weg' })).toThrow(
      'Rezept nicht gefunden',
    );
    expect(() => addPlanEntry({ ...base, kind: 'text', text: '  ' })).toThrow('Der Text fehlt.');
    expect(getData().planEntries).toHaveLength(before);
  });
});
