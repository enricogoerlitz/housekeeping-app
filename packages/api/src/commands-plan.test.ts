import { addDays, entriesForDay, isoWeekday } from '@housekeeping/core';
import { describe, expect, it } from 'vitest';

import { addAbsence } from './commands-household';
import {
  addPlanEntry,
  createAndPlanActivity,
  createAndPlanRecipe,
  createAndPlanRestaurant,
  defaultEaterIds,
  movePlanEntry,
  updatePlanEntry,
} from './commands-plan';
import { readMapsLink } from './commands-restaurants';
import { pantryCheckRows } from './commands-shopping';
import { ENRICO, NADJA, SLOT_DINNER, SLOT_MORNING } from './seed/demo';
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

describe('activities in the plan (spec 0004)', () => {
  const saturday = addDays(TODAY, 8);
  const entryById = (id: string) => getData().planEntries.find((entry) => entry.id === id);

  it('AC-013: an activity with a Zusatz is planned and puts nothing on the shopping list', () => {
    const id = addPlanEntry({
      date: saturday,
      slotId: SLOT_MORNING,
      kind: 'activity',
      activityId: 'act-eislaufen',
      note: ' Hohenschönhausen ',
      eaterIds: [ENRICO, NADJA],
    });
    expect(entryById(id)).toMatchObject({
      kind: 'activity',
      activityId: 'act-eislaufen',
      note: 'Hohenschönhausen',
      slotId: SLOT_MORNING,
      variants: [],
    });
    expect(pantryCheckRows([id])).toEqual([]);
  });

  it('AC-002: in one Tageszeit activities come first, restaurants last', () => {
    const base = { date: saturday, slotId: SLOT_DINNER, eaterIds: [ENRICO, NADJA] };
    addPlanEntry({ ...base, kind: 'recipe', recipeId: 'rec-lasagne' });
    addPlanEntry({ ...base, kind: 'recipe', recipeId: 'rec-gemischter-salat' });
    addPlanEntry({ ...base, kind: 'restaurant', restaurantId: 'rest-enzo' });
    addPlanEntry({ ...base, kind: 'activity', activityId: 'act-bouldern' });
    const dinner = entriesForDay(getData().planEntries, saturday, [SLOT_MORNING, SLOT_DINNER]);
    expect(dinner.map((entry) => entry.recipeId ?? entry.restaurantId ?? entry.activityId)).toEqual(
      ['act-bouldern', 'rec-lasagne', 'rec-gemischter-salat', 'rest-enzo'],
    );
  });

  it('refuses an unknown activity and a Zusatz longer than 120 characters', () => {
    const base = { date: saturday, slotId: SLOT_MORNING, eaterIds: [ENRICO] };
    const before = getData().planEntries;
    expect(() => addPlanEntry({ ...base, kind: 'activity', activityId: 'act-weg' })).toThrow(
      'Aktivität nicht gefunden',
    );
    expect(() => addPlanEntry({ ...base, kind: 'activity' })).toThrow('Aktivität nicht gefunden');
    expect(() =>
      addPlanEntry({
        ...base,
        kind: 'activity',
        activityId: 'act-bouldern',
        note: 'x'.repeat(121),
      }),
    ).toThrow('Der Zusatz ist zu lang (höchstens 120 Zeichen)');
    expect(getData().planEntries).toBe(before);
  });

  it('keeps a Zusatz only on activities', () => {
    const id = addPlanEntry({
      date: saturday,
      slotId: SLOT_DINNER,
      kind: 'restaurant',
      restaurantId: 'rest-enzo',
      note: 'Tisch am Fenster',
      eaterIds: [ENRICO],
    });
    expect(entryById(id)?.note).toBeUndefined();
  });

  it('edits the Zusatz; an empty one is removed', () => {
    const entry = getData().planEntries.find((candidate) => candidate.kind === 'activity');
    if (!entry) throw new Error('fixture');
    updatePlanEntry(entry.id, { note: ' Mit Lena ' });
    expect(entryById(entry.id)?.note).toBe('Mit Lena');
    updatePlanEntry(entry.id, { note: '  ' });
    expect(entryById(entry.id)?.note).toBeUndefined();
  });

  it('switching an activity entry to another kind drops its activity and Zusatz', () => {
    const entry = getData().planEntries.find(
      (candidate) => candidate.kind === 'activity' && candidate.note,
    );
    if (!entry) throw new Error('fixture');
    updatePlanEntry(entry.id, { kind: 'text', text: 'Spazieren gehen' });
    expect(entryById(entry.id)).toMatchObject({ kind: 'text', text: 'Spazieren gehen' });
    expect(entryById(entry.id)?.activityId).toBeUndefined();
    expect(entryById(entry.id)?.note).toBeUndefined();
  });
});

