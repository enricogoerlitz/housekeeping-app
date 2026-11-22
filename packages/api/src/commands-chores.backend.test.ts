// Chore commands (spec 0003, spec 0011): entries are booked only by the domain op complete_chore
// with the state the device saw, and removed only by remove_chore_event — one apply_changes call
// per command (ADR-0011). Chores themselves are inserted, patched and deleted as rows.
import { choreBucket, withoutTrips } from '@housekeeping/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { H, TODAY, withBackend } from './backend-test-helpers';
import { onWriteRejected, stopBackend, WRITE_REJECTED_MESSAGE } from './backend';
import {
  changeChoreEventDay,
  completeChore,
  createChore,
  deleteChore,
  logDone,
  postponeChore,
  reassignChoreEvent,
  removeChoreEvent,
  skipChore,
  updateChore,
} from './commands-chores';
import { ENRICO, NADJA } from './seed/demo';
import { getData, OfflineError, snapshot } from './store';
import { TransportError, type ChangeOp } from './transport';

const fx = withBackend();

const opsOf = (index: number) => (fx.calls[index]?.args[1] ?? []) as ChangeOp[];
const shape = (ops: ChangeOp[]) => ops.map((op) => [op.kind, 'table' in op ? op.table : '']);
const choreById = (id: string) => getData().chores.find((chore) => chore.id === id);
const eventById = (id: string) => getData().choreEvents.find((event) => event.id === id);
const serverEvents = (choreId: string) =>
  fx.server.rows(H, 'chore_events').filter((row) => row.chore_id === choreId);

let rejected: string[] = [];
let stopListening: () => void = () => {};
beforeEach(() => {
  rejected = [];
  stopListening = onWriteRejected((message) => rejected.push(message));
});
afterEach(() => stopListening());

