import { describe, expect, it } from 'vitest';

import { householdItemTitle, householdRow, type HouseholdRowItem } from './household-row';
import { enrico, nadja } from './test-fixtures';
import type { Chore, ChoreEvent } from './types';

describe('householdItemTitle (review 0004, D-09)', () => {
  const item = (approximate: boolean): HouseholdRowItem => ({
    key: 'k',
    title: 'Pflanzen gießen',
    memberIds: [],
    status: 'planned',
    approximate,
  });

  it('a flexible chore says "ungefähr" after a dot, so it never reads like cut-off text', () => {
    expect(householdItemTitle(item(true))).toBe('Pflanzen gießen · ungefähr');
  });

  it('a fixed date keeps its title', () => {
    expect(householdItemTitle(item(false))).toBe('Pflanzen gießen');
  });
});

// Friday, 20 November 2026; KW 47 runs from 16 to 22 November, KW 48 from 23 to 29.
const today = '2026-11-20';
const members = [enrico, nadja];

function chore(partial: Partial<Chore> & Pick<Chore, 'id' | 'title'>): Chore {
  return {
    recurrence: { type: 'once' },
    assignment: { type: 'anyone' },
    effort: 1,
    ...partial,
  };
}

const blumen = chore({
  id: 'blumen',
  title: 'Blumen gießen',
  recurrence: { type: 'weekly', every: 1, weekdays: [3] },
  assignment: { type: 'fixed', memberId: enrico.id },
  nextDueOn: '2026-11-18',
  nextAssigneeId: enrico.id,
});
const fenster = chore({
  id: 'fenster',
  title: 'Fenster Küche',
  assignment: { type: 'fixed', memberId: nadja.id },
  nextDueOn: today,
  nextAssigneeId: nadja.id,
});
const muell = chore({
  id: 'muell',
  title: 'Müll rausbringen',
  recurrence: { type: 'weekly', every: 1, weekdays: [7] },
  assignment: { type: 'rotating', memberIds: [enrico.id, nadja.id] },
  nextDueOn: '2026-11-22',
  nextAssigneeId: enrico.id,
});
const bettwaesche = chore({
  id: 'bett',
  title: 'Bettwäsche wechseln',
  recurrence: { type: 'flexible', everyDays: 14 },
  assignment: { type: 'fixed', memberId: nadja.id },
  lastDoneOn: '2026-11-12',
  nextAssigneeId: nadja.id,
});
const badDone: ChoreEvent = {
  id: 'ev-bad',
  choreId: 'bad',
  title: 'Bad putzen',
  kind: 'done',
  doneOn: '2026-11-16',
  doneBy: nadja.id,
};

const chores = [blumen, fenster, muell, bettwaesche];
const short = (items: HouseholdRowItem[] | undefined) =>
  (items ?? []).map(
    (item) =>
      `${item.status === 'done' ? '✓' : '○'} ${item.title}${item.approximate ? ', etwa' : ''} (${item.memberIds.join(',')})`,
  );

describe('AC-017: the household row of KW 47 and KW 48', () => {
  const week47 = householdRow({
    chores,
    events: [badDone],
    members,
    trips: [],
    from: '2026-11-16',
    to: '2026-11-22',
    today,
  });

  it('shows what was done on past days', () => {
    expect(short(week47['2026-11-16'])).toEqual([`✓ Bad putzen (${nadja.id})`]);
  });

  it('shows overdue chores only today, not on their original day', () => {
    expect(week47['2026-11-18'] ?? []).toEqual([]);
    expect(short(week47[today])).toEqual([
      `○ Blumen gießen (${enrico.id})`,
      `○ Fenster Küche (${nadja.id})`,
    ]);
    expect(week47[today]?.every((item) => item.status === 'open')).toBe(true);
  });

  it('shows the fixed rhythm with the person whose turn it is', () => {
    expect(short(week47['2026-11-22'])).toEqual([`○ Müll rausbringen (${enrico.id})`]);
    expect(week47['2026-11-22']?.[0]?.status).toBe('planned');
  });

  const week48 = householdRow({
    chores,
    events: [badDone],
    members,
    trips: [],
    from: '2026-11-23',
    to: '2026-11-29',
    today,
  });

  it('shows flexible chores approximately and alternates the rotation', () => {
    expect(short(week48['2026-11-26'])).toEqual([`○ Bettwäsche wechseln, etwa (${nadja.id})`]);
    expect(short(week48['2026-11-29'])).toEqual([`○ Müll rausbringen (${nadja.id})`]);
  });

  it('continues an overdue rhythm as if it were done today (OFFEN in plan.md)', () => {
    expect(short(week48['2026-11-25'])).toEqual([`○ Blumen gießen (${enrico.id})`]);
  });
});

