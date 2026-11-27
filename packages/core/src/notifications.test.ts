import { describe, expect, it } from 'vitest';

import {
  choreRemindHint,
  formatTime,
  notificationTargetHref,
  remindAtDueTimeFor,
  withTime,
} from './notifications';

const CHORE = '8f0c2d6e-3b6a-4f3e-9a51-1b2c3d4e5f60';
const ENTRY = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';

describe('times in five-minute steps', () => {
  it('shows times as "H:MM"', () => {
    expect(formatTime('07:30')).toBe('7:30');
    expect(formatTime('19:00')).toBe('19:00');
    expect(formatTime('00:05')).toBe('0:05');
  });

  it('AC-022: withTime adds " · 19:00" to a chore, AC-025: without a time it stays as it is', () => {
    expect(withTime('Müll rausbringen', '19:00')).toBe('Müll rausbringen · 19:00');
    expect(withTime('Müll rausbringen', '07:30')).toBe('Müll rausbringen · 7:30');
    expect(withTime('Müll rausbringen', undefined)).toBe('Müll rausbringen');
  });

  it('AC-035 (spec 0027, spec 0051): the hint under „Erinnern“, on and off', () => {
    expect(choreRemindHint(true)).toBe('Erinnert zur Uhrzeit in den Mitteilungen, wer dran ist.');
    expect(choreRemindHint(false)).toBe('Keine Erinnerung – die Uhrzeit wird nur angezeigt.');
  });

  it('AC-038 (spec 0027): without a time „Erinnern“ is on, so a new time reminds again', () => {
    expect(remindAtDueTimeFor('19:00', false)).toBe(false);
    expect(remindAtDueTimeFor('19:00', true)).toBe(true);
    expect(remindAtDueTimeFor(undefined, false)).toBe(true);
    expect(remindAtDueTimeFor(undefined, true)).toBe(true);
  });
});

describe('notificationTargetHref (spec 0051, AC-017)', () => {
  it('builds the address of the chore or the calendar day with its entry', () => {
    expect(notificationTargetHref({ screen: 'chore', choreId: CHORE })).toBe(
      `/haushalt?aufgabe=${CHORE}`,
    );
    expect(notificationTargetHref({ screen: 'calendar', day: '2026-11-21', entryId: ENTRY })).toBe(
      `/kalender?tag=2026-11-21&eintrag=${ENTRY}`,
    );
    expect(notificationTargetHref({ screen: 'calendar', day: '2026-11-21' })).toBe(
      '/kalender?tag=2026-11-21',
    );
  });
});
