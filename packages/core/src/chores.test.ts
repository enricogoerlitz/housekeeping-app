import { describe, expect, it } from 'vitest';

import {
  assigneeAfterAssignmentChange,
  assignmentLabel,
  choreBucket,
  choreMemberIds,
  completionOutcome,
  daysOverdue,
  doneOnChoices,
  fasterNotice,
  firstDueOn,
  flexibleProgress,
  latestBookedEvent,
  nextAssignee,
  nextDueAfter,
  reassignOutcome,
  recurrenceLabel,
  removalOutcome,
  seasonLabel,
  seasonMonths,
  validateChoreDraft,
} from './chores';
import { enrico, nadja } from './test-fixtures';
import type { Assignment, Chore, ChoreEvent, Recurrence } from './types';

// 2026-11-20 is a Friday; its week runs from Monday 16 to Sunday 22 November.
const today = '2026-11-20';

function chore(partial: Partial<Chore> = {}): Chore {
  return {
    id: 'c',
    title: 'Bad putzen',
    recurrence: { type: 'weekly', every: 1, weekdays: [5] },
    assignment: { type: 'fixed', memberId: enrico.id },
    effort: 2,
    ...partial,
  };
}

describe('choreBucket', () => {
  it('sorts fixed chores into today, overdue, this week and later', () => {
    expect(choreBucket(chore({ nextDueOn: today }), today)).toBe('today');
    expect(choreBucket(chore({ nextDueOn: '2026-11-18' }), today)).toBe('overdue');
    expect(choreBucket(chore({ nextDueOn: '2026-11-22' }), today)).toBe('thisWeek');
    expect(choreBucket(chore({ nextDueOn: '2026-11-23' }), today)).toBe('later');
    expect(choreBucket(chore(), today)).toBe('later');
  });

  it('puts flexible chores under "flexible" whatever their date', () => {
    const flexible = chore({ recurrence: { type: 'flexible', everyDays: 7 }, nextDueOn: today });
    expect(choreBucket(flexible, today)).toBe('flexible');
  });

  it('pauses chores outside their active months; an empty list means all year', () => {
    expect(choreBucket(chore({ nextDueOn: today, activeMonths: [4, 5, 6] }), today)).toBe('paused');
    expect(
      choreBucket(
        chore({ recurrence: { type: 'flexible', everyDays: 3 }, activeMonths: [7] }),
        today,
      ),
    ).toBe('paused');
    expect(choreBucket(chore({ nextDueOn: today, activeMonths: [11] }), today)).toBe('today');
    expect(choreBucket(chore({ nextDueOn: today, activeMonths: [] }), today)).toBe('today');
  });
});

describe('AC-035: completing "Bad putzen"', () => {
  it('moves the next due date out of "Heute" and hands a rotation to Nadja', () => {
    const bathroom = chore({
      nextDueOn: today,
      assignment: { type: 'rotating', memberIds: [enrico.id, nadja.id] },
      nextAssigneeId: enrico.id,
    });
    const next = nextDueAfter(bathroom, today);
    expect(next).toBe('2026-11-27');
    expect(choreBucket({ ...bathroom, nextDueOn: next }, today)).not.toBe('today');
    expect(nextAssignee(bathroom, enrico.id)).toBe(nadja.id);
  });
});

describe('AC-036: "Staubsaugen" weekly on Saturday, rotating', () => {
  it('shows up this week with both members and the label "wöchentlich Sa"', () => {
    const vacuum = chore({
      title: 'Staubsaugen',
      recurrence: { type: 'weekly', every: 1, weekdays: [6] },
      assignment: { type: 'rotating', memberIds: [enrico.id, nadja.id] },
      nextDueOn: '2026-11-21',
      nextAssigneeId: enrico.id,
    });
    expect(choreBucket(vacuum, today)).toBe('thisWeek');
    expect(choreMemberIds(vacuum, [enrico, nadja])).toEqual([enrico.id, nadja.id]);
    expect(recurrenceLabel(vacuum.recurrence)).toBe('wöchentlich Sa');
    expect(assignmentLabel(vacuum.assignment, [enrico, nadja])).toBe('abwechselnd');
  });
});

