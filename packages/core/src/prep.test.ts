import { describe, expect, it } from 'vitest';

import { prepLines, prepStart, prepSummary, slotStartTime, type PrepInput } from './prep';
import { grillabend, makeRecipe } from './test-fixtures';
import type { CollectionRecipe, MealPlanEntry, MealSlot, Recipe } from './types';

// Sunday, 22 November 2026; Haushalt "Enrico & Nadja" with Vormittag, Mittag, Abend.
const today = '2026-11-22';
const slots: MealSlot[] = [
  { id: 'slot-vormittag', name: 'Vormittag', sort: 0 },
  { id: 'slot-mittag', name: 'Mittag', sort: 1 },
  { id: 'slot-abend', name: 'Abend', sort: 2 },
];

const hummus = makeRecipe({
  id: 'hummus',
  title: 'Hummus',
  leadTime: { text: 'Kichererbsen einweichen', hoursBefore: 12 },
});
const bulgogi = makeRecipe({
  id: 'bulgogi',
  title: 'Bulgogi',
  leadTime: { text: 'Fleisch marinieren', hoursBefore: 48 },
});
const spiesse = makeRecipe({
  id: 'spiesse',
  title: 'Grillspieße',
  leadTime: { text: 'Spieße marinieren', hoursBefore: 24 },
});
const kartoffelsalat = makeRecipe({ id: 'kartoffelsalat', title: 'Kartoffelsalat' });
const recipes: Recipe[] = [hummus, bulgogi, spiesse, kartoffelsalat, grillabend];
const recipesById = Object.fromEntries(recipes.map((recipe) => [recipe.id, recipe]));
const collectionRecipes: CollectionRecipe[] = [
  { id: 'cr-1', collectionId: grillabend.id, recipeId: spiesse.id, sort: 0 },
  { id: 'cr-2', collectionId: grillabend.id, recipeId: kartoffelsalat.id, sort: 1 },
];

function entry(partial: Partial<MealPlanEntry> & Pick<MealPlanEntry, 'id'>): MealPlanEntry {
  return {
    date: today,
    slotId: 'slot-abend',
    kind: 'recipe',
    eaterIds: [],
    guests: 0,
    portions: 2,
    variants: [],
    sort: 0,
    ...partial,
  };
}

function lines(entries: MealPlanEntry[], shown = today, now = '08:00'): string[] {
  const input: PrepInput = {
    entries,
    book: { recipesById, collectionRecipes },
    slots,
    shown,
    today,
    now,
  };
  return prepLines(input).map((line) => line.text);
}

describe('slotStartTime (Entscheidung 8)', () => {
  it('Vormittag 8, Mittag 11, Abend 17, otherwise 8 Uhr', () => {
    expect(slotStartTime('Vormittag')).toBe('08:00');
    expect(slotStartTime('Mittag')).toBe('11:00');
    expect(slotStartTime(' Abend ')).toBe('17:00');
    expect(slotStartTime('Frühstück')).toBe('08:00');
  });
});

describe('prepStart (REQ-006)', () => {
  it('a start between 0 and 6 Uhr moves to the evening before', () => {
    expect(prepStart('2026-11-23', '17:00', 12)).toEqual({ day: '2026-11-22', at: undefined });
    expect(prepStart('2026-11-23', '11:00', 12)).toEqual({ day: '2026-11-22', at: '23:00' });
    expect(prepStart('2026-11-24', '17:00', 48)).toEqual({ day: '2026-11-22', at: '17:00' });
    expect(prepStart('2026-11-23', '08:00', 2)).toEqual({ day: '2026-11-23', at: '06:00' });
    expect(prepStart('2026-11-23', '08:00', 8)).toEqual({ day: '2026-11-22', at: undefined });
  });
});

