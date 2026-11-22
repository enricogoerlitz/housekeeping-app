import { describe, expect, it } from 'vitest';

import {
  canDoChoreOn,
  choreBucket,
  choreDayLabel,
  choreDueLabel,
  choreDueOn,
  choreDueState,
  choreMemberIds,
  choreNextDate,
  choreTurn,
  choreTurnLabel,
  choreTurnText,
  dueChores,
  duePoints,
  firstFreeDay,
  flexibleProgress,
  householdAwayNotice,
  householdAwayOn,
  MAX_WAIT_DAYS,
  pointsLabel,
  postponedNotice,
  postponeOptions,
  type ChoreAway,
} from './chore-schedule';
import { completionOutcome, nextAssignee } from './chores';
import { addDays } from './dates';
import { householdRow, type HouseholdRowItem } from './household-row';
import { choresOfDay } from './overview';
import { enrico, nadja, trip, vera } from './test-fixtures';
import type { Chore, ISODate } from './types';

// Spec 0026. Today is Sunday 22 November 2026; household "Enrico & Nadja" (E, N in this order).
// "Urlaub Mallorca" Fri 4.12.–Thu 10.12.2026 for both, "Dienstreise Hamburg" Fri 18.12.–Sat
// 19.12.2026 only Enrico. The same fixtures and names are in notification_parity.test.sql.
const today = '2026-11-22';
const members = [enrico, nadja];
const mallorca = trip(
  'mallorca',
  [enrico.id, nadja.id],
  '2026-12-04',
  '2026-12-10',
  'Urlaub Mallorca',
);
const hamburg = trip('hamburg', [enrico.id], '2026-12-18', '2026-12-19', 'Dienstreise Hamburg');
const home: ChoreAway = { members, trips: [] };
const trips: ChoreAway = { members, trips: [mallorca, hamburg] };

function chore(partial: Partial<Chore> & Pick<Chore, 'id' | 'title'>): Chore {
  return {
    recurrence: { type: 'weekly', every: 1, weekdays: [5] },
    assignment: { type: 'anyone' },
    effort: 1,
    ...partial,
  };
}

const fixed = (id: string) => ({ type: 'fixed' as const, memberId: id });
const ids = (list: Chore[]) => list.map((item) => item.title);

// The chores of AC-033 to AC-045.
const badNadja = chore({
  id: 'bad',
  title: 'Bad putzen',
  assignment: fixed(nadja.id),
  nextAssigneeId: nadja.id,
  nextDueOn: '2026-12-04',
  effort: 2,
});
const fensterWohnzimmer = chore({
  id: 'fenster',
  title: 'Fenster Wohnzimmer',
  recurrence: { type: 'everyMonths', every: 2 },
  assignment: fixed(enrico.id),
  nextAssigneeId: enrico.id,
  nextDueOn: '2026-12-07',
  effort: 2,
});
const staubsaugen = chore({
  id: 'staub',
  title: 'Staubsaugen',
  recurrence: { type: 'weekly', every: 1, weekdays: [1, 4] },
  nextDueOn: '2026-12-07',
});
const muell = chore({
  id: 'muell',
  title: 'Müll rausbringen',
  recurrence: { type: 'weekly', every: 1, weekdays: [6] },
  assignment: fixed(enrico.id),
  nextAssigneeId: enrico.id,
  nextDueOn: '2026-12-19',
  dueTime: '19:00',
});
const fensterPutzen = chore({
  id: 'fp',
  title: 'Fenster putzen',
  recurrence: { type: 'monthly', day: 19 },
  assignment: { type: 'together' },
  nextDueOn: '2026-12-19',
});
const blumen = chore({ id: 'blumen', title: 'Blumen gießen', nextDueOn: '2026-12-18' });
const keller = chore({
  id: 'keller',
  title: 'Keller aufräumen',
  recurrence: { type: 'once', date: '2026-11-30' },
  assignment: fixed(enrico.id),
  nextAssigneeId: enrico.id,
  nextDueOn: '2026-11-30',
});
const pflanzen = chore({
  id: 'pflanzen',
  title: 'Pflanzen gießen',
  recurrence: { type: 'flexible', everyDays: 3 },
  lastDoneOn: '2026-12-03',
  nextDueOn: '2026-12-06',
});
const paket = chore({
  id: 'paket',
  title: 'Paket abholen',
  recurrence: { type: 'once', date: '2026-12-05' },
  nextDueOn: '2026-12-05',
});
const badRotating = chore({
  id: 'bad-r',
  title: 'Bad putzen',
  assignment: { type: 'rotating', memberIds: [enrico.id, nadja.id] },
  nextAssigneeId: enrico.id,
  nextDueOn: '2026-12-18',
});