describe('nextDueAfter', () => {
  it('weekly: the next configured weekday after completion', () => {
    const tuesdayFriday = chore({ recurrence: { type: 'weekly', every: 1, weekdays: [2, 5] } });
    expect(nextDueAfter({ ...tuesdayFriday, nextDueOn: today }, today)).toBe('2026-11-24');
  });

  it('weekly: an early completion counts for the occurrence still ahead', () => {
    const saturday = chore({
      recurrence: { type: 'weekly', every: 1, weekdays: [6] },
      nextDueOn: '2026-11-21',
    });
    expect(nextDueAfter(saturday, '2026-11-19')).toBe('2026-11-28');
  });

  it('weekly: every 2 weeks adds a week; without weekdays it keeps the weekday', () => {
    const fortnightly = chore({ recurrence: { type: 'weekly', every: 2, weekdays: [5] } });
    expect(nextDueAfter({ ...fortnightly, nextDueOn: today }, today)).toBe('2026-12-04');
    const noDays = chore({ recurrence: { type: 'weekly', every: 1, weekdays: [] } });
    expect(nextDueAfter(noDays, today)).toBe('2026-11-27');
  });

  it('weekly: a late completion goes to the next weekday after it', () => {
    const friday = chore({ nextDueOn: '2026-11-13' });
    expect(nextDueAfter(friday, '2026-11-18')).toBe('2026-11-20');
  });

  it('monthly: the configured day of the following month, clamped to its length', () => {
    const first = chore({ recurrence: { type: 'monthly', day: 1 }, nextDueOn: '2026-12-01' });
    expect(nextDueAfter(first, '2026-12-03')).toBe('2027-01-01');
    expect(nextDueAfter(first, '2026-11-28')).toBe('2027-01-01');
    const last = chore({ recurrence: { type: 'monthly', day: 31 }, nextDueOn: '2027-01-31' });
    expect(nextDueAfter(last, '2027-01-31')).toBe('2027-02-28');
  });

  it('everyMonths: steps from the scheduled date so a clamped day does not stick', () => {
    const windows = chore({
      recurrence: { type: 'everyMonths', every: 1 },
      nextDueOn: '2027-01-31',
    });
    expect(nextDueAfter(windows, '2027-01-31')).toBe('2027-02-28');
    expect(nextDueAfter({ ...windows, nextDueOn: '2027-01-31' }, '2027-03-01')).toBe('2027-03-31');
  });

  it('everyMonths: skips as many intervals as needed after a late completion', () => {
    const twoMonthly = chore({
      recurrence: { type: 'everyMonths', every: 2 },
      nextDueOn: '2026-01-15',
    });
    expect(nextDueAfter(twoMonthly, '2026-06-10')).toBe('2026-07-15');
    expect(nextDueAfter({ ...twoMonthly, nextDueOn: undefined }, '2026-06-10')).toBe('2026-08-10');
  });

  it('flexible: completion plus the interval; once: no next date', () => {
    const flexible = chore({ recurrence: { type: 'flexible', everyDays: 14 }, nextDueOn: today });
    expect(nextDueAfter(flexible, '2026-11-18')).toBe('2026-12-02');
    const zero = chore({ recurrence: { type: 'flexible', everyDays: 0 } });
    expect(nextDueAfter(zero, today)).toBe('2026-11-21');
    expect(nextDueAfter(chore({ recurrence: { type: 'once' } }), today)).toBeUndefined();
  });
});

describe('nextAssignee', () => {
  const rotation = chore({
    assignment: { type: 'rotating', memberIds: ['a', 'b', 'c'] },
    nextAssigneeId: 'b',
  });

  it('rotates to the member after the one who did it, wrapping around', () => {
    expect(nextAssignee(rotation, 'a')).toBe('b');
    expect(nextAssignee(rotation, 'c')).toBe('a');
  });

  it('keeps the current turn when someone outside the rotation helped', () => {
    expect(nextAssignee(rotation, 'gast')).toBe('b');
    expect(nextAssignee({ ...rotation, nextAssigneeId: undefined }, 'gast')).toBe('a');
  });

  it('returns the fixed member, nobody for "anyone" and "together"', () => {
    expect(nextAssignee(chore(), nadja.id)).toBe(enrico.id);
    expect(nextAssignee(chore({ assignment: { type: 'anyone' } }), nadja.id)).toBeUndefined();
    expect(nextAssignee(chore({ assignment: { type: 'together' } }), nadja.id)).toBeUndefined();
  });
});

