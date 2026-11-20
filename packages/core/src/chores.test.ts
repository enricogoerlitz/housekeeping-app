import { describe, expect, it } from 'vitest';

import {
  assignmentLabel,
  choreBucket,
  choreMemberIds,
  daysOverdue,
  flexibleProgress,
  nextAssignee,
  nextDueAfter,
  recurrenceLabel,
} from './chores';
import { enrico, nadja } from './test-fixtures';
import type { Chore } from './types';

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
