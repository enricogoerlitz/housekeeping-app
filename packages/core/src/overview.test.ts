import { describe, expect, it } from 'vitest';

import { isoWeekNumber, weekDates } from './dates';
import {
  absenceLines,
  calendarDayParam,
  choresOfDay,
  dayDots,
  dayTile,
  dueChores,
  overviewSections,
  overviewTitle,
  plannedAllLabel,
  shiftShownDay,
  weekNav,
} from './overview';
import { enrico, grillabend, nadja, vera } from './test-fixtures';
import type { Absence, Chore, ChoreEvent, MealPlanEntry } from './types';

// Friday, 20 November 2026 (KW 47: Monday 16 to Sunday 22 November).
const today = '2026-11-20';
const members = [enrico, nadja];
const slotOrder = ['slot-vormittag', 'slot-mittag', 'slot-abend'];

function entry(partial: Partial<MealPlanEntry> & Pick<MealPlanEntry, 'id'>): MealPlanEntry {
  return {
    date: today,
    slotId: 'slot-abend',
    kind: 'recipe',
    eaterIds: [],
    guests: 0,
    portions: 2,
    variants: [],
    sort: 0,
    ...partial,
  };
}

function chore(partial: Partial<Chore> & Pick<Chore, 'id' | 'title'>): Chore {
  return {
    recurrence: { type: 'weekly', every: 1, weekdays: [5] },
    assignment: { type: 'fixed', memberId: enrico.id },
    effort: 1,
    ...partial,
  };
}

describe('REQ-001: the shown day', () => {
  it('AC-001: today is "Freitag, 20. November", "Diese Woche · KW 47", Mo 16 … So 22', () => {
    expect(overviewTitle(today, today)).toBe('Freitag, 20. November');
    expect(weekNav(today, today)).toEqual({ label: 'Diese Woche · KW 47', showToday: false });
    const week = weekDates(today);
    expect(week[0]).toBe('2026-11-16');
    expect(week[6]).toBe('2026-11-22');
  });

  it('AC-002: Saturday is "Morgen, Samstag 21. November" with the "Heute" button', () => {
    expect(overviewTitle('2026-11-21', today)).toBe('Morgen, Samstag 21. November');
    expect(overviewSections('2026-11-21', today)).toEqual({
      planned: 'Geplant am Samstag',
      chores: 'Zu tun am Samstag',
    });
    expect(weekNav('2026-11-21', today).showToday).toBe(true);
  });

  it('AC-002: today reads "Heute geplant" and "Zu tun"', () => {
    expect(overviewSections(today, today)).toEqual({ planned: 'Heute geplant', chores: 'Zu tun' });
  });

  it('AC-032: a past day reads "Erledigt am Mittwoch"; yesterday gets "Gestern, "', () => {
    expect(overviewSections('2026-11-18', today)).toEqual({
      planned: 'Geplant am Mittwoch',
      chores: 'Erledigt am Mittwoch',
    });
    expect(overviewTitle('2026-11-19', today)).toBe('Gestern, Donnerstag 19. November');
  });

  it('AC-003: paging keeps the weekday (KW 49 Fr 4 Dec, then KW 46 Fr 13 Nov)', () => {
    const later = shiftShownDay(shiftShownDay(today, 1), 1);
    expect(later).toBe('2026-12-04');
    expect(isoWeekNumber(later)).toBe(49);
    expect(weekDates(later)[0]).toBe('2026-11-30');
    expect(weekDates(later)[6]).toBe('2026-12-06');
    expect(overviewTitle(later, today)).toBe('Freitag, 4. Dezember');
    const earlier = shiftShownDay(later, -3);
    expect(earlier).toBe('2026-11-13');
    expect(isoWeekNumber(earlier)).toBe(46);
  });

  it('AC-062: another week shows its range and the "Heute" button', () => {
    expect(weekNav('2026-12-04', today)).toEqual({
      label: 'KW 49 · 30. Nov – 6. Dez',
      showToday: true,
    });
  });

  it('another year adds the year; tomorrow across New Year stays "Morgen, …"', () => {
    expect(overviewTitle('2027-01-08', today)).toBe('Freitag, 8. Januar 2027');
    expect(overviewTitle('2025-11-21', today)).toBe('Freitag, 21. November 2025');
    expect(overviewTitle('2027-01-01', '2026-12-31')).toBe('Morgen, Freitag 1. Januar');
  });
});

