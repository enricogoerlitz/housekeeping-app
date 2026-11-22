import { describe, expect, it } from 'vitest';

import { slotStartTime } from './prep';
import {
  cleanReminderText,
  dayChipFor,
  EntryReminderSchema,
  householdClock,
  initialReminder,
  isReminderPast,
  offsetFor,
  planEntryTitle,
  reminderAccessibilityLabel,
  reminderDay,
  reminderDayChips,
  reminderLabel,
  reminderMessage,
  reminderTextCounter,
  selectableReminderDays,
  validateReminder,
} from './reminder';
import { makeRecipe } from './test-fixtures';
import type { MealPlanEntry } from './types';

// The spec's default situation: Wednesday, 25.11.2026, 12:00 in Europe/Berlin (UTC+1).
const BERLIN = 'Europe/Berlin';
const NOW = new Date('2026-11-25T11:00:00Z');
const SATURDAY = '2026-11-28';

function entry(partial: Partial<MealPlanEntry> & Pick<MealPlanEntry, 'id'>): MealPlanEntry {
  return {
    date: SATURDAY,
    slotId: 'slot-abend',
    kind: 'recipe',
    eaterIds: [],
    guests: 0,
    portions: 2,
    variants: [],
    sort: 0,
    ...partial,
  };
}

describe('householdClock', () => {
  it('REQ-003: reads the wall clock of the household, not of the device', () => {
    expect(householdClock(NOW, BERLIN)).toEqual({ date: '2026-11-25', time: '12:00:00' });
    expect(householdClock(NOW, 'America/New_York')).toEqual({
      date: '2026-11-25',
      time: '06:00:00',
    });
    expect(householdClock(new Date('2026-11-24T23:30:00Z'), BERLIN)).toEqual({
      date: '2026-11-25',
      time: '00:30:00',
    });
  });

  it('REQ-003: follows daylight saving time (28.3.2027, Berlin moves to UTC+2)', () => {
    expect(householdClock(new Date('2027-03-28T00:59:00Z'), BERLIN).time).toBe('01:59:00');
    expect(householdClock(new Date('2027-03-28T01:00:00Z'), BERLIN).time).toBe('03:00:00');
  });

  it('throws on a time zone the platform does not know', () => {
    expect(() => householdClock(NOW, 'Mars/Olympus')).toThrow();
  });
});

describe('slotStartTime as the reminder default', () => {
  it('AC-002: evening starts at 17:00', () => {
    expect(slotStartTime('Abend')).toBe('17:00');
  });

  it('REQ-003, Offene Frage 6: by name — Vormittag 08:00, Mittag 11:00, otherwise 08:00', () => {
    expect(slotStartTime('Vormittag')).toBe('08:00');
    expect(slotStartTime('Mittag')).toBe('11:00');
    expect(slotStartTime('Frühstück')).toBe('08:00');
    expect(slotStartTime('Nachmittag')).toBe('08:00');
    expect(slotStartTime(' Abend ')).toBe('17:00');
  });
});

describe('initialReminder', () => {
  it('AC-002: switching on chooses "Am Tag" and the time of the Tageszeit', () => {
    expect(initialReminder(SATURDAY, 'Abend', NOW, BERLIN)).toEqual({ offsetDays: 0, at: '17:00' });
  });

  it('REQ-003: a default that already lies in the past leaves the time empty', () => {
    expect(initialReminder('2026-11-25', 'Mittag', NOW, BERLIN)).toEqual({
      offsetDays: 0,
      at: undefined,
    });
    expect(initialReminder('2026-11-25', 'Abend', NOW, BERLIN)).toEqual({
      offsetDays: 0,
      at: '17:00',
    });
  });
});

