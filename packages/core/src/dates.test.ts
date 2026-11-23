import { describe, expect, it } from 'vitest';

import {
  addDays,
  addMonths,
  createdTime,
  dayInMonth,
  daysBetween,
  formatLongDate,
  formatShortDate,
  isoWeekNumber,
  isoWeekday,
  parseISODate,
  relativeDayLabel,
  startOfWeek,
  toISODate,
  weekDates,
  weekdayShort,
  weekdayShortName,
  weekdayHeads,
} from './dates';

describe('date helpers', () => {
  it('converts between ISO dates and local dates without a UTC shift', () => {
    expect(toISODate(new Date(2026, 10, 20, 0, 5))).toBe('2026-11-20');
    expect(toISODate(new Date(2026, 10, 20, 23, 55))).toBe('2026-11-20');
    expect(parseISODate('2026-11-20').getHours()).toBe(12);
    expect(toISODate(parseISODate('2026-03-05'))).toBe('2026-03-05');
  });

  it('adds days across month, year and daylight-saving boundaries', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('clamps the day to the length of the target month', () => {
    expect(dayInMonth('2026-01-15', 1, 31)).toBe('2026-02-28');
    expect(dayInMonth('2028-01-15', 1, 31)).toBe('2028-02-29');
    expect(dayInMonth('2026-12-15', 1, 1)).toBe('2027-01-01');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-01-31', 2)).toBe('2026-03-31');
    expect(addMonths('2026-11-20', -12)).toBe('2025-11-20');
  });

  it('counts whole days, also across daylight-saving changes', () => {
    expect(daysBetween('2026-11-20', '2026-11-27')).toBe(7);
    expect(daysBetween('2026-11-27', '2026-11-20')).toBe(-7);
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
  });

  it('uses ISO weekdays with Monday = 1 and Sunday = 7', () => {
    expect(isoWeekday('2026-11-16')).toBe(1);
    expect(isoWeekday('2026-11-20')).toBe(5);
    expect(isoWeekday('2026-11-22')).toBe(7);
    expect(weekdayShort('2026-11-20')).toBe('Fr');
    expect(weekdayShortName(7)).toBe('So');
    expect(weekdayShortName(0)).toBe('');
    expect(weekdayShortName(8)).toBe('');
  });

  it('finds the Monday and the seven dates of a week', () => {
    expect(startOfWeek('2026-11-20')).toBe('2026-11-16');
    expect(startOfWeek('2026-11-22')).toBe('2026-11-16');
    expect(startOfWeek('2026-11-16')).toBe('2026-11-16');
    expect(weekDates('2026-11-20')).toEqual([
      '2026-11-16',
      '2026-11-17',
      '2026-11-18',
      '2026-11-19',
      '2026-11-20',
      '2026-11-21',
      '2026-11-22',
    ]);
  });

  it('computes ISO week numbers, including weeks belonging to the neighbouring year', () => {
    expect(isoWeekNumber('2026-11-20')).toBe(47);
    expect(isoWeekNumber('2026-01-01')).toBe(1);
    expect(isoWeekNumber('2027-01-01')).toBe(53);
    expect(isoWeekNumber('2024-12-30')).toBe(1);
  });

  it('formats long and short German dates', () => {
    expect(formatLongDate('2026-11-20')).toBe('Freitag, 20. November');
    expect(formatShortDate('2026-11-20')).toBe('20.11.');
    expect(formatShortDate('2026-03-05')).toBe('5.3.');
  });

  it('names nearby days relatively and others by weekday and date', () => {
    const today = '2026-11-20';
    expect(relativeDayLabel('2026-11-20', today)).toBe('heute');
    expect(relativeDayLabel('2026-11-21', today)).toBe('morgen');
    expect(relativeDayLabel('2026-11-19', today)).toBe('gestern');
    expect(relativeDayLabel('2026-11-17', today)).toBe('vor 3 Tagen');
    expect(relativeDayLabel('2026-11-26', today)).toBe('in 6 Tagen');
    expect(relativeDayLabel('2026-11-27', today)).toBe('Fr 27.11.');
    expect(relativeDayLabel('2026-11-08', today)).toBe('So 8.11.');
  });
});

describe('createdTime', () => {
  it('sorts by the creation timestamp; an unparsable one counts as the oldest', () => {
    expect(createdTime({ createdAt: '2026-11-20T10:00:00.000Z' })).toBe(
      Date.parse('2026-11-20T10:00:00.000Z'),
    );
    expect(createdTime({ createdAt: 'kaputt' })).toBe(0);
  });
});

describe('spec 0030, REQ-001: the weekday heads of the month', () => {
  it('AC-004: written out on the desktop, short elsewhere', () => {
    expect(weekdayHeads(true)).toEqual([
      'Montag',
      'Dienstag',
      'Mittwoch',
      'Donnerstag',
      'Freitag',
      'Samstag',
      'Sonntag',
    ]);
    expect(weekdayHeads(false)).toEqual(['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']);
  });
});
