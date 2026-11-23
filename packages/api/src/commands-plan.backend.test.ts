// Meal plan commands (spec 0003): all on the diff path; removing an entry declares
// its delete and takes recipe-less leftovers of it along (the database would refuse to keep them).
import {
  addDays,
  entriesForDay,
  ingredientDrafts,
  rowsFromIngredientDrafts,
} from '@housekeeping/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { onWriteRejected, WRITE_REJECTED_MESSAGE } from './backend';
import { H, originSummary, TODAY, withBackend } from './backend-test-helpers';
import { createTrip } from './commands-trips';
import {
  addPlanEntry,
  createAndPlanActivity,
  createAndPlanRecipe,
  createAndPlanRestaurant,
  defaultEaterIds,
  movePlanEntry,
  RECIPE_GONE_MESSAGE,
  removePlanEntry,
  saveEntry,
  setEntryReminder,
  updatePlanEntry,
} from './commands-plan';
import { insertArticles } from './commands-articles';
import { createRecipeWithIngredients } from './commands-recipes';
import { readMapsLink } from './commands-restaurants';
import { addPlannedToList, addShoppingItemFromText, pantryCheckRows } from './commands-shopping';
import { ENRICO, NADJA, SLOT_DINNER, SLOT_LUNCH, SLOT_MORNING } from './seed/demo';
import { commit, getData, OfflineError, snapshot } from './store';
import { starterCatalogEntries } from './starter/entries';
import { TransportError, type ChangeOp } from './transport';

const fx = withBackend();

const opsOf = (index: number) => (fx.calls[index]?.args[1] ?? []) as ChangeOp[];
const entryById = (id: string) => getData().planEntries.find((entry) => entry.id === id);

describe('meal plan (diff path)', () => {
  it('AC-013: a dish added here appears on the other device; edits are patches', async () => {
    await fx.startEnrico();
    const nadja = await fx.startNadja();
    const date = addDays(TODAY, 3);
    const id = addPlanEntry({
      date,
      slotId: SLOT_DINNER,
      kind: 'recipe',
      recipeId: 'rec-mango-curry',
      eaterIds: [ENRICO, NADJA],
      cookId: NADJA,
    });
    updatePlanEntry(id, { guests: 2 });
    movePlanEntry(id, null);
    await fx.settle(nadja);
    expect(fx.calls.map((call) => call.fn)).toEqual(Array(3).fill('applyChanges'));
    expect(opsOf(0)).toEqual([
      expect.objectContaining({
        kind: 'insert',
        table: 'meal_plan_entries',
        row: expect.objectContaining({ id, recipe_id: 'rec-mango-curry', date, cook_id: NADJA }),
      }),
    ]);
    expect(opsOf(1)).toEqual([
      { kind: 'patch', table: 'meal_plan_entries', id, changes: { guests: 2 } },
    ]);
    expect(opsOf(2)).toEqual([
      expect.objectContaining({
        kind: 'patch',
        id,
        changes: expect.objectContaining({ date: null }),
      }),
    ]);
    expect(fx.nadjaData(nadja).planEntries.find((entry) => entry.id === id)).toMatchObject({
      date: null,
      guests: 2,
    });
  });

  it('AC-015: removing sends one delete; undo inserts the entry again', async () => {
    await fx.startEnrico();
    const nadja = await fx.startNadja();
    const entry = getData().planEntries.find(
      (candidate) =>
        candidate.kind === 'recipe' &&
        !getData().planEntries.some((other) => other.leftoversOfEntryId === candidate.id),
    );
    if (!entry) throw new Error('fixture');
    const restore = snapshot();
    removePlanEntry(entry.id);
    expect(entryById(entry.id)).toBeUndefined();
    await fx.settle(nadja);
    expect(opsOf(0)).toEqual([{ kind: 'delete', table: 'meal_plan_entries', id: entry.id }]);
    expect(fx.nadjaData(nadja).planEntries.some((other) => other.id === entry.id)).toBe(false);

    restore();
    expect(entryById(entry.id)).toBeDefined();
    await fx.settle(nadja);
    expect(opsOf(1)).toEqual([
      expect.objectContaining({ kind: 'insert', table: 'meal_plan_entries' }),
    ]);
    expect(fx.server.row(H, 'meal_plan_entries', entry.id)).toBeDefined();
    expect(fx.nadjaData(nadja).planEntries.some((other) => other.id === entry.id)).toBe(true);
  });

  it('removing a dish keeps its leftovers that name the recipe (the server clears the link)', async () => {
    await fx.startEnrico();
    const leftovers = getData().planEntries.find((entry) => entry.kind === 'leftovers');
    const source = leftovers && entryById(leftovers.leftoversOfEntryId ?? '');
    if (!leftovers?.recipeId || !source) throw new Error('fixture');
    removePlanEntry(source.id);
    await fx.settle();
    expect(opsOf(0)).toEqual([{ kind: 'delete', table: 'meal_plan_entries', id: source.id }]);
    expect(fx.server.row(H, 'meal_plan_entries', leftovers.id)).toMatchObject({
      leftovers_of_entry_id: null,
    });
    expect(entryById(leftovers.id)).toBeDefined();
  });

  it('removing a free-text dish removes its leftovers with it, in the same call', async () => {
    await fx.startEnrico();
    const date = addDays(TODAY, 4);
    const text = addPlanEntry({
      date,
      slotId: SLOT_DINNER,
      kind: 'text',
      text: 'Gulasch bei Oma',
      eaterIds: [ENRICO],
    });
    const leftovers = addPlanEntry({
      date: addDays(date, 1),
      slotId: SLOT_LUNCH,
      kind: 'leftovers',
      leftoversOfEntryId: text,
      eaterIds: [ENRICO],
    });
    await fx.settle();
    fx.clearCalls();

    const restore = snapshot();
    removePlanEntry(text);
    expect(entryById(leftovers)).toBeUndefined();
    await fx.settle();
    expect(fx.calls.map((call) => call.fn)).toEqual(['applyChanges']);
    expect(opsOf(0)).toEqual(
      expect.arrayContaining([
        { kind: 'delete', table: 'meal_plan_entries', id: text },
        { kind: 'delete', table: 'meal_plan_entries', id: leftovers },
      ]),
    );
    expect(fx.server.row(H, 'meal_plan_entries', leftovers)).toBeUndefined();

    restore();
    await fx.settle();
    expect(fx.server.row(H, 'meal_plan_entries', text)).toBeDefined();
    expect(fx.server.row(H, 'meal_plan_entries', leftovers)).toMatchObject({
      leftovers_of_entry_id: text,
    });
  });
});

