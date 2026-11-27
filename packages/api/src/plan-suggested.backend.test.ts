// Spec 0063, REQ-006 and REQ-011: planning Planvorschläge — one change for the whole Wochenkarte,
// a vorgemerkt dish moves instead of being added twice, one "Rückgängig" brings everything back.
import { addDays } from '@housekeeping/core';
import { describe, expect, it } from 'vitest';

import { H, TODAY, withBackend } from './backend-test-helpers';
import { addPlanEntry, planSuggested } from './commands-plan';
import { ENRICO, NADJA, SLOT_DINNER } from './seed/demo';
import { getData, OfflineError, snapshot } from './store';
import type { ChangeOp } from './transport';

const fx = withBackend();

describe('planSuggested (spec 0063)', () => {
  it('AC-032, AC-021: one apply_changes for all dishes; vorgemerkt moves, the rest is added', async () => {
    await fx.startEnrico();
    const nadja = await fx.startNadja();
    const parked = addPlanEntry({
      date: null,
      slotId: SLOT_DINNER,
      kind: 'recipe',
      recipeId: 'rec-mango-curry',
      eaterIds: [ENRICO, NADJA],
    });
    await fx.settle(nadja);
    const before = fx.calls.length;
    const monday = addDays(TODAY, 3);
    const tuesday = addDays(TODAY, 4);
    const planned = planSuggested(
      [
        { recipeId: 'rec-mango-curry', date: monday, plannedLaterEntryId: parked },
        { recipeId: 'rec-gemischter-salat', date: tuesday },
        { recipeId: 'rec-lasagne', date: null },
      ],
      SLOT_DINNER,
    );
    await fx.settle(nadja);
    expect(fx.calls.slice(before).map((call) => call.fn)).toEqual(['applyChanges']);
    const ops = (fx.calls[before]?.args[1] ?? []) as ChangeOp[];
    expect(ops.filter((op) => op.kind === 'insert')).toHaveLength(2);
    expect(ops.filter((op) => op.kind === 'patch')).toHaveLength(1);
    const entries = getData().planEntries;
    expect(entries.find((entry) => entry.id === parked)).toMatchObject({ date: monday });
    const salad = entries.find(
      (entry) => entry.recipeId === 'rec-gemischter-salat' && entry.date === tuesday,
    );
    expect(salad).toMatchObject({ slotId: SLOT_DINNER, eaterIds: [ENRICO, NADJA], portions: 2 });
    expect(entries.some((entry) => entry.recipeId === 'rec-lasagne' && entry.date === null)).toBe(
      true,
    );
    expect(planned).toEqual([parked, salad?.id]);
    expect(fx.server.row(H, 'meal_plan_entries', salad?.id ?? '')).toBeDefined();
  });

  it('AC-033: one "Rückgängig" puts the week back as it was', async () => {
    await fx.startEnrico();
    const parked = addPlanEntry({
      date: null,
      slotId: SLOT_DINNER,
      kind: 'recipe',
      recipeId: 'rec-mango-curry',
      eaterIds: [ENRICO],
    });
    const count = getData().planEntries.length;
    const restore = snapshot();
    planSuggested(
      [
        { recipeId: 'rec-mango-curry', date: addDays(TODAY, 3), plannedLaterEntryId: parked },
        { recipeId: 'rec-gemischter-salat', date: addDays(TODAY, 4) },
      ],
      SLOT_DINNER,
    );
    expect(getData().planEntries).toHaveLength(count + 1);
    restore();
    expect(getData().planEntries).toHaveLength(count);
    expect(getData().planEntries.find((entry) => entry.id === parked)?.date).toBeNull();
  });

  it('AC-023: offline nothing is planned', async () => {
    await fx.startEnrico();
    const count = getData().planEntries.length;
    fx.environment.setOnline(false);
    expect(() =>
      planSuggested([{ recipeId: 'rec-lasagne', date: addDays(TODAY, 3) }], SLOT_DINNER),
    ).toThrow(OfflineError);
    expect(getData().planEntries).toHaveLength(count);
  });
});