const short = (items: HouseholdRowItem[] | undefined) =>
  (items ?? []).map(
    (item) =>
      `${item.status === 'done' ? '✓' : '○'} ${item.title}${item.approximate ? ', etwa' : ''}${
        item.memberIds.length > 0
          ? ` (${item.memberIds.map((id) => id.slice(2, 3).toUpperCase()).join(',')})`
          : ''
      }`,
  );

describe('REQ-009: one wording for what is due', () => {
  const window = chore({ id: 'fw', title: 'Fenster Wohnzimmer', nextDueOn: '2026-11-21' });
  const trash = chore({ id: 'm', title: 'Müll rausbringen', nextDueOn: '2026-11-19' });
  const bath = chore({ id: 'b', title: 'Bad putzen', nextDueOn: today, effort: 2 });

  it('AC-027: "fällig seit gestern", "fällig seit 3 Tagen", "heute"; the first two are "Noch offen"', () => {
    expect([window, trash, bath].map((item) => choreDueLabel(item, today, home))).toEqual([
      'fällig seit gestern',
      'fällig seit 3 Tagen',
      'heute',
    ]);
    expect([window, trash, bath].map((item) => choreBucket(item, today, home))).toEqual([
      'overdue',
      'overdue',
      'today',
    ]);
    expect(ids(dueChores([bath, trash, window], today, home))).toEqual([
      'Fenster Wohnzimmer',
      'Müll rausbringen',
      'Bad putzen',
    ]);
  });

  it('AC-028: Fri 20.11. not done: Sat "fällig seit gestern", Sun "fällig seit 2 Tagen", in the row only today', () => {
    const friday = { ...bath, nextDueOn: '2026-11-20' };
    expect(choreDueLabel(friday, '2026-11-21', home)).toBe('fällig seit gestern');
    expect(choreDueLabel(friday, today, home)).toBe('fällig seit 2 Tagen');
    expect(choreBucket(friday, today, home)).toBe('overdue');
    const row = householdRow({
      chores: [friday],
      events: [],
      members,
      trips: [],
      from: '2026-11-20',
      to: today,
      today,
    });
    expect(row['2026-11-20']).toBeUndefined();
    expect(short(row[today])).toEqual(['○ Bad putzen']);
  });

  it('AC-030: flexible "jetzt fällig" from the date, "bald fällig" from 80 %, never "fällig seit"', () => {
    const plants = chore({
      id: 'p',
      title: 'Pflanzen gießen',
      recurrence: { type: 'flexible', everyDays: 10 },
      lastDoneOn: '2026-11-10',
      nextDueOn: '2026-11-20',
    });
    const sheets = chore({
      id: 's',
      title: 'Bettwäsche',
      recurrence: { type: 'flexible', everyDays: 10 },
      lastDoneOn: '2026-11-14',
      nextDueOn: '2026-11-24',
    });
    expect(choreDueLabel(plants, today, home)).toBe('jetzt fällig');
    expect(choreDueLabel(sheets, today, home)).toBe('bald fällig');
  });
});

