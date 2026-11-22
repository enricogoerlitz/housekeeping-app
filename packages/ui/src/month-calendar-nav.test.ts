import { describe, expect, it } from 'vitest';

import { monthCalendarKey } from './month-calendar-nav';

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