describe('create while planning (spec 0004, REQ-008)', () => {
  const saturday = addDays(TODAY, 8);
  const sunday = addDays(TODAY, 9);
  const plan = (date: string, slotId: string) => ({ date, slotId, eaterIds: [ENRICO, NADJA] });

  it('AC-021: "Klettern im Wald" is in the collection and planned on Saturday morning', () => {
    const { activityId, entryId } = createAndPlanActivity(
      { name: 'Klettern im Wald' },
      { ...plan(saturday, SLOT_MORNING), note: 'mit Seil' },
    );
    expect(getData().activities[0]).toMatchObject({ id: activityId, name: 'Klettern im Wald' });
    expect(getData().planEntries.find((entry) => entry.id === entryId)).toMatchObject({
      kind: 'activity',
      activityId,
      date: saturday,
      slotId: SLOT_MORNING,
      note: 'mit Seil',
    });
  });

  it('AC-023: without name nothing is created and nothing is planned', () => {
    const before = getData();
    expect(() => createAndPlanActivity({ name: ' ' }, plan(saturday, SLOT_MORNING))).toThrow(
      'Name fehlt',
    );
    expect(() => createAndPlanActivity({ name: 'Bouldern' }, plan(saturday, SLOT_MORNING))).toThrow(
      'Gibt es schon: Bouldern',
    );
    expect(() => createAndPlanRecipe({ title: '' }, plan(sunday, SLOT_DINNER))).toThrow(
      'Titel fehlt',
    );
    expect(() => createAndPlanRestaurant({ name: '' }, plan(sunday, SLOT_DINNER))).toThrow(
      'Name fehlt',
    );
    expect(getData()).toBe(before);
  });

  it('AC-022: "Kürbissuppe" and a restaurant from a map link are created and planned on Sunday evening', () => {
    const soup = createAndPlanRecipe({ title: 'Kürbissuppe' }, plan(sunday, SLOT_DINNER));
    const reading = readMapsLink('https://www.google.com/maps/place/Neues+Lokal/@50.94,6.95,17z');
    if (reading.status !== 'place') throw new Error('fixture');
    const lokal = createAndPlanRestaurant(reading.draft, plan(sunday, SLOT_DINNER));
    expect(getData().recipes[0]).toMatchObject({ id: soup.recipeId, title: 'Kürbissuppe' });
    expect(getData().restaurants[0]).toMatchObject({
      id: lokal.restaurantId,
      name: 'Neues Lokal',
      location: { lat: 50.94, lng: 6.95 },
    });
    const sundayEvening = getData().planEntries.filter(
      (entry) => entry.date === sunday && entry.slotId === SLOT_DINNER,
    );
    expect(sundayEvening.map((entry) => [entry.id, entry.kind])).toEqual([
      [soup.entryId, 'recipe'],
      [lokal.entryId, 'restaurant'],
    ]);
    expect(sundayEvening[0]).toMatchObject({ recipeId: soup.recipeId, portions: 2 });
    expect(sundayEvening[1]).toMatchObject({ restaurantId: lokal.restaurantId });
  });
});
