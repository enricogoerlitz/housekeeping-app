import { describe, expect, it } from 'vitest';

import { recapDayLabel, recapItems } from './recap';
import { enrico, grillabend, kartoffelsalat, makeRecipe, nadja } from './test-fixtures';
import type { Activity, Id, MealPlanEntry, Recipe, Restaurant } from './types';

// Monday, 23 November 2026: "Wie war's?" looks at Fri 20, Sat 21 and Sun 22 November.
const today = '2026-11-23';
const slotOrder = ['slot-vormittag', 'slot-mittag', 'slot-abend'];

function entry(partial: Partial<MealPlanEntry> & Pick<MealPlanEntry, 'id'>): MealPlanEntry {
  return {
    date: '2026-11-22',
    slotId: 'slot-abend',
    kind: 'recipe',
    eaterIds: [enrico.id, nadja.id],
    guests: 0,
    portions: 2,
    variants: [],
    sort: 0,
    ...partial,
  };
}

const lasagne = makeRecipe({ id: 'lasagne', title: 'Lasagne' });
const mango = makeRecipe({ id: 'mango', title: 'Mango-Curry' });
const pizza = makeRecipe({ id: 'pizza', title: 'Pizza' });
const shakshuka = makeRecipe({ id: 'shakshuka', title: 'Shakshuka' });
const soup = makeRecipe({ id: 'soup', title: 'Kürbissuppe' });
const enzo: Restaurant = {
  id: 'enzo',
  name: 'Trattoria Da Enzo',
  tags: [],
  favoriteOf: [],
  ratings: {},
  createdAt: '2026-10-01T12:00:00.000Z',
};
const bouldern: Activity = {
  id: 'bouldern',
  name: 'Bouldern',
  favoriteOf: [],
  ratings: {},
  createdAt: '2026-10-01T12:00:00.000Z',
};

function byId<T extends { id: Id }>(items: T[]): Record<Id, T> {
  return Object.fromEntries(items.map((item) => [item.id, item]));
}

function recap(
  entries: MealPlanEntry[],
  options: { memberId?: Id; recipes?: Recipe[]; on?: string } = {},
) {
  return recapItems({
    entries,
    recipesById: byId(options.recipes ?? [lasagne, mango, pizza, shakshuka, soup]),
    restaurantsById: byId([enzo]),
    activitiesById: byId([bouldern]),
    memberId: options.memberId ?? enrico.id,
    today: options.on ?? today,
    slotOrder,
  });
}

const titles = (items: ReturnType<typeof recap>) => items.map((item) => item.title);

