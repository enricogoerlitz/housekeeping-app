import { describe, expect, it } from 'vitest';

import { recipeDeletedLabel, recipeDeletionEffect } from './recipe-deletion';
import { enrico, halloumiPfanne, nadja } from './test-fixtures';
import type { MealPlanEntry } from './types';

function entry(partial: Partial<MealPlanEntry> & Pick<MealPlanEntry, 'id'>): MealPlanEntry {
  return {
    date: '2026-11-16',
    slotId: 'slot-abend',
    kind: 'recipe',
    recipeId: halloumiPfanne.id,
    eaterIds: [enrico.id, nadja.id],
    guests: 1,
    portions: 3,
    variants: [{ variantId: 'v-x', portions: 3 }],
    cookId: nadja.id,
    sort: 2,
    ...partial,
  };
}

const today = '2026-11-20';

describe('deleting a recipe (REQ-012, E3)', () => {
  const monday = entry({ id: 'mon' });
  const todays = entry({ id: 'today', date: today, notCooked: true });
  const saturday = entry({ id: 'sat', date: '2026-11-21' });
  const planned = entry({ id: 'planned', date: null });
  const leftovers = entry({
    id: 'rest',
    date: '2026-11-17',
    kind: 'leftovers',
    leftoversOfEntryId: 'mon',
    variants: [],
  });
  const other = entry({ id: 'other', recipeId: 'rec-mango-curry' });
  const freeText = entry({ id: 'text', kind: 'text', recipeId: undefined, text: 'Pizza' });

  it('AC-043: up to today free text with the title, later and planned without a day removed', () => {
    const effect = recipeDeletionEffect(
      [monday, todays, saturday, planned, leftovers, other, freeText],
      halloumiPfanne,
      today,
    );
    expect(effect.removedIds).toEqual(['sat', 'planned']);
    expect(effect.converted.map((converted) => converted.id)).toEqual(['mon', 'today', 'rest']);

    const [mon, now, rest] = effect.converted;
    expect(mon).toEqual({
      ...monday,
      kind: 'text',
      recipeId: undefined,
      variants: [],
      text: 'Halloumi-Pfanne',
    });
    expect(now).toMatchObject({ kind: 'text', text: 'Halloumi-Pfanne', notCooked: true });
    expect(rest).toMatchObject({
      kind: 'text',
      recipeId: undefined,
      text: 'Reste von Halloumi-Pfanne',
      leftoversOfEntryId: 'mon',
    });
  });

  it('AC-043: eaters, guests, portions and cook stay on the converted entry', () => {
    const [converted] = recipeDeletionEffect([monday], halloumiPfanne, today).converted;
    expect(converted).toMatchObject({
      eaterIds: [enrico.id, nadja.id],
      guests: 1,
      portions: 3,
      cookId: nadja.id,
      sort: 2,
      date: '2026-11-16',
      slotId: 'slot-abend',
    });
  });

  it('entries of other recipes and a recipe without entries are untouched', () => {
    expect(recipeDeletionEffect([other, freeText], halloumiPfanne, today)).toEqual({
      converted: [],
      removedIds: [],
    });
    expect(recipeDeletionEffect([], halloumiPfanne, today)).toEqual({
      converted: [],
      removedIds: [],
    });
  });

  it('AC-043: the notice says "Halloumi-Pfanne gelöscht"', () => {
    expect(recipeDeletedLabel('Halloumi-Pfanne')).toBe('Halloumi-Pfanne gelöscht');
  });
});
