import { describe, expect, it } from 'vitest';

import {
  absenceEndLabel,
  absenceStripes,
  inRange,
  openRangeField,
  pickRangeDate,
  planAbsenceWrite,
  splitUpcomingPast,
  stripeLabelDate,
  stripeSegment,
  stripesOfYear,
  stripeText,
  validateAbsenceDraft,
  yearDayAbsence,
  type RangePick,
} from './absences';
import { enrico, nadja, vera } from './test-fixtures';
import type { Absence } from './types';

const members = [enrico, nadja];
const wg = [enrico, nadja, vera];

function absence(partial: Partial<Absence> & Pick<Absence, 'id' | 'from' | 'to'>): Absence {
  return { ...partial };
}

const enricoMallorca = absence({
  id: 'a-e',
  memberId: enrico.id,
  from: '2027-01-01',
  to: '2027-01-04',
  note: 'Urlaub Mallorca',
});
const nadjaMallorca = absence({
  id: 'a-n',
  memberId: nadja.id,
  from: '2027-01-01',
  to: '2027-01-07',
  note: 'Urlaub Mallorca',
});

describe('absence stripes', () => {
  it('AC-028: different periods are two stripes with their own end', () => {
    const stripes = absenceStripes([nadjaMallorca, enricoMallorca], members);
    expect(stripes.map((stripe) => stripe.memberIds)).toEqual([[enrico.id], [nadja.id]]);
    expect(stripes.map(stripeText)).toEqual(['Urlaub Mallorca', 'Urlaub Mallorca']);
    expect(stripes.map((stripe) => absenceEndLabel(stripe.to))).toEqual([
      'bis Mo 4.1.',
      'bis Do 7.1.',
    ]);
    expect(stripes.every((stripe) => !stripe.household)).toBe(true);
  });

  it('AC-029: same from, to and note become one stripe with both people', () => {
    const both = [absence({ ...enricoMallorca, to: '2027-01-07' }), absence({ ...nadjaMallorca })];
    const stripes = absenceStripes(both, wg);
    expect(stripes).toHaveLength(1);
    expect(stripes[0]?.memberIds).toEqual([enrico.id, nadja.id]);
    expect(stripes[0]?.absenceIds).toEqual(['a-e', 'a-n']);
  });

  it('AC-029: the whole household is one stripe marked as household', () => {
    const stripes = absenceStripes(
      [absence({ id: 'h', from: '2027-01-01', to: '2027-01-04', note: 'Urlaub Mallorca' })],
      members,
    );
    expect(stripes).toHaveLength(1);
    expect(stripes[0]?.household).toBe(true);
    expect(stripes[0]?.memberIds).toEqual([]);
  });

  it('AC-029: same period, different note stays two stripes', () => {
    const stripes = absenceStripes(
      [
        enricoMallorca,
        absence({ ...nadjaMallorca, to: '2027-01-04', note: 'Dienstreise Hamburg' }),
      ],
      members,
    );
    expect(stripes).toHaveLength(2);
  });

  it('AC-030: without a note the stripe says "abwesend"', () => {
    const [stripe] = absenceStripes([absence({ ...enricoMallorca, note: undefined })], members);
    expect(stripe && stripeText(stripe)).toBe('abwesend');
    expect(absenceEndLabel('2027-01-01')).toBe('bis Fr 1.1.');
  });

  it('AC-028: in KW 53 both stripes run from Friday to Sunday and over the edge', () => {
    const [e, n] = absenceStripes([enricoMallorca, nadjaMallorca], members);
    expect(e && stripeSegment(e, '2026-12-28', '2027-01-03')).toEqual({
      start: 4,
      end: 6,
      continuesBefore: false,
      continuesAfter: true,
    });
    // KW 1: Enrico only on Monday, Nadja Monday to Thursday.
    expect(e && stripeSegment(e, '2027-01-04', '2027-01-10')).toEqual({
      start: 0,
      end: 0,
      continuesBefore: true,
      continuesAfter: false,
    });
    expect(n && stripeSegment(n, '2027-01-04', '2027-01-10')?.end).toBe(3);
    expect(e && stripeSegment(e, '2027-01-11', '2027-01-17')).toBeUndefined();
  });

  it('AC-031: on phones the label stands on the first day, again on the first day of the week', () => {
    const [e] = absenceStripes([enricoMallorca], members);
    expect(e && stripeLabelDate(e, '2026-12-28')).toBe('2027-01-01');
    expect(e && stripeLabelDate(e, '2027-01-04')).toBe('2027-01-04');
  });
});