describe('spec 0011: booking with a condition (complete_chore)', () => {
  it('AC-028: checking sends exactly one apply_changes with complete_chore and the seen state', async () => {
    await fx.startEnrico();
    const nadja = await fx.startNadja();
    const eventId = completeChore('chore-bad');
    if (!eventId) throw new Error('no event');
    expect(choreById('chore-bad')).toMatchObject({ lastDoneOn: TODAY, nextDueOn: '2026-11-27' });
    expect(eventById(eventId)).toMatchObject({ kind: 'done', doneOn: TODAY, doneBy: ENRICO });
    await fx.settle(nadja);

    expect(fx.calls.map((call) => call.fn)).toEqual(['applyChanges']);
    expect(opsOf(0)).toEqual([
      {
        kind: 'complete_chore',
        completion: {
          chore_id: 'chore-bad',
          event_id: eventId,
          kind: 'done',
          done_on: TODAY,
          done_by: ENRICO,
          seen: {
            next_due_on: TODAY,
            last_done_on: '2026-11-13',
            next_assignee_id: ENRICO,
            latest_event_id: 'ev-5',
          },
          next_due_on: '2026-11-27',
          next_assignee_id: ENRICO,
        },
      },
    ]);
    expect(fx.server.row(H, 'chore_events', eventId)).toMatchObject({
      title: 'Bad putzen',
      prev_recorded: true,
      prev_next_due_on: TODAY,
      prev_last_done_on: '2026-11-13',
    });
    expect(eventById(eventId)).toMatchObject({
      previous: { nextDueOn: TODAY, lastDoneOn: '2026-11-13', nextAssigneeId: ENRICO },
      createdAt: expect.any(String),
    });
    expect(fx.nadjaData(nadja).choreEvents.some((event) => event.id === eventId)).toBe(true);
  });

  it('AC-031: Nadja was faster: no second entry, the date moves once, "Nadja war schneller (10:02)"', async () => {
    await fx.startEnrico();
    const seen = choreById('chore-bad');
    if (!seen) throw new Error('fixture');
    // Nadja books two minutes later; Enrico's device has not seen it yet.
    const at = new Date(Date.now() + 2 * 60_000);
    vi.setSystemTime(at);
    const time = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
    await fx.server.transport(NADJA).applyChanges(H, [
      {
        kind: 'complete_chore',
        completion: {
          chore_id: 'chore-bad',
          event_id: 'ev-nadja',
          kind: 'done',
          done_on: TODAY,
          done_by: NADJA,
          seen: {
            next_due_on: TODAY,
            last_done_on: '2026-11-13',
            next_assignee_id: ENRICO,
            latest_event_id: 'ev-5',
          },
          next_due_on: '2026-11-27',
          next_assignee_id: ENRICO,
        },
      },
    ]);
    const mine = completeChore('chore-bad');
    await fx.settle();

    expect(rejected).toEqual([`Nadja war schneller (${time})`]);
    expect(serverEvents('chore-bad').filter((row) => row.done_on === TODAY)).toEqual([
      expect.objectContaining({ id: 'ev-nadja', done_by: NADJA }),
    ]);
    expect(fx.server.row(H, 'chores', 'chore-bad')).toMatchObject({ next_due_on: '2026-11-27' });
    expect(eventById(mine ?? '')).toBeUndefined();
    expect(eventById('ev-nadja')).toMatchObject({ doneBy: NADJA });
  });

  it('AC-031: a second booking of a flexible chore for anyone today, with the same state, is refused by the latest entry seen', async () => {
    await fx.startEnrico();
    const mine = completeChore('chore-pflanzen');
    await fx.settle();
    const after = choreById('chore-pflanzen');
    if (!after || !mine) throw new Error('fixture');
    // Nadja saw Enrico's entry and books "Pflanzen gießen" once more two minutes later; date, last
    // time and person stay exactly as they are. Enrico's device has not seen her entry yet.
    vi.setSystemTime(new Date(Date.now() + 2 * 60_000));
    await fx.server.transport(NADJA).applyChanges(H, [
      {
        kind: 'complete_chore',
        completion: {
          chore_id: 'chore-pflanzen',
          event_id: 'ev-nadja',
          kind: 'done',
          done_on: TODAY,
          done_by: NADJA,
          seen: {
            next_due_on: after.nextDueOn ?? null,
            last_done_on: after.lastDoneOn ?? null,
            next_assignee_id: null,
            latest_event_id: mine,
          },
          next_due_on: after.nextDueOn ?? null,
          next_assignee_id: null,
        },
      },
    ]);
    const again = logDone({ choreId: 'chore-pflanzen' });
    await fx.settle();

    expect(opsOf(1)).toEqual([
      expect.objectContaining({
        completion: expect.objectContaining({
          seen: expect.objectContaining({ latest_event_id: mine }),
        }),
      }),
    ]);
    expect(rejected).toEqual([expect.stringMatching(/^Nadja war schneller \(\d\d:\d\d\)$/)]);
    expect(serverEvents('chore-pflanzen').filter((row) => row.done_on === TODAY)).toHaveLength(2);
    expect(eventById(again?.eventId ?? '')).toBeUndefined();
  });

  it('AC-034: a refused booking springs back with "Hat nicht geklappt – bitte noch einmal versuchen"', async () => {
    await fx.startEnrico();
    fx.server.failNext('apply_changes', new TransportError('permanent', 'chore_changed', 400));
    const eventId = completeChore('chore-bad');
    await fx.settle();
    expect(rejected).toEqual([WRITE_REJECTED_MESSAGE]);
    expect(eventById(eventId ?? '')).toBeUndefined();
    expect(choreById('chore-bad')).toMatchObject({ nextDueOn: TODAY, lastDoneOn: '2026-11-13' });
  });

  it('AC-036: chosen in "Was anderes erledigt?" and done by Nadja: the flexible date runs from today', async () => {
    await fx.startEnrico();
    const done = logDone({ choreId: 'chore-bettwaesche' }, { doneBy: NADJA });
    expect(done?.choreId).toBe('chore-bettwaesche');
    await fx.settle();
    expect(eventById(done?.eventId ?? '')).toMatchObject({ doneBy: NADJA, doneOn: TODAY });
    expect(fx.server.row(H, 'chores', 'chore-bettwaesche')).toMatchObject({
      next_due_on: '2026-12-04',
      last_done_on: TODAY,
      next_assignee_id: ENRICO,
    });
  });

  it('AC-038: entered for yesterday: the entry is on Thursday and the next date is 3.12.', async () => {
    await fx.startEnrico();
    const done = logDone({ choreId: 'chore-bettwaesche' }, { doneOn: '2026-11-19' });
    await fx.settle();
    expect(fx.server.row(H, 'chore_events', done?.eventId ?? '')).toMatchObject({
      done_on: '2026-11-19',
    });
    expect(choreById('chore-bettwaesche')).toMatchObject({
      nextDueOn: '2026-12-03',
      lastDoneOn: '2026-11-19',
    });
  });

  it('AC-037: a fixed rhythm done early counts for the coming date (Sat 21.11. → Sat 28.11.)', async () => {
    await fx.startEnrico();
    logDone({ choreId: 'chore-kueche' });
    await fx.settle();
    expect(fx.server.row(H, 'chores', 'chore-kueche')).toMatchObject({ next_due_on: '2026-11-28' });
  });

  it('AC-039: no hit: a new chore "bei Bedarf" and its entry go in one call', async () => {
    await fx.startEnrico();
    const done = logDone({ title: ' Fenster putzen ' });
    if (!done) throw new Error('nothing logged');
    await fx.settle();
    expect(fx.calls.map((call) => call.fn)).toEqual(['applyChanges']);
    expect(shape(opsOf(0))).toEqual([
      ['insert', 'chores'],
      ['complete_chore', ''],
    ]);
    expect(fx.server.row(H, 'chores', done.choreId)).toMatchObject({
      title: 'Fenster putzen',
      recurrence: { type: 'asNeeded' },
      next_due_on: null,
      last_done_on: TODAY,
    });
    expect(fx.server.row(H, 'chore_events', done.eventId)).toMatchObject({
      title: 'Fenster putzen',
      kind: 'done',
      done_by: ENRICO,
    });
    const chore = choreById(done.choreId);
    expect(chore && choreBucket(chore, TODAY, withoutTrips([]))).toBe('asNeeded');
  });

  it('AC-040: with "Mehr Angaben" the new chore is planned: 4.12., Nadja is next', async () => {
    await fx.startEnrico();
    const done = logDone({
      title: 'Pflanzen düngen',
      recurrence: { type: 'flexible', everyDays: 14 },
      assignment: { type: 'rotating', memberIds: [ENRICO, NADJA] },
    });
    await fx.settle();
    expect(fx.server.row(H, 'chores', done?.choreId ?? '')).toMatchObject({
      next_due_on: '2026-12-04',
      next_assignee_id: NADJA,
      last_done_on: TODAY,
    });
    expect(eventById(done?.eventId ?? '')).toMatchObject({ doneBy: ENRICO, doneOn: TODAY });
  });

  it('AC-044: done "bei Bedarf" shows the last time and still no date', async () => {
    await fx.startEnrico();
    logDone({ choreId: 'chore-fenster-kueche' });
    expect(choreById('chore-fenster-kueche')).toMatchObject({ lastDoneOn: TODAY });
    expect(choreById('chore-fenster-kueche')?.nextDueOn).toBeUndefined();
    await fx.settle();
    expect(rejected).toEqual([]);
    expect(fx.server.row(H, 'chores', 'chore-fenster-kueche')).toMatchObject({
      next_due_on: null,
      last_done_on: TODAY,
    });
  });

  it('AC-042: an empty title or a day outside today − 30 … today sends nothing (spec 0026, AC-020)', async () => {
    await fx.startEnrico();
    expect(() => logDone({ title: '  ' })).toThrow('Titel fehlt');
    expect(() => completeChore('chore-bad', { doneOn: '2026-10-20' })).toThrow();
    expect(() => completeChore('chore-bad', { doneOn: '2026-11-21' })).toThrow();
    expect(completeChore('chore-weg')).toBeNull();
    await fx.settle();
    expect(fx.calls).toEqual([]);
  });

  it('"Überspringen" is booked as skipped: only the date moves', async () => {
    await fx.startEnrico();
    const eventId = skipChore('chore-bad');
    expect(choreById('chore-bad')).toMatchObject({
      nextDueOn: '2026-11-27',
      lastDoneOn: '2026-11-13',
    });
    await fx.settle();
    expect(opsOf(0)).toEqual([
      {
        kind: 'complete_chore',
        completion: expect.objectContaining({ kind: 'skipped', next_due_on: '2026-11-27' }),
      },
    ]);
    expect(fx.server.row(H, 'chore_events', eventId ?? '')).toMatchObject({ kind: 'skipped' });
    expect(fx.server.row(H, 'chores', 'chore-bad')).toMatchObject({
      last_done_on: '2026-11-13',
    });
  });

  it('a one-off chore is deleted by the server, the entry stays; undo brings the chore back', async () => {
    await fx.startEnrico();
    const restore = snapshot();
    const eventId = completeChore('chore-gluehbirne');
    expect(choreById('chore-gluehbirne')).toBeUndefined();
    await fx.settle();
    expect(shape(opsOf(0))).toEqual([['complete_chore', '']]);
    expect(fx.server.row(H, 'chores', 'chore-gluehbirne')).toBeUndefined();
    expect(fx.server.row(H, 'chore_events', eventId ?? '')).toMatchObject({ chore_id: null });

    restore();
    await fx.settle();
    expect(shape(opsOf(1))).toEqual([
      ['insert', 'chores'],
      ['remove_chore_event', ''],
    ]);
    expect(fx.server.row(H, 'chores', 'chore-gluehbirne')).toBeDefined();
    expect(fx.server.row(H, 'chore_events', eventId ?? '')).toBeUndefined();
    expect(choreById('chore-gluehbirne')).toBeDefined();
  });

  it('undo of a completion removes the entry and the server restores date and last time', async () => {
    await fx.startEnrico();
    const restore = snapshot();
    const eventId = completeChore('chore-bad');
    await fx.settle();
    restore();
    await fx.settle();
    expect(opsOf(1)).toEqual([{ kind: 'remove_chore_event', id: eventId }]);
    expect(fx.server.row(H, 'chore_events', eventId ?? '')).toBeUndefined();
    expect(fx.server.row(H, 'chores', 'chore-bad')).toMatchObject({
      next_due_on: TODAY,
      last_done_on: '2026-11-13',
    });
  });
});

