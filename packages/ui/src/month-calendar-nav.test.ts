import { describe, expect, it } from 'vitest';

import {
  monthCalendarFocusDay,
  monthCalendarKey,
  monthCalendarWeeks,
  monthOf,
  shiftMonth,
} from './month-calendar-nav';

const none = () => false;
/** AC-021: "Reste von Lasagne" on 27.11.2026, so 27.11. and every later day are blocked. */
const beforeLeftovers = (date: string) => date >= '2026-11-27';
const weekend = (date: string) => {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return weekday === 0 || weekday === 6;
};

describe('monthCalendarKey', () => {
  it('AC-021: arrows skip the blocked days and Enter picks the 26th', () => {
    expect(monthCalendarKey('ArrowRight', '2026-11-25', beforeLeftovers)).toEqual({
      focus: '2026-11-26',
    });
    expect(monthCalendarKey('ArrowRight', '2026-11-26', beforeLeftovers)).toEqual({
      focus: '2026-11-26',
    });
    expect(monthCalendarKey('ArrowDown', '2026-11-25', beforeLeftovers)).toEqual({
      focus: '2026-11-25',
    });
    expect(monthCalendarKey('PageDown', '2026-11-25', beforeLeftovers)).toEqual({
      focus: '2026-11-25',
    });
    expect(monthCalendarKey('Enter', '2026-11-26', beforeLeftovers)).toEqual({
      select: '2026-11-26',
    });
  });

  it('AC-021: Enter on a blocked day selects nothing', () => {
    expect(monthCalendarKey('Enter', '2026-11-27', beforeLeftovers)).toBeUndefined();
  });

  it('left and right move a day, also across months and years', () => {
    expect(monthCalendarKey('ArrowLeft', '2026-11-25', none)).toEqual({ focus: '2026-11-24' });
    expect(monthCalendarKey('ArrowRight', '2026-11-30', none)).toEqual({ focus: '2026-12-01' });
    expect(monthCalendarKey('ArrowRight', '2026-12-31', none)).toEqual({ focus: '2027-01-01' });
    expect(monthCalendarKey('ArrowLeft', '2027-03-01', none)).toEqual({ focus: '2027-02-28' });
  });

  it('up and down move a week and skip blocked weeks', () => {
    expect(monthCalendarKey('ArrowDown', '2026-11-25', none)).toEqual({ focus: '2026-12-02' });
    expect(monthCalendarKey('ArrowUp', '2026-11-25', none)).toEqual({ focus: '2026-11-18' });
    const blocked18th = (date: string) => date === '2026-11-18';
    expect(monthCalendarKey('ArrowUp', '2026-11-25', blocked18th)).toEqual({
      focus: '2026-11-11',
    });
  });

  it('left and right skip blocked days in between', () => {
    expect(monthCalendarKey('ArrowLeft', '2026-11-23', weekend)).toEqual({ focus: '2026-11-20' });
    expect(monthCalendarKey('ArrowRight', '2026-11-20', weekend)).toEqual({
      focus: '2026-11-23',
    });
  });

  it('PageUp and PageDown move a month and keep the day where the month allows', () => {
    expect(monthCalendarKey('PageDown', '2026-11-25', none)).toEqual({ focus: '2026-12-25' });
    expect(monthCalendarKey('PageUp', '2026-11-25', none)).toEqual({ focus: '2026-10-25' });
    expect(monthCalendarKey('PageDown', '2027-01-31', none)).toEqual({ focus: '2027-02-28' });
    expect(monthCalendarKey('PageUp', '2028-03-31', none)).toEqual({ focus: '2028-02-29' });
    expect(monthCalendarKey('PageDown', '2026-12-15', none)).toEqual({ focus: '2027-01-15' });
  });

  it('a month key on a blocked day moves to the nearest free day of that month', () => {
    // Leftovers of a dish on 25.11. may go up to 2.12.
    const leftoverWindow = (date: string) => date < '2026-11-25' || date > '2026-12-02';
    expect(monthCalendarKey('PageDown', '2026-11-26', leftoverWindow)).toEqual({
      focus: '2026-12-02',
    });
    // 19.12.2026 is a Saturday; Friday the 18th is nearer than Monday the 21st.
    expect(monthCalendarKey('PageDown', '2026-11-19', weekend)).toEqual({ focus: '2026-12-18' });
  });

  it('of two equally near free days the one in the direction of travel wins', () => {
    const blocked15th = (date: string) => date.endsWith('-15');
    expect(monthCalendarKey('PageDown', '2026-11-14', blocked15th)).toEqual({
      focus: '2026-12-14',
    });
    expect(monthCalendarKey('PageDown', '2026-10-15', blocked15th)).toEqual({
      focus: '2026-11-16',
    });
    expect(monthCalendarKey('PageUp', '2026-12-15', blocked15th)).toEqual({
      focus: '2026-11-14',
    });
  });

  it('stays put when every day is blocked', () => {
    const all = () => true;
    expect(monthCalendarKey('ArrowRight', '2026-11-25', all)).toEqual({ focus: '2026-11-25' });
    expect(monthCalendarKey('PageUp', '2026-11-25', all)).toEqual({ focus: '2026-11-25' });
  });

  it('other keys are not the calendar’s', () => {
    expect(monthCalendarKey('Tab', '2026-11-25', none)).toBeUndefined();
    expect(monthCalendarKey('a', '2026-11-25', none)).toBeUndefined();
  });
});

