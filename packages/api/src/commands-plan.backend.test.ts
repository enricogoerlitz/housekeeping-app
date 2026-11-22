// Meal plan commands (spec 0003): all on the diff path; removing an entry declares
// its delete and takes recipe-less leftovers of it along (the database would refuse to keep them).
import { addDays, entriesForDay, isoWeekday } from '@housekeeping/core';
import { beforeEach, describe, expect, it } from 'vitest';

import { onWriteRejected, WRITE_REJECTED_MESSAGE } from './backend';
import { H, TODAY, withBackend } from './backend-test-helpers';
import { saveAbsences } from './commands-household';
import {
  addPlanEntry,
  createAndPlanActivity,
  createAndPlanRecipe,
  createAndPlanRestaurant,
  defaultEaterIds,
  movePlanEntry,
  RECIPE_GONE_MESSAGE,
  removePlanEntry,
  saveEntryFields,
  setReservation,
  updatePlanEntry,
} from './commands-plan';
import { readMapsLink } from './commands-restaurants';
import { pantryCheckRows } from './commands-shopping';
import { ENRICO, NADJA, SLOT_DINNER, SLOT_LUNCH, SLOT_MORNING } from './seed/demo';
import { getData, OfflineError, snapshot } from './store';
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
    saveAbsences({ replaceIds: [], memberIds: [ENRICO], from: saturday, to: addDays(saturday, 2) });
    expect(defaultEaterIds(saturday)).toEqual([NADJA]);
    expect(defaultEaterIds(TODAY)).toEqual([ENRICO, NADJA]);
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

describe('spec 0013: reservation of a restaurant entry', () => {
  const planEnzo = () =>
    addPlanEntry({
      date: addDays(TODAY, 1),
      slotId: SLOT_DINNER,
      kind: 'restaurant',
      restaurantId: 'rest-enzo',
      eaterIds: [ENRICO, NADJA],
    });

  it('AC-027: "Reserviert um 19:30" is one patch; Nadja sees it with the default reminder', async () => {
    await fx.startEnrico();
    const nadja = await fx.startNadja();
    const id = planEnzo();
    await fx.settle(nadja);
    fx.clearCalls();
    setReservation(id, { reservedAt: '19:30' });
    expect(entryById(id)?.reservedAt).toBe('19:30');
    await fx.settle(nadja);
    expect(opsOf(0)).toEqual([
      { kind: 'patch', table: 'meal_plan_entries', id, changes: { reserved_at: '19:30:00' } },
    ]);
    const seen = fx.nadjaData(nadja).planEntries.find((entry) => entry.id === id);
    expect(seen?.reservedAt).toBe('19:30');
    expect(seen?.remindMinutesBefore).toBeUndefined();
    expect(fx.server.row(H, 'meal_plan_entries', id)).toMatchObject({
      reserved_at: '19:30:00',
      remind_minutes_before: 120,
    });
  });

  it('AC-029: "1 h vorher" patches only the reminder; ✕ removes the time', async () => {
    await fx.startEnrico();
    const id = planEnzo();
    setReservation(id, { reservedAt: '19:30' });
    await fx.settle();
    fx.clearCalls();
    setReservation(id, { remindMinutesBefore: 60 });
    expect(entryById(id)?.remindMinutesBefore).toBe(60);
    setReservation(id, { reservedAt: null });
    await fx.settle();
    expect(opsOf(0)).toEqual([
      { kind: 'patch', table: 'meal_plan_entries', id, changes: { remind_minutes_before: 60 } },
    ]);
    expect(opsOf(1)).toEqual([
      { kind: 'patch', table: 'meal_plan_entries', id, changes: { reserved_at: null } },
    ]);
    expect(entryById(id)?.reservedAt).toBeUndefined();
  });

  it('AC-030: a reservation on "Lasagne" is refused by the server and springs back', async () => {
    await fx.startEnrico();
    const messages: string[] = [];
    const stop = onWriteRejected((message) => messages.push(message));
    const lasagne = getData().planEntries.find((entry) => entry.recipeId === 'rec-lasagne');
    if (!lasagne) throw new Error('fixture');
    setReservation(lasagne.id, { reservedAt: '19:30' });
    await fx.settle();
    expect(messages).toEqual([WRITE_REJECTED_MESSAGE]);
    expect(entryById(lasagne.id)?.reservedAt).toBeUndefined();
    expect(fx.server.row(H, 'meal_plan_entries', lasagne.id)).toMatchObject({ reserved_at: null });
    stop();
  });

  it('the database checks: five-minute time, reminder 30/60/120/180/240 (23514)', async () => {
    await fx.startEnrico();
    const id = planEnzo();
    await fx.settle();
    const patch = (changes: Record<string, unknown>) =>
      fx.server
        .transport(ENRICO)
        .applyChanges(H, [{ kind: 'patch', table: 'meal_plan_entries', id, changes }]);
    await expect(patch({ reserved_at: '19:33' })).rejects.toMatchObject({ code: '23514' });
    await expect(patch({ remind_minutes_before: 90 })).rejects.toMatchObject({ code: '23514' });
    expect(() => setReservation(id, { reservedAt: '19:33' })).toThrow('Keine gültige Uhrzeit');
    expect(() => setReservation(id, { remindMinutesBefore: 90 as 60 })).toThrow();
  });

  it('an entry that stops being a restaurant loses its reservation', async () => {
    await fx.startEnrico();
    const id = planEnzo();
    setReservation(id, { reservedAt: '19:30' });
    await fx.settle();
    updatePlanEntry(id, { kind: 'text', text: 'Pizza bestellen', restaurantId: undefined });
    await fx.settle();
    expect(entryById(id)).toMatchObject({ kind: 'text', reservedAt: undefined });
    expect(fx.server.row(H, 'meal_plan_entries', id)).toMatchObject({ reserved_at: null });
  });

  it('REQ-008: offline throws OfflineError', async () => {
    await fx.startEnrico();
    const id = planEnzo();
    await fx.settle();
    fx.environment.setOnline(false);
    expect(() => setReservation(id, { reservedAt: '19:30' })).toThrow(OfflineError);
  });
});

