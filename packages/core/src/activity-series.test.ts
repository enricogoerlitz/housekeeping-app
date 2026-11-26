import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  defaultRepeat,
  isSeriesEntry,
  REPEAT_OPTIONS,
  repeatRule,
  peopleLabel,
  planSeriesEdit,
  SeriesRuleSchema,
  seriesDraftProblem,
  seriesOccurrences,
  seriesPlanEntries,
  seriesRuleLabel,
} from './activity-series';
import type { ActivitySeries, ActivitySeriesException, Member } from './types';

const tuesdays: ActivitySeries = {
  id: 'bouldern-series',
  activityId: 'bouldern',
  rule: { type: 'weekly', every: 1, weekdays: [2] },
  startsOn: '2026-12-01',
  endsOn: '2027-03-31',
  slotId: 'abend',
  startsAt: '18:00',
  eaterIds: [],
  guests: 0,
};

const birthday: ActivitySeries = {
  id: 'nadja-series',
  activityId: 'geburtstag-nadja',
  rule: { type: 'yearly' },
  startsOn: '2027-03-14',
  slotId: 'vormittag',
  eaterIds: [],
  guests: 0,
};

const dates = (
  series: ActivitySeries,
  from: string,
  to: string,
  exceptions: ActivitySeriesException[] = [],
) => seriesOccurrences(series, exceptions, from, to).map((occurrence) => occurrence.date);

describe('seriesOccurrences', () => {
  it('AC-006: a yearly birthday from 14.03.2027, dauerhaft, stands on 14.03.2035', () => {
    expect(dates(birthday, '2035-03-01', '2035-03-31')).toEqual(['2035-03-14']);
    expect(dates(birthday, '2027-01-01', '2027-03-13')).toEqual([]);
  });

  it('AC-007: weekly on Tuesdays from 01.12.2026 to 31.03.2027, and not on 06.04.2027', () => {
    const shown = dates(tuesdays, '2026-11-01', '2027-04-30');
    expect(shown).toHaveLength(18);
    expect(shown[0]).toBe('2026-12-01');
    expect(shown.at(-1)).toBe('2027-03-30');
    expect(shown).not.toContain('2027-04-06');
    expect(seriesOccurrences(tuesdays, [], '2026-12-01', '2026-12-01')[0]?.startsAt).toBe('18:00');
  });

  it('AC-008: a cancelled Termin is missing, the other Tuesdays stay', () => {
    const cancelled: ActivitySeriesException = { id: 'x', seriesId: tuesdays.id, on: '2026-12-08' };
    expect(dates(tuesdays, '2026-12-01', '2026-12-22', [cancelled])).toEqual([
      '2026-12-01',
      '2026-12-15',
      '2026-12-22',
    ]);
  });

  it('AC-008: a moved Termin stands on its new day with its own time, also from outside the range', () => {
    const moved: ActivitySeriesException = {
      id: 'x',
      seriesId: tuesdays.id,
      on: '2026-12-08',
      movedTo: '2026-12-10',
      startsAt: '19:30',
    };
    const occurrences = seriesOccurrences(tuesdays, [moved], '2026-12-09', '2026-12-11');
    expect(occurrences).toEqual([
      expect.objectContaining({
        date: '2026-12-10',
        on: '2026-12-08',
        startsAt: '19:30',
        moved: true,
      }),
    ]);
    expect(dates(tuesdays, '2026-12-08', '2026-12-08', [moved])).toEqual([]);
  });

  it('ignores exceptions of other series and of days the rule never gives', () => {
    const foreign: ActivitySeriesException = { id: 'x', seriesId: 'other', on: '2026-12-08' };
    const wrongDay: ActivitySeriesException = {
      id: 'y',
      seriesId: tuesdays.id,
      on: '2026-12-09',
      movedTo: '2026-12-11',
    };
    expect(dates(tuesdays, '2026-12-08', '2026-12-11', [foreign, wrongDay])).toEqual([
      '2026-12-08',
    ]);
  });

  it('AC-010: a yearly Termin on 29.02. stands on 28.02. in other years', () => {
    const leap: ActivitySeries = { ...birthday, startsOn: '2024-02-29' };
    expect(dates(leap, '2025-02-01', '2025-03-31')).toEqual(['2025-02-28']);
    expect(dates(leap, '2028-02-01', '2028-03-31')).toEqual(['2028-02-29']);
  });

  describe('in Europe/Berlin', () => {
    beforeAll(() => {
      vi.stubEnv('TZ', 'Europe/Berlin');
    });
    afterAll(() => {
      vi.unstubAllEnvs();
    });

    it('AC-011: across the clock change on 28.03.2027 Bouldern stays on Tuesday at 18:00', () => {
      const occurrences = seriesOccurrences(tuesdays, [], '2027-03-22', '2027-03-31');
      expect(occurrences.map((o) => [o.date, o.startsAt])).toEqual([
        ['2027-03-23', '18:00'],
        ['2027-03-30', '18:00'],
      ]);
    });
  });

  it('every 2 weeks keeps the weeks of the start', () => {
    const fortnight: ActivitySeries = {
      ...tuesdays,
      rule: { type: 'weekly', every: 2, weekdays: [1, 4] },
      startsOn: '2026-12-03',
      endsOn: undefined,
    };
    expect(dates(fortnight, '2026-11-30', '2026-12-27')).toEqual([
      '2026-12-03',
      '2026-12-14',
      '2026-12-17',
    ]);
  });

  it('monthly on the 31st falls on the last day of shorter months', () => {
    const monthly: ActivitySeries = {
      ...birthday,
      rule: { type: 'monthly', day: 31 },
      startsOn: '2027-01-31',
    };
    expect(dates(monthly, '2027-01-01', '2027-04-30')).toEqual([
      '2027-01-31',
      '2027-02-28',
      '2027-03-31',
      '2027-04-30',
    ]);
  });

  it('gives nothing for a range before the start, after the end or turned around', () => {
    expect(dates(tuesdays, '2026-11-01', '2026-11-30')).toEqual([]);
    expect(dates(tuesdays, '2027-04-01', '2027-12-31')).toEqual([]);
    expect(dates(tuesdays, '2026-12-31', '2026-12-01')).toEqual([]);
  });
});

