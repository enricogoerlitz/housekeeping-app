// Meal plan commands in backend mode (spec 0003): all on the diff path; removing an entry declares
// its delete and takes recipe-less leftovers of it along (the database would refuse to keep them).
import { addDays } from '@housekeeping/core';
import { describe, expect, it } from 'vitest';

import { H, TODAY, withBackend } from './backend-test-helpers';
import { addPlanEntry, movePlanEntry, removePlanEntry, updatePlanEntry } from './commands-plan';
import { ENRICO, NADJA, SLOT_DINNER, SLOT_LUNCH } from './seed/demo';
import { getData, snapshot } from './store';
import type { ChangeOp } from './transport';

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