describe('meal plan commands: input and local effect', () => {
  beforeEach(async () => {
    await fx.startEnrico();
  });

  it('AC-024: Mango-Curry on an empty evening is split "mit Tofu 1 · mit Hähnchen 1"', () => {
    const date = addDays(TODAY, 3);
    expect(
      getData().planEntries.filter((e) => e.date === date && e.slotId === SLOT_DINNER),
    ).toEqual([]);
    const eaterIds = defaultEaterIds();
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

  it('C-07 (0031): addPlanEntry drops variants with 0 portions itself', () => {
    const id = addPlanEntry({
      date: addDays(TODAY, 3),
      slotId: SLOT_DINNER,
      kind: 'recipe',
      recipeId: 'rec-mango-curry',
      eaterIds: [ENRICO, NADJA],
      portions: 2,
      variants: [
        { variantId: 'mango-curry-v1', portions: 2 },
        { variantId: 'mango-curry-v2', portions: 0 },
      ],
    });
    expect(entryById(id)?.variants).toEqual([{ variantId: 'mango-curry-v1', portions: 2 }]);
  });

  it('AC-027 (0030): a trip changes nothing: everyone is preselected', () => {
    const saturday = addDays(TODAY, 1);
    createTrip({ memberIds: [ENRICO], from: saturday, to: addDays(saturday, 2) });
    expect(defaultEaterIds()).toEqual([ENRICO, NADJA]);
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
    expect(() => addPlanEntry({ ...base, kind: 'text', text: '  ' })).toThrow(
      'Bitte etwas eintragen',
    );
    expect(getData().planEntries).toHaveLength(before);
  });
});

describe('activities in the plan (spec 0004)', () => {
  const saturday = addDays(TODAY, 8);

  beforeEach(async () => {
    await fx.startEnrico();
  });

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
    ).toThrow('Höchstens 120 Zeichen');
    expect(getData().planEntries).toBe(before);
  });

  it('spec 0021, AC-023: every kind keeps its Zusatz, "Trattoria Da Enzo (Tisch am Fenster)"', () => {
    const id = addPlanEntry({
      date: saturday,
      slotId: SLOT_DINNER,
      kind: 'restaurant',
      restaurantId: 'rest-enzo',
      note: 'Tisch am Fenster',
      eaterIds: [ENRICO],
    });
    expect(entryById(id)?.note).toBe('Tisch am Fenster');
  });

  it('edits the Zusatz; an empty one is removed', () => {
    const entry = getData().planEntries.find((candidate) => candidate.kind === 'activity');
    if (!entry) throw new Error('fixture');
    updatePlanEntry(entry.id, { note: ' Mit Lena ' });
    expect(entryById(entry.id)?.note).toBe('Mit Lena');
    updatePlanEntry(entry.id, { note: '  ' });
    expect(entryById(entry.id)?.note).toBeUndefined();
  });

  it('switching an activity entry to another kind drops its activity and time, keeps its Zusatz', () => {
    const entry = getData().planEntries.find(
      (candidate) => candidate.kind === 'activity' && candidate.note,
    );
    if (!entry) throw new Error('fixture');
    updatePlanEntry(entry.id, { kind: 'text', text: 'Spazieren gehen' });
    expect(entryById(entry.id)).toMatchObject({ kind: 'text', text: 'Spazieren gehen' });
    expect(entryById(entry.id)?.activityId).toBeUndefined();
    expect(entryById(entry.id)?.startsAt).toBeUndefined();
    expect(entryById(entry.id)?.note).toBe(entry.note);
  });
});

