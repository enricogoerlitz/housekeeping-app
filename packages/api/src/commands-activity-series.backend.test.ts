// Spec 0041: kinds, own symbol and "Merken" of activities, series with cancelled and moved
// Termine, and "Serie bearbeiten" as one apply_changes call, through the fake server and the
// other device's delta sync.
import { addDays, seriesPlanEntries } from '@housekeeping/core';
import { describe, expect, it } from 'vitest';

import { H, TODAY, withBackend } from './backend-test-helpers';
import {
  createActivity,
  createActivityKind,
  deleteActivityKind,
  updateActivity,
  updateActivityKind,
} from './commands-activities';
import {
  cancelOccurrence,
  createActivitySeries,
  deleteActivitySeries,
  editActivitySeries,
  moveOccurrence,
  restoreOccurrence,
  type SeriesDraft,
} from './commands-activity-series';
import { deleteActivity } from './commands-places';
import { ENRICO, SLOT_DINNER } from './seed/demo';
import { getData } from './store';
import type { ChangeOp } from './transport';

const fx = withBackend();
const opsOf = (index: number) => (fx.calls[index]?.args[1] ?? []) as ChangeOp[];
const kindNamed = (name: string) => getData().activityKinds.find((kind) => kind.name === name);

const weekly = (startsOn: string): SeriesDraft => ({
  activityId: 'act-bouldern',
  rule: { type: 'weekly', every: 1, weekdays: [2] },
  startsOn,
  slotId: SLOT_DINNER,
  startsAt: '18:00',
  eaterIds: [],
  guests: 0,
});

describe('kinds (REQ-001)', () => {
  it('REQ-001: the household has the default kinds', async () => {
    await fx.startEnrico();
    expect(getData().activityKinds.map((kind) => kind.name)).toEqual([
      'Geburtstag',
      'Sport',
      'Ausflug',
      'Kultur',
      'Essen gehen',
      'Treffen',
      'Reise',
      'Sonstiges',
    ]);
  });

  it('AC-001: "Bouldern" with kind "Sport" carries the kind; AC-005: an own symbol wins', async () => {
    await fx.startEnrico();
    const sport = kindNamed('Sport');
    const id = createActivity({ name: 'Bouldern draußen', kindId: sport?.id });
    updateActivity(id, { icon: 'mountain' });
    await fx.settle();
    expect(fx.server.row(H, 'activities', id)).toMatchObject({
      kind_id: sport?.id,
      icon: 'mountain',
      remembered: true,
    });
  });

  it('AC-002: "Wellness" with a symbol is there for the whole household', async () => {
    await fx.startEnrico();
    const nadja = await fx.startNadja();
    const id = createActivityKind('Wellness', 'bath');
    await fx.settle(nadja);
    expect(opsOf(0)).toEqual([
      {
        kind: 'insert',
        table: 'activity_kinds',
        row: { id, name: 'Wellness', name_key: 'wellness', icon: 'bath' },
      },
    ]);
    expect(fx.nadjaData(nadja).activityKinds).toContainEqual({
      id,
      name: 'Wellness',
      icon: 'bath',
    });
  });

  it('AC-002: a taken or empty name is refused before anything is sent', async () => {
    await fx.startEnrico();
    expect(() => createActivityKind(' sport ', 'heart')).toThrow('Gibt es schon: Sport');
    expect(() => createActivityKind('  ', 'heart')).toThrow('Name fehlt');
    const sport = kindNamed('Sport');
    if (!sport) throw new Error('fixture: no Sport');
    expect(() => updateActivityKind(sport.id, { name: 'Kultur' })).toThrow('Gibt es schon: Kultur');
    await fx.settle();
    expect(fx.calls).toEqual([]);
  });

  it('AC-003: deleting "Sport" keeps Bouldern, without a kind, here and on the other device', async () => {
    await fx.startEnrico();
    const nadja = await fx.startNadja();
    const sport = kindNamed('Sport');
    if (!sport) throw new Error('fixture: no Sport');
    updateActivityKind(sport.id, { name: 'Bewegung', icon: 'bike' });
    deleteActivityKind(sport.id);
    await fx.settle(nadja);
    expect(opsOf(1)).toEqual([{ kind: 'delete', table: 'activity_kinds', id: sport.id }]);
    const bouldern = (data: ReturnType<typeof getData>) =>
      data.activities.find((activity) => activity.id === 'act-bouldern');
    expect(bouldern(getData())?.kindId).toBeUndefined();
    expect(bouldern(fx.nadjaData(nadja))?.kindId).toBeUndefined();
    expect(fx.server.row(H, 'activities', 'act-bouldern')).toMatchObject({ kind_id: null });
  });

  it('AC-012: "Merken" off reaches the other device', async () => {
    await fx.startEnrico();
    const nadja = await fx.startNadja();
    const id = createActivity({ name: 'Autofahren', remembered: false });
    await fx.settle(nadja);
    expect(fx.nadjaData(nadja).activities.find((activity) => activity.id === id)?.remembered).toBe(
      false,
    );
  });
});