describe('reminderDay and offsetFor', () => {
  it('REQ-003: the offset counts days before the entry', () => {
    expect(reminderDay(SATURDAY, 0)).toBe(SATURDAY);
    expect(reminderDay(SATURDAY, 1)).toBe('2026-11-27');
    expect(reminderDay(SATURDAY, 2)).toBe('2026-11-26');
    expect(offsetFor(SATURDAY, '2026-11-26')).toBe(2);
    expect(offsetFor(SATURDAY, SATURDAY)).toBe(0);
  });

  it('AC-021: moving the entry keeps the offset, so the reminder moves along', () => {
    expect(reminderDay('2026-11-29', 1)).toBe(SATURDAY);
  });

  it('counts across the change to summer time', () => {
    expect(offsetFor('2027-03-29', '2027-03-27')).toBe(2);
    expect(reminderDay('2027-03-29', 2)).toBe('2027-03-27');
  });
});

describe('dayChipFor and reminderDayChips', () => {
  it('AC-002: the three chips, "Am Tag" chosen', () => {
    expect(reminderDayChips(SATURDAY, 0)).toEqual([
      { key: 'sameDay', label: 'Am Tag', selected: true },
      { key: 'dayBefore', label: 'Am Vortag', selected: false },
      { key: 'otherDate', label: 'Anderes Datum …', selected: false },
    ]);
  });

  it('AC-010: another date shows on its chip, "Do 26.11."', () => {
    expect(dayChipFor(SATURDAY, 2)).toEqual({ key: 'otherDate', label: 'Do 26.11.' });
    expect(reminderDayChips(SATURDAY, 2)[2]).toEqual({
      key: 'otherDate',
      label: 'Do 26.11.',
      selected: true,
    });
  });

  it('REQ-003: choosing the entry day or the day before picks "Am Tag" or "Am Vortag"', () => {
    expect(dayChipFor(SATURDAY, offsetFor(SATURDAY, SATURDAY))).toEqual({
      key: 'sameDay',
      label: 'Am Tag',
    });
    expect(dayChipFor(SATURDAY, offsetFor(SATURDAY, '2026-11-27'))).toEqual({
      key: 'dayBefore',
      label: 'Am Vortag',
    });
  });

  it('REQ-003: without a reminder no chip is chosen', () => {
    expect(reminderDayChips(SATURDAY, undefined).map((chip) => chip.selected)).toEqual([
      false,
      false,
      false,
    ]);
  });
});

describe('selectableReminderDays', () => {
  it('AC-010: from today to the day of the entry, 25. to 28.11.', () => {
    expect(selectableReminderDays(SATURDAY, '2026-11-25')).toEqual({
      from: '2026-11-25',
      to: SATURDAY,
    });
  });

  it('Offene Frage 7: at most 366 days before the entry', () => {
    expect(selectableReminderDays('2028-01-10', '2026-11-25')).toEqual({
      from: '2027-01-09',
      to: '2028-01-10',
    });
  });

  it('AC-007: an entry on a past day offers no day', () => {
    expect(selectableReminderDays('2026-11-23', '2026-11-25')).toBeUndefined();
  });

  it('REQ-003: an entry today offers only today', () => {
    expect(selectableReminderDays('2026-11-25', '2026-11-25')).toEqual({
      from: '2026-11-25',
      to: '2026-11-25',
    });
  });
});

