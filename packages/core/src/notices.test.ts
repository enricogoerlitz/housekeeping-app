import { describe, expect, it } from 'vitest';

import {
  acknowledgedAfter,
  dueNotices,
  isNoticeKey,
  noticeBadge,
  type NoticeInput,
} from './notices';
import { enrico, makeRecipe, nadja, trip } from './test-fixtures';
import type { Activity, Chore, MealPlanEntry, MealSlot, Restaurant } from './types';

// Friday, 20 November 2026, household "Enrico & Nadja" (spec 0051).
const today = '2026-11-20';
const tomorrow = '2026-11-21';
const slots: MealSlot[] = [
  { id: 'slot-vormittag', name: 'Vormittag', sort: 0 },
  { id: 'slot-mittag', name: 'Mittag', sort: 1 },
  { id: 'slot-abend', name: 'Abend', sort: 2 },
];
const lasagne = makeRecipe({ id: 'r-lasagne', title: 'Lasagne' });
const hummus = makeRecipe({
  id: 'r-hummus',
  title: 'Hummus',
  leadTime: { text: 'Kichererbsen einweichen', hoursBefore: 12 },
});
const roma = { id: 'p-roma', name: 'Pizzeria Roma' } as Restaurant;
const eislaufen = { id: 'a-eislaufen', name: 'Eislaufen' } as Activity;

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
    nextDueOn: today,
    nextAssigneeId: enrico.id,
    ...partial,
  };
}

const pizza = entry({
  id: 'e-pizza',
  kind: 'restaurant',
  restaurantId: roma.id,
  startsAt: '19:30',
  reminder: { offsetDays: 0, at: '17:30' },
});
const muell = chore({ id: 'c-muell', title: 'Müll rausbringen', dueTime: '19:00' });

function input(partial: Partial<NoticeInput> = {}): NoticeInput {
  return {
    me: enrico.id,
    today,
    now: '18:00',
    entries: [],
    chores: [],
    book: { recipesById: { [lasagne.id]: lasagne, [hummus.id]: hummus }, collectionRecipes: [] },
    slots,
    restaurantsById: { [roma.id]: roma },
    activitiesById: { [eislaufen.id]: eislaufen },
    away: { members: [enrico, nadja], trips: [] },
    acknowledged: [],
    ...partial,
  };
}

function shown(partial: Partial<NoticeInput>): string[] {
  return dueNotices(input(partial)).map((notice) => `${notice.title} | ${notice.detail}`);
}

describe('dueNotices — entry reminders (REQ-002)', () => {
  it('AC-007: a reminder shows from its moment until the end of the entry day', () => {
    expect(shown({ entries: [pizza], now: '18:00' })).toEqual(['Pizzeria Roma | heute 19:30']);
    expect(shown({ entries: [pizza], now: '17:29' })).toEqual([]);
    expect(shown({ entries: [pizza], today: tomorrow, now: '08:00' })).toEqual([]);
  });

  it('AC-007: a reminder of the day before names "morgen" and its text', () => {
    const early = { ...pizza, date: tomorrow, reminder: { offsetDays: 1, at: '17:30', text: 'Tisch bestätigen' } };
    expect(shown({ entries: [early] })).toEqual(['Pizzeria Roma | morgen 19:30 · Tisch bestätigen']);
  });

  it('AC-007: the target opens the day with the entry', () => {
    const [notice] = dueNotices(input({ entries: [pizza] }));
    expect(notice?.target).toEqual({ screen: 'calendar', day: today, entryId: 'e-pizza' });
    expect(notice?.kind).toBe('entryReminder');
    expect(notice?.key).toBe(`entry:e-pizza:0-1730:${today}`);
  });

  it('AC-013: a reminder only for who eats along; at an activity for everyone', () => {
    const forNadja = { ...pizza, eaterIds: [nadja.id] };
    expect(shown({ entries: [forNadja] })).toEqual([]);
    expect(shown({ entries: [forNadja], me: nadja.id })).toHaveLength(1);
    const activity = entry({
      id: 'e-eis',
      kind: 'activity',
      activityId: eislaufen.id,
      eaterIds: [nadja.id],
      reminder: { offsetDays: 0, at: '17:00' },
    });
    expect(shown({ entries: [activity] })).toContain('Eislaufen | heute Abend');
  });

  it('AC-021: a reminder acknowledged and then moved to another time is open again', () => {
    const acknowledged = [`entry:e-pizza:0-1730:${today}`];
    expect(shown({ entries: [pizza], acknowledged })).toEqual([]);
    const moved = { ...pizza, reminder: { offsetDays: 0, at: '17:45' } };
    expect(shown({ entries: [moved], acknowledged })).toHaveLength(1);
  });

  it('a reminder of an entry marked "Nicht gemacht" or without a day stays away', () => {
    expect(shown({ entries: [{ ...pizza, notDone: true }] })).toEqual([]);
    expect(shown({ entries: [{ ...pizza, date: null }] })).toEqual([]);
  });
});