describe('progress and overdue days', () => {
  it('measures the share of a flexible interval that has passed', () => {
    const plants = chore({
      recurrence: { type: 'flexible', everyDays: 10 },
      lastDoneOn: '2026-11-15',
    });
    expect(flexibleProgress(plants, today)).toBe(0.5);
    expect(flexibleProgress(plants, '2026-11-30')).toBe(1.5);
    expect(flexibleProgress({ ...plants, lastDoneOn: undefined }, today)).toBe(1);
    expect(flexibleProgress(chore(), today)).toBe(0);
  });

  it('counts overdue days of fixed chores only', () => {
    expect(daysOverdue(chore({ nextDueOn: '2026-11-17' }), today)).toBe(3);
    expect(daysOverdue(chore({ nextDueOn: '2026-11-25' }), today)).toBe(0);
    expect(daysOverdue(chore(), today)).toBe(0);
    const flexible = chore({
      recurrence: { type: 'flexible', everyDays: 3 },
      nextDueOn: '2026-11-01',
    });
    expect(daysOverdue(flexible, today)).toBe(0);
  });
});

describe('labels', () => {
  it('describes every rhythm in German', () => {
    expect(recurrenceLabel({ type: 'once' })).toBe('einmalig');
    expect(recurrenceLabel({ type: 'weekly', every: 1, weekdays: [4, 1, 4] })).toBe(
      'wöchentlich Mo, Do',
    );
    expect(recurrenceLabel({ type: 'weekly', every: 2, weekdays: [1] })).toBe('alle 2 Wochen Mo');
    expect(recurrenceLabel({ type: 'weekly', every: 1, weekdays: [] })).toBe('wöchentlich');
    expect(recurrenceLabel({ type: 'monthly', day: 1 })).toBe('monatlich am 1.');
    expect(recurrenceLabel({ type: 'everyMonths', every: 1 })).toBe('monatlich');
    expect(recurrenceLabel({ type: 'everyMonths', every: 6 })).toBe('alle 6 Monate');
    expect(recurrenceLabel({ type: 'everyMonths', every: 12 })).toBe('jährlich');
    expect(recurrenceLabel({ type: 'flexible', everyDays: 1 })).toBe('etwa täglich');
    expect(recurrenceLabel({ type: 'flexible', everyDays: 7 })).toBe('etwa wöchentlich');
    expect(recurrenceLabel({ type: 'flexible', everyDays: 14 })).toBe('etwa alle 2 Wochen');
    expect(recurrenceLabel({ type: 'flexible', everyDays: 10 })).toBe('etwa alle 10 Tage');
  });

  it('names the assignment; "" for an unknown fixed member', () => {
    const members = [enrico, nadja];
    expect(assignmentLabel({ type: 'fixed', memberId: nadja.id }, members)).toBe('Nadja');
    expect(assignmentLabel({ type: 'fixed', memberId: 'weg' }, members)).toBe('');
    expect(assignmentLabel({ type: 'anyone' }, members)).toBe('egal wer');
    expect(assignmentLabel({ type: 'together' }, members)).toBe('zu zweit');
  });

  it('shows the next assignee, everyone for "together", and drops unknown ids', () => {
    const members = [enrico, nadja];
    expect(choreMemberIds(chore({ nextAssigneeId: nadja.id }), members)).toEqual([nadja.id]);
    expect(choreMemberIds(chore(), members)).toEqual([enrico.id]);
    expect(choreMemberIds(chore({ assignment: { type: 'together' } }), members)).toEqual([
      enrico.id,
      nadja.id,
    ]);
    expect(choreMemberIds(chore({ assignment: { type: 'anyone' } }), members)).toEqual([]);
    expect(
      choreMemberIds(
        chore({ assignment: { type: 'rotating', memberIds: [enrico.id, 'weg'] } }),
        members,
      ),
    ).toEqual([enrico.id]);
  });
});