describe('create while planning (spec 0004, REQ-008)', () => {
  const saturday = addDays(TODAY, 8);
  const sunday = addDays(TODAY, 9);
  const plan = (date: string, slotId: string) => ({ date, slotId, eaterIds: [ENRICO, NADJA] });

  beforeEach(async () => {
    await fx.startEnrico();
  });

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
    expect(getData()).toEqual(before);
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

describe('spec 0008: planning a recipe that was deleted meanwhile (E6)', () => {
  it('the refused entry jumps back with "Das Rezept gibt es nicht mehr"', async () => {
    await fx.startEnrico();
    const messages: string[] = [];
    const stop = onWriteRejected((message) => messages.push(message));
    await fx.server.transport(NADJA).deleteRecipe('rec-lasagne', TODAY);
    const id = addPlanEntry({
      date: addDays(TODAY, 1),
      slotId: SLOT_DINNER,
      kind: 'recipe',
      recipeId: 'rec-lasagne',
      eaterIds: [ENRICO, NADJA],
    });
    expect(entryById(id)).toBeDefined();
    await fx.settle();
    expect(entryById(id)).toBeUndefined();
    expect(messages).toEqual([RECIPE_GONE_MESSAGE]);
    stop();
  });

  it('another refusal keeps the general hint', async () => {
    await fx.startEnrico();
    const messages: string[] = [];
    const stop = onWriteRejected((message) => messages.push(message));
    fx.server.failNext('apply_changes', new TransportError('permanent', 'boom', 400));
    addPlanEntry({
      date: addDays(TODAY, 1),
      slotId: SLOT_DINNER,
      kind: 'recipe',
      recipeId: 'rec-lasagne',
      eaterIds: [ENRICO],
    });
    await fx.settle();
    expect(messages).toEqual([WRITE_REJECTED_MESSAGE]);
    stop();
  });

  it('negative: offline throws OfflineError', async () => {
    await fx.startEnrico();
    fx.environment.setOnline(false);
    expect(() =>
      addPlanEntry({
        date: TODAY,
        slotId: SLOT_DINNER,
        kind: 'recipe',
        recipeId: 'rec-lasagne',
        eaterIds: [ENRICO],
      }),
    ).toThrow(OfflineError);
  });
});

async function saveEntryAndSettle(...args: Parameters<typeof saveEntry>) {
  const saved = saveEntry(...args);
  await fx.settle();
  return saved;
}

describe('spec 0021, REQ-009: closing the window saves the entry in one call', () => {
  const plan = (input: Partial<Parameters<typeof addPlanEntry>[0]>) =>
    addPlanEntry({
      date: addDays(TODAY, 1),
      slotId: SLOT_DINNER,
      kind: 'recipe',
      recipeId: 'rec-mango-curry',
      eaterIds: [ENRICO, NADJA],
      ...input,
    });
  const ownContributions = (entryId: string, checked = false) =>
    getData()
      .items.filter((item) => item.checked === checked)
      .flatMap((item) =>
        item.contributions
          .filter((c) => c.source.kind === 'recipe' && c.source.entryId === entryId)
          .map((c) => ({ articleId: item.articleId, ...c })),
      );

  it('AC-025: the typed Zusatz "Hohenschönhausen" of "Eislaufen" is one patch, confirmed', async () => {
    await fx.startEnrico();
    const nadja = await fx.startNadja();
    const id = plan({ kind: 'activity', activityId: 'act-bouldern', recipeId: undefined });
    await fx.settle(nadja);
    fx.clearCalls();
    const saved = saveEntry(id, { note: ' Hohenschönhausen ' });
    await fx.settle(nadja);
    await expect(saved).resolves.toBeUndefined();
    expect(opsOf(0)).toEqual([
      { kind: 'patch', table: 'meal_plan_entries', id, changes: { note: 'Hohenschönhausen' } },
    ]);
    expect(fx.nadjaData(nadja).planEntries.find((entry) => entry.id === id)?.note).toBe(
      'Hohenschönhausen',
    );
  });

  it('AC-023: a recipe gets the Zusatz "doppelte Menge"; a restaurant is planned with one', async () => {
    await fx.startEnrico();
    const id = plan({});
    const enzo = plan({
      kind: 'restaurant',
      recipeId: undefined,
      restaurantId: 'rest-enzo',
      note: 'Tisch für 6',
    });
    await fx.settle();
    await saveEntryAndSettle(id, { note: 'doppelte Menge' });
    expect(fx.server.row(H, 'meal_plan_entries', id)).toMatchObject({ note: 'doppelte Menge' });
    expect(fx.server.row(H, 'meal_plan_entries', enzo)).toMatchObject({ note: 'Tisch für 6' });
  });

  it('AC-022: the free text changes; empty or with a line break it is refused before sending', async () => {
    await fx.startEnrico();
    const id = plan({ kind: 'text', recipeId: undefined, text: 'Essen bei Oam' });
    await fx.settle();
    await saveEntryAndSettle(id, { text: 'Essen bei Oma' });
    expect(entryById(id)?.text).toBe('Essen bei Oma');
    fx.clearCalls();
    expect(() => saveEntry(id, { text: '  ' })).toThrow('Bitte etwas eintragen');
    expect(() => saveEntry(id, { note: 'mit\nKuchen' })).toThrow('Ohne Zeilenumbrüche');
    expect(fx.calls).toEqual([]);
  });

  it('AC-035: "Uhrzeit 10:30" of an activity is starts_at; a recipe takes no time', async () => {
    await fx.startEnrico();
    const id = plan({ kind: 'activity', recipeId: undefined, activityId: 'act-bouldern' });
    const curry = plan({});
    await fx.settle();
    fx.clearCalls();
    await saveEntryAndSettle(id, { startsAt: '10:30' });
    expect(opsOf(0)).toEqual([
      { kind: 'patch', table: 'meal_plan_entries', id, changes: { starts_at: '10:30:00' } },
    ]);
    fx.clearCalls();
    await expect(saveEntry(curry, { startsAt: '10:30' })).resolves.toBeUndefined();
    expect(fx.calls).toEqual([]);
    expect(() => saveEntry(id, { startsAt: '10:33' })).toThrow('Keine gültige Uhrzeit');
  });

  it('AC-015: eaters, guests and portions are one patch', async () => {
    await fx.startEnrico();
    const id = plan({ eaterIds: [ENRICO], kind: 'recipe', recipeId: 'rec-mango-curry' });
    await fx.settle();
    fx.clearCalls();
    await saveEntryAndSettle(id, { eaterIds: [ENRICO, NADJA], portions: 3 });
    expect(opsOf(0)).toEqual([
      expect.objectContaining({
        kind: 'patch',
        id,
        changes: expect.objectContaining({ eater_ids: [ENRICO, NADJA], portions: 3 }),
      }),
    ]);
  });

  it('AC-019: twice the portions → the open items follow in the same call, with the hint label', async () => {
    await fx.startEnrico();
    const id = plan({});
    const rows = pantryCheckRows([id]).filter((row) => !row.isPantry);
    addPlannedToList(rows);
    await fx.settle();
    const entry = entryById(id);
    if (!entry) throw new Error('fixture');
    fx.clearCalls();
    const saved = saveEntry(id, {
      portions: entry.portions * 2,
      variants: entry.variants.map((row) => ({ ...row, portions: row.portions * 2 })),
    });
    await fx.settle();
    await expect(saved).resolves.toMatch(/^Mango-Curry \(/);
    expect(fx.calls.map((call) => call.fn)).toEqual(['applyChanges']);
    const expected = pantryCheckRows([id])
      .filter((row) => !row.isPantry)
      .flatMap((row) =>
        row.contributions.map((c) => ({ articleId: row.articleId, qty: c.qty, count: c.count })),
      );
    const actual = ownContributions(id).map((c) => ({
      articleId: c.articleId,
      qty: c.qty,
      count: c.count,
    }));
    expect(actual).toEqual(expect.arrayContaining(expected));
    expect(actual).toHaveLength(expected.length);
    for (const c of ownContributions(id)) {
      expect(fx.server.row(H, 'shopping_contributions', c.id)).toMatchObject({
        qty: c.qty ?? null,
      });
    }
  });

  it('AC-021: a checked item stays; when the server refuses, entry and list spring back', async () => {
    await fx.startEnrico();
    const messages: string[] = [];
    const stop = onWriteRejected((message) => messages.push(message));
    const id = plan({});
    addPlannedToList(pantryCheckRows([id]).filter((row) => !row.isPantry));
    await fx.settle();
    const before = getData().items;
    const entry = entryById(id);
    if (!entry) throw new Error('fixture');
    fx.server.failNext('apply_changes', new TransportError('permanent', '23503', 400));
    const saved = saveEntry(id, { portions: entry.portions + 2 });
    saved.catch(() => {});
    await fx.settle();
    await expect(saved).rejects.toMatchObject({ code: '23503' });
    expect(messages).toEqual([WRITE_REJECTED_MESSAGE]);
    expect(entryById(id)?.portions).toBe(entry.portions);
    expect(getData().items).toEqual(before);
    stop();
  });

  it('REQ-007: nothing of the entry on the list changes nothing on it', async () => {
    await fx.startEnrico();
    const id = plan({});
    await fx.settle();
    const before = getData().items;
    await expect(saveEntryAndSettle(id, { portions: 5 })).resolves.toBeUndefined();
    expect(getData().items).toBe(before);
  });

  it('negative: offline and a gone entry throw before anything changes', async () => {
    await fx.startEnrico();
    const id = plan({});
    await fx.settle();
    expect(() => saveEntry('gone', { note: 'x' })).toThrow('Den Eintrag gibt es nicht mehr');
    fx.environment.setOnline(false);
    expect(() => saveEntry(id, { note: 'doppelte Menge' })).toThrow(OfflineError);
    expect(entryById(id)?.note).toBeUndefined();
  });
});

describe('spec 0021, REQ-015: removing an entry with its contributions', () => {
  it('AC-040, AC-041: entry and its contributions go in one call; "von Hand" stays; undo brings all back', async () => {
    await fx.startEnrico();
    const id = addPlanEntry({
      date: addDays(TODAY, 1),
      slotId: SLOT_DINNER,
      kind: 'recipe',
      recipeId: 'rec-mango-curry',
      eaterIds: [ENRICO, NADJA],
    });
    const rows = pantryCheckRows([id]).filter((row) => !row.isPantry);
    addPlannedToList(rows);
    const first = rows[0];
    if (!first) throw new Error('fixture');
    addShoppingItemFromText(first.name);
    await fx.settle();
    const before = getData().items;
    const restore = snapshot();
    fx.clearCalls();
    expect(removePlanEntry(id, { withList: true })).toBe(rows.length);
    await fx.settle();
    expect(fx.calls.map((call) => call.fn)).toEqual(['applyChanges']);
    expect(entryById(id)).toBeUndefined();
    const left = getData().items.filter((item) => !item.checked);
    expect(
      left.some((item) =>
        item.contributions.some((c) => c.source.kind === 'recipe' && c.source.entryId === id),
      ),
    ).toBe(false);
    const manual = left.find((item) => item.articleId === first.articleId);
    expect(manual?.contributions.map((c) => c.source.kind)).toEqual(['manual']);
    restore();
    await fx.settle();
    expect(entryById(id)).toBeDefined();
    expect(getData().items.length).toBe(before.length);
  });

  it('REQ-015: "Nur aus dem Plan nehmen" keeps the contributions', async () => {
    await fx.startEnrico();
    const id = addPlanEntry({
      date: addDays(TODAY, 1),
      slotId: SLOT_DINNER,
      kind: 'recipe',
      recipeId: 'rec-mango-curry',
      eaterIds: [ENRICO],
    });
    addPlannedToList(pantryCheckRows([id]).filter((row) => !row.isPantry));
    await fx.settle();
    const before = getData().items;
    expect(removePlanEntry(id)).toBe(0);
    await fx.settle();
    expect(getData().items).toEqual(before);
  });
});

describe('spec 0021: a dish with more than 20 ingredients on the list (one call, no delete limit)', () => {
  let key = 0;
  /** "Grillabend" with 25 ingredients, planned for tomorrow and all of them on the list. */
  async function grillabend(): Promise<string> {
    await fx.startEnrico();
    const names = Array.from({ length: 25 }, (_, index) => `Zutat ${index + 1}`);
    commit({ path: 'diff' }, () =>
      insertArticles(
        names.map((name) => ({
          name,
          synonyms: [],
          diet: 'vegan' as const,
          isPantry: false,
          needsReview: false,
        })),
      ),
    );
    const lines = names.map((name) => `100 g ${name}`).join('\n');
    const rows = rowsFromIngredientDrafts(
      ingredientDrafts(lines, getData().articles, starterCatalogEntries, () => `paste-${++key}`),
    );
    const { recipeId } = createRecipeWithIngredients({ title: 'Grillabend' }, rows);
    const id = addPlanEntry({
      date: addDays(TODAY, 1),
      slotId: SLOT_DINNER,
      kind: 'recipe',
      recipeId,
      eaterIds: [ENRICO, NADJA],
    });
    addPlannedToList(pantryCheckRows([id]).filter((row) => !row.isPantry));
    await fx.settle();
    return id;
  }
  const serverContributions = (entryId: string) =>
    fx.server
      .rows(H, 'shopping_contributions')
      .filter((row) => (row.source as { entryId?: string } | null)?.entryId === entryId);

  it('AC-019: twice the portions of 25 ingredients follow in the same call', async () => {
    const id = await grillabend();
    expect(serverContributions(id)).toHaveLength(25);
    const entry = entryById(id);
    if (!entry) throw new Error('fixture');
    fx.clearCalls();
    const saved = saveEntry(id, { portions: entry.portions * 2 });
    await fx.settle();
    await expect(saved).resolves.toMatch(/^Grillabend \(/);
    expect(fx.calls.map((call) => call.fn)).toEqual(['applyChanges']);
    expect(opsOf(0)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'replace_entry_contributions', entry_ids: [id] }),
      ]),
    );
    const onServer = serverContributions(id);
    expect(onServer).toHaveLength(25);
    expect(new Set(onServer.map((row) => Number(row.qty)))).toEqual(new Set([200]));
    const local = getData().items.flatMap((item) =>
      item.contributions.filter((c) => c.source.kind === 'recipe' && c.source.entryId === id),
    );
    expect(local.map((c) => c.id).sort()).toEqual(onServer.map((row) => row.id).sort());
  });

  it('AC-040: removing it with its 25 ingredients is one call; undo brings everything back', async () => {
    const id = await grillabend();
    const items = getData().items.length;
    const restore = snapshot();
    fx.clearCalls();
    expect(removePlanEntry(id, { withList: true })).toBe(25);
    await fx.settle();
    expect(fx.calls.map((call) => call.fn)).toEqual(['applyChanges']);
    expect(fx.server.row(H, 'meal_plan_entries', id)).toBeUndefined();
    expect(serverContributions(id)).toEqual([]);
    expect(getData().items.length).toBe(items - 25);
    restore();
    await fx.settle();
    expect(fx.server.row(H, 'meal_plan_entries', id)).toBeDefined();
    expect(serverContributions(id)).toHaveLength(25);
    expect(getData().items.length).toBe(items);
  });
});