describe('dueNotices — chores with a time (REQ-002)', () => {
  it('AC-008: from the time on, for whoever is up', () => {
    expect(shown({ chores: [muell], now: '19:00' })).toEqual([
      'Müll rausbringen | 19:00 · du bist dran',
    ]);
    expect(shown({ chores: [muell], now: '19:00', me: nadja.id })).toEqual([]);
    expect(shown({ chores: [muell], now: '18:55' })).toEqual([]);
  });

  it('AC-008: "Erinnern" off, no time, another day or "bei Bedarf": none', () => {
    expect(shown({ chores: [{ ...muell, remindAtDueTime: false }], now: '20:00' })).toEqual([]);
    expect(shown({ chores: [{ ...muell, dueTime: undefined }], now: '20:00' })).toEqual([]);
    expect(shown({ chores: [{ ...muell, nextDueOn: tomorrow }], now: '20:00' })).toEqual([]);
    expect(shown({ chores: [{ ...muell, nextDueOn: '2026-11-19' }], now: '20:00' })).toEqual([]);
    expect(
      shown({ chores: [{ ...muell, recurrence: { type: 'asNeeded' } }], now: '20:00' }),
    ).toEqual([]);
  });

  it('AC-008: "egal wer" and "zu zweit" remind everyone, without "du bist dran"', () => {
    const anyone = { ...muell, assignment: { type: 'anyone' as const } };
    expect(shown({ chores: [anyone], now: '19:00', me: nadja.id })).toEqual([
      'Müll rausbringen | 19:00',
    ]);
    const together = { ...muell, assignment: { type: 'together' as const } };
    expect(shown({ chores: [together], now: '19:00', me: nadja.id })).toHaveLength(1);
  });

  it('AC-017: the target is the chore', () => {
    const [notice] = dueNotices(input({ chores: [muell], now: '19:00' }));
    expect(notice?.target).toEqual({ screen: 'chore', choreId: 'c-muell' });
    expect(notice?.key).toBe(`chore:c-muell:${today}`);
  });
});

describe('dueNotices — Vorlauf and cooking (REQ-002)', () => {
  const hummusMorgen = entry({
    id: 'e-hummus',
    date: tomorrow,
    slotId: 'slot-mittag',
    recipeId: hummus.id,
    cookId: enrico.id,
  });

  it('AC-009: the Vorlauf of today for who cooks', () => {
    expect(shown({ entries: [hummusMorgen], now: '08:00' })).toEqual([
      'Kichererbsen einweichen | Heute bis ca. 23 Uhr · Hummus (morgen Mittag)',
    ]);
    expect(shown({ entries: [hummusMorgen], now: '08:00', me: nadja.id })).toEqual([]);
  });

  it('AC-009: without a cook, for who eats along (everyone when nobody is named)', () => {
    const noCook = { ...hummusMorgen, cookId: undefined };
    expect(shown({ entries: [noCook], me: nadja.id, now: '08:00' })).toHaveLength(1);
    expect(
      shown({ entries: [{ ...noCook, eaterIds: [enrico.id] }], me: nadja.id, now: '08:00' }),
    ).toEqual([]);
  });

  it('AC-010: "Du kochst" for a recipe today with me as the cook', () => {
    const heute = entry({ id: 'e-lasagne', recipeId: lasagne.id, cookId: enrico.id });
    expect(shown({ entries: [heute], now: '07:00' })).toEqual(['Lasagne | Du kochst · heute Abend']);
    expect(shown({ entries: [heute], me: nadja.id })).toEqual([]);
    expect(shown({ entries: [{ ...heute, notDone: true }] })).toEqual([]);
    expect(shown({ entries: [{ ...heute, date: tomorrow }] })).toEqual([]);
  });
});

describe('dueNotices — activities (REQ-002)', () => {
  const eisMorgen = entry({
    id: 'e-eis',
    date: tomorrow,
    slotId: 'slot-vormittag',
    kind: 'activity',
    activityId: eislaufen.id,
  });

  it('AC-011: from 19:00 the day before, for everyone, until the end of its day', () => {
    expect(shown({ entries: [eisMorgen], now: '19:00' })).toEqual(['Eislaufen | morgen Vormittag']);
    expect(shown({ entries: [eisMorgen], now: '19:00', me: nadja.id })).toHaveLength(1);
    expect(shown({ entries: [eisMorgen], now: '18:55' })).toEqual([]);
    expect(shown({ entries: [eisMorgen], today: tomorrow, now: '22:00' })).toEqual([
      'Eislaufen | heute Vormittag',
    ]);
  });

  it('AC-011: a Termin of a series opens its day, without an entry window', () => {
    const termin = { ...eisMorgen, id: 's-eis:2026-11-21', series: { seriesId: 's-eis', on: tomorrow } };
    const [notice] = dueNotices(input({ entries: [termin], now: '20:00' }));
    expect(notice?.target).toEqual({ screen: 'calendar', day: tomorrow });
    expect(notice && isNoticeKey(notice.key)).toBe(true);
  });
});

