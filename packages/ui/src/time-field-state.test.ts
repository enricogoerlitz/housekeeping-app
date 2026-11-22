import { describe, expect, it } from 'vitest';

import {
  hourOptions,
  minuteOptions,
  switchRowParts,
  timeFieldParts,
  timeFieldShowsClear,
  timeSelectLabel,
  timeWithHour,
  timeWithMinute,
} from './time-field-state';

describe('TimeField: hour and minute (spec 0027, REQ-007)', () => {
  it('AC-029: "Stunde" offers exactly 0–23, "Minute" exactly the twelve five-minute steps', () => {
    expect(hourOptions(false).map((option) => option.label)).toEqual(
      Array.from({ length: 24 }, (_, hour) => String(hour)),
    );
    expect(minuteOptions(false).map((option) => option.label)).toEqual([
      '00',
      '05',
      '10',
      '15',
      '20',
      '25',
      '30',
      '35',
      '40',
      '45',
      '50',
      '55',
    ]);
  });

  it('AC-029: 7:30 shows "7" and "30"; choosing 6 and 45 gives 06:45', () => {
    expect(timeFieldParts('07:30')).toEqual({ hour: '07', minute: '30' });
    const hour = timeWithHour('07:30', '06');
    expect(hour).toBe('06:30');
    expect(timeWithMinute(hour, '45')).toBe('06:45');
    const label = (value: string) =>
      hourOptions(false).find((option) => option.value === value)?.label;
    expect(label('07')).toBe('7');
  });

  it('AC-030: without a time both show "–" and choosing 19 gives 19:00', () => {
    expect(timeFieldParts(undefined)).toEqual({ hour: '', minute: '' });
    expect(hourOptions(true)[0]).toEqual({ value: '', label: '–' });
    expect(minuteOptions(true)[0]).toEqual({ value: '', label: '–' });
    expect(timeWithHour(undefined, '19')).toBe('19:00');
  });

  it('AC-030: "–" as hour removes the time; a minute without an hour changes nothing', () => {
    expect(timeWithHour('19:30', '')).toBeUndefined();
    expect(timeWithMinute(undefined, '30')).toBeUndefined();
    expect(timeWithMinute('19:00', '')).toBe('19:00');
  });

  it('AC-030: ✕ shows only for an optional time that is set and can be edited', () => {
    expect(timeFieldShowsClear({ value: '19:00', optional: true, editable: true })).toBe(true);
    expect(timeFieldShowsClear({ value: undefined, optional: true, editable: true })).toBe(false);
    expect(timeFieldShowsClear({ value: '19:00', optional: false, editable: true })).toBe(false);
    expect(timeFieldShowsClear({ value: '19:00', optional: true, editable: false })).toBe(false);
  });

  it('AC-031: a screen reader hears "Uhrzeit, Stunde" as the name of the hour', () => {
    expect(timeSelectLabel('Uhrzeit', 'Stunde')).toBe('Uhrzeit, Stunde');
    expect(timeSelectLabel('Uhrzeit', 'Minute')).toBe('Uhrzeit, Minute');
  });

  it('a time outside the choices is never offered, the field keeps the stored value', () => {
    expect(timeFieldParts('nonsense')).toEqual({ hour: '', minute: '' });
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
