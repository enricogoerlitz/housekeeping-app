import { describe, expect, it } from 'vitest';

import {
  offersReminder,
  REMINDER_OFF_DRAFT,
  reminderDayChoices,
  reminderDraftFrom,
  reminderReachHint,
  reminderSave,
  switchedOnDraft,
} from './reminder-form';

// The spec's default situation: Wednesday, 25.11.2026, 12:00 in Europe/Berlin (UTC+1).
const BERLIN = 'Europe/Berlin';
const NOW = new Date('2026-11-25T11:00:00Z');
const TODAY = '2026-11-25';
const SATURDAY = '2026-11-28';

const at = (input: {
  stored?: Parameters<typeof reminderSave>[0]['stored'];
  draft: Parameters<typeof reminderSave>[0]['draft'];
  entryDate?: string;
}) =>
  reminderSave({
    entryDate: input.entryDate ?? SATURDAY,
    stored: input.stored,
    draft: input.draft,
    now: NOW,
    timeZone: BERLIN,
  });

describe('offersReminder', () => {
  it('AC-001, AC-005: an entry on a day from today on offers "Erinnern"', () => {
    expect(offersReminder(SATURDAY, TODAY)).toBe(true);
    expect(offersReminder(TODAY, TODAY)).toBe(true);
  });

  it('AC-003, AC-007: neither "vorgemerkt" nor a past day offers it', () => {
    expect(offersReminder(null, TODAY)).toBe(false);
    expect(offersReminder('2026-11-23', TODAY)).toBe(false);
  });
});

describe('reminderDraftFrom and switchedOnDraft', () => {
  it('AC-001: without a reminder the switch is off and the fields are empty', () => {
    expect(reminderDraftFrom(undefined)).toEqual(REMINDER_OFF_DRAFT);
    expect(REMINDER_OFF_DRAFT).toEqual({ on: false, offsetDays: 0, time: '', text: '' });
  });

  it('AC-005: a stored reminder shows as typed values ("18:00", its text)', () => {
    expect(reminderDraftFrom({ offsetDays: 1, at: '18:00', text: 'Fleisch auftauen' })).toEqual({
      on: true,
      offsetDays: 1,
      time: '18:00',
      text: 'Fleisch auftauen',
    });
    expect(reminderDraftFrom({ offsetDays: 0, at: '08:00' })).toEqual({
      on: true,
      offsetDays: 0,
      time: '8:00',
      text: '',
    });
  });

  it('AC-002, AC-006: switching on gives "Am Tag", the default time of the Tageszeit and no text', () => {
    expect(switchedOnDraft(SATURDAY, 'Abend', NOW, BERLIN)).toEqual({
      on: true,
      offsetDays: 0,
      time: '17:00',
      text: '',
    });
  });

  it('REQ-003: a default already in the past leaves the time empty', () => {
    expect(switchedOnDraft(TODAY, 'Mittag', NOW, BERLIN)).toEqual({
      on: true,
      offsetDays: 0,
      time: '',
      text: '',
    });
  });
});

