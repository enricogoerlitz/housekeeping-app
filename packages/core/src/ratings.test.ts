import { describe, expect, it } from 'vitest';

import { formatStars, isHalfStar, ratedOnOrAfter } from './ratings';

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
