import { describe, expect, it } from 'vitest';

import { formatStars, isHalfStar, memberRatingRows, ratedOnOrAfter } from './ratings';
import { enrico, nadja, vera } from './test-fixtures';

describe('ratings in half steps (REQ-004)', () => {
  it('AC-017/AC-026: accepts 0.5 … 5 in half steps only', () => {
    for (const stars of [0.5, 1, 3.5, 4, 4.5, 5]) expect(isHalfStar(stars)).toBe(true);
    for (const stars of [0, 4.3, 4.25, 5.5, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(isHalfStar(stars)).toBe(false);
    }
  });

  it('AC-017/AC-025: writes "4,5" and whole values without a decimal', () => {
    expect(formatStars(4.5)).toBe('4,5');
    expect(formatStars(0.5)).toBe('0,5');
    expect(formatStars(4)).toBe('4');
  });

  it('AC-020: rated on the day of the entry or later counts, earlier does not', () => {
    expect(ratedOnOrAfter('2026-11-21T18:30:00', '2026-11-21')).toBe(true);
    expect(ratedOnOrAfter('2026-11-23T08:00:00', '2026-11-21')).toBe(true);
    expect(ratedOnOrAfter('2026-10-01T12:00:00', '2026-11-21')).toBe(false);
    expect(ratedOnOrAfter(undefined, '2026-11-21')).toBe(false);
    expect(ratedOnOrAfter('kaputt', '2026-11-21')).toBe(false);
  });
});

describe('ratings of all members on the recipe page (spec 0008, REQ-011)', () => {
  it('AC-040: "Du" first and settable, the others by name for display only', () => {
    expect(memberRatingRows({ [nadja.id]: 5 }, [nadja, enrico], enrico.id)).toEqual([
      { memberId: enrico.id, label: 'Du', stars: undefined, editable: true },
      { memberId: nadja.id, label: 'Nadja', stars: 5, editable: false },
    ]);
  });

  it('AC-040: ratings of former members are not shown; members keep their order', () => {
    const rows = memberRatingRows(
      { [enrico.id]: 4.5, 'm-former': 1, [vera.id]: 3 },
      [vera, enrico, nadja],
      enrico.id,
    );
    expect(rows.map((row) => [row.label, row.stars])).toEqual([
      ['Du', 4.5],
      ['Vera', 3],
      ['Nadja', undefined],
    ]);
  });

  it('AC-040: without own membership there is still the own row first', () => {
    expect(memberRatingRows({}, [nadja], enrico.id).map((row) => row.label)).toEqual([
      'Du',
      'Nadja',
    ]);
  });
});