describe('REQ-010: the same points for today', () => {
  const window = chore({
    id: 'fw',
    title: 'Fenster Wohnzimmer',
    nextDueOn: '2026-11-21',
    effort: 2,
  });
  const trash = chore({ id: 'm', title: 'Müll rausbringen', nextDueOn: '2026-11-19' });
  const bath = chore({ id: 'b', title: 'Bad putzen', nextDueOn: today, effort: 2 });

  it('AC-031: "Bad putzen" (2), "Fenster Wohnzimmer" (2), "Müll rausbringen" (1): "ca. 5 Punkte"', () => {
    expect(pointsLabel(duePoints([bath, window, trash], today, home))).toBe('ca. 5 Punkte');
  });

  it('AC-032: only "Müll rausbringen": "ca. 1 Punkt"; once booked no points at all', () => {
    expect(pointsLabel(duePoints([trash], today, home))).toBe('ca. 1 Punkt');
    const done = completionOutcome(trash, { kind: 'done', doneOn: today, doneBy: enrico.id });
    expect(
      pointsLabel(duePoints([{ ...trash, nextDueOn: done.nextDueOn }], today, home)),
    ).toBeUndefined();
  });

  it('AC-049: no points during a trip of the whole household', () => {
    expect(duePoints([bath, window, trash], '2026-12-05', trips)).toBe(0);
  });
});