describe('absences in the year', () => {
  const summer = absence({ id: 'h', from: '2027-08-09', to: '2027-08-23', note: 'Sommerurlaub' });

  it('AC-015: lines for several people, a tint for one, neutral for the household', () => {
    const all = [enricoMallorca, nadjaMallorca, summer];
    expect(yearDayAbsence('2027-01-02', all)).toEqual({
      kind: 'several',
      memberIds: [enrico.id, nadja.id],
    });
    expect(yearDayAbsence('2027-01-06', all)).toEqual({ kind: 'one', memberId: nadja.id });
    expect(yearDayAbsence('2027-08-15', all)).toEqual({ kind: 'household' });
    expect(yearDayAbsence('2027-02-01', all)).toEqual({ kind: 'none' });
  });

  it('AC-015: the list of the year, earliest first', () => {
    const stripes = absenceStripes([summer, nadjaMallorca, enricoMallorca], members);
    expect(stripesOfYear(stripes, 2027).map((stripe) => stripe.key)).toEqual(
      stripes.map((stripe) => stripe.key),
    );
    expect(stripesOfYear(stripes, 2027).map((stripe) => stripe.from)).toEqual([
      '2027-01-01',
      '2027-01-01',
      '2027-08-09',
    ]);
  });

  it('AC-016: an absence over the turn of the year is in both lists; 2028 has none', () => {
    const stripes = absenceStripes(
      [absence({ id: 'h', from: '2026-12-28', to: '2027-01-03' })],
      members,
    );
    expect(stripesOfYear(stripes, 2026)).toHaveLength(1);
    expect(stripesOfYear(stripes, 2027)).toHaveLength(1);
    expect(stripesOfYear(stripes, 2028)).toEqual([]);
  });
});

describe('page "Abwesenheiten"', () => {
  it('AC-037: running and future ones earliest first, past ones newest first', () => {
    const today = '2026-11-20';
    const stripes = absenceStripes(
      [
        absence({ id: 'u', from: '2026-12-28', to: '2027-01-03', note: 'Urlaub' }),
        absence({
          id: 'd',
          memberId: nadja.id,
          from: '2026-11-16',
          to: '2026-11-24',
          note: 'Dienstreise Hamburg',
        }),
        absence({ id: 'f', memberId: enrico.id, from: '2026-11-02', to: '2026-11-06' }),
        absence({ id: 'o', memberId: enrico.id, from: '2026-10-01', to: '2026-10-02' }),
      ],
      members,
    );
    const { upcoming, past } = splitUpcomingPast(stripes, today);
    expect(upcoming.map((stripe) => stripe.absenceIds[0])).toEqual(['d', 'u']);
    expect(past.map((stripe) => stripe.absenceIds[0])).toEqual(['f', 'o']);
  });
});

