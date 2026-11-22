import { describe, expect, it } from 'vitest';

import { entriesOnList } from './entry-edit';
import { deletedNotice, deletionListQuestion, recipeDeletionEffect } from './recipe-deletion';
import {
  enrico,
  grillabend,
  grillabendRecipes,
  halloumiPfanne,
  kartoffelsalat,
  nadja,
} from './test-fixtures';
import type { CollectionRecipe, MealPlanEntry, ShoppingItem } from './types';

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
      [],
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
    const [converted] = recipeDeletionEffect([monday], halloumiPfanne, today, []).converted;
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
    const nothing = {
      converted: [],
      removedIds: [],
      removedCollectionRecipeIds: [],
      collections: 0,
    };
    expect(recipeDeletionEffect([other, freeText], halloumiPfanne, today, [])).toEqual(nothing);
    expect(recipeDeletionEffect([], halloumiPfanne, today, [])).toEqual(nothing);
  });

  it('E3: leftovers without their own recipe go with a removed entry, also leftovers of those', () => {
    const plain = (id: string, of: string, date: string | null) =>
      entry({
        id,
        date,
        kind: 'leftovers',
        recipeId: undefined,
        leftoversOfEntryId: of,
        variants: [],
      });
    const ofSaturday = plain('rest-sat', 'sat', '2026-11-22');
    const ofThose = plain('rest-rest', 'rest-sat', '2026-11-19');
    const ofMonday = plain('rest-mon', 'mon', '2026-11-17');
    const withRecipe = entry({
      id: 'rest-own',
      kind: 'leftovers',
      recipeId: 'rec-mango-curry',
      leftoversOfEntryId: 'sat',
      variants: [],
    });
    const effect = recipeDeletionEffect(
      [monday, saturday, ofSaturday, ofThose, ofMonday, withRecipe],
      halloumiPfanne,
      today,
      [],
    );
    expect(effect.removedIds).toEqual(['sat', 'rest-sat', 'rest-rest']);
    expect(effect.converted.map((converted) => converted.id)).toEqual(['mon']);
  });

  it('AC-043: the notice says "Halloumi-Pfanne gelöscht"', () => {
    expect(deletedNotice('Halloumi-Pfanne', { collections: 0 })).toBe('Halloumi-Pfanne gelöscht');
  });
});

describe('deleting with Sammlungen (spec 0009, REQ-010)', () => {
  const sommerbuffet: CollectionRecipe = {
    id: 'cr-buffet-salat',
    collectionId: 'col-sommerbuffet',
    recipeId: kartoffelsalat.id,
    sort: 0,
  };
  const rows = [...grillabendRecipes, sommerbuffet];

  it('AC-033: a recipe in two collections leaves both, and the notice says so', () => {
    const effect = recipeDeletionEffect([], kartoffelsalat, today, rows);
    expect(effect.removedCollectionRecipeIds).toEqual(['cr-kartoffelsalat', 'cr-buffet-salat']);
    expect(effect.collections).toBe(2);
    expect(deletedNotice(kartoffelsalat.title, { collections: effect.collections })).toBe(
      'Kartoffelsalat gelöscht · auch aus 2 Sammlungen entfernt',
    );
    expect(deletedNotice(kartoffelsalat.title, { collections: 1 })).toBe(
      'Kartoffelsalat gelöscht · auch aus 1 Sammlung entfernt',
    );
  });

  it('AC-032: deleting a collection takes its rows, not the recipes, and says only "gelöscht"', () => {
    const entry = (partial: Partial<MealPlanEntry> & Pick<MealPlanEntry, 'id'>): MealPlanEntry => ({
      date: '2026-11-21',
      slotId: 'slot-abend',
      kind: 'recipe',
      recipeId: grillabend.id,
      eaterIds: [],
      guests: 0,
      portions: 3,
      variants: [],
      sort: 0,
      ...partial,
    });
    const effect = recipeDeletionEffect(
      [entry({ id: 'sa' }), entry({ id: 'do', date: '2026-11-19' })],
      grillabend,
      today,
      rows,
    );
    expect(effect.removedCollectionRecipeIds).toEqual(['cr-kartoffelsalat', 'cr-grillgemuese']);
    expect(effect.collections).toBe(0);
    expect(effect.removedIds).toEqual(['sa']);
    expect(effect.converted.map((converted) => converted.text)).toEqual(['Grillabend']);
    expect(deletedNotice(grillabend.title, { collections: effect.collections })).toBe(
      'Grillabend gelöscht',
    );
  });
});

