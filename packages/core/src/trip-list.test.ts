import { describe, expect, it } from 'vitest';

import { enrico, nadja, trip } from './test-fixtures';
import {
  parseTripPeriod,
  tripDateTile,
  tripListSections,
  tripPeriodOptions,
  tripRowDetail,
} from './trip-list';
import { tripStripes } from './trips';

const members = [enrico, nadja];
const today = '2026-11-23';
const mallorca = trip('mallorca', [enrico.id, nadja.id], '2026-12-12', '2026-12-19', 'Mallorca');
const hamburg = trip('hamburg', [enrico.id], '2027-01-04', '2027-01-06', 'Hamburg');
const berlin = trip('berlin', [nadja.id], '2026-10-01', '2026-10-03', 'Berlin');
const silvester = trip('silvester', [nadja.id], '2026-12-28', '2027-01-04', 'Silvester');
const stripes = tripStripes([hamburg, berlin, mallorca], members);

const titles = (sections: ReturnType<typeof tripListSections>) =>
  sections.map((section) => ({
    title: section.title,
    months: section.months.map((month) => [
      month.title,
      ...month.stripes.map((stripe) => stripe.note),
    ]),
  }));

describe('"Reisen" by month (spec 0030, REQ-003)', () => {
  it('AC-007: "Kommend" with its months first, then "Vergangen"', () => {
    expect(titles(tripListSections(stripes, today, undefined))).toEqual([
      {
        title: 'Kommend',
        months: [
          ['Dezember 2026', 'Mallorca'],
          ['Januar 2027', 'Hamburg'],
        ],
      },
      { title: 'Vergangen', months: [['Oktober 2026', 'Berlin']] },
    ]);
  });

  it('AC-007: past months newest first, a running trip is upcoming', () => {
    const running = trip('jetzt', [enrico.id], '2026-11-20', '2026-11-25', 'Jetzt');
    const old = trip('alt', [enrico.id], '2026-03-01', '2026-03-02', 'Alt');
    const sections = tripListSections(
      tripStripes([berlin, old, running], members),
      today,
      undefined,
    );
    expect(titles(sections)).toEqual([
      { title: 'Kommend', months: [['November 2026', 'Jetzt']] },
      {
        title: 'Vergangen',
        months: [
          ['Oktober 2026', 'Berlin'],
          ['März 2026', 'Alt'],
        ],
      },
    ]);
  });

  it('AC-008: a month or a year filters by the start', () => {
    expect(titles(tripListSections(stripes, today, '2026-12'))).toEqual([
      { title: 'Kommend', months: [['Dezember 2026', 'Mallorca']] },
    ]);
    expect(titles(tripListSections(stripes, today, '2026'))).toEqual([
      { title: 'Kommend', months: [['Dezember 2026', 'Mallorca']] },
      { title: 'Vergangen', months: [['Oktober 2026', 'Berlin']] },
    ]);
  });

  it('AC-009: a trip across the turn of the year belongs to the month it starts', () => {
    const all = tripStripes([silvester], members);
    expect(titles(tripListSections(all, today, undefined))).toEqual([
      { title: 'Kommend', months: [['Dezember 2026', 'Silvester']] },
    ]);
    expect(tripListSections(all, today, '2027-01')).toEqual([]);
    expect(tripListSections(all, today, '2027')).toEqual([]);
    expect(tripPeriodOptions(all).map((option) => option.value)).toEqual([
      undefined,
      '2026',
      '2026-12',
    ]);
  });

  it('AC-008: the options are "Alle Zeiträume", then each year with its months, newest first', () => {
    expect(tripPeriodOptions(stripes)).toEqual([
      { value: undefined, label: 'Alle Zeiträume', depth: 0 },
      { value: '2027', label: '2027', depth: 0 },
      { value: '2027-01', label: 'Januar 2027', depth: 1 },
      { value: '2026', label: '2026', depth: 0 },
      { value: '2026-12', label: 'Dezember 2026', depth: 1 },
      { value: '2026-10', label: 'Oktober 2026', depth: 1 },
    ]);
  });

  it('AC-010: an unknown or invalid period', () => {
    expect(tripListSections(stripes, today, '2030')).toEqual([]);
    expect(parseTripPeriod('2026')).toBe('2026');
    expect(parseTripPeriod('2026-12')).toBe('2026-12');
    expect(parseTripPeriod('abc')).toBeUndefined();
    expect(parseTripPeriod('2026-13')).toBeUndefined();
    expect(parseTripPeriod(undefined)).toBeUndefined();
  });

  it('AC-011: the date tile and the detail line of a row', () => {
    expect(tripDateTile('2026-12-12')).toEqual({ weekday: 'SA', day: '12' });
    const [stripe] = tripStripes([mallorca], members);
    expect(stripe && tripRowDetail(stripe, 'Ganzer Haushalt')).toBe(
      '12.–19. Dez · 8 Tage · Ganzer Haushalt',
    );
    const [one] = tripStripes([trip('x', [enrico.id], '2026-12-12', '2026-12-12')], members);
    expect(one && tripRowDetail(one, 'Enrico')).toBe('12. Dez · 1 Tag · Enrico');
  });
});