describe('entry reminders (spec 0017, diff path)', () => {
  // Friday 20.11.2026, 11:00 in Berlin (withBackend); the household's zone is Europe/Berlin.
  const SATURDAY = addDays(TODAY, 1);
  const SUNDAY = addDays(TODAY, 2);
  const stored = (id: string) => fx.server.row(H, 'meal_plan_entries', id);

  async function lasagne(reminder?: { offsetDays: number; at: string; text?: string }) {
    const id = addPlanEntry({
      date: SATURDAY,
      slotId: SLOT_DINNER,
      kind: 'text',
      text: 'Lasagne',
      eaterIds: [ENRICO, NADJA],
      ...(reminder ? { reminder } : {}),
    });
    await fx.settle();
    fx.clearCalls();
    return id;
  }

  it('AC-005, AC-014: setEntryReminder is one patch; the text is trimmed; the other device sees it', async () => {
    await fx.startEnrico();
    const nadja = await fx.startNadja();
    const id = await lasagne();
    setEntryReminder(id, { offsetDays: 1, at: '18:00', text: '  Fleisch auftauen ' });
    expect(entryById(id)?.reminder).toEqual({
      offsetDays: 1,
      at: '18:00',
      text: 'Fleisch auftauen',
    });
    await fx.settle(nadja);
    expect(opsOf(0)).toEqual([
      {
        kind: 'patch',
        table: 'meal_plan_entries',
        id,
        changes: {
          reminder_day_offset: 1,
          reminder_at: '18:00:00',
          reminder_text: 'Fleisch auftauen',
        },
      },
    ]);
    expect(fx.nadjaData(nadja).planEntries.find((entry) => entry.id === id)?.reminder).toEqual({
      offsetDays: 1,
      at: '18:00',
      text: 'Fleisch auftauen',
    });
  });

  it('AC-006: null switches it off: all three columns null; an empty text is no text', async () => {
    await fx.startEnrico();
    const id = await lasagne({ offsetDays: 1, at: '18:00', text: 'Fleisch auftauen' });
    setEntryReminder(id, { offsetDays: 1, at: '18:00', text: '   ' });
    setEntryReminder(id, null);
    expect(entryById(id)?.reminder).toBeUndefined();
    await fx.settle();
    expect(opsOf(0)).toEqual([
      { kind: 'patch', table: 'meal_plan_entries', id, changes: { reminder_text: null } },
    ]);
    expect(opsOf(1)).toEqual([
      {
        kind: 'patch',
        table: 'meal_plan_entries',
        id,
        changes: { reminder_day_offset: null, reminder_at: null },
      },
    ]);
    expect(stored(id)).toMatchObject({
      reminder_day_offset: null,
      reminder_at: null,
      reminder_text: null,
    });
  });

  it('AC-002: addPlanEntry with a reminder inserts it in the same row', async () => {
    await fx.startEnrico();
    const id = addPlanEntry({
      date: SATURDAY,
      slotId: SLOT_DINNER,
      kind: 'text',
      text: 'Lasagne',
      eaterIds: [ENRICO],
      reminder: { offsetDays: 0, at: '17:00' },
    });
    await fx.settle();
    expect(fx.calls.map((call) => call.fn)).toEqual(['applyChanges']);
    expect(opsOf(0)).toEqual([
      expect.objectContaining({
        kind: 'insert',
        row: expect.objectContaining({ id, reminder_day_offset: 0, reminder_at: '17:00:00' }),
      }),
    ]);
    expect(stored(id)).toMatchObject({ reminder_day_offset: 0, reminder_at: '17:00:00' });
  });

  it('AC-003: "Vormerken" takes no reminder', async () => {
    await fx.startEnrico();
    expect(() =>
      addPlanEntry({
        date: null,
        slotId: SLOT_DINNER,
        kind: 'text',
        text: 'Shakshuka',
        eaterIds: [ENRICO],
        reminder: { offsetDays: 0, at: '17:00' },
      }),
    ).toThrow();
    await fx.settle();
    expect(fx.calls).toEqual([]);
  });

  it('AC-021: moving to another day keeps offset, time and text; changing the meal keeps the time', async () => {
    await fx.startEnrico();
    const id = await lasagne({ offsetDays: 1, at: '18:00', text: 'Käse' });
    movePlanEntry(id, SUNDAY, SLOT_LUNCH);
    await fx.settle();
    expect(opsOf(0)).toEqual([
      expect.objectContaining({
        kind: 'patch',
        changes: expect.not.objectContaining({ reminder_day_offset: expect.anything() }),
      }),
    ]);
    expect(stored(id)).toMatchObject({
      date: SUNDAY,
      slot_id: SLOT_LUNCH,
      reminder_day_offset: 1,
      reminder_at: '18:00:00',
      reminder_text: 'Käse',
    });
    expect(entryById(id)?.reminder).toEqual({ offsetDays: 1, at: '18:00', text: 'Käse' });
  });

  it('AC-022: moving onto a day where the reminder has passed is not refused; undo brings it back', async () => {
    await fx.startEnrico();
    const id = await lasagne({ offsetDays: 1, at: '18:00' });
    const restore = snapshot();
    movePlanEntry(id, TODAY);
    await fx.settle();
    expect(stored(id)).toMatchObject({ date: TODAY, reminder_day_offset: 1 });
    restore();
    await fx.settle();
    expect(stored(id)).toMatchObject({ date: SATURDAY, reminder_day_offset: 1 });
  });

  it('AC-023: "Vormerken" clears the reminder in the same patch; undo restores date and reminder', async () => {
    await fx.startEnrico();
    const id = await lasagne({ offsetDays: 0, at: '17:00', text: 'Käse kaufen' });
    const restore = snapshot();
    movePlanEntry(id, null);
    expect(entryById(id)?.reminder).toBeUndefined();
    await fx.settle();
    expect(fx.calls.map((call) => call.fn)).toEqual(['applyChanges']);
    expect(opsOf(0)).toEqual([
      expect.objectContaining({
        kind: 'patch',
        id,
        changes: expect.objectContaining({
          date: null,
          reminder_day_offset: null,
          reminder_at: null,
          reminder_text: null,
        }),
      }),
    ]);
    expect(stored(id)).toMatchObject({ date: null, reminder_at: null });
    restore();
    await fx.settle();
    expect(stored(id)).toMatchObject({
      date: SATURDAY,
      reminder_day_offset: 0,
      reminder_at: '17:00:00',
      reminder_text: 'Käse kaufen',
    });
    expect(entryById(id)?.reminder).toEqual({ offsetDays: 0, at: '17:00', text: 'Käse kaufen' });
  });

  it('AC-024: removing and undo bring a future reminder back', async () => {
    await fx.startEnrico();
    const id = await lasagne({ offsetDays: 0, at: '17:00' });
    const restore = snapshot();
    removePlanEntry(id);
    await fx.settle();
    expect(stored(id)).toBeUndefined();
    restore();
    await fx.settle();
    expect(stored(id)).toMatchObject({ reminder_day_offset: 0, reminder_at: '17:00:00' });
    expect(entryById(id)?.reminder).toEqual({ offsetDays: 0, at: '17:00' });
  });

  it('REQ-006: undo after removing drops a reminder that has passed meanwhile and restores the entry', async () => {
    await fx.startEnrico();
    const rejected: string[] = [];
    const stop = onWriteRejected((message) => rejected.push(message));
    const id = addPlanEntry({
      date: TODAY,
      slotId: SLOT_DINNER,
      kind: 'text',
      text: 'Curry',
      eaterIds: [ENRICO],
      reminder: { offsetDays: 0, at: '11:30', text: 'Reis kochen' },
    });
    await fx.settle();
    // 11:45 in Berlin: the reminder at 11:30 has passed and would not be sent anyway.
    vi.setSystemTime(new Date('2026-11-20T10:45:00Z'));
    const restore = snapshot();
    removePlanEntry(id);
    await fx.settle();
    restore();
    expect(entryById(id)?.reminder).toBeUndefined();
    await fx.settle();
    stop();
    expect(rejected).toEqual([]);
    expect(stored(id)).toMatchObject({
      text: 'Curry',
      reminder_day_offset: null,
      reminder_at: null,
      reminder_text: null,
    });
    expect(entryById(id)).toMatchObject({ text: 'Curry', reminder: undefined });
  });

  it('AC-004, REQ-002: offline nothing is set, cleared or added with a reminder', async () => {
    await fx.startEnrico();
    const id = await lasagne({ offsetDays: 0, at: '17:00' });
    fx.environment.setOnline(false);
    expect(() => setEntryReminder(id, { offsetDays: 1, at: '18:00' })).toThrow(OfflineError);
    expect(() => setEntryReminder(id, null)).toThrow(OfflineError);
    expect(() =>
      addPlanEntry({
        date: SATURDAY,
        slotId: SLOT_LUNCH,
        kind: 'text',
        text: 'Suppe',
        eaterIds: [ENRICO],
        reminder: { offsetDays: 0, at: '10:00' },
      }),
    ).toThrow(OfflineError);
    expect(entryById(id)?.reminder).toEqual({ offsetDays: 0, at: '17:00' });
    await fx.settle();
    expect(fx.calls).toEqual([]);
  });

  it.each([
    ['AC-011: a moment in the past', { offsetDays: 1, at: '18:00' }, 'Liegt in der Vergangenheit'],
    [
      'AC-012: a time outside 5-minute steps',
      { offsetDays: 0, at: '17:03' },
      'Keine gültige Uhrzeit',
    ],
    [
      'AC-013: a day after the entry',
      { offsetDays: -1, at: '18:00' },
      'Liegt nach dem Tag des Eintrags',
    ],
    [
      'AC-013: more than 366 days before',
      { offsetDays: 367, at: '18:00' },
      'Höchstens 366 Tage vorher',
    ],
    [
      'AC-015: 81 characters',
      { offsetDays: 0, at: '17:00', text: 'x'.repeat(81) },
      'Höchstens 80 Zeichen',
    ],
    [
      'AC-015: a line break',
      { offsetDays: 0, at: '17:00', text: 'Käse\nkaufen' },
      'Ohne Zeilenumbrüche',
    ],
  ] as const)('%s is refused before anything is sent', async (_, reminder, message) => {
    await fx.startEnrico();
    // The day before an entry today is yesterday; every other case is about Saturday.
    const id =
      reminder.offsetDays === 1
        ? addPlanEntry({
            date: TODAY,
            slotId: SLOT_DINNER,
            kind: 'text',
            text: 'Curry',
            eaterIds: [ENRICO],
          })
        : await lasagne();
    await fx.settle();
    fx.clearCalls();
    expect(() => setEntryReminder(id, reminder)).toThrow(message);
    expect(entryById(id)?.reminder).toBeUndefined();
    await fx.settle();
    expect(fx.calls).toEqual([]);
  });

  it('AC-007: an entry without a day or one that is gone takes no reminder', async () => {
    await fx.startEnrico();
    const id = addPlanEntry({
      date: null,
      slotId: SLOT_DINNER,
      kind: 'text',
      text: 'Shakshuka',
      eaterIds: [ENRICO],
    });
    await fx.settle();
    fx.clearCalls();
    expect(() => setEntryReminder(id, { offsetDays: 0, at: '17:00' })).toThrow();
    expect(() => setEntryReminder('gone', { offsetDays: 0, at: '17:00' })).toThrow();
    await fx.settle();
    expect(fx.calls).toEqual([]);
  });

  it('AC-008: when the entry was removed on another device, the server refuses with the general hint', async () => {
    await fx.startEnrico();
    const id = await lasagne();
    const rejected: string[] = [];
    const stop = onWriteRejected((message) => rejected.push(message));
    fx.server.deleteRow(H, 'meal_plan_entries', id);
    setEntryReminder(id, { offsetDays: 0, at: '17:00' });
    await fx.settle();
    stop();
    expect(rejected).toEqual([WRITE_REJECTED_MESSAGE]);
    expect(entryById(id)).toBeUndefined();
  });

  it('AC-008, spec 0018 AC-009: resolves once the server took it, rejects when it refused it', async () => {
    await fx.startEnrico();
    const id = await lasagne();
    const taken = setEntryReminder(id, { offsetDays: 0, at: '17:00' });
    await fx.settle();
    await expect(taken).resolves.toBeUndefined();
    const stop = onWriteRejected(() => {});
    fx.server.deleteRow(H, 'meal_plan_entries', id);
    const refused = setEntryReminder(id, { offsetDays: 1, at: '18:00' });
    await fx.settle();
    stop();
    await expect(refused).rejects.toBeDefined();
  });

  it('AC-013: only the text changes once the moment has passed: it is not judged again', async () => {
    await fx.startEnrico();
    const id = addPlanEntry({
      date: TODAY,
      slotId: SLOT_DINNER,
      kind: 'text',
      text: 'Curry',
      eaterIds: [ENRICO],
      reminder: { offsetDays: 0, at: '11:30' },
    });
    await fx.settle();
    vi.setSystemTime(new Date('2026-11-20T10:45:00Z'));
    fx.clearCalls();
    setEntryReminder(id, { offsetDays: 0, at: '11:30', text: 'Reis' });
    await fx.settle();
    expect(stored(id)).toMatchObject({ reminder_at: '11:30:00', reminder_text: 'Reis' });
    expect(() => setEntryReminder(id, { offsetDays: 0, at: '11:35' })).toThrow(
      'Liegt in der Vergangenheit',
    );
  });
});

