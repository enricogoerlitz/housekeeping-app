// The diff of a command (changes.ts) for the packing tables (spec 0012, plan decisions 3 and 7):
// rows the database deletes or clears itself (cascade, set null) and quantities its trigger
// computes are shown locally but never sent, so deleting a parent stays one delete.
import type { PackingItem, RowOp } from '@housekeeping/core';
import { describe, expect, it } from 'vitest';

import { diffHousehold, withoutPassedReminders } from './changes';
import { createInitialState, DEMO_HOUSEHOLD_ID } from './seed/demo';
import type { HouseholdData } from './store';

const demo = (): HouseholdData => {
  const data = createInitialState('2026-11-20').households[DEMO_HOUSEHOLD_ID];
  if (!data) throw new Error('demo household missing');
  return data;
};

/** The demo with an absence whose packing list has 30 Packstücke in two bags. */
function withThirtyItems(): HouseholdData {
  const data = demo();
  const absenceId = 'abs-30';
  const items: PackingItem[] = Array.from({ length: 30 }, (_, index) => ({
    id: `pi-30-${index}`,
    listBagId: index < 15 ? 'lb-30-a' : 'lb-30-b',
    name: `Stück ${index}`,
    packed: index % 3 === 0,
    packSeq: index % 3 === 0 ? 1 : 0,
    sort: index,
  }));
  return {
    ...data,
    absences: [...data.absences, { id: absenceId, from: '2027-01-01', to: '2027-01-07' }],
    packingListBags: [
      ...data.packingListBags,
      { id: 'lb-30-a', absenceId, name: 'A', sort: 0 },
      { id: 'lb-30-b', absenceId, name: 'B', sort: 1 },
    ],
    packingItems: [...data.packingItems, ...items],
  };
}

describe('spec 0012: cascades in the diff (plan, decision 7)', () => {
  it('AC-038: deleting an absence with 30 Packstücke sends exactly one delete, shows all gone', () => {
    const before = withThirtyItems();
    const after: HouseholdData = {
      ...before,
      absences: before.absences.filter((absence) => absence.id !== 'abs-30'),
      packingListBags: before.packingListBags.filter((bag) => bag.absenceId !== 'abs-30'),
      packingItems: before.packingItems.filter((item) => !item.id.startsWith('pi-30-')),
    };
    const change = diffHousehold(before, after, { mode: 'send', maxDeletes: { absences: 1 } });
    expect(change.send).toEqual([{ kind: 'delete', table: 'absences', id: 'abs-30' }]);
    // Locally the whole packing list disappears at once.
    expect(change.ops.filter((op) => op.kind === 'delete')).toHaveLength(33);
    // Its undo puts everything back (the inserts are sent, parents first).
    expect(change.sendInverse.map((op) => op.kind)).toEqual(Array(33).fill('insert'));
    expect(change.sendInverse[0]).toMatchObject({ table: 'absences' });
  });

  it('a removed child without its parent is still a declared delete', () => {
    const before = withThirtyItems();
    const after: HouseholdData = {
      ...before,
      packingItems: before.packingItems.filter((item) => item.id !== 'pi-30-1'),
    };
    expect(() => diffHousehold(before, after, { mode: 'send' })).toThrow(/deletes/);
    expect(
      diffHousehold(before, after, { mode: 'send', maxDeletes: { packing_items: 1 } }).send,
    ).toEqual([{ kind: 'delete', table: 'packing_items', id: 'pi-30-1' }]);
  });

  it('AC-009: deleting a Reisetasche sends only its delete; undo re-inserts and links again', () => {
    const before = demo();
    const strand = before.packingBags.find((bag) => bag.name === 'Strand');
    if (!strand) throw new Error('fixture');
    const linked = before.packingListBags.filter((bag) => bag.bagId === strand.id);
    expect(linked.length).toBeGreaterThan(0);
    const after: HouseholdData = {
      ...before,
      packingBags: before.packingBags.filter((bag) => bag.id !== strand.id),
      packingBagItems: before.packingBagItems.filter((item) => item.bagId !== strand.id),
      packingListBags: before.packingListBags.map((bag) =>
        bag.bagId === strand.id ? { ...bag, bagId: undefined } : bag,
      ),
    };
    const change = diffHousehold(before, after, {
      mode: 'send',
      maxDeletes: { packing_bags: 1 },
    });
    expect(change.send).toEqual([{ kind: 'delete', table: 'packing_bags', id: strand.id }]);
    expect(change.ops.some((op) => op.kind === 'patch' && op.table === 'packing_list_bags')).toBe(
      true,
    );
    const items = before.packingBagItems.filter((item) => item.bagId === strand.id);
    expect(change.sendInverse).toEqual([
      expect.objectContaining({ kind: 'insert', table: 'packing_bags' }),
      ...items.map(() => expect.objectContaining({ kind: 'insert', table: 'packing_bag_items' })),
      ...linked.map((bag) => ({
        kind: 'patch',
        table: 'packing_list_bags',
        id: bag.id,
        changes: { bag_id: strand.id },
      })),
    ]);
  });

  it('undo of a packing list with 21 Packstücke stays within 20 deletes (one delete sent)', () => {
    const after = withThirtyItems();
    const before: HouseholdData = {
      ...after,
      absences: after.absences.filter((absence) => absence.id !== 'abs-30'),
      packingListBags: after.packingListBags.filter((bag) => bag.absenceId !== 'abs-30'),
      packingItems: after.packingItems.filter((item) => !item.id.startsWith('pi-30-')),
    };
    const change = diffHousehold(before, after, { mode: 'send' });
    expect(change.send.filter((op) => op.kind === 'insert')).toHaveLength(33);
    expect(change.sendInverse).toEqual([{ kind: 'delete', table: 'absences', id: 'abs-30' }]);
  });
});

