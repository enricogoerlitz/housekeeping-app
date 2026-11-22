import { describe, expect, it } from 'vitest';

import {
  calendarDayParam,
  choresOfDay,
  dayDots,
  overviewSections,
  tripLines,
  overviewTitle,
  overviewNav,
  overviewSection,
  overviewSubline,
  plannedAllLabel,
  shiftOverview,
  tileEntry,
} from './overview';
import { dueChores, withoutTrips } from './chore-schedule';
import { enrico, grillabend, nadja, trip, vera } from './test-fixtures';
import type { Chore, ChoreEvent, MealPlanEntry, Trip } from './types';

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
  it('spec 0011: titles and section names of the shown day', () => {
    expect(overviewTitle(today, today)).toBe('Freitag, 20. November');
    expect(overviewTitle('2026-11-21', today)).toBe('Morgen, Samstag 21. November');
    expect(overviewSections('2026-11-21', today)).toEqual({
      planned: 'Geplant am Samstag',
      chores: 'Zu tun am Samstag',
    });
    expect(overviewSections(today, today)).toEqual({ planned: 'Heute geplant', chores: 'Zu tun' });
  });

  it('spec 0011 AC-032: a past day reads "Erledigt am Mittwoch"; yesterday gets "Gestern, "', () => {
    expect(overviewSections('2026-11-18', today)).toEqual({
      planned: 'Geplant am Mittwoch',
      chores: 'Erledigt am Mittwoch',
    });
    expect(overviewTitle('2026-11-19', today)).toBe('Gestern, Donnerstag 19. November');
  });

  it('another year adds the year; tomorrow across New Year stays "Morgen, …"', () => {
    expect(overviewTitle('2027-01-08', today)).toBe('Freitag, 8. Januar 2027');
    expect(overviewTitle('2025-11-21', today)).toBe('Freitag, 21. November 2025');
    expect(overviewTitle('2027-01-01', '2026-12-31')).toBe('Morgen, Freitag 1. Januar');
  });
});