describe('spec 0020 REQ-006: the prep lines under the Tagesleiste', () => {
  it('AC-027: Hummus Mo Mittag today "bis ca. 23 Uhr", Mo Abend "Heute Abend"', () => {
    const lunch = entry({ id: 'h', date: '2026-11-23', slotId: 'slot-mittag', recipeId: 'hummus' });
    expect(lines([lunch])).toEqual([
      'Heute bis ca. 23 Uhr: Kichererbsen einweichen · Hummus (morgen Mittag)',
    ]);
    const dinner = { ...lunch, slotId: 'slot-abend' };
    expect(lines([dinner])).toEqual([
      'Heute Abend: Kichererbsen einweichen · Hummus (morgen Abend)',
    ]);
    expect(lines([dinner], '2026-11-23')).toEqual([]);
  });

  it('AC-028: Bulgogi Di Abend today "bis ca. 17 Uhr", Monday nothing', () => {
    const tuesday = entry({ id: 'b', date: '2026-11-24', recipeId: 'bulgogi' });
    expect(lines([tuesday])).toEqual([
      'Heute bis ca. 17 Uhr: Fleisch marinieren · Bulgogi (Di 24.11., Abend)',
    ]);
    expect(lines([tuesday], '2026-11-23')).toEqual([]);
  });

  it('AC-029: a collection names each of its recipes with a lead time', () => {
    const grill = entry({ id: 'g', date: '2026-11-23', recipeId: grillabend.id });
    expect(lines([grill])).toEqual([
      'Heute bis ca. 17 Uhr: Spieße marinieren · Grillabend: Grillspieße (morgen Abend)',
    ]);
  });

  it('AC-030: a later day reads "Bis ca. 23 Uhr", a past day has no line', () => {
    const wednesday = entry({
      id: 'h',
      date: '2026-11-25',
      slotId: 'slot-mittag',
      recipeId: 'hummus',
    });
    expect(lines([wednesday], '2026-11-24')).toEqual([
      'Bis ca. 23 Uhr: Kichererbsen einweichen · Hummus (Mi 25.11., Mittag)',
    ]);
    expect(lines([wednesday])).toEqual([]);
    const yesterday = entry({ id: 'y', date: '2026-11-22', recipeId: 'hummus' });
    expect(lines([yesterday], '2026-11-21')).toEqual([]);
  });

  it('AC-030: a later day with a start in the night reads "Abends"', () => {
    const wednesday = entry({ id: 'h', date: '2026-11-25', recipeId: 'hummus' });
    expect(lines([wednesday], '2026-11-24')).toEqual([
      'Abends: Kichererbsen einweichen · Hummus (Mi 25.11., Abend)',
    ]);
  });

  it('AC-031: planned at 10 Uhr for tonight: "Schon fällig" first, not on Monday', () => {
    const tonight = entry({ id: 'h', recipeId: 'hummus' });
    const tuesday = entry({ id: 'b', date: '2026-11-24', recipeId: 'bulgogi' });
    expect(lines([tuesday, tonight], today, '10:00')).toEqual([
      'Schon fällig: Kichererbsen einweichen · Hummus (heute Abend)',
      'Heute bis ca. 17 Uhr: Fleisch marinieren · Bulgogi (Di 24.11., Abend)',
    ]);
    expect(lines([tonight], '2026-11-23', '10:00')).toEqual([]);
  });

  it('AC-031: when Monday is today, the missed start of Sunday evening is "Schon fällig"', () => {
    const dinner = entry({ id: 'h', date: '2026-11-23', recipeId: 'hummus' });
    const monday = prepLines({
      entries: [dinner],
      book: { recipesById, collectionRecipes },
      slots,
      shown: '2026-11-23',
      today: '2026-11-23',
      now: '08:00',
    });
    expect(monday.map((line) => line.text)).toEqual([
      'Schon fällig: Kichererbsen einweichen · Hummus (heute Abend)',
    ]);
  });

  it('AC-031: a time of today that has passed is "Schon fällig" too', () => {
    const tuesday = entry({ id: 'b', date: '2026-11-24', recipeId: 'bulgogi' });
    expect(lines([tuesday], today, '17:30')).toEqual([
      'Schon fällig: Fleisch marinieren · Bulgogi (Di 24.11., Abend)',
    ]);
  });

  it('order: "Schon fällig", then by start, "Heute Abend" last', () => {
    const monLunch = entry({
      id: 'h1',
      date: '2026-11-23',
      slotId: 'slot-mittag',
      recipeId: 'hummus',
    });
    const monDinner = entry({ id: 'h2', date: '2026-11-23', recipeId: 'hummus' });
    const tuesday = entry({ id: 'b', date: '2026-11-24', recipeId: 'bulgogi' });
    expect(lines([monDinner, monLunch, tuesday]).map((line) => line.split(':')[0])).toEqual([
      'Heute bis ca. 17 Uhr',
      'Heute bis ca. 23 Uhr',
      'Heute Abend',
    ]);
  });

  it('a Vorlauf the editor never writes (1.5 h, 0 h, over 168 h) is no line, as in SQL', () => {
    for (const hoursBefore of [1.5, 0, 169, 2000000000]) {
      const odd = makeRecipe({ id: 'odd', title: 'Odd', leadTime: { text: 'x', hoursBefore } });
      const input: PrepInput = {
        entries: [entry({ id: 'o', date: '2026-11-23', recipeId: 'odd' })],
        book: { recipesById: { odd }, collectionRecipes: [] },
        slots,
        shown: today,
        today,
        now: '08:00',
      };
      expect(prepLines(input), String(hoursBefore)).toEqual([]);
    }
  });

  it('AC-032: nothing with a lead time, no line; leftovers, text, restaurants never', () => {
    expect(lines([entry({ id: 'k', date: '2026-11-23', recipeId: 'kartoffelsalat' })])).toEqual([]);
    expect(
      lines([
        entry({ id: 'r', date: '2026-11-23', kind: 'leftovers', recipeId: 'hummus' }),
        entry({ id: 't', date: '2026-11-23', kind: 'text', text: 'Hummus' }),
        entry({ id: 'reserved', date: null, recipeId: 'hummus' }),
        entry({ id: 'gone', date: '2026-11-23', recipeId: 'deleted' }),
      ]),
    ).toEqual([]);
  });
});