describe('writing absences (D23)', () => {
  const draft = { from: '2027-01-01', to: '2027-01-04', note: 'Urlaub Mallorca' };

  it('AC-033: all members chosen is one absence of the whole household', () => {
    const plan = planAbsenceWrite({
      existing: [],
      memberIds: [enrico.id, nadja.id],
      allMemberIds: [enrico.id, nadja.id],
      ...draft,
    });
    expect(plan.removeIds).toEqual([]);
    expect(plan.update).toEqual([]);
    expect(plan.create).toEqual([{ memberId: undefined, ...draft }]);
  });

  it('AC-034: some members chosen is one absence per person with the same dates', () => {
    const plan = planAbsenceWrite({
      existing: [],
      memberIds: [enrico.id, nadja.id],
      allMemberIds: wg.map((member) => member.id),
      ...draft,
      to: '2027-01-07',
    });
    expect(plan.create.map((row) => row.memberId)).toEqual([enrico.id, nadja.id]);
    expect(plan.create.every((row) => row.to === '2027-01-07')).toBe(true);
  });

  it('AC-036: editing keeps the rows of the stripe and changes their dates', () => {
    const existing = [
      absence({ ...enricoMallorca, to: '2027-01-07' }),
      absence({ ...nadjaMallorca }),
    ];
    const allMemberIds = wg.map((member) => member.id);
    const later = planAbsenceWrite({
      existing,
      memberIds: [enrico.id, nadja.id],
      allMemberIds,
      ...draft,
      to: '2027-01-05',
    });
    expect(later.create).toEqual([]);
    expect(later.removeIds).toEqual([]);
    expect(later.update.map((row) => [row.id, row.to])).toEqual([
      ['a-e', '2027-01-05'],
      ['a-n', '2027-01-05'],
    ]);

    const withoutNadja = planAbsenceWrite({
      existing,
      memberIds: [enrico.id],
      allMemberIds,
      ...draft,
    });
    expect(withoutNadja.removeIds).toEqual(['a-n']);
    expect(withoutNadja.update.map((row) => row.id)).toEqual(['a-e']);

    const everyone = planAbsenceWrite({
      existing: [existing[0] as Absence],
      memberIds: allMemberIds,
      allMemberIds,
      ...draft,
    });
    expect(everyone.removeIds).toEqual(['a-e']);
    expect(everyone.create).toEqual([{ memberId: undefined, ...draft }]);
  });

  it('turns a household absence back into single people', () => {
    const plan = planAbsenceWrite({
      existing: [absence({ id: 'h', ...draft })],
      memberIds: [nadja.id],
      allMemberIds: [enrico.id, nadja.id],
      ...draft,
    });
    expect(plan.removeIds).toEqual(['h']);
    expect(plan.create.map((row) => row.memberId)).toEqual([nadja.id]);
  });

  it('AC-035, AC-044: "Bis" before "Von" and nobody chosen are invalid; one day is fine', () => {
    expect(
      validateAbsenceDraft({ memberIds: [enrico.id], from: '2027-01-04', to: '2027-01-01' }),
    ).toEqual({ toBeforeFrom: true, noOne: false });
    expect(validateAbsenceDraft({ memberIds: [], from: '2027-01-01', to: '2027-01-01' })).toEqual({
      toBeforeFrom: false,
      noOne: true,
    });
    expect(
      validateAbsenceDraft({ memberIds: [enrico.id], from: '2027-01-01', to: '2027-01-01' }),
    ).toEqual({ toBeforeFrom: false, noOne: false });
  });
});

describe('choosing the period in the month calendar (REQ-010)', () => {
  const start: RangePick = { from: '2026-11-20', to: '2026-11-20', editing: null };

  it('AC-042: "Von", then the next tap is "Bis", then the calendar closes', () => {
    const fromOpen = openRangeField(start, 'from');
    expect(fromOpen.editing).toBe('from');
    const afterFrom = pickRangeDate(fromOpen, '2026-12-28');
    expect(afterFrom).toEqual({ from: '2026-12-28', to: '2026-11-20', editing: 'to' });
    const afterTo = pickRangeDate(afterFrom, '2027-01-03');
    expect(afterTo).toEqual({ from: '2026-12-28', to: '2027-01-03', editing: null });
  });

  it('AC-042: the range is marked across months and years', () => {
    expect(inRange('2026-12-31', '2026-12-28', '2027-01-03')).toBe(true);
    expect(inRange('2027-01-03', '2026-12-28', '2027-01-03')).toBe(true);
    expect(inRange('2027-01-04', '2026-12-28', '2027-01-03')).toBe(false);
    expect(inRange('2027-01-02', '2027-01-04', '2027-01-01')).toBe(false);
  });

  it('AC-043, AC-044: a tap on "Bis" changes only "Bis", also before "Von"', () => {
    const toOpen = openRangeField({ from: '2027-01-04', to: '2027-01-04', editing: null }, 'to');
    expect(pickRangeDate(toOpen, '2027-01-01')).toEqual({
      from: '2027-01-04',
      to: '2027-01-01',
      editing: null,
    });
  });

  it('ignores a tap while the calendar is closed', () => {
    expect(pickRangeDate(start, '2027-01-01')).toBe(start);
  });
});