describe('REQ-011: a date waits for the first free day', () => {
  it('AC-033: on Thu 3.12. both "nach der Reise am Fr 11.12."', () => {
    expect(choreDueLabel(badNadja, '2026-12-03', trips)).toBe('nach der Reise am Fr 11.12.');
    expect(choreDueLabel(fensterWohnzimmer, '2026-12-03', trips)).toBe(
      'nach der Reise am Fr 11.12.',
    );
    expect(choreNextDate(badNadja, '2026-12-03', trips)).toEqual({
      date: '2026-12-11',
      afterTrip: true,
    });
  });

  it('AC-033: Sat 5.12. nothing under "Zu tun" or "Noch offen"', () => {
    const all = [badNadja, fensterWohnzimmer, staubsaugen, keller, pflanzen, paket];
    expect(dueChores(all, '2026-12-05', trips)).toEqual([]);
    expect(all.map((item) => choreBucket(item, '2026-12-05', trips))).not.toContain('overdue');
  });

  it('AC-033: Fri 11.12. "Bad putzen", then "Fenster Wohnzimmer", each "heute, nach der Reise"; Sat "fällig seit gestern"', () => {
    expect(ids(dueChores([fensterWohnzimmer, badNadja], '2026-12-11', trips))).toEqual([
      'Bad putzen',
      'Fenster Wohnzimmer',
    ]);
    expect(choreDueLabel(badNadja, '2026-12-11', trips)).toBe('heute, nach der Reise');
    expect(choreDueLabel(fensterWohnzimmer, '2026-12-11', trips)).toBe('heute, nach der Reise');
    expect(choreDueLabel(badNadja, '2026-12-12', trips)).toBe('fällig seit gestern');
  });

  it('AC-034: "Staubsaugen" (Mon, Thu) shows once on Fri 11.12.; checked off next Mon 14.12.', () => {
    const row = householdRow({
      chores: [staubsaugen],
      events: [],
      members,
      trips: [mallorca],
      from: '2026-12-04',
      to: '2026-12-13',
      today,
    });
    expect(Object.keys(row)).toEqual(['2026-12-11']);
    expect(ids(dueChores([staubsaugen], '2026-12-11', trips))).toEqual(['Staubsaugen']);
    const done = completionOutcome(staubsaugen, {
      kind: 'done',
      doneOn: '2026-12-11',
      doneBy: nadja.id,
    });
    expect(done.nextDueOn).toBe('2026-12-14');
  });

  it('AC-035: Hamburg moves the fixed and the together chore to Sun 20.12., not the one for anyone', () => {
    expect(choreDueLabel(muell, '2026-12-17', trips)).toBe('nach der Reise am So 20.12.');
    expect(choreDueLabel(fensterPutzen, '2026-12-17', trips)).toBe('nach der Reise am So 20.12.');
    expect(ids(dueChores([muell, fensterPutzen, blumen], '2026-12-18', trips))).toEqual([
      'Blumen gießen',
    ]);
    expect(choreDueLabel(blumen, '2026-12-18', trips)).toBe('heute');
  });

  it('AC-036: open since Mon 30.11.: hidden on Sat 5.12., "fällig seit 11 Tagen" on Fri 11.12.', () => {
    expect(dueChores([keller], '2026-12-05', trips)).toEqual([]);
    expect(choreDueLabel(keller, '2026-12-05', trips)).toBe('nach der Reise am Fr 11.12.');
    expect(choreDueLabel(keller, '2026-12-11', trips)).toBe('fällig seit 11 Tagen');
    expect(choreDueOn(keller, trips)).toBe('2026-11-30');
  });

  it('AC-037: the flexible clock runs on: hidden 6.–10.12., "jetzt fällig" with a full bar on 11.12.', () => {
    for (let day = '2026-12-06'; day <= '2026-12-10'; day = addDays(day, 1)) {
      expect(dueChores([pflanzen], day, trips)).toEqual([]);
    }
    expect(ids(dueChores([pflanzen], '2026-12-11', trips))).toEqual(['Pflanzen gießen']);
    expect(flexibleProgress(pflanzen, '2026-12-11')).toBeGreaterThanOrEqual(1);
    expect(choreDueLabel(pflanzen, '2026-12-11', trips)).toBe('jetzt fällig');
    const row = householdRow({
      chores: [pflanzen],
      events: [],
      members,
      trips: [mallorca],
      from: '2026-12-04',
      to: '2026-12-13',
      today: '2026-12-03',
    });
    expect(short(row['2026-12-11'])).toEqual(['○ Pflanzen gießen, etwa']);
    expect(row['2026-12-06']).toBeUndefined();
  });

  it('AC-038: a one-off date moves, a one-off chore without a date stays under "Ohne Termin"', () => {
    const bulb = chore({ id: 'g', title: 'Glühbirne Flur tauschen', recurrence: { type: 'once' } });
    expect(choreDueLabel(paket, today, trips)).toBe('nach der Reise am Fr 11.12.');
    expect(choreBucket(bulb, today, trips)).toBe('noDate');
    expect(choreDueLabel(bulb, today, trips)).toBeUndefined();
  });

  it('AC-039: on Fri 4.12. not due; done by Nadja anyway it is next due Fri 11.12. with plain "heute"', () => {
    expect(dueChores([badNadja], '2026-12-04', trips)).toEqual([]);
    const done = completionOutcome(badNadja, {
      kind: 'done',
      doneOn: '2026-12-04',
      doneBy: nadja.id,
    });
    expect(done.nextDueOn).toBe('2026-12-11');
    expect(choreDueLabel({ ...badNadja, nextDueOn: done.nextDueOn }, '2026-12-11', trips)).toBe(
      'heute',
    );
  });

  it('AC-040: a longer trip moves it to Sun 13.12., without the trip it is Fri 4.12. again; nothing stored', () => {
    const longer = trip('mallorca', [enrico.id, nadja.id], '2026-12-04', '2026-12-12');
    expect(choreDueLabel(badNadja, '2026-12-03', { members, trips: [longer] })).toBe(
      'nach der Reise am So 13.12.',
    );
    expect(choreNextDate(badNadja, '2026-12-03', home)).toEqual({
      date: '2026-12-04',
      afterTrip: false,
    });
    expect(badNadja.nextDueOn).toBe('2026-12-04');
  });

  it('AC-041: overlapping trips count together; two single trips act like one of the household', () => {
    const messe = trip('messe', [enrico.id], '2026-12-01', '2026-12-05', 'Messe');
    const withMesse: ChoreAway = { members, trips: [mallorca, hamburg, messe] };
    const kellerWed = { ...keller, nextDueOn: '2026-12-02' };
    const blumenWed = { ...blumen, nextDueOn: '2026-12-02' };
    expect(choreDueLabel(kellerWed, '2026-12-01', withMesse)).toBe('nach der Reise am Fr 11.12.');
    expect(ids(dueChores([kellerWed, blumenWed], '2026-12-02', withMesse))).toEqual([
      'Blumen gießen',
    ]);
    const single: ChoreAway = {
      members,
      trips: [
        trip('e', [enrico.id], '2026-12-04', '2026-12-10'),
        trip('n', [nadja.id], '2026-12-04', '2026-12-10'),
      ],
    };
    expect(householdAwayOn('2026-12-05', single)).toBe(true);
    expect(choreDueLabel(blumen, '2026-12-03', single)).toBeUndefined();
    expect(firstFreeDay(staubsaugen, '2026-12-07', single)).toBe('2026-12-11');
  });

  it('AC-042: the season counts for the new day: Mon 4.10.2027 not due but "pausiert"', () => {
    const lawn = chore({
      id: 'rasen',
      title: 'Rasen mähen',
      recurrence: { type: 'weekly', every: 1, weekdays: [6] },
      nextDueOn: '2027-09-25',
      activeMonths: [4, 5, 6, 7, 8, 9],
    });
    const away: ChoreAway = {
      members,
      trips: [trip('herbst', [enrico.id, nadja.id], '2027-09-25', '2027-10-03')],
    };
    expect(dueChores([lawn], '2027-10-04', away)).toEqual([]);
    expect(choreBucket(lawn, '2027-10-04', away)).toBe('paused');
    const row = householdRow({
      chores: [lawn],
      events: [],
      members,
      trips: away.trips as (typeof mallorca)[],
      from: '2027-09-20',
      to: '2027-10-10',
      today: '2027-09-20',
    });
    expect(row).toEqual({});
  });

  it('AC-043: "Später" onto a day of the trip says when it really is due', () => {
    const trash = chore({ id: 'm', title: 'Müll rausbringen', nextDueOn: today });
    expect(postponedNotice(trash, '2026-12-05', today, trips)).toBe(
      'Verschoben auf Sa 5.12. – wegen der Reise erst Fr 11.12.',
    );
    expect(postponedNotice(trash, '2026-11-24', today, trips)).toBe('Verschoben auf Di 24.11.');
  });

  it('AC-044: only the household\'s own trips count (a trip of "WG Berlin" is not passed in)', () => {
    const own: ChoreAway = { members, trips: [] };
    expect(ids(dueChores([{ ...muell, nextDueOn: '2026-12-05' }], '2026-12-05', own))).toEqual([
      'Müll rausbringen',
    ]);
  });

  it('a trip of more than 400 days does not loop: the search stops after MAX_WAIT_DAYS', () => {
    const long: ChoreAway = {
      members,
      trips: [trip('lang', [enrico.id, nadja.id], '2026-12-01', '2028-06-30')],
    };
    expect(firstFreeDay(blumen, '2026-12-01', long)).toBe(addDays('2026-12-01', MAX_WAIT_DAYS));
    expect(dueChores([blumen], '2027-01-01', long)).toEqual([]);
  });

  it('nobody to wait for counts as free (empty household or rotation)', () => {
    const empty = chore({ id: 'x', title: 'X', assignment: { type: 'rotating', memberIds: [] } });
    expect(canDoChoreOn(empty, '2026-12-05', trips)).toBe(true);
    expect(canDoChoreOn(blumen, '2026-12-05', { members: [], trips: [mallorca] })).toBe(true);
  });
});