describe('REQ-003: "Wie war\'s?"', () => {
  const weekend = [
    entry({ id: 'fr', date: '2026-11-20', recipeId: 'lasagne' }),
    entry({ id: 'sa', date: '2026-11-21', kind: 'restaurant', restaurantId: 'enzo' }),
    entry({ id: 'so-abend', recipeId: 'soup' }),
    entry({ id: 'so-vm', kind: 'activity', activityId: 'bouldern', slotId: 'slot-vormittag' }),
    entry({ id: 'do', date: '2026-11-19', recipeId: 'mango' }),
  ];

  it('AC-015: the youngest day first, within it by Tageszeit; four days ago is left out', () => {
    const items = recap(weekend);
    expect(titles(items)).toEqual(['Bouldern', 'Kürbissuppe', 'Trattoria Da Enzo', 'Lasagne']);
    expect(items[0]).toMatchObject({
      kind: 'activity',
      targetId: 'bouldern',
      stars: undefined,
    });
    expect(items[0]?.entry.id).toBe('so-vm');
    expect(items[2]?.kind).toBe('restaurant');
  });

  it('AC-015: today and later are not asked yet', () => {
    const now = [
      entry({ id: 'heute', date: today, recipeId: 'lasagne' }),
      entry({ id: 'morgen', date: '2026-11-24', recipeId: 'mango' }),
      entry({ id: 'vorgemerkt', date: null, recipeId: 'pizza' }),
    ];
    expect(recap(now)).toEqual([]);
  });

  it('AC-016: no free text, no leftovers, nothing "nicht gekocht"', () => {
    const yesterday = [
      entry({ id: 'oma', kind: 'text', text: 'Essen bei Oma' }),
      entry({ id: 'reste', kind: 'leftovers', leftoversOfEntryId: 'fr' }),
      entry({ id: 'pizza', recipeId: 'pizza', notCooked: true }),
    ];
    expect(recap(yesterday)).toEqual([]);
  });

  it('AC-016: only who was at the table; Nadja is asked about "Shakshuka", Enrico not', () => {
    const saturday = [
      entry({ id: 'sh', date: '2026-11-21', recipeId: 'shakshuka', eaterIds: [nadja.id] }),
    ];
    expect(recap(saturday)).toEqual([]);
    expect(titles(recap(saturday, { memberId: nadja.id }))).toEqual(['Shakshuka']);
  });

  it('Offene Frage 8: an empty "Wer isst mit?" asks everyone', () => {
    const nobody = [entry({ id: 'sh', recipeId: 'shakshuka', eaterIds: [] })];
    expect(titles(recap(nobody))).toEqual(['Shakshuka']);
    expect(titles(recap(nobody, { memberId: nadja.id }))).toEqual(['Shakshuka']);
  });

  it('AC-020: rated before the day it was on the plan → asked again, prefilled with 5', () => {
    const rated = {
      ...lasagne,
      ratings: { [enrico.id]: 5 },
      ratedAt: { [enrico.id]: '2026-10-01T19:00:00' },
    };
    const saturday = [entry({ id: 'sa', date: '2026-11-21', recipeId: 'lasagne' })];
    const items = recap(saturday, { recipes: [rated] });
    expect(titles(items)).toEqual(['Lasagne']);
    expect(items[0]?.stars).toBe(5);
  });

  it('AC-020: rated on the day of the entry or later → not asked any more', () => {
    const saturday = [entry({ id: 'sa', date: '2026-11-21', recipeId: 'lasagne' })];
    const ratedMonday = {
      ...lasagne,
      ratings: { [enrico.id]: 4 },
      ratedAt: { [enrico.id]: '2026-11-23T08:00:00' },
    };
    expect(recap(saturday, { recipes: [ratedMonday], on: '2026-11-24' })).toEqual([]);
    const ratedSameEvening = {
      ...ratedMonday,
      ratedAt: { [enrico.id]: '2026-11-21T21:00:00' },
    };
    expect(recap(saturday, { recipes: [ratedSameEvening] })).toEqual([]);
    // Nadja's rating does not count for Enrico.
    const ratedByNadja = {
      ...lasagne,
      ratings: { [nadja.id]: 4 },
      ratedAt: { [nadja.id]: '2026-11-22T08:00:00' },
    };
    expect(titles(recap(saturday, { recipes: [ratedByNadja] }))).toEqual(['Lasagne']);
  });

  it('Offene Frage 8: the same recipe twice appears once, on the youngest day', () => {
    const twice = [
      entry({ id: 'fr', date: '2026-11-20', recipeId: 'lasagne' }),
      entry({ id: 'sa', date: '2026-11-21', recipeId: 'lasagne' }),
    ];
    const items = recap(twice);
    expect(items).toHaveLength(1);
    expect(items[0]?.entry.id).toBe('sa');
  });

  it('AC-021: "Nicht gemacht" removes the entry from "Wie war\'s?"', () => {
    const sunday = [
      entry({
        id: 'so',
        kind: 'activity',
        activityId: 'bouldern',
        slotId: 'slot-vormittag',
        notCooked: true,
      }),
    ];
    expect(recap(sunday)).toEqual([]);
  });

  it('skips entries whose recipe, restaurant or activity no longer exists', () => {
    const gone = [
      entry({ id: 'x', recipeId: 'weg' }),
      entry({ id: 'y', kind: 'restaurant', restaurantId: 'weg' }),
      entry({ id: 'z', kind: 'activity' }),
    ];
    expect(recap(gone)).toEqual([]);
  });
});

describe('AC-015: the day of a "Wie war’s?" row', () => {
  it('AC-015: "gestern", "vorgestern", then the weekday', () => {
    expect(recapDayLabel('2026-11-22', today)).toBe('gestern');
    expect(recapDayLabel('2026-11-21', today)).toBe('vorgestern');
    expect(recapDayLabel('2026-11-20', today)).toBe('Freitag');
  });
});

describe('Sammlungen in "Wie war\'s?" (spec 0009, REQ-009)', () => {
  const recipes = [lasagne, mango, pizza, shakshuka, soup, grillabend, kartoffelsalat];
  const weekend = [
    entry({ id: 'fr', date: '2026-11-20', recipeId: 'lasagne' }),
    entry({ id: 'sa', date: '2026-11-21', kind: 'restaurant', restaurantId: 'enzo' }),
    entry({ id: 'so-grill', recipeId: grillabend.id }),
    entry({ id: 'so-vm', kind: 'activity', activityId: 'bouldern', slotId: 'slot-vormittag' }),
    entry({ id: 'do', date: '2026-11-19', recipeId: 'mango' }),
  ];

  it('spec 0011 AC-015: "Bouldern", "Grillabend", "Trattoria Da Enzo", "Lasagne"', () => {
    const items = recap(weekend, { recipes });
    expect(titles(items)).toEqual(['Bouldern', 'Grillabend', 'Trattoria Da Enzo', 'Lasagne']);
    expect(items[1]).toMatchObject({ kind: 'collection', targetId: grillabend.id });
  });

  it('AC-030, spec 0011 AC-024: the collection as a whole, its recipes not because of it', () => {
    const items = recap([entry({ id: 'sa-grill', date: '2026-11-21', recipeId: grillabend.id })], {
      recipes,
    });
    expect(titles(items)).toEqual(['Grillabend']);
    expect(titles(items)).not.toContain(kartoffelsalat.title);
  });
});