describe('dueNotices — absence and order', () => {
  const eisMorgen = entry({
    id: 'e-eis',
    date: tomorrow,
    slotId: 'slot-vormittag',
    kind: 'activity',
    activityId: eislaufen.id,
  });
  const pizzaMorgen = { ...pizza, date: tomorrow, reminder: { offsetDays: 1, at: '17:30' } };

  it('AC-012: on a trip today: no notices at all', () => {
    const trips = [trip('t-1', [enrico.id], today, '2026-11-22')];
    expect(
      shown({ entries: [pizza, eisMorgen], chores: [muell], now: '20:00', away: { members: [enrico, nadja], trips } }),
    ).toEqual([]);
  });

  it('AC-012: away only tomorrow: the activity and the reminder of tomorrow are missing', () => {
    const trips = [trip('t-1', [enrico.id], tomorrow, '2026-11-22')];
    const away = { members: [enrico, nadja], trips };
    expect(shown({ entries: [pizzaMorgen, eisMorgen], now: '20:00', away })).toEqual([]);
    expect(shown({ entries: [pizzaMorgen, eisMorgen], now: '20:00', away, me: nadja.id })).toHaveLength(2);
  });

  it('REQ-004: newest first, acknowledged ones left out', () => {
    const notices = dueNotices(input({ entries: [pizza, eisMorgen], chores: [muell], now: '20:00' }));
    expect(notices.map((notice) => notice.kind)).toEqual(['activity', 'chore', 'entryReminder']);
    const acknowledged = [notices[1]?.key ?? ''];
    expect(
      dueNotices(input({ entries: [pizza, eisMorgen], chores: [muell], now: '20:00', acknowledged })).map(
        (notice) => notice.kind,
      ),
    ).toEqual(['activity', 'entryReminder']);
  });
});

describe('noticeBadge (REQ-003)', () => {
  it('AC-014: the count and the name for the screen reader', () => {
    expect(noticeBadge(3)).toEqual({ count: '3', label: 'Mitteilungen, 3 offen' });
    expect(noticeBadge(1)).toEqual({ count: '1', label: 'Mitteilungen, 1 offen' });
  });

  it('AC-015: no circle at 0, "9+" above nine', () => {
    expect(noticeBadge(0)).toEqual({ count: undefined, label: 'Mitteilungen' });
    expect(noticeBadge(12)).toEqual({ count: '9+', label: 'Mitteilungen, 12 offen' });
  });
});

describe('notice keys and acknowledgements (REQ-005)', () => {
  it('AC-024: only keys of the form <kind>:<id>[:<more>]:<day>, at most 200 characters', () => {
    expect(isNoticeKey(`chore:c-muell:${today}`)).toBe(true);
    expect(isNoticeKey(`entry:e-pizza:0-1730:${today}`)).toBe(true);
    expect(isNoticeKey('x')).toBe(false);
    expect(isNoticeKey(`chore:c-muell:2026-13-45`)).toBe(false);
    expect(isNoticeKey(`chore:${'a'.repeat(50)}:${'b'.repeat(50)}:${'c'.repeat(50)}:${'d'.repeat(50)}:${today}`)).toBe(false);
  });

  it('AC-023: unites, drops what is older than 14 days, keeps each key once', () => {
    const before = ['cook:old:2026-11-05', 'cook:edge:2026-11-06', `chore:c-muell:${today}`];
    expect(acknowledgedAfter(before, [`chore:c-muell:${today}`, `cook:new:${today}`], today)).toEqual([
      `chore:c-muell:${today}`,
      `cook:new:${today}`,
      'cook:edge:2026-11-06',
    ]);
  });

  it('Decision 7: keeps the newest 400', () => {
    const full = Array.from({ length: 400 }, (_, index) => `cook:k${index}:2026-11-19`);
    const after = acknowledgedAfter([...full, 'cook:oldest:2026-11-18'], [`cook:today:${today}`], today);
    expect(after).toHaveLength(400);
    expect(after[0]).toBe(`cook:today:${today}`);
    expect(after).not.toContain('cook:oldest:2026-11-18');
  });
});