describe('REQ-012: "Abwechselnd" skips whoever is away', () => {
  it('AC-045: on Wed 16.12. Nadja stands in for Enrico; after her it is Enrico again from Fri 25.12.', () => {
    expect(choreMemberIds(badRotating, '2026-12-16', trips)).toEqual([nadja.id]);
    expect(choreTurnLabel(badRotating, '2026-12-16', trips)).toBe('dran: Nadja');
    expect(choreTurnText(badRotating, '2026-12-16', trips)).toBe(
      'dran: Nadja (für Enrico, unterwegs)',
    );
    expect(choreTurn(badRotating, '2026-12-16', trips)).toEqual({
      regularId: enrico.id,
      actingId: nadja.id,
    });
    const done = completionOutcome(badRotating, {
      kind: 'done',
      doneOn: '2026-12-18',
      doneBy: nadja.id,
    });
    expect(done).toMatchObject({ nextDueOn: '2026-12-25', nextAssigneeId: enrico.id });
  });

  it('AC-046: "WG Berlin": Nadja for Enrico, then Vera, then Enrico; with both away Vera', () => {
    const wg = [enrico, nadja, vera];
    const rotation = chore({
      id: 'wg',
      title: 'Bad putzen',
      assignment: { type: 'rotating', memberIds: [enrico.id, nadja.id, vera.id] },
      nextAssigneeId: enrico.id,
      nextDueOn: '2026-12-18',
    });
    const onlyE: ChoreAway = { members: wg, trips: [hamburg] };
    expect(choreMemberIds(rotation, '2026-12-16', onlyE)).toEqual([nadja.id]);
    expect(nextAssignee(rotation, nadja.id)).toBe(vera.id);
    expect(nextAssignee({ ...rotation, nextAssigneeId: vera.id }, vera.id)).toBe(enrico.id);
    const both: ChoreAway = {
      members: wg,
      trips: [trip('both', [enrico.id, nadja.id], '2026-12-18', '2026-12-19')],
    };
    expect(choreMemberIds(rotation, '2026-12-16', both)).toEqual([vera.id]);
  });

  it('AC-047: Enrico checks it off in Hamburg himself: the entry is his, then Nadja', () => {
    const done = completionOutcome(badRotating, {
      kind: 'done',
      doneOn: '2026-12-18',
      doneBy: enrico.id,
    });
    expect(done.nextAssigneeId).toBe(nadja.id);
  });

  it('AC-048: KW 51 shows "○ Bad putzen (N)" on Fri 18.12., KW 52 "○ Bad putzen (E)" on Fri 25.12.', () => {
    const row = householdRow({
      chores: [badRotating],
      events: [],
      members,
      trips: [hamburg],
      from: '2026-12-14',
      to: '2026-12-27',
      today: '2026-12-16',
    });
    expect(short(row['2026-12-18'])).toEqual(['○ Bad putzen (N)']);
    expect(short(row['2026-12-25'])).toEqual(['○ Bad putzen (E)']);
  });
});

