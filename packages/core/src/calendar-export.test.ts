import { describe, expect, it } from 'vitest';

import {
  choreCalendarEvent,
  googleCalendarUrl,
  icsFileName,
  planEntryCalendarEvent,
  calendarSlotIndex,
  toICalendar,
  tripCalendarEvent,
  utf8Length,
  type CalendarEvent,
} from './calendar-export';
import { enrico, trip } from './test-fixtures';
import type { Chore, MealPlanEntry } from './types';

// Spec 0059 "Nichts verpassen", REQ-001/REQ-002. Friday, 27 November 2026, Europe/Berlin.
const now = new Date('2026-11-27T10:15:00Z');
const zone = 'Europe/Berlin';

function entry(partial: Partial<MealPlanEntry> & Pick<MealPlanEntry, 'id'>): MealPlanEntry {
  return {
    date: '2026-11-28',
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

const roma = entry({ id: 'e-roma', kind: 'restaurant', restaurantId: 'p-roma', startsAt: '19:30' });

function lines(event: CalendarEvent): string[] {
  return toICalendar(event, { now, timeZone: zone }).split('\r\n');
}

describe('toICalendar (REQ-001)', () => {
  it('AC-001: a restaurant at 19:30 is a two-hour Termin in Europe/Berlin with a VTIMEZONE', () => {
    const event = planEntryCalendarEvent({
      entry: roma,
      title: 'Pizzeria Roma',
      slotName: 'Abend',
    });
    const text = toICalendar(event, { now, timeZone: zone });
    const all = text.split('\r\n');
    expect(text.endsWith('\r\n')).toBe(true);
    expect(text).not.toMatch(/[^\r]\n/);
    expect(all[0]).toBe('BEGIN:VCALENDAR');
    expect(all).toContain('VERSION:2.0');
    expect(all).toContain('DTSTART;TZID=Europe/Berlin:20261128T193000');
    expect(all).toContain('DTEND;TZID=Europe/Berlin:20261128T213000');
    expect(all).toContain('SUMMARY:Pizzeria Roma');
    expect(all).toContain('UID:e-roma@housekeeping');
    expect(all).toContain('DTSTAMP:20261127T101500Z');
    expect(all).toContain('BEGIN:VTIMEZONE');
    expect(all).toContain('TZID:Europe/Berlin');
    expect(all).toContain('RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU');
    expect(all.at(-2)).toBe('END:VCALENDAR');
  });

  it('AC-001: a Termin late in the evening ends on the next day', () => {
    const late = entry({ ...roma, id: 'e-late', startsAt: '23:00' });
    expect(
      lines(planEntryCalendarEvent({ entry: late, title: 'Bar', slotName: 'Abend' })),
    ).toContain('DTEND;TZID=Europe/Berlin:20261129T010000');
  });

  it('AC-002 (Enrico 27.11.): without a time the entry starts at its Tageszeit, one hour', () => {
    const lasagne = entry({ id: 'e-lasagne', date: '2026-11-30' });
    const at = (slotIndex: number) =>
      lines(
        planEntryCalendarEvent({ entry: lasagne, title: 'Lasagne', slotName: 'Abend', slotIndex }),
      );
    expect(at(0)).toContain('DTSTART;TZID=Europe/Berlin:20261130T090000');
    expect(at(0)).toContain('DTEND;TZID=Europe/Berlin:20261130T100000');
    expect(at(1)).toContain('DTSTART;TZID=Europe/Berlin:20261130T130000');
    expect(at(2)).toContain('DTSTART;TZID=Europe/Berlin:20261130T170000');
    expect(at(2)).toContain('DTEND;TZID=Europe/Berlin:20261130T180000');
    expect(at(3)).toContain('DTSTART;TZID=Europe/Berlin:20261130T210000');
    expect(at(2)).toContain('BEGIN:VTIMEZONE');
    expect(at(2)).toContain('DESCRIPTION:Abend');
  });

  it('AC-002: the position of a Tageszeit follows its sort order; unknown is undefined', () => {
    const slots = [
      { id: 'abend', sort: 30 },
      { id: 'vormittag', sort: 10 },
      { id: 'mittag', sort: 20 },
    ];
    expect(calendarSlotIndex(slots, 'vormittag')).toBe(0);
    expect(calendarSlotIndex(slots, 'abend')).toBe(2);
    expect(calendarSlotIndex(slots, 'weg')).toBeUndefined();
  });

  it('AC-002: a later Tageszeit never starts after 22:00', () => {
    const late = entry({ id: 'e-late-slot', date: '2026-11-30' });
    expect(
      lines(
        planEntryCalendarEvent({ entry: late, title: 'Snack', slotName: 'Nacht', slotIndex: 5 }),
      ),
    ).toContain('DTSTART;TZID=Europe/Berlin:20261130T220000');
  });

  it('AC-002 (edge): without a known Tageszeit the entry stays all-day', () => {
    const lasagne = entry({ id: 'e-lasagne', date: '2026-11-30' });
    const all = lines(planEntryCalendarEvent({ entry: lasagne, title: 'Lasagne', slotName: '' }));
    expect(all).toContain('DTSTART;VALUE=DATE:20261130');
    expect(all).toContain('DTEND;VALUE=DATE:20261201');
    expect(all).not.toContain('BEGIN:VTIMEZONE');
  });

  it('AC-002: a recipe ignores a stray time and starts at its Tageszeit', () => {
    const odd = entry({ id: 'e-odd', startsAt: '18:00' });
    expect(
      lines(
        planEntryCalendarEvent({ entry: odd, title: 'Lasagne', slotName: 'Abend', slotIndex: 2 }),
      ),
    ).toContain('DTSTART;TZID=Europe/Berlin:20261128T170000');
  });

  it('AC-003: a trip is all-day over every day, the end exclusive', () => {
    const ostsee = trip('t-ostsee', [enrico.id], '2026-12-18', '2026-12-20', 'Ostsee');
    const all = lines(tripCalendarEvent({ trip: ostsee, title: 'Ostsee' }));
    expect(all).toContain('DTSTART;VALUE=DATE:20261218');
    expect(all).toContain('DTEND;VALUE=DATE:20261221');
    expect(all).toContain('SUMMARY:Ostsee');
    expect(all).not.toContain('BEGIN:VALARM');
  });

  it('AC-004: the reminder of the entry becomes a VALARM relative to the start', () => {
    const reminded = entry({
      ...roma,
      reminder: { offsetDays: 1, at: '18:00', text: 'Tisch bestätigen' },
    });
    const all = lines(
      planEntryCalendarEvent({ entry: reminded, title: 'Pizzeria Roma', slotName: 'Abend' }),
    );
    expect(all).toContain('BEGIN:VALARM');
    expect(all).toContain('ACTION:DISPLAY');
    expect(all).toContain('TRIGGER:-P1DT1H30M');
    expect(all).toContain('DESCRIPTION:Tisch bestätigen');
    expect(all).toContain('END:VALARM');
  });

  it('AC-004: an all-day entry counts its reminder from 00:00; without text it names the title', () => {
    const lasagne = entry({ id: 'e-lasagne', reminder: { offsetDays: 1, at: '18:00' } });
    const all = lines(planEntryCalendarEvent({ entry: lasagne, title: 'Lasagne', slotName: '' }));
    expect(all).toContain('TRIGGER:-PT6H');
    expect(all).toContain('DESCRIPTION:Lasagne');
  });

  it('AC-004: a reminder after the start is a positive trigger', () => {
    const after = entry({ ...roma, reminder: { offsetDays: 0, at: '20:00' } });
    expect(lines(planEntryCalendarEvent({ entry: after, title: 'Roma', slotName: '' }))).toContain(
      'TRIGGER:PT30M',
    );
  });

  it('AC-005: a chore with a time lasts 30 minutes; "Erinnern" and the Vorwarnung give alarms', () => {
    const muell: Chore = {
      id: 'c-muell',
      title: 'Müll rausbringen',
      recurrence: { type: 'once' },
      assignment: { type: 'anyone' },
      effort: 1,
      nextDueOn: '2026-12-01',
      dueTime: '19:00',
      noticeDaysBefore: 3,
    };
    const all = lines(choreCalendarEvent({ chore: muell, due: '2026-12-01' }));
    expect(all).toContain('DTSTART;TZID=Europe/Berlin:20261201T190000');
    expect(all).toContain('DTEND;TZID=Europe/Berlin:20261201T193000');
    expect(all).toContain('TRIGGER:PT0M');
    expect(all).toContain('TRIGGER:-P3DT10H');
    expect(all.filter((line) => line === 'BEGIN:VALARM')).toHaveLength(2);
  });

  it('AC-005: "Erinnern" off and no Vorwarnung: no alarm; without a time all-day', () => {
    const quiet: Chore = {
      id: 'c-bad',
      title: 'Bad putzen',
      recurrence: { type: 'once' },
      assignment: { type: 'anyone' },
      effort: 1,
      nextDueOn: '2026-12-01',
      dueTime: '19:00',
      remindAtDueTime: false,
    };
    expect(lines(choreCalendarEvent({ chore: quiet, due: '2026-12-01' }))).not.toContain(
      'BEGIN:VALARM',
    );
    const allDay = lines(
      choreCalendarEvent({ chore: { ...quiet, dueTime: undefined }, due: '2026-12-01' }),
    );
    expect(allDay).toContain('DTSTART;VALUE=DATE:20261201');
  });

  it('AC-006: text is escaped and long lines are folded at 75 bytes without splitting a character', () => {
    const title = 'Essen, Kino; Bar\\Neu\nzweite Zeile – ' + 'Größenwahn '.repeat(10);
    const text = toICalendar(
      planEntryCalendarEvent({ entry: entry({ id: 'e-x' }), title, slotName: '' }),
      { now, timeZone: zone },
    );
    expect(text).toContain('SUMMARY:Essen\\, Kino\\; Bar\\\\Neu\\nzweite Zeile');
    for (const line of text.split('\r\n')) {
      const bytes = [...line].reduce((sum, char) => sum + utf8Length(char), 0);
      expect(bytes).toBeLessThanOrEqual(75);
    }
    const unfolded = text.replace(/\r\n /g, '');
    expect(unfolded).toContain(
      `SUMMARY:Essen\\, Kino\\; Bar\\\\Neu\\nzweite Zeile – ${'Größenwahn '.repeat(10).trim()}`,
    );
    expect(text).not.toContain('�');
  });

  it('AC-006: a carriage return cannot start a new property', () => {
    const text = toICalendar(
      planEntryCalendarEvent({
        entry: entry({ id: 'e-y' }),
        title: 'A\r\nBEGIN:VEVENT',
        slotName: '',
      }),
      { now, timeZone: zone },
    );
    expect(text.split('\r\n').filter((line) => line === 'BEGIN:VEVENT')).toHaveLength(1);
  });

  it('Decision 5: another zone writes local times without a zone', () => {
    const all = toICalendar(planEntryCalendarEvent({ entry: roma, title: 'Roma', slotName: '' }), {
      now,
      timeZone: 'America/New_York',
    }).split('\r\n');
    expect(all).toContain('DTSTART:20261128T193000');
    expect(all).not.toContain('BEGIN:VTIMEZONE');
  });

  it('a location and a link back into the app go along', () => {
    const all = lines(
      planEntryCalendarEvent({
        entry: roma,
        title: 'Pizzeria Roma',
        slotName: 'Abend',
        location: 'Hauptstraße 1, Berlin',
        link: 'https://house.example/kalender?tag=2026-11-28',
      }),
    );
    expect(all).toContain('LOCATION:Hauptstraße 1\\, Berlin');
    expect(all).toContain('URL:https://house.example/kalender?tag=2026-11-28');
  });

  it('AC-007: an entry without a day has no Termin', () => {
    expect(() =>
      planEntryCalendarEvent({ entry: entry({ id: 'e-z', date: null }), title: 'X', slotName: '' }),
    ).toThrow();
  });
});

/** The query of a link as key → decoded value (core has no URL globals). */
function query(url: string): { base: string; params: Map<string, string> } {
  const [base = '', search = ''] = url.split('?');
  const params = new Map(
    search.split('&').map((pair) => {
      const [key = '', value = ''] = pair.split('=');
      return [key, decodeURIComponent(value.replace(/\+/g, ' '))] as const;
    }),
  );
  return { base, params };
}

describe('googleCalendarUrl (REQ-002)', () => {
  it('AC-008: a timed Termin with its zone', () => {
    const link = googleCalendarUrl(
      planEntryCalendarEvent({
        entry: roma,
        title: 'Pizzeria Roma',
        slotName: 'Abend',
        location: 'Hauptstraße 1',
      }),
      zone,
    );
    const { base, params } = query(link);
    expect(base).toBe('https://calendar.google.com/calendar/render');
    expect(params.get('action')).toBe('TEMPLATE');
    expect(params.get('text')).toBe('Pizzeria Roma');
    expect(params.get('dates')).toBe('20261128T193000/20261128T213000');
    expect(params.get('ctz')).toBe('Europe/Berlin');
    expect(params.get('location')).toBe('Hauptstraße 1');
    expect(link).toContain('text=Pizzeria+Roma');
  });

  it('AC-009: an all-day Termin without a zone', () => {
    const { params } = query(
      googleCalendarUrl(
        planEntryCalendarEvent({
          entry: entry({ id: 'e-lasagne', date: '2026-11-30' }),
          title: 'Lasagne',
          slotName: 'Abend',
        }),
        zone,
      ),
    );
    expect(params.get('dates')).toBe('20261130/20261201');
    expect(params.has('ctz')).toBe(false);
    expect(params.get('details')).toBe('Abend');
  });
});

describe('icsFileName', () => {
  it('a readable name for the download', () => {
    expect(icsFileName('Geburtstag Mama (Café Lisa)')).toBe('Geburtstag-Mama-Café-Lisa.ics');
    expect(icsFileName('  ///  ')).toBe('Termin.ics');
    expect(icsFileName('x'.repeat(100))).toBe(`${'x'.repeat(60)}.ics`);
  });
});