describe('the notice names the entries that go (spec 0023, REQ-012)', () => {
  const lasagne = { id: halloumiPfanne.id, title: 'Lasagne' };
  const day = '2026-11-22';

  it('AC-049: one past and two later entries: "Lasagne gelöscht · 2 geplante Einträge entfallen"', () => {
    const entries = [
      entry({ id: 'past', date: '2026-11-20' }),
      entry({ id: 'later', date: '2026-11-25' }),
      entry({ id: 'december', date: '2026-12-04' }),
    ];
    const effect = recipeDeletionEffect(entries, lasagne, day, []);
    expect(
      deletedNotice(lasagne.title, {
        entries: effect.removedIds.length,
        collections: effect.collections,
      }),
    ).toBe('Lasagne gelöscht · 2 geplante Einträge entfallen');
    expect(effect.converted.map((converted) => converted.text)).toEqual(['Lasagne']);
  });

  it('AC-050: tomorrow and noted count both: "Grillabend gelöscht · 2 geplante Einträge entfallen"', () => {
    const entries = [
      entry({ id: 'tomorrow', recipeId: grillabend.id, date: '2026-11-23' }),
      entry({ id: 'noted', recipeId: grillabend.id, date: null }),
    ];
    const effect = recipeDeletionEffect(entries, grillabend, day, grillabendRecipes);
    expect(deletedNotice(grillabend.title, { entries: effect.removedIds.length })).toBe(
      'Grillabend gelöscht · 2 geplante Einträge entfallen',
    );
  });

  it('AC-051: one entry and one collection', () => {
    expect(deletedNotice('Mango-Curry', { entries: 1, collections: 1 })).toBe(
      'Mango-Curry gelöscht · 1 geplanter Eintrag entfällt · auch aus 1 Sammlung entfernt',
    );
  });

  it('AC-052: nothing planned: only "Shakshuka gelöscht"', () => {
    expect(deletedNotice('Shakshuka', { entries: 0, collections: 0 })).toBe('Shakshuka gelöscht');
    expect(deletedNotice('Shakshuka', {})).toBe('Shakshuka gelöscht');
  });
});

describe('ingredients of the entries that go (spec 0023, Decision 15)', () => {
  const source = (entryId: string) => ({
    kind: 'recipe' as const,
    recipeId: 'rec-lasagne',
    entryId,
    label: 'Lasagne (Sa)',
  });
  const item = (id: string, entryIds: string[], checked = false): ShoppingItem => ({
    id,
    articleId: `art-${id}`,
    checked,
    createdAt: '2026-11-22T10:00:00Z',
    contributions: entryIds.map((entryId, index) => ({
      id: `${id}-${index}`,
      source: entryId === 'hand' ? { kind: 'manual' } : source(entryId),
      count: 1,
    })),
  });
  const items = [
    item('hack', ['sat', 'hand']),
    item('platten', ['sat', 'tue']),
    item('salz', ['sat'], true),
    item('milch', ['hand']),
  ];

  it('Decision 15: counts the open items holding contributions of the entries that go', () => {
    expect(entriesOnList(items, ['sat', 'tue'])).toBe(2);
    expect(entriesOnList(items, ['tue'])).toBe(1);
    expect(entriesOnList(items, ['other'])).toBe(0);
    expect(entriesOnList(items, [])).toBe(0);
  });

  it('Decision 15: the question names the entries and the ingredients', () => {
    expect(deletionListQuestion({ entries: 2, ingredients: 3 })).toBe(
      'Für 2 geplante Einträge stehen 3 Zutaten auf der Einkaufsliste.',
    );
    expect(deletionListQuestion({ entries: 1, ingredients: 1 })).toBe(
      'Für 1 geplanten Eintrag steht 1 Zutat auf der Einkaufsliste.',
    );
  });

  it('Decision 15: the notice says how many ingredients left the list', () => {
    expect(deletedNotice('Lasagne', { entries: 2, ingredients: 3, collections: 1 })).toBe(
      'Lasagne gelöscht · 2 geplante Einträge entfallen · 3 Zutaten von der Liste genommen · auch aus 1 Sammlung entfernt',
    );
    expect(deletedNotice('Lasagne', { entries: 1, ingredients: 1 })).toBe(
      'Lasagne gelöscht · 1 geplanter Eintrag entfällt · 1 Zutat von der Liste genommen',
    );
    expect(deletedNotice('Lasagne', { entries: 1, ingredients: 0 })).toBe(
      'Lasagne gelöscht · 1 geplanter Eintrag entfällt',
    );
  });
});