describe('spec 0011: editing and deleting a chore', () => {
  it('AC-050: title, assignment, effort, room and season in one patch; Nadja sees it', async () => {
    await fx.startEnrico();
    const nadja = await fx.startNadja();
    const before = choreById('chore-bad');
    if (!before) throw new Error('fixture');
    updateChore('chore-bad', {
      title: 'Bad gründlich putzen',
      room: 'Bad',
      recurrence: before.recurrence,
      assignment: { type: 'rotating', memberIds: [ENRICO, NADJA] },
      effort: 3,
      activeMonths: [4, 5, 6, 7, 8, 9],
    });
    await fx.settle(nadja);
    expect(shape(opsOf(0))).toEqual([['patch', 'chores']]);
    expect(fx.nadjaData(nadja).chores.find((chore) => chore.id === 'chore-bad')).toMatchObject({
      title: 'Bad gründlich putzen',
      assignment: { type: 'rotating', memberIds: [ENRICO, NADJA] },
      effort: 3,
      room: 'Bad',
      activeMonths: [4, 5, 6, 7, 8, 9],
      nextDueOn: TODAY,
      nextAssigneeId: ENRICO,
    });
  });

  it('AC-051: a new rhythm gets a new date: Monday 23.11.; never done "monatlich am 1." → 1.12.', async () => {
    await fx.startEnrico();
    const bath = choreById('chore-bad');
    const mattress = choreById('chore-matratze');
    if (!bath || !mattress) throw new Error('fixture');
    updateChore('chore-bad', { ...bath, recurrence: { type: 'weekly', every: 1, weekdays: [1] } });
    updateChore('chore-matratze', { ...mattress, recurrence: { type: 'monthly', day: 1 } });
    await fx.settle();
    expect(fx.server.row(H, 'chores', 'chore-bad')).toMatchObject({ next_due_on: '2026-11-23' });
    expect(fx.server.row(H, 'chores', 'chore-matratze')).toMatchObject({
      next_due_on: '2026-12-01',
    });
  });

  it('AC-045: switching to "bei Bedarf" drops the date and keeps the entries', async () => {
    await fx.startEnrico();
    const bath = choreById('chore-bad');
    if (!bath) throw new Error('fixture');
    updateChore('chore-bad', { ...bath, recurrence: { type: 'asNeeded' } });
    await fx.settle();
    expect(rejected).toEqual([]);
    expect(fx.server.row(H, 'chores', 'chore-bad')).toMatchObject({ next_due_on: null });
    expect(serverEvents('chore-bad')).toHaveLength(1);
  });

  it('AC-052: an empty title saves nothing and says "Titel fehlt"', async () => {
    await fx.startEnrico();
    const bath = choreById('chore-bad');
    if (!bath) throw new Error('fixture');
    expect(() => updateChore('chore-bad', { ...bath, title: '  ' })).toThrow('Titel fehlt');
    await fx.settle();
    expect(fx.calls).toEqual([]);
    expect(choreById('chore-bad')?.title).toBe('Bad putzen');
  });

  it('AC-054: saving a chore Nadja deleted meanwhile springs back with the hint, it stays deleted', async () => {
    await fx.startEnrico();
    const bath = choreById('chore-bad');
    if (!bath) throw new Error('fixture');
    await fx.server
      .transport(NADJA)
      .applyChanges(H, [{ kind: 'delete', table: 'chores', id: 'chore-bad' }]);
    updateChore('chore-bad', { ...bath, title: 'Bad gründlich putzen' });
    await fx.settle();
    expect(rejected).toEqual([WRITE_REJECTED_MESSAGE]);
    expect(fx.server.row(H, 'chores', 'chore-bad')).toBeUndefined();
    expect(choreById('chore-bad')).toBeUndefined();
  });

  it('AC-053: deleting keeps the entries with their title; undo links them to the chore again', async () => {
    await fx.startEnrico();
    const nadja = await fx.startNadja();
    const restore = snapshot();
    deleteChore('chore-bad');
    expect(choreById('chore-bad')).toBeUndefined();
    expect(eventById('ev-5')).toMatchObject({ title: 'Bad putzen' });
    expect(eventById('ev-5')?.choreId).toBeUndefined();
    await fx.settle(nadja);
    expect(opsOf(0)).toEqual([{ kind: 'delete', table: 'chores', id: 'chore-bad' }]);
    expect(fx.server.row(H, 'chore_events', 'ev-5')).toMatchObject({
      chore_id: null,
      title: 'Bad putzen',
    });
    expect(fx.nadjaData(nadja).chores.some((chore) => chore.id === 'chore-bad')).toBe(false);

    restore();
    await fx.settle(nadja);
    expect(shape(opsOf(1))).toEqual([
      ['insert', 'chores'],
      ['patch', 'chore_events'],
    ]);
    expect(fx.server.row(H, 'chores', 'chore-bad')).toMatchObject({ title: 'Bad putzen' });
    expect(fx.server.row(H, 'chore_events', 'ev-5')).toMatchObject({ chore_id: 'chore-bad' });
    expect(eventById('ev-5')?.choreId).toBe('chore-bad');
  });

  it('AC-036 (spec 0003) / AC-051: a new chore gets its first date from core.firstDueOn', async () => {
    await fx.startEnrico();
    const saturday = createChore({
      title: 'Staubsaugen',
      recurrence: { type: 'weekly', every: 1, weekdays: [6] },
      assignment: { type: 'rotating', memberIds: [ENRICO, NADJA] },
    });
    const monthly = createChore({
      title: 'Kühlschrank abtauen',
      recurrence: { type: 'monthly', day: 1 },
      assignment: { type: 'anyone' },
      activeMonths: [11, 12],
    });
    const asNeeded = createChore({
      title: 'Fenster Bad',
      recurrence: { type: 'asNeeded' },
      assignment: { type: 'fixed', memberId: NADJA },
    });
    expect(choreById(saturday)).toMatchObject({ nextDueOn: '2026-11-21', nextAssigneeId: ENRICO });
    expect(choreById(monthly)).toMatchObject({ nextDueOn: '2026-12-01', activeMonths: [11, 12] });
    expect(choreById(asNeeded)).toMatchObject({ nextAssigneeId: NADJA });
    expect(choreById(asNeeded)?.nextDueOn).toBeUndefined();
    expect(() =>
      createChore({ title: ' ', recurrence: { type: 'once' }, assignment: { type: 'anyone' } }),
    ).toThrow('Titel fehlt');
    await fx.settle();
    expect(rejected).toEqual([]);
    expect(fx.calls.map((call) => call.fn)).toEqual(Array(3).fill('applyChanges'));
  });

  it('AC-013: "Später" moves only the next date to the chosen day', async () => {
    await fx.startEnrico();
    postponeChore('chore-bad', '2026-11-21');
    await fx.settle();
    expect(fx.server.row(H, 'chores', 'chore-bad')).toMatchObject({ next_due_on: '2026-11-21' });
  });
});