// ---------- Spec 0011 ----------

function event(partial: Partial<ChoreEvent> & Pick<ChoreEvent, 'id'>): ChoreEvent {
  return {
    choreId: 'c',
    title: 'Bad putzen',
    kind: 'done',
    doneOn: today,
    doneBy: enrico.id,
    ...partial,
  };
}

describe('AC-043/AC-044: rhythm "bei Bedarf"', () => {
  const window = chore({
    title: 'Fenster Küche',
    recurrence: { type: 'asNeeded' },
    assignment: { type: 'anyone' },
  });

  it('AC-043: is never due, has its own bucket and the label "bei Bedarf"', () => {
    expect(choreBucket(window, today)).toBe('asNeeded');
    // Even a stray date (the database forbids it) does not make it due.
    expect(choreBucket({ ...window, nextDueOn: today }, today)).toBe('asNeeded');
    expect(choreBucket({ ...window, activeMonths: [4] }, today)).toBe('asNeeded');
    expect(recurrenceLabel({ type: 'asNeeded' })).toBe('bei Bedarf');
    expect(daysOverdue({ ...window, nextDueOn: '2026-11-01' }, today)).toBe(0);
    expect(flexibleProgress(window, today)).toBe(0);
  });

  it('AC-044: completing it keeps it without a next date', () => {
    expect(nextDueAfter(window, today)).toBeUndefined();
    expect(completionOutcome(window, { kind: 'done', doneOn: today, doneBy: enrico.id })).toEqual({
      deletesChore: false,
      nextDueOn: undefined,
      lastDoneOn: today,
      nextAssigneeId: undefined,
    });
  });
});

describe('AC-051: firstDueOn (creating and changing the rhythm)', () => {
  it('AC-051: Fr → "wöchentlich montags" after doing it today is due Mon 23 Nov', () => {
    expect(firstDueOn({ type: 'weekly', every: 1, weekdays: [1] }, today, today)).toBe(
      '2026-11-23',
    );
  });

  it('AC-051: never done, "monatlich am 1." is due Tue 1 Dec', () => {
    expect(firstDueOn({ type: 'monthly', day: 1 }, today)).toBe('2026-12-01');
    expect(firstDueOn({ type: 'monthly', day: 20 }, today)).toBe(today);
    expect(firstDueOn({ type: 'monthly', day: 31 }, '2027-02-10')).toBe('2027-02-28');
  });

  it('fixed rhythm: the next matching day from today, from tomorrow when done today', () => {
    const friday: Recurrence = { type: 'weekly', every: 1, weekdays: [5] };
    expect(firstDueOn(friday, today)).toBe(today);
    expect(firstDueOn(friday, today, today)).toBe('2026-11-27');
    expect(firstDueOn(friday, today, '2026-11-13')).toBe(today);
    expect(firstDueOn({ type: 'monthly', day: 20 }, today, today)).toBe('2026-12-20');
    expect(firstDueOn({ type: 'weekly', every: 1, weekdays: [] }, today)).toBe(today);
  });

  it('every n months: n months after the last time, never before today', () => {
    expect(firstDueOn({ type: 'everyMonths', every: 2 }, today, '2026-10-05')).toBe('2026-12-05');
    expect(firstDueOn({ type: 'everyMonths', every: 1 }, today, '2026-09-01')).toBe(today);
    expect(firstDueOn({ type: 'everyMonths', every: 1 }, today, today)).toBe('2026-12-20');
    expect(firstDueOn({ type: 'everyMonths', every: 6 }, today)).toBe(today);
  });

  it('flexible: the interval after the last time; never done = due today', () => {
    expect(firstDueOn({ type: 'flexible', everyDays: 14 }, today, '2026-11-10')).toBe('2026-11-24');
    expect(firstDueOn({ type: 'flexible', everyDays: 14 }, today, '2026-10-01')).toBe(today);
    expect(firstDueOn({ type: 'flexible', everyDays: 14 }, today)).toBe(today);
  });

  it('"bei Bedarf" has no date, "einmalig" its own date', () => {
    expect(firstDueOn({ type: 'asNeeded' }, today)).toBeUndefined();
    expect(firstDueOn({ type: 'once', date: '2026-12-24' }, today)).toBe('2026-12-24');
    expect(firstDueOn({ type: 'once' }, today)).toBeUndefined();
  });
});