describe('series (REQ-003)', () => {
  it('AC-007, AC-014: a weekly series with people reaches the other device and its calendar', async () => {
    await fx.startEnrico();
    const nadja = await fx.startNadja();
    const start = addDays(TODAY, 1);
    const id = createActivitySeries({ ...weekly(start), eaterIds: [ENRICO], guests: 2 });
    await fx.settle(nadja);
    expect(fx.server.row(H, 'activity_series', id)).toMatchObject({
      rule: { type: 'weekly', every: 1, weekdays: [2] },
      starts_on: start,
      starts_at: '18:00:00',
      eater_ids: [ENRICO],
      guests: 2,
    });
    const other = fx.nadjaData(nadja);
    const entries = seriesPlanEntries(
      other.activitySeries,
      other.activitySeriesExceptions,
      start,
      addDays(start, 13),
    );
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ activityId: 'act-bouldern', eaterIds: [ENRICO], guests: 2 });
  });

  it('refuses a series without weekday before anything is sent', async () => {
    await fx.startEnrico();
    expect(() =>
      createActivitySeries({ ...weekly(TODAY), rule: { type: 'weekly', every: 1, weekdays: [] } }),
    ).toThrow('Wähl mindestens einen Wochentag.');
    await fx.settle();
    expect(fx.calls).toEqual([]);
  });

  it('AC-008: cancel, move and take back a single Termin', async () => {
    await fx.startEnrico();
    const id = createActivitySeries(weekly(TODAY));
    const on = seriesPlanEntries(getData().activitySeries, [], TODAY, addDays(TODAY, 6))[0]?.series
      ?.on;
    if (!on) throw new Error('fixture: no Termin in the first week');
    cancelOccurrence(id, on);
    moveOccurrence(id, on, { date: addDays(on, 1), startsAt: '19:00' });
    await fx.settle();
    const exceptions = fx.server.rows(H, 'activity_series_exceptions');
    expect(exceptions).toEqual([
      expect.objectContaining({
        series_id: id,
        on_date: on,
        moved_to: addDays(on, 1),
        starts_at: '19:00:00',
      }),
    ]);
    restoreOccurrence(id, on);
    await fx.settle();
    expect(fx.server.rows(H, 'activity_series_exceptions')).toEqual([]);
  });

  it('AC-009: "Serie bearbeiten" ends the series, starts the new one and moves its exception in one call', async () => {
    await fx.startEnrico();
    const start = addDays(TODAY, -21);
    const id = createActivitySeries(weekly(start));
    const future = seriesPlanEntries(
      getData().activitySeries,
      [],
      addDays(TODAY, 1),
      addDays(TODAY, 7),
    )[0]?.series?.on;
    if (!future) throw new Error('fixture: no Termin next week');
    cancelOccurrence(id, future);
    await fx.settle();
    const before = fx.calls.length;
    const plan = editActivitySeries(id, { startsAt: '19:00' }, TODAY);
    await fx.settle();
    expect(plan.kind).toBe('split');
    expect(fx.calls).toHaveLength(before + 1);
    const ops = opsOf(before);
    expect(ops.map((op) => [op.kind, 'table' in op ? op.table : undefined])).toEqual([
      ['patch', 'activity_series'],
      ['insert', 'activity_series'],
      ['patch', 'activity_series_exceptions'],
    ]);
    const series = fx.server.rows(H, 'activity_series');
    expect(series.map((row) => [row.starts_at, row.ends_on])).toEqual([
      ['18:00:00', addDays(TODAY, -1)],
      ['19:00:00', null],
    ]);
    const next = series.find((row) => row.starts_at === '19:00:00');
    expect(fx.server.rows(H, 'activity_series_exceptions')[0]).toMatchObject({
      series_id: next?.id,
    });
  });

  it('AC-009: a series that has not started is changed as a whole; one without Termine refuses', async () => {
    await fx.startEnrico();
    const id = createActivitySeries(weekly(addDays(TODAY, 7)));
    expect(editActivitySeries(id, { guests: 1 }, TODAY).kind).toBe('update');
    const ended = createActivitySeries({
      ...weekly(addDays(TODAY, -30)),
      endsOn: addDays(TODAY, -2),
    });
    expect(() => editActivitySeries(ended, { guests: 1 }, TODAY)).toThrow(
      'Die Serie hat keine Termine mehr.',
    );
    await fx.settle();
    expect(fx.server.row(H, 'activity_series', id)).toMatchObject({ guests: 1 });
  });

  it('"Serie löschen" takes its exceptions along; deleting the activity takes its series', async () => {
    await fx.startEnrico();
    const id = createActivitySeries(weekly(TODAY));
    cancelOccurrence(id, addDays(TODAY, 30));
    deleteActivitySeries(id);
    const other = createActivitySeries(weekly(TODAY));
    await fx.settle();
    expect(fx.server.rows(H, 'activity_series').map((row) => row.id)).toEqual([other]);
    expect(fx.server.rows(H, 'activity_series_exceptions')).toEqual([]);
    const deletion = deleteActivity('act-bouldern');
    await deletion?.confirmed;
    await fx.settle();
    expect(getData().activitySeries).toEqual([]);
    expect(fx.server.rows(H, 'activity_series')).toEqual([]);
  });
});