describe('seriesPlanEntries', () => {
  it('turns Termine into activity entries with the series and the people', () => {
    const entries = seriesPlanEntries(
      [{ ...tuesdays, eaterIds: ['enrico'], guests: 2, note: 'Halle Nord' }],
      [],
      '2026-12-01',
      '2026-12-07',
    );
    expect(entries).toEqual([
      expect.objectContaining({
        date: '2026-12-01',
        kind: 'activity',
        activityId: 'bouldern',
        slotId: 'abend',
        startsAt: '18:00',
        note: 'Halle Nord',
        eaterIds: ['enrico'],
        guests: 2,
        series: { seriesId: 'bouldern-series', on: '2026-12-01' },
      }),
    ]);
    expect(entries.every(isSeriesEntry)).toBe(true);
    expect(isSeriesEntry({ series: undefined })).toBe(false);
  });
});

describe('planSeriesEdit', () => {
  const exceptions: ActivitySeriesException[] = [
    { id: 'past', seriesId: tuesdays.id, on: '2026-12-08' },
    { id: 'future', seriesId: tuesdays.id, on: '2027-02-02' },
  ];

  it('AC-009: "Serie bearbeiten" → 19:00 moves every future Termin, the past stays 18:00', () => {
    const plan = planSeriesEdit(tuesdays, exceptions, { startsAt: '19:00' }, '2027-01-14');
    expect(plan).toEqual({
      kind: 'split',
      endsOld: '2027-01-13',
      next: expect.objectContaining({
        startsOn: '2027-01-14',
        startsAt: '19:00',
        endsOn: '2027-03-31',
      }),
      movedExceptionIds: ['future'],
    });
    if (plan.kind !== 'split' || !plan.next) return;
    const old = { ...tuesdays, endsOn: plan.endsOld };
    const next = { ...plan.next, id: 'new' };
    expect(seriesOccurrences(old, [], '2027-01-01', '2027-01-31').map((o) => o.startsAt)).toEqual([
      '18:00',
      '18:00',
    ]);
    expect(
      seriesOccurrences(next, [], '2027-01-01', '2027-01-31').map((o) => [o.date, o.startsAt]),
    ).toEqual([
      ['2027-01-19', '19:00'],
      ['2027-01-26', '19:00'],
    ]);
  });

  it('AC-009: a series that has not started yet is changed as a whole', () => {
    expect(planSeriesEdit(tuesdays, exceptions, { startsAt: '19:00' }, '2026-11-26')).toEqual({
      kind: 'update',
      changes: { startsAt: '19:00' },
    });
  });

  it('keeps the phase of "alle 2 Wochen" and the day of a yearly series', () => {
    const fortnight: ActivitySeries = {
      ...tuesdays,
      rule: { type: 'weekly', every: 2, weekdays: [2] },
    };
    // From 01.12.2026 every other week: the Tuesday 12.01.2027 is past on 14.01., the next one is
    // 26.01.2027, so the new series starts in its week.
    const plan = planSeriesEdit(fortnight, [], { guests: 1 }, '2027-01-14');
    expect(plan.kind === 'split' && plan.next?.startsOn).toBe('2027-01-25');
    const yearly = planSeriesEdit(birthday, [], { startsAt: '10:00' }, '2028-05-01');
    expect(yearly.kind === 'split' && [yearly.endsOld, yearly.next?.startsOn]).toEqual([
      '2028-04-30',
      '2029-03-14',
    ]);
  });

  it('says so when the series has no Termin ahead any more', () => {
    expect(planSeriesEdit(tuesdays, [], { startsAt: '19:00' }, '2027-04-01')).toEqual({
      kind: 'ended',
    });
  });
});