describe('validateReminder', () => {
  const base = { entryDate: SATURDAY, offsetDays: 0, now: NOW, timeZone: BERLIN };

  it('AC-009: the day before at 18:00 is saved', () => {
    expect(validateReminder({ ...base, offsetDays: 1, time: '18:00' })).toEqual({
      ok: true,
      reminder: { offsetDays: 1, at: '18:00' },
    });
  });

  it('AC-011: a moment in the past is refused with "Liegt in der Vergangenheit"', () => {
    const curry = { ...base, entryDate: '2026-11-25' };
    expect(validateReminder({ ...curry, time: '11:00' })).toEqual({
      ok: false,
      field: 'time',
      error: 'Liegt in der Vergangenheit',
    });
    expect(validateReminder({ ...curry, time: '16:00' })).toEqual({
      ok: true,
      reminder: { offsetDays: 0, at: '16:00' },
    });
  });

  it('REQ-003: the current minute is not in the future any more', () => {
    const curry = { ...base, entryDate: '2026-11-25' };
    expect(validateReminder({ ...curry, time: '12:00' }).ok).toBe(false);
    expect(validateReminder({ ...curry, time: '12:05' }).ok).toBe(true);
    const later = new Date('2026-11-25T11:00:01Z');
    expect(validateReminder({ ...curry, now: later, time: '12:00' }).ok).toBe(false);
  });

  it('REQ-003: the past is judged in the household time zone', () => {
    // 12:00 in Berlin is 06:00 in New York: 11:00 there still lies ahead.
    const curry = { ...base, entryDate: '2026-11-25', time: '11:00' };
    expect(validateReminder({ ...curry, timeZone: 'America/New_York' }).ok).toBe(true);
  });

  it('AC-012: a time outside the choices of the time field is no valid time (spec 0027)', () => {
    for (const time of ['17:03', '1730', '25:00']) {
      expect(validateReminder({ ...base, time }), time).toEqual({
        ok: false,
        field: 'time',
        error: 'Keine gültige Uhrzeit',
      });
    }
  });

  it('REQ-003: the time is required', () => {
    expect(validateReminder({ ...base, time: undefined })).toEqual({
      ok: false,
      field: 'time',
      error: 'Bitte eine Uhrzeit wählen',
    });
  });

  it('AC-013: never after the day of the entry, never more than 366 days before', () => {
    expect(validateReminder({ ...base, offsetDays: -1, time: '17:00' })).toMatchObject({
      ok: false,
      field: 'day',
    });
    expect(
      validateReminder({ ...base, entryDate: '2028-01-10', offsetDays: 367, time: '17:00' }),
    ).toMatchObject({ ok: false, field: 'day' });
    expect(
      validateReminder({ ...base, entryDate: '2028-01-10', offsetDays: 366, time: '17:00' }).ok,
    ).toBe(true);
    expect(validateReminder({ ...base, offsetDays: 1.5, time: '17:00' })).toMatchObject({
      ok: false,
      field: 'day',
    });
  });

  it('AC-013: a reminder day before today is in the past', () => {
    expect(validateReminder({ ...base, offsetDays: 4, time: '17:00' })).toEqual({
      ok: false,
      field: 'time',
      error: 'Liegt in der Vergangenheit',
    });
  });
});

describe('isReminderPast', () => {
  it('AC-022: after moving to tonight, the day before lies in the past', () => {
    expect(isReminderPast('2026-11-25', { offsetDays: 1, at: '18:00' }, NOW, BERLIN)).toBe(true);
    expect(isReminderPast(SATURDAY, { offsetDays: 1, at: '18:00' }, NOW, BERLIN)).toBe(false);
  });
});

