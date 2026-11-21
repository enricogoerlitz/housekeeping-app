// Chore commands (spec 0003): all on the diff path; completing a one-off chore
// declares its delete; "Rückgängig" (today list, chore sheet) sends the inverse.
import { choreBucket } from '@housekeeping/core';
import { beforeEach, describe, expect, it } from 'vitest';

import { H, TODAY, withBackend } from './backend-test-helpers';
import {
  completeChore,
  createChore,
  logSpontaneous,
  postponeChore,
  reassignChoreEvent,
  skipChore,
} from './commands-chores';
import { ENRICO, NADJA } from './seed/demo';
import { getData, snapshot } from './store';
import type { ChangeOp } from './transport';

const fx = withBackend();

const opsOf = (index: number) => (fx.calls[index]?.args[1] ?? []) as ChangeOp[];
const shape = (ops: ChangeOp[]) => ops.map((op) => [op.kind, 'table' in op ? op.table : '']);
const choreById = (id: string) => getData().chores.find((chore) => chore.id === id);

describe('chores (diff path)', () => {
  it('AC-013: completing writes the event and the next date in one call; undo reverts both', async () => {
    await fx.startEnrico();
    const nadja = await fx.startNadja();
    const before = choreById('chore-bad');
    if (!before) throw new Error('fixture');
    const restore = snapshot();
    const eventId = completeChore('chore-bad');
    await fx.settle(nadja);
    expect(fx.calls.map((call) => call.fn)).toEqual(['applyChanges']);
    expect(shape(opsOf(0))).toEqual([
      ['patch', 'chores'],
      ['insert', 'chore_events'],
    ]);
    expect(fx.server.row(H, 'chore_events', eventId ?? '')).toMatchObject({ done_by: ENRICO });
    expect(fx.nadjaData(nadja).choreEvents.some((event) => event.id === eventId)).toBe(true);

    restore();
    await fx.settle(nadja);
    expect(shape(opsOf(1))).toEqual([
      ['patch', 'chores'],
      ['delete', 'chore_events'],
    ]);
    expect(fx.server.row(H, 'chore_events', eventId ?? '')).toBeUndefined();
    expect(choreById('chore-bad')).toMatchObject({
      nextDueOn: before.nextDueOn,
      lastDoneOn: before.lastDoneOn,
    });
  });

  it('a one-off chore is deleted with the event kept; undo brings it back', async () => {
    await fx.startEnrico();
    const restore = snapshot();
    const eventId = completeChore('chore-gluehbirne');
    expect(choreById('chore-gluehbirne')).toBeUndefined();
    await fx.settle();
    expect(shape(opsOf(0))).toEqual([
      ['insert', 'chore_events'],
      ['delete', 'chores'],
    ]);
    expect(fx.server.row(H, 'chores', 'chore-gluehbirne')).toBeUndefined();
    expect(fx.server.row(H, 'chore_events', eventId ?? '')).toMatchObject({ chore_id: null });

    restore();
    await fx.settle();
    expect(fx.server.row(H, 'chores', 'chore-gluehbirne')).toBeDefined();
    expect(fx.server.row(H, 'chore_events', eventId ?? '')).toBeUndefined();
    expect(choreById('chore-gluehbirne')).toBeDefined();
  });

  it('chore sheet: postpone and skip are undoable', async () => {
    await fx.startEnrico();
    const before = choreById('chore-fenster');
    if (!before) throw new Error('fixture');
    let restore = snapshot();
    postponeChore('chore-fenster');
    await fx.settle();
    restore();
    await fx.settle();
    expect(fx.server.row(H, 'chores', 'chore-fenster')).toMatchObject({
      next_due_on: before.nextDueOn ?? null,
    });

    restore = snapshot();
    const events = getData().choreEvents.length;
    skipChore('chore-fenster');
    expect(getData().choreEvents).toHaveLength(events + 1);
    await fx.settle();
    restore();
    await fx.settle();
    expect(getData().choreEvents).toHaveLength(events);
    expect(fx.calls.map((call) => call.fn)).toEqual(Array(4).fill('applyChanges'));
  });

  it('create, log spontaneous and reassign are single calls', async () => {
    await fx.startEnrico();
    const choreId = createChore({
      title: 'Staubsaugen',
      recurrence: { type: 'weekly', every: 1, weekdays: [6] },
      assignment: { type: 'rotating', memberIds: [ENRICO, NADJA] },
    });
    const eventId = logSpontaneous('Keller aufgeräumt');
    reassignChoreEvent(eventId, NADJA);
    await fx.settle();
    expect(fx.calls.map((call) => call.fn)).toEqual(Array(3).fill('applyChanges'));
    expect(fx.server.row(H, 'chores', choreId)).toMatchObject({ title: 'Staubsaugen' });
    expect(fx.server.row(H, 'chore_events', eventId)).toMatchObject({ done_by: NADJA });
  });
});

describe('chore commands: local effect', () => {
  beforeEach(async () => {
    await fx.startEnrico();
  });

  it('AC-035: checking "Bad putzen" removes it from today and logs Enrico today', () => {
    const eventId = completeChore('chore-bad');
    const data = getData();
    const bathroom = data.chores.find((chore) => chore.id === 'chore-bad');
    expect(bathroom && choreBucket(bathroom, TODAY)).not.toBe('today');
    expect(bathroom?.lastDoneOn).toBe(TODAY);
    expect(data.choreEvents.find((event) => event.id === eventId)).toMatchObject({
      title: 'Bad putzen',
      doneBy: ENRICO,
      doneOn: TODAY,
      kind: 'done',
    });

    if (!eventId) throw new Error('no event');
    reassignChoreEvent(eventId, NADJA);
    expect(getData().choreEvents.find((event) => event.id === eventId)?.doneBy).toBe(NADJA);
  });

  it('hands a rotating chore to the next member and drops one-off chores', () => {
    completeChore('chore-muell', NADJA);
    expect(choreById('chore-muell')?.nextAssigneeId).toBe(ENRICO);
    completeChore('chore-gluehbirne');
    expect(choreById('chore-gluehbirne')).toBeUndefined();
    expect(completeChore('chore-weg')).toBeNull();
  });

  it('AC-036: "Staubsaugen" weekly on Saturday, rotating, is due this week; no title fails', () => {
    const id = createChore({
      title: 'Staubsaugen',
      recurrence: { type: 'weekly', every: 1, weekdays: [6] },
      assignment: { type: 'rotating', memberIds: [ENRICO, NADJA] },
    });
    const chore = choreById(id);
    expect(chore).toMatchObject({ nextDueOn: '2026-11-21', nextAssigneeId: ENRICO });
    expect(chore && choreBucket(chore, TODAY)).toBe('thisWeek');
    expect(() =>
      createChore({ title: ' ', recurrence: { type: 'once' }, assignment: { type: 'anyone' } }),
    ).toThrow('Titel fehlt');
  });
});