describe('householdRow rules', () => {
  it('AC-018: a chore done today stands at the end of the day with ✓', () => {
    const row = householdRow({
      chores: [fenster],
      events: [{ ...badDone, id: 'ev', title: 'Blumen gießen', doneOn: today, doneBy: enrico.id }],
      members,
      trips: [],
      from: today,
      to: today,
      today,
    });
    expect(short(row[today])).toEqual([
      `○ Fenster Küche (${nadja.id})`,
      `✓ Blumen gießen (${enrico.id})`,
    ]);
  });

  it('spec 0035 AC-001: a done item names its entry, so it can be taken back', () => {
    const row = householdRow({
      chores: [fenster],
      events: [{ ...badDone, id: 'ev', doneOn: today }],
      members,
      trips: [],
      from: today,
      to: today,
      today,
    });
    expect(row[today]?.map((item) => item.eventId)).toEqual([undefined, 'ev']);
  });

  it('leaves out skipped events and chores without a date until they are done', () => {
    const row = householdRow({
      chores: [chore({ id: 'x', title: 'Keller' })],
      events: [{ ...badDone, kind: 'skipped' }],
      members,
      trips: [],
      from: '2026-11-16',
      to: '2026-11-29',
      today,
    });
    expect(Object.values(row).flat()).toEqual([]);
  });

  it('a flexible chore that is due today stands today and then every interval', () => {
    const row = householdRow({
      chores: [{ ...bettwaesche, lastDoneOn: '2026-11-01' }],
      events: [],
      members,
      trips: [],
      from: today,
      to: '2026-12-10',
      today,
    });
    expect(row[today]?.[0]?.status).toBe('open');
    expect(row['2026-12-04']?.[0]?.approximate).toBe(true);
  });

  it('skips months in which a chore rests', () => {
    const row = householdRow({
      chores: [{ ...muell, activeMonths: [11] }],
      events: [],
      members,
      trips: [],
      from: '2026-11-23',
      to: '2026-12-13',
      today,
    });
    expect(row['2026-11-29']).toHaveLength(1);
    expect(row['2026-12-06'] ?? []).toEqual([]);
  });

  it('"zu zweit" shows both people, "egal wer" nobody', () => {
    const row = householdRow({
      chores: [
        chore({ id: 't', title: 'Fenster', assignment: { type: 'together' }, nextDueOn: today }),
        chore({ id: 'a', title: 'Einkauf', nextDueOn: today }),
      ],
      events: [],
      members,
      trips: [],
      from: today,
      to: today,
      today,
    });
    expect(row[today]?.map((item) => item.memberIds)).toEqual([[enrico.id, nadja.id], []]);
  });
});

describe('AC-043: "bei Bedarf" in the household row', () => {
  const kitchenWindow = chore({
    id: 'fk',
    title: 'Fenster Küche',
    recurrence: { type: 'asNeeded' },
    assignment: { type: 'fixed', memberId: nadja.id },
    // A stray date (the database forbids it) must not make it due or planned either.
    nextDueOn: today,
    nextAssigneeId: nadja.id,
  });

  it('AC-043: never stands as due or planned, only as done on the day it was done', () => {
    const done: ChoreEvent = { ...badDone, id: 'ev-fk', choreId: 'fk', title: 'Fenster Küche' };
    const row = householdRow({
      chores: [kitchenWindow],
      events: [done],
      members,
      trips: [],
      from: '2026-11-16',
      to: '2026-12-31',
      today,
    });
    expect(Object.keys(row)).toEqual(['2026-11-16']);
    expect(short(row['2026-11-16'])).toEqual([`✓ Fenster Küche (${nadja.id})`]);
  });
});

describe('spec 0013: the time of a chore in the household row', () => {
  const timed = { ...muell, dueTime: '19:00' };

  it('AC-022: "Müll rausbringen · 19:00" on its due day and on the computed days after', () => {
    const row = householdRow({
      chores: [timed],
      events: [],
      members,
      trips: [],
      from: '2026-11-16',
      to: '2026-11-29',
      today: '2026-11-22',
    });
    expect(row['2026-11-22']?.map((item) => item.title)).toEqual(['Müll rausbringen · 19:00']);
    expect(row['2026-11-29']?.map((item) => item.title)).toEqual(['Müll rausbringen · 19:00']);
  });

  it('AC-025: without a time, and in what was done, the title stays as it is', () => {
    const done: ChoreEvent = {
      ...badDone,
      id: 'ev-m',
      choreId: 'muell',
      title: 'Müll rausbringen',
    };
    const row = householdRow({
      chores: [muell, { ...timed, id: 'muell-2' }],
      events: [{ ...done, doneOn: '2026-11-16' }],
      members,
      trips: [],
      from: '2026-11-16',
      to: '2026-11-22',
      today,
    });
    expect(row['2026-11-16']?.map((item) => item.title)).toEqual(['Müll rausbringen']);
    expect(row['2026-11-22']?.map((item) => item.title)).toEqual([
      'Müll rausbringen',
      'Müll rausbringen · 19:00',
    ]);
  });
});