describe('completionOutcome', () => {
  const sheets = chore({
    title: 'Bettwäsche wechseln',
    recurrence: { type: 'flexible', everyDays: 14 },
    assignment: { type: 'fixed', memberId: nadja.id },
    lastDoneOn: '2026-11-10',
    nextDueOn: '2026-11-24',
    nextAssigneeId: nadja.id,
  });

  it('AC-036: "etwa alle 14 Tage" done today by Nadja is next due on 4 Dec', () => {
    expect(completionOutcome(sheets, { kind: 'done', doneOn: today, doneBy: nadja.id })).toEqual({
      deletesChore: false,
      nextDueOn: '2026-12-04',
      lastDoneOn: today,
      nextAssigneeId: nadja.id,
    });
  });

  it('AC-038: done yesterday is next due on 3 Dec', () => {
    const outcome = completionOutcome(sheets, {
      kind: 'done',
      doneOn: '2026-11-19',
      doneBy: enrico.id,
    });
    expect(outcome.nextDueOn).toBe('2026-12-03');
    expect(outcome.lastDoneOn).toBe('2026-11-19');
  });

  it('a late entry for an earlier day moves neither the last time nor the interval back', () => {
    const doneToday = { ...sheets, lastDoneOn: today, nextDueOn: '2026-12-04' };
    const outcome = completionOutcome(doneToday, {
      kind: 'done',
      doneOn: '2026-11-18',
      doneBy: nadja.id,
    });
    expect(outcome.lastDoneOn).toBe(today);
    expect(outcome.nextDueOn).toBe('2026-12-04');
  });

  it('AC-037: a fixed rhythm done early counts for the date ahead (Wed → Fri 27 Nov)', () => {
    const bath = chore({ nextDueOn: '2026-11-20' });
    const outcome = completionOutcome(bath, {
      kind: 'done',
      doneOn: '2026-11-18',
      doneBy: enrico.id,
    });
    expect(outcome.nextDueOn).toBe('2026-11-27');
    expect(choreBucket({ ...bath, ...outcome }, today)).not.toBe('today');
  });

  it('AC-040: a new "etwa alle 14 Tage", "abwechselnd" chore done by Enrico: 4 Dec, Nadja', () => {
    const assignment: Assignment = { type: 'rotating', memberIds: [enrico.id, nadja.id] };
    const recurrence: Recurrence = { type: 'flexible', everyDays: 14 };
    const fresh = chore({
      title: 'Pflanzen düngen',
      recurrence,
      assignment,
      nextDueOn: firstDueOn(recurrence, today),
      nextAssigneeId: assigneeAfterAssignmentChange(assignment),
    });
    expect(completionOutcome(fresh, { kind: 'done', doneOn: today, doneBy: enrico.id })).toEqual({
      deletesChore: false,
      nextDueOn: '2026-12-04',
      lastDoneOn: today,
      nextAssigneeId: nadja.id,
    });
  });

  it('"Überspringen" only moves the date; done "einmalig" deletes the chore', () => {
    const bath = chore({ nextDueOn: today, lastDoneOn: '2026-11-13', nextAssigneeId: enrico.id });
    expect(completionOutcome(bath, { kind: 'skipped', doneOn: today, doneBy: nadja.id })).toEqual({
      deletesChore: false,
      nextDueOn: '2026-11-27',
      lastDoneOn: '2026-11-13',
      nextAssigneeId: enrico.id,
    });
    const once = chore({ recurrence: { type: 'once' }, nextDueOn: today });
    expect(
      completionOutcome(once, { kind: 'done', doneOn: today, doneBy: enrico.id }).deletesChore,
    ).toBe(true);
    expect(
      completionOutcome(once, { kind: 'skipped', doneOn: today, doneBy: enrico.id }).deletesChore,
    ).toBe(false);
  });
});