describe('spec 0018, REQ-003: "Fertig" saves the open fields of an entry', () => {
  const plan = (
    input: { kind: 'activity'; activityId: string } | { kind: 'restaurant'; restaurantId: string },
  ) =>
    addPlanEntry({
      date: addDays(TODAY, 1),
      slotId: SLOT_DINNER,
      eaterIds: [ENRICO, NADJA],
      ...input,
    });

  it('AC-007: the typed Zusatz "Halle Nord" of "Bouldern" is one patch, confirmed by the server', async () => {
    await fx.startEnrico();
    const nadja = await fx.startNadja();
    const id = plan({ kind: 'activity', activityId: 'act-bouldern' });
    await fx.settle(nadja);
    fx.clearCalls();
    const saved = saveEntryFields(id, { note: ' Halle Nord ' });
    expect(entryById(id)?.note).toBe('Halle Nord');
    await fx.settle(nadja);
    await expect(saved).resolves.toBeUndefined();
    expect(opsOf(0)).toEqual([
      { kind: 'patch', table: 'meal_plan_entries', id, changes: { note: 'Halle Nord' } },
    ]);
    expect(fx.nadjaData(nadja).planEntries.find((entry) => entry.id === id)?.note).toBe(
      'Halle Nord',
    );
  });

  it('AC-008: "Reserviert um 19:30" of "Trattoria Da Enzo" is saved the same way', async () => {
    await fx.startEnrico();
    const id = plan({ kind: 'restaurant', restaurantId: 'rest-enzo' });
    await fx.settle();
    fx.clearCalls();
    const saved = saveEntryFields(id, { reservedAt: '19:30' });
    await fx.settle();
    await expect(saved).resolves.toBeUndefined();
    expect(opsOf(0)).toEqual([
      { kind: 'patch', table: 'meal_plan_entries', id, changes: { reserved_at: '19:30:00' } },
    ]);
    expect(fx.server.row(H, 'meal_plan_entries', id)).toMatchObject({ reserved_at: '19:30:00' });
  });

  it('AC-008: nothing changed sends nothing and resolves at once', async () => {
    await fx.startEnrico();
    const id = plan({ kind: 'activity', activityId: 'act-bouldern' });
    await fx.settle();
    fx.clearCalls();
    await expect(saveEntryFields(id, {})).resolves.toBeUndefined();
    await expect(saveEntryFields(id, { note: '  ' })).resolves.toBeUndefined();
    expect(fx.calls).toEqual([]);
  });

  it('AC-009: a refusal rejects, the entry springs back and the general hint is reported', async () => {
    await fx.startEnrico();
    const messages: string[] = [];
    const stop = onWriteRejected((message) => messages.push(message));
    const id = plan({ kind: 'activity', activityId: 'act-bouldern' });
    await fx.settle();
    fx.server.failNext('apply_changes', new TransportError('permanent', '23514', 400));
    const saved = saveEntryFields(id, { note: 'Halle Nord' });
    saved.catch(() => {});
    await fx.settle();
    await expect(saved).rejects.toMatchObject({ code: '23514' });
    expect(messages).toEqual([WRITE_REJECTED_MESSAGE]);
    expect(entryById(id)?.note).toBeUndefined();
    stop();
  });

  it('negative: offline and an invalid time throw before anything changes', async () => {
    await fx.startEnrico();
    const id = plan({ kind: 'restaurant', restaurantId: 'rest-enzo' });
    await fx.settle();
    expect(() => saveEntryFields(id, { reservedAt: '19:33' })).toThrow('Keine gültige Uhrzeit');
    fx.environment.setOnline(false);
    expect(() => saveEntryFields(id, { reservedAt: '19:30' })).toThrow(OfflineError);
    expect(entryById(id)?.reservedAt).toBeUndefined();
  });
});