describe('AC-005/AC-006/AC-011: the week strip and the planned cards', () => {
  const thursday = '2026-11-19';
  const entries = [
    entry({ id: 'shakshuka', date: thursday, recipeId: 'r1' }),
    entry({ id: 'dal', date: thursday, recipeId: 'r2', slotId: 'slot-mittag' }),
    entry({ id: 'enzo', date: thursday, kind: 'restaurant', restaurantId: 'enzo' }),
    entry({ id: 'bouldern', kind: 'activity', activityId: 'b', slotId: 'slot-vormittag' }),
    entry({ id: 'lasagne', recipeId: 'lasagne', sort: 1 }),
    entry({ id: 'enzo-fr', kind: 'restaurant', restaurantId: 'enzo' }),
  ];

  it('AC-005: Thursday carries exactly one recipe and one restaurant dot', () => {
    expect(dayDots(entries, thursday, {})).toEqual(['recipe', 'restaurant']);
    expect(dayDots(entries, '2026-11-22', {})).toEqual([]);
  });

  it('AC-006: the desktop tile shows the first entry of the day and "+2"', () => {
    const tile = dayTile(entries, today, slotOrder);
    expect(tile.first?.id).toBe('bouldern');
    expect(tile.more).toBe(2);
    expect(dayTile(entries, '2026-11-22', slotOrder)).toEqual({ first: undefined, more: 0 });
  });

  it('AC-011: "Alle n ›" only from four entries on', () => {
    expect(plannedAllLabel(5)).toBe('Alle 5 ›');
    expect(plannedAllLabel(4)).toBe('Alle 4 ›');
    expect(plannedAllLabel(3)).toBeUndefined();
    expect(plannedAllLabel(0)).toBeUndefined();
  });
});

describe('AC-007: the absence line', () => {
  const trip: Absence = {
    id: 'a1',
    memberId: nadja.id,
    from: '2026-11-21',
    to: '2026-11-26',
    note: 'Urlaub Mallorca',
  };

  it('AC-007: "Nadja · Urlaub Mallorca · bis Do 26.11." while it lasts, gone after', () => {
    expect(absenceLines({ absences: [trip], members, date: '2026-11-23' })).toEqual([
      {
        key: expect.any(String),
        memberIds: [nadja.id],
        text: 'Nadja · Urlaub Mallorca · bis Do 26.11.',
      },
    ]);
    expect(absenceLines({ absences: [trip], members, date: '2026-11-26' })).toHaveLength(1);
    expect(absenceLines({ absences: [trip], members, date: '2026-11-27' })).toEqual([]);
    expect(absenceLines({ absences: [trip], members, date: '2026-11-20' })).toEqual([]);
  });

  it('AC-007: without a note it reads "Nadja ist abwesend bis Do 26.11."', () => {
    const plain = { ...trip, note: undefined };
    expect(absenceLines({ absences: [plain], members, date: '2026-11-23' })[0]?.text).toBe(
      'Nadja ist abwesend bis Do 26.11.',
    );
  });

  it('several people and the whole household', () => {
    const three = [enrico, nadja, vera];
    const both: Absence[] = [
      { id: 'e', memberId: enrico.id, from: '2026-11-21', to: '2026-11-22' },
      { id: 'v', memberId: vera.id, from: '2026-11-21', to: '2026-11-22' },
    ];
    expect(absenceLines({ absences: both, members: three, date: '2026-11-21' })[0]?.text).toBe(
      'Enrico und Vera sind abwesend bis So 22.11.',
    );
    const household: Absence = { id: 'h', from: '2026-11-21', to: '2026-11-22', note: 'Berlin' };
    expect(absenceLines({ absences: [household], members, date: '2026-11-22' })).toEqual([
      { key: expect.any(String), memberIds: [], text: 'Alle · Berlin · bis So 22.11.' },
    ]);
  });
});