describe('reminderLabel', () => {
  it('AC-002: "Erinnerung Sa 17:00"', () => {
    expect(reminderLabel(SATURDAY, { offsetDays: 0, at: '17:00' }, NOW, BERLIN)).toBe(
      'Erinnerung Sa 17:00',
    );
  });

  it('AC-005, AC-009: the day before at 18:00 is "Erinnerung Fr 18:00"', () => {
    expect(reminderLabel(SATURDAY, { offsetDays: 1, at: '18:00' }, NOW, BERLIN)).toBe(
      'Erinnerung Fr 18:00',
    );
  });

  it('AC-010: "Erinnerung Do 09:00"', () => {
    expect(reminderLabel(SATURDAY, { offsetDays: 2, at: '09:00' }, NOW, BERLIN)).toBe(
      'Erinnerung Do 09:00',
    );
  });

  it('AC-021: after moving to Sunday the label names Saturday', () => {
    expect(reminderLabel('2026-11-29', { offsetDays: 1, at: '18:00' }, NOW, BERLIN)).toBe(
      'Erinnerung Sa 18:00',
    );
  });

  it('REQ-002: more than six days before the entry, with the date', () => {
    expect(reminderLabel('2026-11-27', { offsetDays: 7, at: '18:00' }, NOW, BERLIN)).toBe(
      'Erinnerung vorbei',
    );
    const earlier = new Date('2026-11-18T11:00:00Z');
    expect(reminderLabel('2026-11-27', { offsetDays: 7, at: '18:00' }, earlier, BERLIN)).toBe(
      'Erinnerung Fr 20.11. 18:00',
    );
    expect(reminderLabel('2026-11-26', { offsetDays: 6, at: '18:00' }, earlier, BERLIN)).toBe(
      'Erinnerung Fr 18:00',
    );
  });

  it('AC-022: a reminder that has passed shows "Erinnerung vorbei"', () => {
    expect(reminderLabel('2026-11-25', { offsetDays: 1, at: '18:00' }, NOW, BERLIN)).toBe(
      'Erinnerung vorbei',
    );
  });
});

describe('reminderAccessibilityLabel', () => {
  it('Plattformen: "Lasagne, Erinnerung Freitag 18 Uhr"', () => {
    expect(
      reminderAccessibilityLabel('Lasagne', SATURDAY, { offsetDays: 1, at: '18:00' }, NOW, BERLIN),
    ).toBe('Lasagne, Erinnerung Freitag 18 Uhr');
  });

  it('Plattformen: minutes are spoken after "Uhr", the date when far ahead', () => {
    const earlier = new Date('2026-11-18T11:00:00Z');
    expect(
      reminderAccessibilityLabel(
        'Lasagne',
        '2026-11-27',
        { offsetDays: 7, at: '09:30' },
        earlier,
        BERLIN,
      ),
    ).toBe('Lasagne, Erinnerung Freitag, 20. November, 9 Uhr 30');
  });

  it('Plattformen: "Erinnerung vorbei" once passed', () => {
    expect(
      reminderAccessibilityLabel(
        'Lasagne',
        '2026-11-25',
        { offsetDays: 1, at: '18:00' },
        NOW,
        BERLIN,
      ),
    ).toBe('Lasagne, Erinnerung vorbei');
  });
});

describe('cleanReminderText and reminderTextCounter', () => {
  it('REQ-004: trims the edges; empty means no text', () => {
    expect(cleanReminderText('  Fleisch auftauen ')).toEqual({
      ok: true,
      text: 'Fleisch auftauen',
    });
    expect(cleanReminderText('   ')).toEqual({ ok: true, text: undefined });
  });

  it('AC-015: 81 characters are refused, 80 are fine', () => {
    expect(cleanReminderText('a'.repeat(80))).toEqual({ ok: true, text: 'a'.repeat(80) });
    expect(cleanReminderText('a'.repeat(81))).toEqual({
      ok: false,
      error: 'Höchstens 80 Zeichen',
    });
  });

  it('AC-015: counts characters like the database, not UTF-16 units', () => {
    expect(cleanReminderText('🧀'.repeat(80)).ok).toBe(true);
    expect(reminderTextCounter('🧀🧀')).toBe('2/80');
  });

  it('AC-015: line breaks and other control characters are refused', () => {
    for (const text of [
      'Fleisch\nauftauen',
      'Fleisch\tauftauen',
      'a\u0000b',
      'a\u007fb',
      'a\u0085b',
      'Fleisch \u202Eauftauen',
      'Fleisch\u200Bauftauen',
      'a\u2028b',
      'a\u00adb',
      'a\ufeffb',
    ]) {
      expect(cleanReminderText(text)).toEqual({ ok: false, error: 'Ohne Zeilenumbrüche' });
    }
  });

  it('AC-015: the counter shows "80/80" and "0/80"', () => {
    expect(reminderTextCounter('a'.repeat(80))).toBe('80/80');
    expect(reminderTextCounter('')).toBe('0/80');
    expect(reminderTextCounter('Fleisch auftauen')).toBe('16/80');
  });
});