describe('spec 0020 REQ-001/REQ-002: seven days from yesterday', () => {
  // Sunday, 22 November 2026.
  const sunday = '2026-11-22';

  it('AC-001: the strip shows Sa 21. to Fr 27.11., Sunday chosen, Mo 16. to Fr 20. missing', () => {
    const section = overviewSection(sunday, sunday);
    expect(section.dates).toEqual([
      '2026-11-21',
      '2026-11-22',
      '2026-11-23',
      '2026-11-24',
      '2026-11-25',
      '2026-11-26',
      '2026-11-27',
    ]);
    expect(section.dates).not.toContain('2026-11-20');
  });

  it('AC-002: › goes to Sa 28.11.–Fr 4.12. with So 29.11.; twice ‹ to Sa 14.–Fr 20.11.', () => {
    const later = shiftOverview(sunday, 1);
    expect(later).toBe('2026-11-29');
    expect(overviewSection(later, sunday)).toMatchObject({ from: '2026-11-28', to: '2026-12-04' });
    const earlier = shiftOverview(later, -2);
    expect(earlier).toBe('2026-11-15');
    expect(overviewSection(earlier, sunday)).toMatchObject({
      from: '2026-11-14',
      to: '2026-11-20',
    });
  });

  it('AC-003: Mi 25.11. › is Mi 2.12. at the fifth place, "Mittwoch, 2. Dezember"', () => {
    const next = shiftOverview('2026-11-25', 1);
    expect(next).toBe('2026-12-02');
    expect(overviewSection(next, sunday).dates.indexOf(next)).toBe(4);
    expect(overviewTitle(next, sunday)).toBe('Mittwoch, 2. Dezember');
  });

  it('AC-005: on Do 31.12.2026 the strip runs Mi 30.12.2026 to Di 5.1.2027', () => {
    const newYear = '2026-12-31';
    expect(overviewSection(newYear, newYear)).toMatchObject({
      from: '2026-12-30',
      to: '2027-01-05',
    });
    expect(overviewTitle('2027-01-01', newYear)).toBe('Morgen, Freitag 1. Januar');
  });

  it('AC-006: at midnight to Mo 23.11. the strip becomes So 22.–Sa 28.11.', () => {
    expect(overviewSection('2026-11-23', '2026-11-23')).toMatchObject({
      from: '2026-11-22',
      to: '2026-11-28',
    });
  });

  it('AC-007: range "Sa 21.11. – Fr 27.11." without "KW", "Heute" inactive in the section', () => {
    const nav = overviewNav(sunday, sunday);
    expect(nav.label).toBe('Sa 21.11. – Fr 27.11.');
    expect(nav.label).not.toMatch(/KW|Diese Woche/);
    expect(nav.todayActive).toBe(false);
    expect(overviewNav('2026-11-24', sunday)).toMatchObject({
      label: 'Sa 21.11. – Fr 27.11.',
      todayActive: false,
    });
    expect(overviewSubline('2026-11-24', sunday, 'Guten Morgen, Enrico')).toBe(
      'Guten Morgen, Enrico',
    );
    expect(overviewSubline('2026-11-21', sunday, 'Guten Morgen, Enrico')).toBe(
      'Guten Morgen, Enrico',
    );
  });

  it('AC-008: outside the section "In 7 Tagen" / "Vor 8 Tagen" and "Heute" active', () => {
    expect(overviewNav('2026-11-29', sunday)).toMatchObject({
      label: 'Sa 28.11. – Fr 4.12.',
      todayActive: true,
    });
    expect(overviewSubline('2026-11-29', sunday, 'Guten Tag, Enrico')).toBe('In 7 Tagen');
    expect(overviewSubline('2026-11-14', sunday, 'Guten Tag, Enrico')).toBe('Vor 8 Tagen');
    expect(overviewSubline('2026-11-28', sunday, 'Guten Tag, Enrico')).toBe('In 6 Tagen');
  });

  it('AC-011: "Mi 30.12. – Di 5.1." and its spoken form', () => {
    expect(overviewNav('2026-12-31', '2026-12-31')).toMatchObject({
      label: 'Mi 30.12. – Di 5.1.',
      a11yLabel: 'Mittwoch, 30. Dezember, bis Dienstag, 5. Januar',
    });
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

  it('AC-011: "Alle n ›" only from four entries on', () => {
    expect(plannedAllLabel(5)).toBe('Alle 5 ›');
    expect(plannedAllLabel(4)).toBe('Alle 4 ›');
    expect(plannedAllLabel(3)).toBeUndefined();
    expect(plannedAllLabel(0)).toBeUndefined();
  });
});

describe('AC-007: the trip line', () => {
  const mallorca = trip('a1', [nadja.id], '2026-11-21', '2026-11-26', 'Urlaub Mallorca');

  it('AC-007: "Nadja · Urlaub Mallorca · bis Do 26.11." while it lasts, gone after', () => {
    expect(tripLines({ trips: [mallorca], members, date: '2026-11-23' })).toEqual([
      {
        key: expect.any(String),
        memberIds: [nadja.id],
        text: 'Nadja · Urlaub Mallorca · bis Do 26.11.',
      },
    ]);
    expect(tripLines({ trips: [mallorca], members, date: '2026-11-26' })).toHaveLength(1);
    expect(tripLines({ trips: [mallorca], members, date: '2026-11-27' })).toEqual([]);
    expect(tripLines({ trips: [mallorca], members, date: '2026-11-20' })).toEqual([]);
  });

  it('AC-007, AC-033 (0016): without a note it reads "Nadja ist unterwegs bis Do 26.11."', () => {
    const plain = { ...mallorca, note: undefined };
    expect(tripLines({ trips: [plain], members, date: '2026-11-23' })[0]?.text).toBe(
      'Nadja ist unterwegs bis Do 26.11.',
    );
  });

  it('several people and the whole household', () => {
    const three = [enrico, nadja, vera];
    const both: Trip[] = [trip('e', [enrico.id, vera.id], '2026-11-21', '2026-11-22')];
    expect(tripLines({ trips: both, members: three, date: '2026-11-21' })[0]?.text).toBe(
      'Enrico und Vera sind unterwegs bis So 22.11.',
    );
    const household = trip('h', [enrico.id, nadja.id], '2026-11-21', '2026-11-22', 'Berlin');
    expect(tripLines({ trips: [household], members, date: '2026-11-22' })).toEqual([
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
  const input = { chores, events: [window], members, trips: [], today };

  it('AC-028: today lists overdue, due and nearly due flexible chores, never "bei Bedarf"', () => {
    const day = choresOfDay({ ...input, shown: today });
    expect(day.kind).toBe('due');
    expect(day.kind === 'due' && day.chores.map((item) => item.id)).toEqual([
      'muell',
      'bad',
      'bett',
    ]);
    expect(dueChores(chores, today, withoutTrips(members)).map((item) => item.id)).toEqual([
      'muell',
      'bad',
      'bett',
    ]);
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

describe('spec 0020 REQ-003: the most important entry of a tile', () => {
  const day = '2026-11-22';
  const books = { [grillabend.id]: grillabend };
  const at = (partial: Partial<MealPlanEntry> & Pick<MealPlanEntry, 'id'>) =>
    entry({ date: day, ...partial });
  const eislaufen = at({
    id: 'eis',
    kind: 'activity',
    activityId: 'eis',
    slotId: 'slot-vormittag',
  });
  const reste = at({ id: 'reste', kind: 'leftovers', recipeId: 'mango', slotId: 'slot-mittag' });
  const lasagne = at({ id: 'lasagne', recipeId: 'lasagne', sort: 0 });
  const enzo = at({ id: 'enzo', kind: 'restaurant', restaurantId: 'enzo', sort: 1 });
  const tile = (entries: MealPlanEntry[], date = day) => tileEntry(entries, date, slotOrder, books);

  it('AC-012: "Lasagne" "+3", then a collection in the evening wins with "+4"', () => {
    expect(tile([eislaufen, reste, lasagne, enzo])).toMatchObject({
      entry: { id: 'lasagne' },
      more: 3,
    });
    const grill = at({ id: 'grill', recipeId: grillabend.id, sort: 2 });
    expect(tile([eislaufen, reste, lasagne, enzo, grill])).toMatchObject({
      entry: { id: 'grill' },
      more: 4,
    });
  });

  it('AC-013: a later Tageszeit wins over the kind', () => {
    const monday = [
      at({ id: 'shakshuka', recipeId: 'shakshuka', slotId: 'slot-mittag' }),
      at({ id: 'eis', kind: 'activity', activityId: 'eis' }),
    ];
    expect(tile(monday)).toMatchObject({ entry: { id: 'shakshuka' }, more: 1 });
    const tuesday = [
      at({ id: 'mango', recipeId: 'mango', slotId: 'slot-mittag' }),
      at({ id: 'enzo', kind: 'restaurant', restaurantId: 'enzo' }),
    ];
    expect(tile(tuesday)).toMatchObject({ entry: { id: 'enzo' }, more: 1 });
  });

  it('AC-014: leftovers and free text by Tageszeit, leftovers before free text', () => {
    const wednesday = [
      at({ id: 'reste', kind: 'leftovers', recipeId: 'lasagne', slotId: 'slot-mittag' }),
      at({ id: 'pizza', kind: 'text', text: 'Pizza bestellen' }),
      at({ id: 'eis', kind: 'activity', activityId: 'eis' }),
    ];
    expect(tile(wednesday)).toMatchObject({ entry: { id: 'pizza' }, more: 2 });
    const thursday = [
      at({ id: 'pizza', kind: 'text', text: 'Pizza bestellen', sort: 0 }),
      at({ id: 'reste', kind: 'leftovers', recipeId: 'lasagne', sort: 1 }),
    ];
    expect(tile(thursday)).toMatchObject({ entry: { id: 'reste' }, more: 1 });
  });

  it('AC-015: the same kind in the same Tageszeit follows the calendar order', () => {
    const mango = at({ id: 'mango', recipeId: 'mango', sort: 0 });
    const shakshuka = at({ id: 'shakshuka', recipeId: 'shakshuka', sort: 1 });
    expect(tile([shakshuka, mango]).entry?.id).toBe('mango');
    expect(
      tile([
        { ...shakshuka, sort: 0 },
        { ...mango, sort: 1 },
      ]).entry?.id,
    ).toBe('shakshuka');
  });

  it('AC-016: only "Eislaufen" planned: no "+n"; reserved entries never count', () => {
    const reserved = { ...lasagne, date: null };
    expect(tile([eislaufen, reserved])).toEqual({
      entry: eislaufen,
      more: 0,
    });
    expect(tile([], '2026-11-28')).toEqual({ entry: undefined, more: 0 });
  });
});