describe('spec 0011: history entries', () => {
  it('AC-059: "Erledigt von" on the latest entry moves the turn; on an older one only the avatar', async () => {
    await fx.startEnrico();
    const eventId = completeChore('chore-muell');
    if (!eventId) throw new Error('no event');
    expect(choreById('chore-muell')?.nextAssigneeId).toBe(NADJA);
    await fx.settle();

    reassignChoreEvent(eventId, NADJA);
    expect(eventById(eventId)?.doneBy).toBe(NADJA);
    expect(choreById('chore-muell')?.nextAssigneeId).toBe(ENRICO);
    await fx.settle();
    expect(shape(opsOf(1))).toEqual([
      ['patch', 'chores'],
      ['patch', 'chore_events'],
    ]);
    expect(fx.server.row(H, 'chores', 'chore-muell')).toMatchObject({ next_assignee_id: ENRICO });

    reassignChoreEvent('ev-3', NADJA);
    await fx.settle();
    expect(opsOf(2)).toEqual([
      { kind: 'patch', table: 'chore_events', id: 'ev-3', changes: { done_by: NADJA } },
    ]);
    expect(choreById('chore-muell')?.nextAssigneeId).toBe(ENRICO);
  });

  it('AC-060: removing the latest entry restores date and person; an older one only goes', async () => {
    await fx.startEnrico();
    const eventId = completeChore('chore-bad');
    if (!eventId) throw new Error('no event');
    await fx.settle();

    expect(removeChoreEvent(eventId)).toEqual({ restoresChore: true, undoable: true });
    expect(eventById(eventId)).toBeUndefined();
    expect(choreById('chore-bad')).toMatchObject({
      nextDueOn: TODAY,
      lastDoneOn: '2026-11-13',
      nextAssigneeId: ENRICO,
    });
    await fx.settle();
    expect(opsOf(1)).toEqual([{ kind: 'remove_chore_event', id: eventId }]);
    expect(fx.server.row(H, 'chores', 'chore-bad')).toMatchObject({
      next_due_on: TODAY,
      last_done_on: '2026-11-13',
      next_assignee_id: ENRICO,
    });

    expect(removeChoreEvent('ev-5')).toEqual({ restoresChore: false, undoable: false });
    await fx.settle();
    expect(fx.server.row(H, 'chore_events', 'ev-5')).toBeUndefined();
    expect(fx.server.row(H, 'chores', 'chore-bad')).toMatchObject({ next_due_on: TODAY });
    expect(removeChoreEvent('weg')).toBeNull();
  });

  it('AC-060: removing the latest entry can be undone: booked again with the same id', async () => {
    await fx.startEnrico();
    const eventId = completeChore('chore-bad');
    await fx.settle();
    const restore = snapshot();
    removeChoreEvent(eventId ?? '');
    await fx.settle();
    restore();
    await fx.settle();
    expect(rejected).toEqual([]);
    expect(opsOf(2)).toEqual([
      {
        kind: 'complete_chore',
        completion: {
          chore_id: 'chore-bad',
          event_id: eventId,
          kind: 'done',
          done_on: TODAY,
          done_by: ENRICO,
          seen: {
            next_due_on: TODAY,
            last_done_on: '2026-11-13',
            next_assignee_id: ENRICO,
            latest_event_id: 'ev-5',
          },
          next_due_on: '2026-11-27',
          next_assignee_id: ENRICO,
        },
      },
    ]);
    expect(fx.server.row(H, 'chore_events', eventId ?? '')).toMatchObject({ done_by: ENRICO });
    expect(fx.server.row(H, 'chores', 'chore-bad')).toMatchObject({ next_due_on: '2026-11-27' });
  });
});