describe('EntryReminderSchema', () => {
  it('REQ-003, REQ-004: accepts what the database accepts', () => {
    expect(EntryReminderSchema.safeParse({ offsetDays: 1, at: '18:00' }).success).toBe(true);
    expect(
      EntryReminderSchema.safeParse({ offsetDays: 366, at: '18:00', text: 'Käse kaufen' }).success,
    ).toBe(true);
  });

  it('AC-013, AC-015: refuses what the database refuses', () => {
    for (const value of [
      { offsetDays: -1, at: '18:00' },
      { offsetDays: 367, at: '18:00' },
      { offsetDays: 1, at: '17:03' },
      { offsetDays: 1, at: '18:00', text: '' },
      { offsetDays: 1, at: '18:00', text: ' Käse' },
      { offsetDays: 1, at: '18:00', text: 'a'.repeat(81) },
      { offsetDays: 1, at: '18:00', text: 'a\nb' },
    ]) {
      expect(EntryReminderSchema.safeParse(value).success).toBe(false);
    }
  });
});

describe('planEntryTitle', () => {
  const lasagne = makeRecipe({ id: 'r-lasagne', title: 'Lasagne' });
  const recipesById = { [lasagne.id]: lasagne };

  it('REQ-004: a recipe is named by its title', () => {
    expect(planEntryTitle(entry({ id: 'e', recipeId: lasagne.id }), recipesById, [])).toBe(
      'Lasagne',
    );
    expect(planEntryTitle(entry({ id: 'e', recipeId: 'gone' }), recipesById, [])).toBe('Rezept');
  });

  it('REQ-004: free text is named by its text', () => {
    expect(planEntryTitle(entry({ id: 'e', kind: 'text', text: 'Pizza' }), {}, [])).toBe('Pizza');
    expect(planEntryTitle(entry({ id: 'e', kind: 'text' }), {}, [])).toBe('');
  });

  it('REQ-004: leftovers name the weekday of their source', () => {
    const source = entry({ id: 'src', date: '2026-11-26', recipeId: lasagne.id });
    const rest = entry({ id: 'e', kind: 'leftovers', leftoversOfEntryId: 'src' });
    expect(planEntryTitle(rest, recipesById, [source, rest])).toBe('Reste von Donnerstag');
    expect(planEntryTitle(rest, recipesById, [rest])).toBe('Reste');
    const planless = entry({ id: 'src', date: null });
    expect(planEntryTitle(rest, recipesById, [planless])).toBe('Reste');
  });

  it('REQ-004: a restaurant by its name, then the text', () => {
    const visit = entry({ id: 'e', kind: 'restaurant', restaurantId: 'rest-1', text: 'Alt' });
    expect(planEntryTitle(visit, {}, [], { 'rest-1': { name: 'Mama Lu' } })).toBe('Mama Lu');
    expect(planEntryTitle(visit, {}, [])).toBe('Alt');
    expect(planEntryTitle(entry({ id: 'e', kind: 'restaurant' }), {}, [])).toBe('Restaurant');
  });

  it('REQ-004: an activity with its Zusatz, "Eislaufen (Hohenschönhausen)"', () => {
    const skating = entry({
      id: 'e',
      kind: 'activity',
      activityId: 'act-1',
      note: 'Hohenschönhausen',
    });
    expect(planEntryTitle(skating, {}, [], {}, { 'act-1': { name: 'Eislaufen' } })).toBe(
      'Eislaufen (Hohenschönhausen)',
    );
    expect(planEntryTitle(entry({ id: 'e', kind: 'activity', text: 'Zoo' }), {}, [])).toBe('Zoo');
    expect(planEntryTitle(entry({ id: 'e', kind: 'activity', note: '  ' }), {}, [])).toBe(
      'Aktivität',
    );
  });

  it('falls back to the text for a kind this version does not know', () => {
    const future = {
      ...entry({ id: 'e', text: 'Neu' }),
      kind: 'party',
    } as unknown as MealPlanEntry;
    expect(planEntryTitle(future, {}, [])).toBe('Neu');
  });
});