describe('REQ-013: while the whole household is away', () => {
  it('AC-049: Sat 5.12. "Ihr seid unterwegs – Aufgaben warten bis Fr 11.12."', () => {
    expect(householdAwayNotice('2026-12-05', '2026-12-05', trips)).toBe(
      'Ihr seid unterwegs – Aufgaben warten bis Fr 11.12.',
    );
    const day = choresOfDay({
      chores: [badNadja],
      events: [],
      members,
      trips: [mallorca, hamburg],
      shown: '2026-12-05',
      today: '2026-12-05',
    });
    expect(day).toEqual({
      kind: 'away',
      notice: 'Ihr seid unterwegs – Aufgaben warten bis Fr 11.12.',
      items: [],
    });
  });

  it('AC-050: Wed 9.12. chosen on Sun 22.11. shows the same sentence instead of "Nichts geplant."', () => {
    const day = choresOfDay({
      chores: [badNadja],
      events: [],
      members,
      trips: [mallorca],
      shown: '2026-12-09',
      today,
    });
    expect(day.kind === 'away' && day.notice).toBe(
      'Ihr seid unterwegs – Aufgaben warten bis Fr 11.12.',
    );
  });

  it('AC-051: the household row is empty 4.–10.12. and has the moved chores on Fri 11.12.', () => {
    const row = householdRow({
      chores: [fensterWohnzimmer, staubsaugen, badNadja, pflanzen, paket],
      events: [],
      members,
      trips: [mallorca],
      from: '2026-11-30',
      to: '2026-12-13',
      today,
    });
    for (let day = '2026-12-04'; day <= '2026-12-10'; day = addDays(day, 1)) {
      expect(row[day]).toBeUndefined();
    }
    expect(short(row['2026-12-11'])).toEqual([
      '○ Bad putzen (N)',
      '○ Paket abholen',
      '○ Pflanzen gießen, etwa',
      '○ Fenster Wohnzimmer (E)',
      '○ Staubsaugen',
    ]);
  });

  it('AC-052: a trip of Enrico alone has no sentence', () => {
    expect(householdAwayNotice('2026-12-18', '2026-12-18', trips)).toBeUndefined();
  });
});