describe('spec 0011: negative cases', () => {
  it('AC-034 / AC-042 / AC-061: every chore command throws OfflineError offline and sends nothing', async () => {
    await fx.startEnrico();
    const bath = choreById('chore-bad');
    if (!bath) throw new Error('fixture');
    fx.environment.setOnline(false);
    const commands = [
      () => completeChore('chore-bad'),
      () => skipChore('chore-bad'),
      () => logDone({ title: 'Fenster putzen' }),
      () => logDone({ choreId: 'chore-bad' }, { doneOn: '2026-11-19' }),
      () => postponeChore('chore-bad', '2026-11-21'),
      () => updateChore('chore-bad', { ...bath, title: 'Bad gründlich putzen' }),
      () => deleteChore('chore-bad'),
      () => reassignChoreEvent('ev-5', NADJA),
      () => removeChoreEvent('ev-5'),
      () =>
        createChore({
          title: 'Staubsaugen',
          recurrence: { type: 'once' },
          assignment: { type: 'anyone' },
        }),
    ];
    for (const command of commands) expect(command).toThrow(OfflineError);
    expect(choreById('chore-bad')).toEqual(bath);
    fx.environment.setOnline(true);
    await fx.settle();
    expect(fx.calls).toEqual([]);
  });

  it('AC-055: signed out, nothing can be booked', async () => {
    await fx.startEnrico();
    await stopBackend();
    expect(() => completeChore('chore-bad')).toThrow();
    expect(() => removeChoreEvent('ev-5')).toThrow();
  });
});