describe('spec 0012: what the server computes (plan, decision 3)', () => {
  it('AC-037: a recalculated "je Tag" quantity is shown but never sent', () => {
    const before = withThirtyItems();
    const perDay = { ...before.packingItems[0], id: 'pi-tshirts' } as PackingItem;
    const base: HouseholdData = {
      ...before,
      packingItems: [
        ...before.packingItems,
        { ...perDay, name: 'T-Shirts', quantity: 7, perDay: 1, packed: false, packSeq: 0 },
      ],
    };
    const after: HouseholdData = {
      ...base,
      absences: base.absences.map((absence) =>
        absence.id === 'abs-30' ? { ...absence, to: '2027-01-05' } : absence,
      ),
      packingItems: base.packingItems.map((item) =>
        item.id === 'pi-tshirts' ? { ...item, quantity: 5 } : item,
      ),
    };
    const change = diffHousehold(base, after, { mode: 'send' });
    expect(change.send).toEqual([
      { kind: 'patch', table: 'absences', id: 'abs-30', changes: { to_on: '2027-01-05' } },
    ]);
    expect(change.ops).toContainEqual({
      kind: 'patch',
      table: 'packing_items',
      id: 'pi-tshirts',
      changes: { quantity: 5 },
    });
    expect(change.sendInverse).toEqual([
      { kind: 'patch', table: 'absences', id: 'abs-30', changes: { to_on: '2027-01-07' } },
    ]);
  });

  it('a Packstück of a packing list is never patched otherwise; a list bag keeps its copy', () => {
    const before = withThirtyItems();
    const renamed: HouseholdData = {
      ...before,
      packingItems: before.packingItems.map((item) =>
        item.id === 'pi-30-1' ? { ...item, name: 'Neu' } : item,
      ),
    };
    expect(() => diffHousehold(before, renamed, { mode: 'send' })).toThrow(/packing_items/);
    const bagRenamed: HouseholdData = {
      ...before,
      packingListBags: before.packingListBags.map((bag) =>
        bag.id === 'lb-30-a' ? { ...bag, name: 'Neu' } : bag,
      ),
    };
    expect(() => diffHousehold(before, bagRenamed, { mode: 'send' })).toThrow(/packing_list_bags/);
  });
});

describe('spec 0017: undo inserts an entry again only with a reminder still to come', () => {
  // 11:45 in Berlin on Friday 20.11.2026.
  const NOW = new Date('2026-11-20T10:45:00Z');
  const insert = (row: Record<string, unknown>): RowOp => ({
    kind: 'insert',
    table: 'meal_plan_entries',
    row: { id: 'e1', date: '2026-11-20', ...row },
  });

  it('REQ-006: a passed reminder is dropped from the insert, the entry stays', () => {
    const op = insert({ reminder_day_offset: 0, reminder_at: '11:30:00', reminder_text: 'Reis' });
    expect(withoutPassedReminders([op], NOW, 'Europe/Berlin')).toEqual([
      insert({ reminder_day_offset: null, reminder_at: null, reminder_text: null }),
    ]);
  });

  it('AC-024: a reminder still to come stays; it is judged in the household zone', () => {
    const op = insert({ reminder_day_offset: 0, reminder_at: '12:00:00' });
    expect(withoutPassedReminders([op], NOW, 'Europe/Berlin')).toEqual([op]);
    // 11:45 in Berlin is 10:45 in London: 11:30 is still to come there.
    const london = insert({ reminder_day_offset: 0, reminder_at: '11:30:00' });
    expect(withoutPassedReminders([london], NOW, 'Europe/London')).toEqual([london]);
  });

  it('leaves patches, other tables and entries without a reminder alone', () => {
    const ops: RowOp[] = [
      insert({ reminder_day_offset: null, reminder_at: null }),
      {
        kind: 'patch',
        table: 'meal_plan_entries',
        id: 'e1',
        changes: { reminder_day_offset: 1, reminder_at: '08:00:00' },
      },
      { kind: 'insert', table: 'recipes', row: { id: 'r1', reminder_at: '08:00:00' } },
    ];
    expect(withoutPassedReminders(ops, NOW, 'Europe/Berlin')).toEqual(ops);
  });
});