describe('reminderSave', () => {
  it('AC-001: off without a stored reminder keeps nothing and sends nothing', () => {
    expect(at({ draft: REMINDER_OFF_DRAFT })).toEqual({ action: 'keep' });
  });

  it('AC-006: off with a stored reminder clears it', () => {
    expect(at({ stored: { offsetDays: 1, at: '18:00' }, draft: REMINDER_OFF_DRAFT })).toEqual({
      action: 'clear',
    });
  });

  it('AC-002, AC-009: on sets day, time and text (text trimmed, empty is none)', () => {
    expect(at({ draft: { on: true, offsetDays: 0, time: '17:00', text: '' } })).toEqual({
      action: 'set',
      reminder: { offsetDays: 0, at: '17:00' },
    });
    expect(
      at({ draft: { on: true, offsetDays: 1, time: '18', text: '  Fleisch auftauen ' } }),
    ).toEqual({
      action: 'set',
      reminder: { offsetDays: 1, at: '18:00', text: 'Fleisch auftauen' },
    });
  });

  it('REQ-002: nothing changed keeps the stored reminder', () => {
    expect(
      at({
        stored: { offsetDays: 1, at: '18:00', text: 'Käse kaufen' },
        draft: { on: true, offsetDays: 1, time: '18:00', text: 'Käse kaufen ' },
      }),
    ).toEqual({ action: 'keep' });
  });

  it('AC-014: only the text changed sets it', () => {
    expect(
      at({
        stored: { offsetDays: 1, at: '18:00' },
        draft: { on: true, offsetDays: 1, time: '18:00', text: 'Fleisch auftauen' },
      }),
    ).toEqual({
      action: 'set',
      reminder: { offsetDays: 1, at: '18:00', text: 'Fleisch auftauen' },
    });
  });

  it('AC-011: a moment in the past is refused under the time', () => {
    expect(
      at({ entryDate: TODAY, draft: { on: true, offsetDays: 0, time: '11:00', text: '' } }),
    ).toEqual({ action: 'invalid', field: 'time', error: 'Liegt in der Vergangenheit' });
  });

  it('AC-011: a text alone may change once the stored moment has passed, as on the server', () => {
    expect(
      at({
        entryDate: TODAY,
        stored: { offsetDays: 0, at: '11:00' },
        draft: { on: true, offsetDays: 0, time: '11:00', text: 'Reis' },
      }),
    ).toEqual({ action: 'set', reminder: { offsetDays: 0, at: '11:00', text: 'Reis' } });
  });

  it('AC-012: a time outside 5-minute steps shows the time field’s message', () => {
    expect(at({ draft: { on: true, offsetDays: 0, time: '17:03', text: '' } })).toEqual({
      action: 'invalid',
      field: 'time',
      error: 'Bitte in 5-Minuten-Schritten',
    });
  });

  it('REQ-003: on without a time asks for one', () => {
    expect(at({ draft: { on: true, offsetDays: 0, time: '', text: '' } })).toEqual({
      action: 'invalid',
      field: 'time',
      error: 'Bitte eine Uhrzeit eingeben',
    });
  });

  it('AC-015: a line break in the text is refused under the text', () => {
    expect(at({ draft: { on: true, offsetDays: 0, time: '17:00', text: 'Käse\nkaufen' } })).toEqual(
      { action: 'invalid', field: 'text', error: 'Ohne Zeilenumbrüche' },
    );
  });
});

describe('reminderDayChoices', () => {
  it('AC-002: "Am Tag", "Am Vortag" and "Anderes Datum …", all selectable for Saturday', () => {
    expect(reminderDayChoices(SATURDAY, 0, TODAY)).toEqual([
      { key: 'sameDay', label: 'Am Tag', selected: true, disabled: false },
      { key: 'dayBefore', label: 'Am Vortag', selected: false, disabled: false },
      { key: 'otherDate', label: 'Anderes Datum …', selected: false, disabled: false },
    ]);
  });

  it('AC-010: a day chosen in the calendar shows as its date', () => {
    expect(reminderDayChoices(SATURDAY, 2, TODAY)[2]).toEqual({
      key: 'otherDate',
      label: 'Do 26.11.',
      selected: true,
      disabled: false,
    });
  });

  it('REQ-003: for an entry today "Am Vortag" lies in the past and is greyed out', () => {
    expect(reminderDayChoices(TODAY, 0, TODAY)[1]).toEqual({
      key: 'dayBefore',
      label: 'Am Vortag',
      selected: false,
      disabled: true,
    });
  });
});

describe('reminderReachHint', () => {
  it('REQ-007: nothing to say when the kind is on and this device is registered', () => {
    expect(reminderReachHint({ kindEnabled: true, deviceRegistered: true })).toBeUndefined();
  });

  it('AC-026: this device shows no notifications', () => {
    expect(reminderReachHint({ kindEnabled: true, deviceRegistered: false })).toBe(
      'Auf diesem Gerät kommen keine Benachrichtigungen an',
    );
  });

  it('REQ-007: the kind switched off for me comes first', () => {
    expect(reminderReachHint({ kindEnabled: false, deviceRegistered: false })).toBe(
      'Erinnerungen an Einträgen sind bei dir aus',
    );
    expect(reminderReachHint({ kindEnabled: false, deviceRegistered: true })).toBe(
      'Erinnerungen an Einträgen sind bei dir aus',
    );
  });
});
