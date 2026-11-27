// Spec 0059 "Nichts verpassen": "Erinnern" at a series (REQ-003) and "Vorwarnung" at a chore
// (REQ-004) through the fake server and the other device's delta sync.
import { addDays, seriesPlanEntries } from '@housekeeping/core';
import { describe, expect, it } from 'vitest';

import { H, TODAY, withBackend } from './backend-test-helpers';
import { createActivitySeries, editActivitySeries } from './commands-activity-series';
import { createChore, updateChore } from './commands-chores';
import { SLOT_DINNER } from './seed/demo';
import { getData } from './store';

const fx = withBackend();

const yearly = {
  activityId: 'act-bouldern',
  rule: { type: 'yearly' as const },
  startsOn: addDays(TODAY, 10),
  slotId: SLOT_DINNER,
  eaterIds: [],
  guests: 0,
};

describe('Erinnern an Serien (REQ-003)', () => {
  it('AC-015: the reminder of a series reaches the other device and its Termine', async () => {
    await fx.startEnrico();
    const nadja = await fx.startNadja();
    const id = createActivitySeries({
      ...yearly,
      reminder: { offsetDays: 7, at: '18:00', text: 'Geschenk besorgen' },
    });
    await fx.settle(nadja);
    expect(fx.server.row(H, 'activity_series', id)).toMatchObject({
      reminder_day_offset: 7,
      reminder_at: '18:00:00',
      reminder_text: 'Geschenk besorgen',
    });
    const other = fx.nadjaData(nadja);
    const [termin] = seriesPlanEntries(other.activitySeries, [], yearly.startsOn, yearly.startsOn);
    expect(termin?.reminder).toEqual({ offsetDays: 7, at: '18:00', text: 'Geschenk besorgen' });
  });

  it('AC-015: "Serie bearbeiten" switches it on and off again', async () => {
    await fx.startEnrico();
    const id = createActivitySeries(yearly);
    await fx.settle();
    editActivitySeries(id, { reminder: { offsetDays: 3, at: '09:00' } }, TODAY);
    await fx.settle();
    expect(fx.server.row(H, 'activity_series', id)).toMatchObject({
      reminder_day_offset: 3,
      reminder_at: '09:00:00',
      reminder_text: null,
    });
    editActivitySeries(id, { reminder: undefined }, TODAY);
    await fx.settle();
    expect(fx.server.row(H, 'activity_series', id)).toMatchObject({
      reminder_day_offset: null,
      reminder_at: null,
    });
  });

  it('AC-017: a Vorlauf beyond 30 days is refused before anything is sent', async () => {
    await fx.startEnrico();
    expect(() =>
      createActivitySeries({ ...yearly, reminder: { offsetDays: 31, at: '18:00' } }),
    ).toThrow('Die Erinnerung passt so nicht.');
    await fx.settle();
    expect(fx.calls).toEqual([]);
  });
});

describe('Vorwarnung an Aufgaben (REQ-004)', () => {
  const vertrag = {
    title: 'Handyvertrag kündigen',
    recurrence: { type: 'once' as const, date: addDays(TODAY, 18) },
    assignment: { type: 'anyone' as const },
  };

  it('AC-018: the Vorwarnung is stored and reaches the other device', async () => {
    await fx.startEnrico();
    const nadja = await fx.startNadja();
    const id = createChore({ ...vertrag, noticeDaysBefore: 30 });
    await fx.settle(nadja);
    expect(fx.server.row(H, 'chores', id)).toMatchObject({ notice_days_before: 30 });
    expect(fx.nadjaData(nadja).chores.find((chore) => chore.id === id)?.noticeDaysBefore).toBe(30);
  });

  it('AC-018: editing keeps it, 0 removes it', async () => {
    await fx.startEnrico();
    const id = createChore({ ...vertrag, noticeDaysBefore: 7 });
    await fx.settle();
    updateChore(id, { ...vertrag, title: 'Vertrag kündigen' });
    await fx.settle();
    expect(fx.server.row(H, 'chores', id)).toMatchObject({ notice_days_before: 7 });
    updateChore(id, { ...vertrag, noticeDaysBefore: 0 });
    await fx.settle();
    expect(fx.server.row(H, 'chores', id)).toMatchObject({ notice_days_before: null });
  });

  it('AC-023: "Flexibel" and "Bei Bedarf" keep no Vorwarnung', async () => {
    await fx.startEnrico();
    const id = createChore({
      ...vertrag,
      recurrence: { type: 'flexible', everyDays: 30 },
      noticeDaysBefore: 7,
    });
    await fx.settle();
    expect(getData().chores.find((chore) => chore.id === id)?.noticeDaysBefore).toBeUndefined();
    expect(fx.server.row(H, 'chores', id)).toMatchObject({ notice_days_before: null });
  });
});