describe('reminderMessage', () => {
  const lasagne = { title: 'Lasagne', entryDate: SATURDAY, slotName: 'Abend' };

  it('AC-016: on the day, "Erinnerung: Lasagne · heute Abend"', () => {
    expect(reminderMessage({ ...lasagne, offsetDays: 0 })).toBe(
      'Erinnerung: Lasagne · heute Abend',
    );
  });

  it('AC-014: the day before with text, "… · morgen Abend · Fleisch auftauen"', () => {
    expect(reminderMessage({ ...lasagne, offsetDays: 1, text: 'Fleisch auftauen' })).toBe(
      'Erinnerung: Lasagne · morgen Abend · Fleisch auftauen',
    );
  });

  it('REQ-005: further ahead with weekday and date, "Sa 28.11., Abend"', () => {
    expect(reminderMessage({ ...lasagne, offsetDays: 2 })).toBe(
      'Erinnerung: Lasagne · Sa 28.11., Abend',
    );
    expect(reminderMessage({ ...lasagne, entryDate: '2027-03-05', offsetDays: 3 })).toBe(
      'Erinnerung: Lasagne · Fr 5.3., Abend',
    );
  });

  it('AC-019: "Erinnerung: Lasagne · morgen Mittag"', () => {
    expect(
      reminderMessage({
        title: 'Lasagne',
        entryDate: '2026-11-29',
        slotName: 'Mittag',
        offsetDays: 1,
      }),
    ).toBe('Erinnerung: Lasagne · morgen Mittag');
  });

  it('REQ-004: an activity is named with its Zusatz', () => {
    expect(
      reminderMessage({
        title: 'Eislaufen (Hohenschönhausen)',
        entryDate: '2026-11-29',
        slotName: 'Vormittag',
        offsetDays: 0,
      }),
    ).toBe('Erinnerung: Eislaufen (Hohenschönhausen) · heute Vormittag');
  });

  it('REQ-005: without a (known) Tageszeit it is left out, like the scheduler', () => {
    const noSlot = { ...lasagne, slotName: '' };
    expect(reminderMessage({ ...noSlot, offsetDays: 0 })).toBe('Erinnerung: Lasagne · heute');
    expect(reminderMessage({ ...noSlot, offsetDays: 1, text: 'Käse' })).toBe(
      'Erinnerung: Lasagne · morgen · Käse',
    );
    expect(reminderMessage({ ...noSlot, offsetDays: 2 })).toBe('Erinnerung: Lasagne · Sa 28.11.');
  });

  it('REQ-005: a very long name is shortened with "…" to at most 400 characters', () => {
    const long = 'L'.repeat(500);
    const message = reminderMessage({ ...lasagne, title: long, offsetDays: 1, text: 'Käse' });
    expect([...message]).toHaveLength(400);
    expect(message.endsWith('L… · morgen Abend · Käse')).toBe(true);
    expect(message.startsWith('Erinnerung: LLL')).toBe(true);
  });

  it('REQ-005: a name that fits exactly is not shortened', () => {
    const suffix = ' · heute Abend';
    const fits = 'N'.repeat(400 - 'Erinnerung: '.length - suffix.length);
    expect(reminderMessage({ ...lasagne, title: fits, offsetDays: 0 })).toBe(
      `Erinnerung: ${fits}${suffix}`,
    );
  });

  it('REQ-005: shortening counts characters, not UTF-16 units', () => {
    const message = reminderMessage({ ...lasagne, title: '🍝'.repeat(500), offsetDays: 0 });
    expect([...message]).toHaveLength(400);
  });
});