describe('spec 0016, REQ-004: moving an entry', () => {
  const lasagne = () => {
    const entry = getData().planEntries.find((candidate) => candidate.recipeId === 'rec-lasagne');
    if (!entry) throw new Error('lasagne missing');
    return entry;
  };

  it('AC-014: "Rückgängig" brings back day and Tageszeit', async () => {
    await fx.startEnrico();
    const before = lasagne();
    const restore = snapshot();
    movePlanEntry(before.id, addDays(TODAY, 40), SLOT_LUNCH);
    expect(entryById(before.id)).toMatchObject({ date: addDays(TODAY, 40), slotId: SLOT_LUNCH });
    restore();
    expect(entryById(before.id)).toMatchObject({ date: before.date, slotId: before.slotId });
    await fx.settle();
    expect(fx.server.row(H, 'meal_plan_entries', before.id)).toMatchObject({
      date: before.date,
      slot_id: before.slotId,
    });
  });

  it('AC-017: moved to Sunday, the reservation stays "19:30" and the list origin reads "(So)"', async () => {
    await fx.startEnrico();
    const saturday = '2026-11-21';
    const sunday = '2026-11-22';
    const enzo = addPlanEntry({
      date: saturday,
      slotId: SLOT_DINNER,
      kind: 'restaurant',
      restaurantId: 'rest-enzo',
      eaterIds: [ENRICO, NADJA],
    });
    void saveEntry(enzo, { startsAt: '19:30' });
    const curry = addPlanEntry({
      date: saturday,
      slotId: SLOT_DINNER,
      kind: 'recipe',
      recipeId: 'rec-mango-curry',
      eaterIds: [ENRICO, NADJA],
    });
    const rows = pantryCheckRows([curry]).filter((row) => !row.isPantry);
    expect(addPlannedToList(rows)).toBe(rows.length);
    await fx.settle();
    const fromCurry = () =>
      getData().items.filter((item) =>
        item.contributions.some(
          (contribution) =>
            contribution.source.kind === 'recipe' && contribution.source.entryId === curry,
        ),
      );
    expect(fromCurry().length).toBeGreaterThan(0);
    const before = fromCurry().map((item) => originSummary(item));
    expect(before.every((origin) => origin.includes('Mango-Curry (Sa)'))).toBe(true);

    fx.clearCalls();
    movePlanEntry(enzo, sunday);
    const undo = snapshot();
    movePlanEntry(curry, sunday);
    await fx.settle();

    // The dish and the labels of its contributions go in one call (one transaction).
    expect(fx.calls.map((call) => call.fn)).toEqual(['applyChanges', 'applyChanges']);
    const curryOps = opsOf(1);
    expect(curryOps.filter((op) => 'table' in op && op.table === 'meal_plan_entries')).toHaveLength(
      1,
    );
    const contributionIds = fromCurry().flatMap((item) =>
      item.contributions
        .filter((c) => c.source.kind === 'recipe' && c.source.entryId === curry)
        .map((c) => c.id),
    );
    expect(
      curryOps.filter((op) => 'table' in op && op.table === 'shopping_contributions'),
    ).toHaveLength(contributionIds.length);
    for (const id of contributionIds) {
      expect(fx.server.row(H, 'shopping_contributions', id)).toMatchObject({
        source: expect.objectContaining({ entryId: curry, label: 'Mango-Curry (So)' }),
      });
    }
    expect(entryById(enzo)).toMatchObject({ date: sunday, startsAt: '19:30' });
    expect(fx.server.row(H, 'meal_plan_entries', enzo)).toMatchObject({
      date: sunday,
      starts_at: '19:30:00',
    });
    expect(fromCurry().map((item) => originSummary(item))).toEqual(
      before.map((origin) => origin.replace('Mango-Curry (Sa)', 'Mango-Curry (So)')),
    );

    // "Rückgängig" (AC-014) brings the day of the Herkunft back as well.
    undo();
    await fx.settle();
    expect(fromCurry().map((item) => originSummary(item))).toEqual(before);
    for (const id of contributionIds) {
      expect(fx.server.row(H, 'shopping_contributions', id)).toMatchObject({
        source: expect.objectContaining({ label: 'Mango-Curry (Sa)' }),
      });
    }
  });

  it('AC-018: an entry deleted meanwhile is refused with the general hint and then gone', async () => {
    await fx.startEnrico();
    const messages: string[] = [];
    const stop = onWriteRejected((message) => messages.push(message));
    const { id } = lasagne();
    await fx.server
      .transport(NADJA)
      .applyChanges(H, [{ kind: 'delete', table: 'meal_plan_entries', id }]);
    movePlanEntry(id, addDays(TODAY, 2));
    expect(entryById(id)?.date).toBe(addDays(TODAY, 2));
    await fx.settle();
    expect(messages).toEqual([WRITE_REJECTED_MESSAGE]);
    expect(entryById(id)).toBeUndefined();
    stop();
  });
});
