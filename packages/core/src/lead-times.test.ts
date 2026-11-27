import { describe, expect, it } from 'vitest';

import {
  CHORE_NOTICE_OPTIONS,
  choreNoticeLabel,
  MAX_CHORE_NOTICE_DAYS,
  MAX_SERIES_REMINDER_DAYS,
  offersChoreNotice,
  SERIES_REMINDER_DAY_OPTIONS,
  SeriesReminderSchema,
  seriesReminderDraft,
  seriesReminderSave,
} from './lead-times';

// Spec 0059, REQ-003 and REQ-004: the choices and checks of "Erinnern" at a series and of
// "Vorwarnung" at a chore, as the database checks them.

describe('Erinnern an Serien (REQ-003)', () => {
  it('AC-015: the chips and the defaults when switched on', () => {
    expect(SERIES_REMINDER_DAY_OPTIONS.map((option) => option.label)).toEqual([
      'Am Tag',
      '1 Tag vorher',
      '3 Tage vorher',
      '1 Woche vorher',
    ]);
    expect(seriesReminderDraft(undefined)).toEqual({
      on: false,
      offsetDays: 1,
      at: '18:00',
      text: '',
    });
    expect(seriesReminderDraft({ offsetDays: 7, at: '09:30', text: 'Geschenk' })).toEqual({
      on: true,
      offsetDays: 7,
      at: '09:30',
      text: 'Geschenk',
    });
  });

  it('AC-015: what is saved: nothing when off, the trimmed text or none', () => {
    expect(seriesReminderSave({ on: false, offsetDays: 7, at: '18:00', text: 'x' })).toEqual({
      ok: true,
      reminder: undefined,
    });
    expect(
      seriesReminderSave({ on: true, offsetDays: 7, at: '18:00', text: '  Geschenk besorgen ' }),
    ).toEqual({ ok: true, reminder: { offsetDays: 7, at: '18:00', text: 'Geschenk besorgen' } });
    expect(seriesReminderSave({ on: true, offsetDays: 0, at: '08:00', text: '  ' })).toEqual({
      ok: true,
      reminder: { offsetDays: 0, at: '08:00' },
    });
  });

  it('AC-016: 81 characters or a control character give the hint of the field', () => {
    expect(
      seriesReminderSave({ on: true, offsetDays: 1, at: '18:00', text: 'x'.repeat(81) }),
    ).toEqual({ ok: false, error: 'Höchstens 80 Zeichen' });
    const zeroWidth = String.fromCodePoint(0x200b);
    expect(
      seriesReminderSave({ on: true, offsetDays: 1, at: '18:00', text: `a${zeroWidth}b` }),
    ).toEqual({ ok: false, error: 'Ohne Zeilenumbrüche' });
  });

  it('AC-017: the schema refuses a Vorlauf beyond 30 days or off the five-minute grid', () => {
    expect(MAX_SERIES_REMINDER_DAYS).toBe(30);
    expect(SeriesReminderSchema.safeParse({ offsetDays: 30, at: '18:00' }).success).toBe(true);
    expect(SeriesReminderSchema.safeParse({ offsetDays: 31, at: '18:00' }).success).toBe(false);
    expect(SeriesReminderSchema.safeParse({ offsetDays: -1, at: '18:00' }).success).toBe(false);
    expect(SeriesReminderSchema.safeParse({ offsetDays: 1, at: '18:02' }).success).toBe(false);
  });
});

describe('Vorwarnung an Aufgaben (REQ-004)', () => {
  it('AC-018: the chips', () => {
    expect(CHORE_NOTICE_OPTIONS.map((option) => [option.value, option.label])).toEqual([
      [0, 'Keine'],
      [3, '3 Tage'],
      [7, '1 Woche'],
      [14, '2 Wochen'],
      [30, '1 Monat'],
    ]);
    expect(MAX_CHORE_NOTICE_DAYS).toBe(60);
  });

  it('AC-023: only for a rhythm with a fixed Termin', () => {
    expect(offersChoreNotice('once')).toBe(true);
    expect(offersChoreNotice('weekly')).toBe(true);
    expect(offersChoreNotice('monthly')).toBe(true);
    expect(offersChoreNotice('months')).toBe(true);
    expect(offersChoreNotice('flexible')).toBe(false);
    expect(offersChoreNotice('asNeeded')).toBe(false);
  });

  it('the line in the chore: "Vorwarnung 1 Woche vorher"', () => {
    expect(choreNoticeLabel(7)).toBe('Vorwarnung 1 Woche vorher');
    expect(choreNoticeLabel(10)).toBe('Vorwarnung 10 Tage vorher');
    expect(choreNoticeLabel(1)).toBe('Vorwarnung 1 Tag vorher');
    expect(choreNoticeLabel(undefined)).toBeUndefined();
  });
});
