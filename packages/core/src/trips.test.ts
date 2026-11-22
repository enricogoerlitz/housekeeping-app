import { describe, expect, it } from 'vitest';

import { enrico, nadja, trip, vera } from './test-fixtures';
import {
  inRange,
  isOnTrip,
  openRangeField,
  pickRangeDate,
  splitUpcomingPast,
  stripeLabelDate,
  stripeSegment,
  stripesOfYear,
  stripeText,
  tripEndLabel,
  tripStripes,
  tripWhoHint,
  validateTripDraft,
  yearDayTrip,
  type RangePick,
} from './trips';

const members = [enrico, nadja];
const wg = [enrico, nadja, vera];

const enricoMallorca = trip('t-e', [enrico.id], '2027-01-01', '2027-01-04', 'Urlaub Mallorca');
const nadjaMallorca = trip('t-n', [nadja.id], '2027-01-01', '2027-01-07', 'Urlaub Mallorca');

describe('trip stripes (spec 0022, REQ-015)', () => {
  it('AC-028 (0010): different trips are two stripes with their own end', () => {
    const stripes = tripStripes([nadjaMallorca, enricoMallorca], members);
    expect(stripes.map((stripe) => stripe.memberIds)).toEqual([[enrico.id], [nadja.id]]);
    expect(stripes.map(stripeText)).toEqual(['Urlaub Mallorca', 'Urlaub Mallorca']);
    expect(stripes.map((stripe) => tripEndLabel(stripe.to))).toEqual([
      'bis Mo 4.1.',
      'bis Do 7.1.',
    ]);
    expect(stripes.every((stripe) => !stripe.household)).toBe(true);
  });

  it('AC-009: one trip of Enrico and Vera is exactly one stripe with both, in household order', () => {
    const stripes = tripStripes(
      [trip('t', [vera.id, enrico.id], '2027-01-01', '2027-01-04', 'Urlaub')],
      wg,
    );
    expect(stripes).toHaveLength(1);
    expect(stripes[0]).toMatchObject({
      tripId: 't',
      memberIds: [enrico.id, vera.id],
      household: false,
    });
  });

  it('AC-001: every member on the trip is "Ganzer Haushalt"', () => {
    const [stripe] = tripStripes(
      [trip('t', [nadja.id, enrico.id], '2027-01-01', '2027-01-04')],
      members,
    );
    expect(stripe).toMatchObject({ household: true, memberIds: [enrico.id, nadja.id] });
  });

  it('AC-045: after Vera joined, the trip of Enrico and Nadja is no longer the whole household', () => {
    const mallorca = trip(
      't',
      [enrico.id, nadja.id],
      '2026-12-04',
      '2026-12-10',
      'Urlaub Mallorca',
    );
    expect(tripStripes([mallorca], wg)[0]).toMatchObject({
      household: false,
      memberIds: [enrico.id, nadja.id],
    });
    expect(isOnTrip(vera.id, '2026-12-05', [mallorca])).toBe(false);
    expect(isOnTrip(enrico.id, '2026-12-05', [mallorca])).toBe(true);
    expect(isOnTrip(enrico.id, '2026-12-11', [mallorca])).toBe(false);
  });

  it('AC-003: without a note the stripe says "unterwegs"', () => {
    const [stripe] = tripStripes(
      [trip('t', [enrico.id], '2027-01-01', '2027-01-04', '  ')],
      members,
    );
    expect(stripe && stripeText(stripe)).toBe('unterwegs');
    expect(tripEndLabel('2027-01-01')).toBe('bis Fr 1.1.');
  });

  it('AC-028 (0010): in KW 53 both stripes run from Friday to Sunday and over the edge', () => {
    const [e, n] = tripStripes([enricoMallorca, nadjaMallorca], members);
    expect(e && stripeSegment(e, '2026-12-28', '2027-01-03')).toEqual({
      start: 4,
      end: 6,
      continuesBefore: false,
      continuesAfter: true,
    });
    expect(e && stripeSegment(e, '2027-01-04', '2027-01-10')).toEqual({
      start: 0,
      end: 0,
      continuesBefore: true,
      continuesAfter: false,
    });
    expect(n && stripeSegment(n, '2027-01-04', '2027-01-10')?.end).toBe(3);
    expect(e && stripeSegment(e, '2027-01-11', '2027-01-17')).toBeUndefined();
  });

  it('AC-031 (0010): on phones the label stands on the first day, again on the first day of the week', () => {
    const [e] = tripStripes([enricoMallorca], members);
    expect(e && stripeLabelDate(e, '2026-12-28')).toBe('2027-01-01');
    expect(e && stripeLabelDate(e, '2027-01-04')).toBe('2027-01-04');
  });
});