describe('AC-032: choresOfDay', () => {
  const kitchen = chore({
    id: 'kueche',
    title: 'Küche wischen',
    recurrence: { type: 'weekly', every: 1, weekdays: [6] },
    nextDueOn: '2026-11-21',
    nextAssigneeId: enrico.id,
  });
  const bath = chore({ id: 'bad', title: 'Bad putzen', nextDueOn: today });
  const trash = chore({ id: 'muell', title: 'Müll rausbringen', nextDueOn: '2026-11-18' });
  const sheets = chore({
    id: 'bett',
    title: 'Bettwäsche wechseln',
    recurrence: { type: 'flexible', everyDays: 10 },
    lastDoneOn: '2026-11-12',
  });
  const plants = chore({
    id: 'pflanzen',
    title: 'Pflanzen gießen',
    recurrence: { type: 'flexible', everyDays: 10 },
    lastDoneOn: '2026-11-15',
  });
  const kitchenWindow = chore({
    id: 'fk',
    title: 'Fenster Küche',
    recurrence: { type: 'asNeeded' },
    nextDueOn: today,
  });
  const window: ChoreEvent = {
    id: 'ev-fw',
    choreId: 'fw',
    title: 'Fenster Wohnzimmer',
    kind: 'done',
    doneOn: '2026-11-18',
    doneBy: nadja.id,
  };
  const chores = [kitchen, bath, trash, sheets, plants, kitchenWindow];
  const input = { chores, events: [window], members, today };

  it('AC-028: today lists overdue, due and nearly due flexible chores, never "bei Bedarf"', () => {
    const day = choresOfDay({ ...input, shown: today });
    expect(day.kind).toBe('due');
    expect(day.kind === 'due' && day.chores.map((item) => item.id)).toEqual([
      'muell',
      'bad',
      'bett',
    ]);
    expect(dueChores(chores, today).map((item) => item.id)).toEqual(['muell', 'bad', 'bett']);
  });

  it('AC-032: Saturday shows "Küche wischen" planned with Enrico', () => {
    const day = choresOfDay({ ...input, shown: '2026-11-21' });
    expect(day.kind).toBe('planned');
    expect(day.items.map((item) => [item.title, item.memberIds])).toEqual([
      ['Küche wischen', [enrico.id]],
    ]);
  });

  it('AC-032: Wednesday shows "Fenster Wohnzimmer" done by Nadja', () => {
    const day = choresOfDay({ ...input, shown: '2026-11-18' });
    expect(day.kind).toBe('done');
    expect(day.items.map((item) => [item.title, item.status, item.memberIds])).toEqual([
      ['Fenster Wohnzimmer', 'done', [nadja.id]],
    ]);
  });

  it('AC-043: "bei Bedarf" is never planned on a later day', () => {
    for (const shown of ['2026-11-21', '2026-11-27', '2026-12-20']) {
      const day = choresOfDay({ ...input, chores: [kitchenWindow], shown });
      expect(day.items).toEqual([]);
    }
  });
});

describe('AC-004/AC-011/AC-013: the day handed to the calendar', () => {
  it('AC-004: "/kalender?tag=2026-11-28" opens the week of Saturday, 28 November', () => {
    expect(calendarDayParam('2026-11-28')).toBe('2026-11-28');
    expect(calendarDayParam(['2026-11-22', '2026-11-23'])).toBe('2026-11-22');
  });

  it('an invalid or missing value is ignored', () => {
    for (const raw of [undefined, '', '28.11.2026', '2026-13-01', '2026-02-30', 'heute', []]) {
      expect(calendarDayParam(raw)).toBeUndefined();
    }
  });
});

describe('Sammlungen on the Übersicht (spec 0009, E17)', () => {
  it('spec 0011 AC-012: a collection gets its own dot, after the recipe', () => {
    const sunday = [
      entry({ id: 'grill', date: '2026-11-22', recipeId: grillabend.id }),
      entry({ id: 'dal', date: '2026-11-22', recipeId: 'rec-dal' }),
    ];
    expect(dayDots(sunday, '2026-11-22', { [grillabend.id]: grillabend })).toEqual([
      'recipe',
      'collection',
    ]);
  });
});