describe('spec 0020 REQ-007: "Vorbereiten" in the daily summary', () => {
  const summary = (entries: MealPlanEntry[], now = '07:30') =>
    prepSummary(
      prepLines({
        entries,
        book: { recipesById, collectionRecipes },
        slots,
        shown: today,
        today,
        now,
      }),
    );

  it('AC-033: at 7:30 "Fleisch marinieren (bis ca. 17 Uhr), Kichererbsen einweichen (…23 Uhr)"', () => {
    expect(
      summary([
        entry({ id: 'l', recipeId: 'kartoffelsalat' }),
        entry({ id: 'h', date: '2026-11-23', slotId: 'slot-mittag', recipeId: 'hummus' }),
        entry({ id: 'b', date: '2026-11-24', recipeId: 'bulgogi' }),
      ]),
    ).toBe(
      'Vorbereiten: Fleisch marinieren (bis ca. 17 Uhr), Kichererbsen einweichen (bis ca. 23 Uhr)',
    );
  });

  it('AC-035: nothing to start today, no part', () => {
    expect(
      summary([entry({ id: 'h', date: '2026-11-25', slotId: 'slot-mittag', recipeId: 'hummus' })]),
    ).toBeUndefined();
  });

  it('"heute Abend" and "schon fällig" read in lower case', () => {
    expect(
      summary([
        entry({ id: 'h1', recipeId: 'hummus' }),
        entry({ id: 'h2', date: '2026-11-23', recipeId: 'hummus' }),
      ]),
    ).toBe(
      'Vorbereiten: Kichererbsen einweichen (schon fällig), Kichererbsen einweichen (heute Abend)',
    );
  });
});