describe('trips in the year', () => {
  const summer = trip('h', [enrico.id, nadja.id], '2027-08-09', '2027-08-23', 'Sommerurlaub');

  it('AC-015 (0010): lines for several people, a tint for one, neutral for the household', () => {
    const stripes = tripStripes([enricoMallorca, nadjaMallorca, summer], members);
    expect(yearDayTrip('2027-01-02', stripes)).toEqual({
      kind: 'several',
      memberIds: [enrico.id, nadja.id],
    });
    expect(yearDayTrip('2027-01-06', stripes)).toEqual({ kind: 'one', memberId: nadja.id });
    expect(yearDayTrip('2027-08-15', stripes)).toEqual({ kind: 'household' });
    expect(yearDayTrip('2027-02-01', stripes)).toEqual({ kind: 'none' });
  });

  it('AC-015 (0010): the list of the year, earliest first', () => {
    const stripes = tripStripes([summer, nadjaMallorca, enricoMallorca], members);
    expect(stripesOfYear(stripes, 2027).map((stripe) => stripe.from)).toEqual([
      '2027-01-01',
      '2027-01-01',
      '2027-08-09',
    ]);
  });

  it('AC-016 (0010): a trip over the turn of the year is in both lists; 2028 has none', () => {
    const stripes = tripStripes([trip('h', [enrico.id], '2026-12-28', '2027-01-03')], members);
    expect(stripesOfYear(stripes, 2026)).toHaveLength(1);
    expect(stripesOfYear(stripes, 2027)).toHaveLength(1);
    expect(stripesOfYear(stripes, 2028)).toEqual([]);
  });
});

describe('page "Reisen"', () => {
  it('AC-019: running and future ones earliest first, past ones newest first', () => {
    const stripes = tripStripes(
      [
        trip('u', [enrico.id, nadja.id], '2026-12-04', '2026-12-10', 'Urlaub Mallorca'),
        trip('d', [enrico.id], '2026-11-30', '2026-12-02', 'Dienstreise Hamburg'),
        trip('f', [enrico.id], '2026-11-02', '2026-11-06'),
        trip('o', [enrico.id], '2026-10-01', '2026-10-02'),
      ],
      members,
    );
    const { upcoming, past } = splitUpcomingPast(stripes, '2026-11-22');
    expect(upcoming.map((stripe) => stripe.tripId)).toEqual(['d', 'u']);
    expect(past.map((stripe) => stripe.tripId)).toEqual(['f', 'o']);
  });
});

describe('the trip draft', () => {
  it('AC-010: "Bis" before "Von" and nobody chosen are invalid; one day is fine', () => {
    expect(
      validateTripDraft({ memberIds: [enrico.id], from: '2027-01-04', to: '2027-01-01' }),
    ).toEqual({
      toBeforeFrom: true,
      noOne: false,
    });
    expect(validateTripDraft({ memberIds: [], from: '2027-01-01', to: '2027-01-01' })).toEqual({
      toBeforeFrom: false,
      noOne: true,
    });
    expect(
      validateTripDraft({ memberIds: [enrico.id], from: '2027-01-01', to: '2027-01-01' }),
    ).toEqual({
      toBeforeFrom: false,
      noOne: false,
    });
  });
});

describe('choosing the period in the month calendar (spec 0010, REQ-010)', () => {
  const start: RangePick = { from: '2026-11-20', to: '2026-11-20', editing: null };

  it('AC-042 (0010): "Von", then the next tap is "Bis", then the calendar closes', () => {
    const fromOpen = openRangeField(start, 'from');
    expect(fromOpen.editing).toBe('from');
    const afterFrom = pickRangeDate(fromOpen, '2026-12-28');
    expect(afterFrom).toEqual({ from: '2026-12-28', to: '2026-11-20', editing: 'to' });
    const afterTo = pickRangeDate(afterFrom, '2027-01-03');
    expect(afterTo).toEqual({ from: '2026-12-28', to: '2027-01-03', editing: null });
  });

  it('AC-042 (0010): the range is marked across months and years', () => {
    expect(inRange('2026-12-31', '2026-12-28', '2027-01-03')).toBe(true);
    expect(inRange('2027-01-03', '2026-12-28', '2027-01-03')).toBe(true);
    expect(inRange('2027-01-04', '2026-12-28', '2027-01-03')).toBe(false);
    expect(inRange('2027-01-02', '2027-01-04', '2027-01-01')).toBe(false);
  });

  it('AC-043, AC-044 (0010): a tap on "Bis" changes only "Bis", also before "Von"', () => {
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

describe('the hint under "Wer?"', () => {
  it('AC-021 (0018): only Enrico chosen says "Nur Enrico", Enrico and Nadja "Ganzer Haushalt"', () => {
    expect(tripWhoHint([enrico.id], members)).toBe('Nur Enrico');
    expect(tripWhoHint([nadja.id, enrico.id], members)).toBe('Ganzer Haushalt');
  });

  it('AC-009: several but not all are named in household order', () => {
    expect(tripWhoHint([vera.id, enrico.id], wg)).toBe('Nur Enrico und Vera');
    expect(tripWhoHint([nadja.id], wg)).toBe('Nur Nadja');
    expect(tripWhoHint([vera.id, nadja.id, enrico.id], wg)).toBe('Ganzer Haushalt');
  });

  it('AC-010: nobody chosen asks who is travelling', () => {
    expect(tripWhoHint([], members)).toBe('Wähle, wer unterwegs ist');
  });
});