describe('assigneeAfterAssignmentChange', () => {
  it('fixed → that member; rotating keeps a current turn that is still in it', () => {
    expect(assigneeAfterAssignmentChange({ type: 'fixed', memberId: nadja.id }, enrico.id)).toBe(
      nadja.id,
    );
    const rotation: Assignment = { type: 'rotating', memberIds: [enrico.id, nadja.id] };
    expect(assigneeAfterAssignmentChange(rotation, nadja.id)).toBe(nadja.id);
    expect(assigneeAfterAssignmentChange(rotation, 'weg')).toBe(enrico.id);
    expect(assigneeAfterAssignmentChange(rotation)).toBe(enrico.id);
  });

  it('"egal wer", "zu zweit" and an empty rotation have nobody', () => {
    expect(assigneeAfterAssignmentChange({ type: 'anyone' }, enrico.id)).toBeUndefined();
    expect(assigneeAfterAssignmentChange({ type: 'together' }, enrico.id)).toBeUndefined();
    expect(assigneeAfterAssignmentChange({ type: 'rotating', memberIds: [] })).toBeUndefined();
  });
});

describe('the history chain (Offene Frage 9: the latest booked entry)', () => {
  const thisWeek = event({
    id: 'ev-20',
    doneOn: today,
    createdAt: '2026-11-20T09:00:00.000Z',
    previous: { nextDueOn: today, lastDoneOn: '2026-11-13', nextAssigneeId: enrico.id },
  });
  const lastWeek = event({
    id: 'ev-13',
    doneOn: '2026-11-13',
    createdAt: '2026-11-13T09:00:00.000Z',
    previous: { nextDueOn: '2026-11-13', lastDoneOn: '2026-11-06', nextAssigneeId: enrico.id },
  });
  const yesterdayLate = event({
    id: 'ev-19',
    doneOn: '2026-11-19',
    createdAt: '2026-11-20T10:00:00.000Z',
  });
  const other = event({ id: 'ev-x', choreId: 'other', createdAt: '2026-11-21T08:00:00.000Z' });

  it('latestBookedEvent goes by booking time, not by day; without a time it is newest', () => {
    expect(latestBookedEvent([lastWeek, thisWeek, other], 'c')?.id).toBe('ev-20');
    expect(latestBookedEvent([thisWeek, yesterdayLate, lastWeek], 'c')?.id).toBe('ev-19');
    const pending = event({ id: 'ev-new' });
    expect(latestBookedEvent([thisWeek, pending], 'c')?.id).toBe('ev-new');
    expect(latestBookedEvent([other], 'c')).toBeUndefined();
  });

  it('latestBookedEvent breaks a tie of booking times by id', () => {
    const a = event({ id: 'a', createdAt: '2026-11-20T09:00:00.000Z' });
    const b = event({ id: 'b', createdAt: '2026-11-20T09:00:00.000Z' });
    expect(latestBookedEvent([b, a], 'c')?.id).toBe('b');
    expect(latestBookedEvent([a, b], 'c')?.id).toBe('b');
  });

  const bath = chore({
    assignment: { type: 'rotating', memberIds: [enrico.id, nadja.id] },
    nextDueOn: '2026-11-27',
    lastDoneOn: today,
    nextAssigneeId: nadja.id,
  });

  it('AC-059: changing "Erledigt von" of the latest entry moves the turn (Nadja → Enrico)', () => {
    expect(
      reassignOutcome({
        chore: bath,
        events: [thisWeek, lastWeek],
        eventId: 'ev-20',
        doneBy: nadja.id,
      }),
    ).toEqual({ nextAssigneeId: enrico.id });
  });

  it('AC-059: an older entry, a skipped one or a deleted chore only change the avatar', () => {
    const events = [thisWeek, lastWeek];
    expect(
      reassignOutcome({ chore: bath, events, eventId: 'ev-13', doneBy: nadja.id }),
    ).toBeUndefined();
    const skipped = { ...thisWeek, kind: 'skipped' as const };
    expect(
      reassignOutcome({ chore: bath, events: [skipped], eventId: 'ev-20', doneBy: nadja.id }),
    ).toBeUndefined();
    expect(
      reassignOutcome({ chore: undefined, events, eventId: 'ev-20', doneBy: nadja.id }),
    ).toBeUndefined();
    const anyone = { ...bath, assignment: { type: 'anyone' as const } };
    expect(
      reassignOutcome({ chore: anyone, events, eventId: 'ev-20', doneBy: nadja.id }),
    ).toBeUndefined();
  });

  it('AC-060: removing the latest entry restores date and person of before', () => {
    expect(removalOutcome({ chore: bath, events: [thisWeek, lastWeek], eventId: 'ev-20' })).toEqual(
      { nextDueOn: today, lastDoneOn: '2026-11-13', nextAssigneeId: enrico.id },
    );
  });

  it('AC-060: removing an older entry changes neither date nor person', () => {
    expect(
      removalOutcome({ chore: bath, events: [thisWeek, lastWeek], eventId: 'ev-13' }),
    ).toBeUndefined();
  });

  it('removing restores nothing without a recorded state or without the chore', () => {
    expect(
      removalOutcome({ chore: bath, events: [yesterdayLate, thisWeek], eventId: 'ev-19' }),
    ).toBeUndefined();
    expect(
      removalOutcome({ chore: undefined, events: [thisWeek], eventId: 'ev-20' }),
    ).toBeUndefined();
    expect(removalOutcome({ chore: bath, events: [thisWeek], eventId: 'weg' })).toBeUndefined();
  });
});