describe('spec 0013: the time of a chore', () => {
  it('AC-022: setting 19:00 is one patch of due_time; Nadja sees "19:00"', async () => {
    await fx.startEnrico();
    const nadja = await fx.startNadja();
    const bath = choreById('chore-bad');
    if (!bath) throw new Error('fixture');
    updateChore('chore-bad', { ...bath, dueTime: '19:00' });
    expect(choreById('chore-bad')?.dueTime).toBe('19:00');
    await fx.settle(nadja);
    expect(opsOf(0)).toEqual([
      { kind: 'patch', table: 'chores', id: 'chore-bad', changes: { due_time: '19:00:00' } },
    ]);
    expect(fx.nadjaData(nadja).chores.find((chore) => chore.id === 'chore-bad')?.dueTime).toBe(
      '19:00',
    );
  });

  it('AC-025: ✕ (null) removes the time; another change without a time keeps it', async () => {
    await fx.startEnrico();
    const trash = choreById('chore-muell');
    if (!trash) throw new Error('fixture');
    expect(trash.dueTime).toBe('19:00');
    const { dueTime: _kept, ...withoutTime } = trash;
    updateChore('chore-muell', { ...withoutTime, title: 'Müll und Papier rausbringen' });
    expect(choreById('chore-muell')?.dueTime).toBe('19:00');
    updateChore('chore-muell', { ...withoutTime, dueTime: null });
    await fx.settle();
    expect(choreById('chore-muell')?.dueTime).toBeUndefined();
    expect(fx.server.row(H, 'chores', 'chore-muell')).toMatchObject({ due_time: null });
  });

  it('a new chore keeps its time', async () => {
    await fx.startEnrico();
    const id = createChore({
      title: 'Blumen gießen',
      recurrence: { type: 'weekly', every: 1, weekdays: [6] },
      assignment: { type: 'anyone' },
      dueTime: '18:00',
    });
    await fx.settle();
    expect(rejected).toEqual([]);
    expect(fx.server.row(H, 'chores', id)).toMatchObject({ due_time: '18:00:00' });
  });

  it('a time outside the five-minute steps is refused locally and by the server (23514)', async () => {
    await fx.startEnrico();
    const bath = choreById('chore-bad');
    if (!bath) throw new Error('fixture');
    expect(() => updateChore('chore-bad', { ...bath, dueTime: '19:03' })).toThrow(
      'Keine gültige Uhrzeit',
    );
    await fx.settle();
    expect(fx.calls).toEqual([]);
    await expect(
      fx.server
        .transport(ENRICO)
        .applyChanges(H, [
          { kind: 'patch', table: 'chores', id: 'chore-bad', changes: { due_time: '19:03:00' } },
        ]),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('REQ-007: setting a time is refused offline', async () => {
    await fx.startEnrico();
    const bath = choreById('chore-bad');
    if (!bath) throw new Error('fixture');
    fx.environment.setOnline(false);
    expect(() => updateChore('chore-bad', { ...bath, dueTime: '19:00' })).toThrow(OfflineError);
    expect(choreById('chore-bad')?.dueTime).toBeUndefined();
  });
});

describe('spec 0026: dates, Später, Nachtragen', () => {
  it('AC-019: "Was anderes erledigt?" books a day up to 30 days back', async () => {
    await fx.startEnrico();
    const entry = logDone({ choreId: 'chore-bad' }, { doneOn: '2026-10-21' });
    expect(entry).not.toBeNull();
    await fx.settle();
    expect(rejected).toEqual([]);
    expect(fx.server.row(H, 'chore_events', entry?.eventId ?? '')).toMatchObject({
      done_on: '2026-10-21',
    });
  });

  it('AC-004: creating with „Zuletzt erledigt“ and „Nächstes Mal“ stores both, no history entry', async () => {
    await fx.startEnrico();
    const id = createChore({
      title: 'Matratze drehen',
      recurrence: { type: 'everyMonths', every: 6 },
      assignment: { type: 'anyone' },
      lastDoneOn: '2026-08-15',
      nextDueOn: '2027-02-15',
    });
    await fx.settle();
    expect(fx.server.row(H, 'chores', id)).toMatchObject({
      next_due_on: '2027-02-15',
      last_done_on: '2026-08-15',
    });
    expect(serverEvents(id)).toEqual([]);
  });

  it('AC-005: without „Nächstes Mal“ a new chore gets the suggestion of core (today + interval)', async () => {
    await fx.startEnrico();
    const id = createChore({
      title: 'Fenster Wohnzimmer',
      recurrence: { type: 'everyMonths', every: 2 },
      assignment: { type: 'anyone' },
    });
    expect(choreById(id)?.nextDueOn).toBe('2027-01-20');
  });

  it('AC-006: editing „Nächstes Mal“ moves only the date; a day before today throws', async () => {
    await fx.startEnrico();
    const bath = choreById('chore-bad');
    if (!bath) throw new Error('fixture');
    updateChore('chore-bad', { ...bath, nextDueOn: '2026-11-26' });
    await fx.settle();
    expect(fx.server.row(H, 'chores', 'chore-bad')).toMatchObject({ next_due_on: '2026-11-26' });
    expect(() => updateChore('chore-bad', { ...bath, nextDueOn: '2026-11-19' })).toThrow(
      'Nur ab heute',
    );
  });

  it('AC-009: „Als Nächstes dran“ sets the turn of an alternating chore', async () => {
    await fx.startEnrico();
    const id = createChore({
      title: 'Staubsaugen',
      recurrence: { type: 'weekly', every: 1, weekdays: [6] },
      assignment: { type: 'rotating', memberIds: [ENRICO, NADJA] },
      nextAssigneeId: NADJA,
    });
    const chore = choreById(id);
    if (!chore) throw new Error('not created');
    expect(chore.nextAssigneeId).toBe(NADJA);
    updateChore(id, { ...chore, nextAssigneeId: ENRICO });
    await fx.settle();
    expect(fx.server.row(H, 'chores', id)).toMatchObject({ next_assignee_id: ENRICO });
  });

  it('AC-015: "Später" takes the chosen day; before today it throws and sends nothing', async () => {
    await fx.startEnrico();
    expect(() => postponeChore('chore-bad', '2026-11-19')).toThrow('Nur ab heute');
    postponeChore('chore-bad', '2026-11-25');
    await fx.settle();
    expect(fx.server.row(H, 'chores', 'chore-bad')).toMatchObject({ next_due_on: '2026-11-25' });
  });

  it('AC-021: „Datum ändern“ of the latest entry moves the entry, the date and the last time', async () => {
    await fx.startEnrico();
    const eventId = completeChore('chore-bad');
    if (!eventId) throw new Error('no event');
    await fx.settle();
    expect(changeChoreEventDay(eventId, '2026-11-18')).toBe(true);
    expect(eventById(eventId)?.doneOn).toBe('2026-11-18');
    await fx.settle();
    expect(rejected).toEqual([]);
    const op = opsOf(1)[0];
    expect(op).toMatchObject({
      kind: 'change_chore_event_day',
      change: { event_id: eventId, done_on: '2026-11-18', next_due_on: '2026-11-27' },
    });
    expect(fx.server.row(H, 'chore_events', eventId)).toMatchObject({ done_on: '2026-11-18' });
    // Done early counts for the Friday ahead (spec 0011, AC-037).
    expect(fx.server.row(H, 'chores', 'chore-bad')).toMatchObject({
      next_due_on: '2026-11-27',
      last_done_on: '2026-11-18',
    });
  });

  it('AC-022: an older entry changes only its day', async () => {
    await fx.startEnrico();
    const before = choreById('chore-bad');
    expect(changeChoreEventDay('ev-5', '2026-11-12')).toBe(true);
    await fx.settle();
    expect(rejected).toEqual([]);
    expect(choreById('chore-bad')).toEqual(before);
    expect(opsOf(0)[0]).toMatchObject({ change: { event_id: 'ev-5', done_on: '2026-11-12' } });
    expect(opsOf(0)[0]).not.toHaveProperty('change.next_due_on');
  });

  it('AC-023: an entry removed on another device springs back with the general hint; > 30 days throws', async () => {
    await fx.startEnrico();
    const nadja = await fx.startNadja();
    expect(() => changeChoreEventDay('ev-5', '2026-10-20')).toThrow();
    fx.server.deleteRow(H, 'chore_events', 'ev-5');
    changeChoreEventDay('ev-5', '2026-11-12');
    await fx.settle(nadja);
    expect(rejected).toEqual([WRITE_REJECTED_MESSAGE]);
    expect(changeChoreEventDay('ev-unknown', '2026-11-12')).toBe(false);
  });
});