describe('REQ-005: "Später" with a choice', () => {
  it('AC-013: due today: "Morgen · Mo 23.11.", "Übermorgen · Di 24.11.", "Am Wochenende · Sa 28.11."', () => {
    const trash = chore({
      id: 'm',
      title: 'Müll rausbringen',
      recurrence: { type: 'weekly', every: 1, weekdays: [7] },
      nextDueOn: today,
    });
    expect(postponeOptions(trash, today, home).map((option) => option.label)).toEqual([
      'Morgen · Mo 23.11.',
      'Übermorgen · Di 24.11.',
      'Am Wochenende · Sa 28.11.',
    ]);
    expect(postponedNotice(trash, '2026-11-24', today, home)).toBe('Verschoben auf Di 24.11.');
  });

  it('AC-015: due Fri 27.11.: counted from that day, no "Am Wochenende" when it doubles', () => {
    const bath = chore({ id: 'b', title: 'Bad putzen', nextDueOn: '2026-11-27' });
    expect(postponeOptions(bath, today, home)).toEqual([
      { key: 'plus1', label: 'Einen Tag später · Sa 28.11.', date: '2026-11-28' },
      { key: 'plus2', label: 'Zwei Tage später · So 29.11.', date: '2026-11-29' },
    ]);
  });
});

describe('REQ-001: day labels', () => {
  it('AC-001/AC-002: another year carries its year: "Di 16.3.2027", "Sa 23.1.2027"; this year "Sa 19.12."', () => {
    expect(choreDayLabel('2027-03-16', today)).toBe('Di 16.3.2027');
    expect(choreDayLabel('2027-01-23', today)).toBe('Sa 23.1.2027');
    expect(choreDayLabel('2026-12-19', today)).toBe('Sa 19.12.');
  });
});

// ---------- AC-056: parity with the scheduler (notification_parity.test.sql) ----------

const parityChores = [
  badNadja,
  fensterWohnzimmer,
  staubsaugen,
  muell,
  fensterPutzen,
  blumen,
  keller,
  pflanzen,
  paket,
  badRotating,
];

/**
 * One character per day 1.12.–27.12.: "." not due, "t" today, "o" overdue, "f" flexible; then
 * the person whose turn it is in lower case ("e", "n", "-" for nobody in particular).
 */
function parityLine(item: Chore): string {
  let line = '';
  for (let day: ISODate = '2026-12-01'; day <= '2026-12-27'; day = addDays(day, 1)) {
    const state = choreDueState(item, day, trips);
    line += state === undefined ? '.' : state === 'flexibleDue' ? 'f' : state[0];
  }
  const persons = [];
  for (let day: ISODate = '2026-12-01'; day <= '2026-12-27'; day = addDays(day, 1)) {
    const acting = choreTurn(item, day, trips).actingId;
    persons.push(acting === enrico.id ? 'e' : acting === nadja.id ? 'n' : '-');
  }
  return `${choreDueOn(item, trips) ?? '-'} ${line} ${persons.join('')}`;
}

describe('REQ-014: notifications by the same rule', () => {
  it('AC-056: due state, Zähltag and person for every day 1.12.–27.12.', () => {
    expect(Object.fromEntries(parityChores.map((item) => [item.id, parityLine(item)]))).toEqual(
      PARITY,
    );
  });
});

// The same lines are expected from SQL in notification_parity.test.sql (AC-056).
const PARITY: Record<string, string> = {
  bad: '2026-12-11 ..........toooooooooooooooo nnnnnnnnnnnnnnnnnnnnnnnnnnn',
  fenster: '2026-12-11 ..........toooooo..oooooooo eeeeeeeeeeeeeeeeeeeeeeeeeee',
  staub: '2026-12-11 ..........toooooooooooooooo ---------------------------',
  muell: '2026-12-20 ...................tooooooo eeeeeeeeeeeeeeeeeeeeeeeeeee',
  fp: '2026-12-20 ...................tooooooo ---------------------------',
  blumen: '2026-12-18 .................tooooooooo ---------------------------',
  keller: '2026-11-30 ooo.......ooooooo..oooooooo eeeeeeeeeeeeeeeeeeeeeeeeeee',
  pflanzen: '2026-12-11 ..........fffffffffffffffff ---------------------------',
  paket: '2026-12-11 ..........toooooooooooooooo ---------------------------',
  'bad-r': '2026-12-18 .................tooooooooo nnnnnnnnnnnnnnnnnnneeeeeeee',
};