describe('the chore form', () => {
  it('AC-052: an empty or blank title is "Titel fehlt"', () => {
    expect(validateChoreDraft({ title: '' })).toEqual({ title: 'Titel fehlt' });
    expect(validateChoreDraft({ title: '   ' })).toEqual({ title: 'Titel fehlt' });
    expect(validateChoreDraft({ title: 'Bad gründlich putzen' })).toEqual({});
  });

  it('AC-050: a season "April–September" is the months 4 to 9', () => {
    expect(seasonMonths(4, 9)).toEqual([4, 5, 6, 7, 8, 9]);
    expect(seasonLabel([4, 5, 6, 7, 8, 9])).toBe('April–September');
  });

  it('a season across the turn of the year, a single month and all year', () => {
    expect(seasonMonths(10, 3)).toEqual([10, 11, 12, 1, 2, 3]);
    expect(seasonLabel([10, 11, 12, 1, 2, 3])).toBe('Oktober–März');
    expect(seasonLabel([1, 2, 3, 10, 11, 12])).toBe('Oktober–März');
    expect(seasonMonths(5, 5)).toEqual([5]);
    expect(seasonLabel([5])).toBe('Mai');
    expect(seasonLabel(undefined)).toBe('');
    expect(seasonLabel([])).toBe('');
    expect(seasonLabel(seasonMonths(1, 12))).toBe('');
    expect(seasonLabel([1, 3])).toBe('Januar, März');
  });

  it('seasonMonths ignores months outside 1–12', () => {
    expect(seasonMonths(0, 3)).toEqual([]);
    expect(seasonMonths(3, 13)).toEqual([]);
  });

  it('AC-035/AC-038: the day choices are heute, gestern, vorgestern', () => {
    expect(doneOnChoices(today)).toEqual([
      { date: today, label: 'heute' },
      { date: '2026-11-19', label: 'gestern' },
      { date: '2026-11-18', label: 'vorgestern' },
    ]);
  });
});

describe('AC-031: someone else was faster', () => {
  it('AC-031: names the person and the local time', () => {
    expect(fasterNotice('Nadja', '2026-11-20T10:02:00')).toBe('Nadja war schneller (10:02)');
    expect(fasterNotice('Nadja', '2026-11-20T08:05:30.123')).toBe('Nadja war schneller (08:05)');
  });

  it('leaves the time out when it cannot be read', () => {
    expect(fasterNotice('Nadja', 'kaputt')).toBe('Nadja war schneller');
    expect(fasterNotice('Nadja', undefined)).toBe('Nadja war schneller');
  });
});