describe('seriesDraftProblem', () => {
  it('names what keeps a series from being saved', () => {
    expect(
      seriesDraftProblem({ ...tuesdays, rule: { type: 'weekly', every: 1, weekdays: [] } }),
    ).toBe('Wähl mindestens einen Wochentag.');
    expect(
      seriesDraftProblem({ ...tuesdays, rule: { type: 'weekly', every: 60, weekdays: [2] } }),
    ).toBe('Alle 1 bis 52 Wochen.');
    expect(seriesDraftProblem({ ...tuesdays, endsOn: '2026-11-01' })).toBe(
      '„Bis“ liegt vor dem Start.',
    );
    expect(seriesDraftProblem(tuesdays)).toBeUndefined();
  });
});

describe('SeriesRuleSchema', () => {
  it('reads the rules the database accepts and refuses others', () => {
    expect(SeriesRuleSchema.parse({ type: 'yearly' })).toEqual({ type: 'yearly' });
    expect(SeriesRuleSchema.safeParse({ type: 'weekly', every: 1, weekdays: [8] }).success).toBe(
      false,
    );
    expect(SeriesRuleSchema.safeParse({ type: 'monthly', day: 0 }).success).toBe(false);
    expect(SeriesRuleSchema.safeParse({ type: 'daily' }).success).toBe(false);
  });
});

describe('labels', () => {
  it('names the rhythm', () => {
    expect(seriesRuleLabel(tuesdays.rule, tuesdays.startsOn)).toBe('wöchentlich Di');
    expect(seriesRuleLabel({ type: 'weekly', every: 2, weekdays: [4, 1] }, '2026-12-03')).toBe(
      'alle 2 Wochen Mo, Do',
    );
    expect(seriesRuleLabel({ type: 'monthly', day: 15 }, '2026-12-15')).toBe('monatlich am 15.');
    expect(seriesRuleLabel(birthday.rule, birthday.startsOn)).toBe('jährlich am 14. März');
  });

  const members: Record<string, Member> = {
    enrico: {
      id: 'enrico',
      name: 'Enrico',
      color: '#000',
      dietPreference: 'flexible',
      dislikes: [],
    },
    nadja: { id: 'nadja', name: 'Nadja', color: '#000', dietPreference: 'flexible', dislikes: [] },
  };

  it('AC-014: Enrico and 2 guests read "Enrico + 2"', () => {
    expect(peopleLabel(['enrico'], 2, members)).toBe('Enrico + 2');
    expect(peopleLabel(['enrico', 'nadja'], 0, members)).toBe('Enrico, Nadja');
    expect(peopleLabel([], 1, members)).toBe('1 Gast');
    expect(peopleLabel([], 3, members)).toBe('3 Gäste');
    expect(peopleLabel(['gone'], 0, members)).toBe('');
  });
});

describe('repeat in the form', () => {
  it('AC-006, AC-007: "Einmalig" by default; the day gives weekday, day of month and date', () => {
    const repeat = defaultRepeat('2026-12-01');
    expect(REPEAT_OPTIONS.map((option) => option.label)).toEqual([
      'Einmalig',
      'Wöchentlich',
      'Monatlich',
      'Jährlich',
    ]);
    expect(repeatRule(repeat)).toBeUndefined();
    expect(repeatRule({ ...repeat, kind: 'weekly' })).toEqual({
      type: 'weekly',
      every: 1,
      weekdays: [2],
    });
    expect(repeatRule({ ...repeat, kind: 'weekly', every: 2, weekdays: [4, 1] })).toEqual({
      type: 'weekly',
      every: 2,
      weekdays: [1, 4],
    });
    expect(repeatRule({ ...repeat, kind: 'monthly' })).toEqual({ type: 'monthly', day: 1 });
    expect(repeatRule({ ...repeat, kind: 'yearly' })).toEqual({ type: 'yearly' });
  });
});
