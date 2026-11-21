import { describe, expect, it } from 'vitest';

import { switchRowParts, timeFieldA11yValue, timeFieldShowsClear } from './time-field-state';

// The words a feature passes in; ui holds no copy of its own.
const EMPTY = 'keine Uhrzeit';

describe('TimeField (spec 0013, Decision 27)', () => {
  it('AC-022: a screen reader hears the time, "19:00"', () => {
    expect(timeFieldA11yValue('19:00', EMPTY)).toBe('19:00');
    expect(timeFieldA11yValue(' 7.30 ', EMPTY)).toBe('7.30');
  });

  it('AC-025: an empty field is announced as "keine Uhrzeit"', () => {
    expect(timeFieldA11yValue('', EMPTY)).toBe('keine Uhrzeit');
    expect(timeFieldA11yValue('   ', EMPTY)).toBe('keine Uhrzeit');
  });

  it('AC-025: ✕ shows only with a time and while the field can be edited', () => {
    expect(timeFieldShowsClear('19:00', true)).toBe(true);
    expect(timeFieldShowsClear('', true)).toBe(false);
    expect(timeFieldShowsClear(' ', true)).toBe(false);
    expect(timeFieldShowsClear('19:00', false)).toBe(false);
  });
});

describe('SwitchRow with details (spec 0013, Decision 25)', () => {
  it('AC-011: the switch and "›" are two buttons with names of their own', () => {
    expect(
      switchRowParts({
        label: 'Tagesüberblick',
        description: '7:30 · Essen · Aktivitäten · Aufgaben · Vorbereitung',
        detailLabel: 'Tagesüberblick einstellen',
        hasDetail: true,
      }),
    ).toEqual({
      switchLabel: 'Tagesüberblick',
      detailLabel:
        'Tagesüberblick einstellen, 7:30 · Essen · Aktivitäten · Aufgaben · Vorbereitung',
    });
  });

  it('a detail without a description reads only its own name', () => {
    expect(
      switchRowParts({
        label: 'Aktivitäten am Vortag',
        detailLabel: 'Uhrzeit ändern',
        hasDetail: true,
      }),
    ).toEqual({ switchLabel: 'Aktivitäten am Vortag', detailLabel: 'Uhrzeit ändern' });
  });

  it('without onDetail the row stays one switch, as before', () => {
    expect(
      switchRowParts({
        label: 'Aufgaben mit Uhrzeit',
        description: 'zur Uhrzeit',
        hasDetail: false,
      }),
    ).toEqual({ switchLabel: 'Aufgaben mit Uhrzeit', detailLabel: undefined });
  });
});