describe('monthCalendarWeeks', () => {
  it('AC-019: November 2026 runs Monday to Sunday, days of other months are empty', () => {
    const weeks = monthCalendarWeeks('2026-11-01');
    expect(weeks).toHaveLength(6);
    // 1.11.2026 is a Sunday, 30.11. a Monday.
    expect(weeks[0]).toEqual([null, null, null, null, null, null, '2026-11-01']);
    expect(weeks[4]).toEqual([
      '2026-11-23',
      '2026-11-24',
      '2026-11-25',
      '2026-11-26',
      '2026-11-27',
      '2026-11-28',
      '2026-11-29',
    ]);
    expect(weeks[5]).toEqual(['2026-11-30', null, null, null, null, null, null]);
  });

  it('a February that starts on Monday fills exactly four weeks', () => {
    const weeks = monthCalendarWeeks('2027-02-14');
    expect(weeks).toHaveLength(4);
    expect(weeks[0]?.[0]).toBe('2027-02-01');
    expect(weeks[3]?.[6]).toBe('2027-02-28');
  });
});

describe('paging and the month of a day', () => {
  it('AC-019: › pages from November 2026 to January 2027 without a limit', () => {
    expect(shiftMonth('2026-11-01', 1)).toBe('2026-12-01');
    expect(shiftMonth('2026-12-01', 1)).toBe('2027-01-01');
    expect(shiftMonth('2027-01-01', -13)).toBe('2025-12-01');
    expect(shiftMonth('2026-11-25', 120)).toBe('2036-11-01');
  });

  it('a day belongs to the first of its month', () => {
    expect(monthOf('2026-11-25')).toBe('2026-11-01');
    expect(monthOf('2027-01-01')).toBe('2027-01-01');
  });
});

describe('monthCalendarFocusDay', () => {
  it('AC-019: Tab enters on the marked day when it is in the shown month', () => {
    expect(monthCalendarFocusDay('2026-11-01', '2026-11-25', '2026-11-22', none)).toBe(
      '2026-11-25',
    );
  });

  it('else on today, else on the first free day of the month', () => {
    expect(monthCalendarFocusDay('2026-11-01', '2027-01-08', '2026-11-22', none)).toBe(
      '2026-11-22',
    );
    expect(monthCalendarFocusDay('2027-01-01', undefined, '2026-11-22', none)).toBe('2027-01-01');
    expect(monthCalendarFocusDay('2026-11-01', undefined, undefined, weekend)).toBe('2026-11-02');
  });

  it('AC-021: a blocked marked day or today is never the entry point', () => {
    expect(monthCalendarFocusDay('2026-11-01', '2026-11-27', '2026-11-28', beforeLeftovers)).toBe(
      '2026-11-01',
    );
  });

  it('a month with no free day has no entry point', () => {
    expect(monthCalendarFocusDay('2026-12-01', undefined, undefined, beforeLeftovers)).toBeNull();
  });
});
