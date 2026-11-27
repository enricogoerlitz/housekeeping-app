import { addDays, daysBetween } from './dates';
import type { Chore, ISODate, MealPlanEntry, TimeOfDay, Trip } from './types';

// Spec 0059 "Nichts verpassen", REQ-001/REQ-002: "In meinen Kalender" — one Termin of the app as
// an iCalendar file (RFC 5545) or as a Google Calendar template link, built on the device from
// the cache. A copy: later changes in the app do not follow (Nicht-Ziel: no subscription).

/** One Termin to export: all-day over `date`…`lastDate`, or from `time` for `minutes`. */
export interface CalendarEvent {
  /** Stable per entry, so downloading again can replace the same Termin (Decision 8). */
  uid: string;
  title: string;
  date: ISODate;
  /** Only all-day: the last day (inclusive); undefined = one day. */
  lastDate?: ISODate;
  /** Only timed: the start on the household's clock. */
  time?: TimeOfDay;
  /** Only timed: the duration. */
  minutes?: number;
  location?: string;
  description?: string;
  /** A link back into the app. */
  url?: string;
  /** Wall-clock moments of the household for the alarms, each with its text. */
  alarms: { date: ISODate; at: TimeOfDay; text: string }[];
}

/** Decision 6. */
const PLACE_MINUTES = 120;
const CHORE_MINUTES = 30;
/** Decision 7: the Vorwarnung of a chore rings at this time. */
const NOTICE_AT: TimeOfDay = '09:00';
const BERLIN = 'Europe/Berlin';
const UID_DOMAIN = 'housekeeping';
const MAX_LINE_BYTES = 75;
const MAX_FILE_NAME = 60;

// EU summer time: last Sunday of March 02:00 → last Sunday of October 03:00 (Decision 5).
const BERLIN_VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Berlin',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

// ---------- Termine of the app ----------

/**
 * A plan entry with a day (also a Termin of a series): restaurants and activities with a time
 * last two hours, everything else is all-day; its reminder becomes the alarm (AC-001 to AC-004).
 * Throws for an entry without a day (AC-007: the window does not offer it).
 */
export function planEntryCalendarEvent(input: {
  entry: MealPlanEntry;
  title: string;
  slotName: string;
  location?: string;
  link?: string;
}): CalendarEvent {
  const { entry } = input;
  const date = entry.date;
  if (date === null) throw new Error('Ein vorgemerkter Eintrag hat keinen Termin.');
  const placed = entry.kind === 'restaurant' || entry.kind === 'activity';
  const time = placed ? entry.startsAt : undefined;
  const { reminder } = entry;
  return {
    uid: entry.id,
    title: input.title,
    date,
    ...(time === undefined ? {} : { time, minutes: PLACE_MINUTES }),
    location: input.location,
    description: input.slotName || undefined,
    url: input.link,
    alarms: reminder
      ? [
          {
            date: addDays(date, -reminder.offsetDays),
            at: reminder.at,
            text: reminder.text ?? input.title,
          },
        ]
      : [],
  };
}

/** A trip: all-day over all its days, no alarm (AC-003). */
export function tripCalendarEvent(input: {
  trip: Trip;
  title: string;
  link?: string;
}): CalendarEvent {
  const { trip } = input;
  return {
    uid: trip.id,
    title: input.title,
    date: trip.from,
    lastDate: trip.to,
    description: trip.note && trip.note !== input.title ? trip.note : undefined,
    url: input.link,
    alarms: [],
  };
}

/**
 * A chore on its Termin `due` (after trips): 30 minutes from its time, else all-day; "Erinnern"
 * rings at the time and the Vorwarnung at 09:00 that many days before (AC-005).
 */
export function choreCalendarEvent(input: {
  chore: Chore;
  due: ISODate;
  link?: string;
}): CalendarEvent {
  const { chore, due } = input;
  const time = chore.dueTime;
  const alarms: CalendarEvent['alarms'] = [];
  if (time !== undefined && chore.remindAtDueTime !== false) {
    alarms.push({ date: due, at: time, text: chore.title });
  }
  if (chore.noticeDaysBefore !== undefined && chore.noticeDaysBefore > 0) {
    alarms.push({ date: addDays(due, -chore.noticeDaysBefore), at: NOTICE_AT, text: chore.title });
  }
  return {
    uid: chore.id,
    title: chore.title,
    date: due,
    ...(time === undefined ? {} : { time, minutes: CHORE_MINUTES }),
    description: chore.room,
    url: input.link,
    alarms,
  };
}

// ---------- Formats ----------

function compactDate(date: ISODate): string {
  return date.replaceAll('-', '');
}

function compactTime(time: TimeOfDay): string {
  return `${time.replace(':', '').slice(0, 4)}00`;
}

function minutesOf(time: TimeOfDay): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

function timeOf(minutes: number): TimeOfDay {
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** The end of a timed Termin on the wall clock, the next day after midnight. */
function endOf(event: CalendarEvent & { time: TimeOfDay }): { date: ISODate; time: TimeOfDay } {
  const total = minutesOf(event.time) + (event.minutes ?? 0);
  const days = Math.floor(total / 1440);
  return { date: addDays(event.date, days), time: timeOf(total % 1440) };
}

/** The day after the last one: DTEND of an all-day Termin is exclusive. */
function allDayEnd(event: CalendarEvent): ISODate {
  return addDays(event.lastDate ?? event.date, 1);
}

/**
 * The alarm relative to the start as a duration (`-P1DT1H30M`): whole days are nominal days, so a
 * change of summer time keeps the wall-clock time of the alarm.
 */
function trigger(event: CalendarEvent, alarm: CalendarEvent['alarms'][number]): string {
  const start = minutesOf(event.time ?? '00:00');
  const total = daysBetween(event.date, alarm.date) * 1440 + minutesOf(alarm.at) - start;
  if (total === 0) return 'PT0M';
  const sign = total < 0 ? '-' : '';
  let rest = Math.abs(total);
  const days = Math.floor(rest / 1440);
  rest %= 1440;
  const hours = Math.floor(rest / 60);
  const minutes = rest % 60;
  const time = `${hours ? `${hours}H` : ''}${minutes ? `${minutes}M` : ''}`;
  return `${sign}P${days ? `${days}D` : ''}${time ? `T${time}` : ''}`;
}

/** TEXT as RFC 5545 §3.3.11 writes it; a carriage return never starts a new line. */
function escapeText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/** Octets of one code point in UTF-8 (core has no TextEncoder). */
export function utf8Length(char: string): number {
  const code = char.codePointAt(0) ?? 0;
  return code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
}

/** Folds a content line at 75 octets (§3.1), never inside a UTF-8 character. */
function fold(line: string): string {
  const parts: string[] = [];
  let current = '';
  let bytes = 0;
  for (const char of line) {
    const size = utf8Length(char);
    // Continuation lines start with a space, which counts too.
    const limit = parts.length === 0 ? MAX_LINE_BYTES : MAX_LINE_BYTES - 1;
    if (bytes + size > limit) {
      parts.push(current);
      current = '';
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

function stamp(now: Date): string {
  return `${now.toISOString().slice(0, 19).replace(/[-:]/g, '')}Z`;
}

/**
 * The iCalendar file of one Termin (REQ-001): CRLF, folded, escaped; times with
 * `TZID=Europe/Berlin` and its VTIMEZONE, in another zone as local time (Decision 5).
 */
export function toICalendar(
  event: CalendarEvent,
  options: { now: Date; timeZone: string },
): string {
  const berlin = options.timeZone === BERLIN;
  const at = (date: ISODate, time: TimeOfDay) =>
    `${berlin ? `;TZID=${BERLIN}` : ''}:${compactDate(date)}T${compactTime(time)}`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Housekeeping//Haushalt//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];
  if (event.time !== undefined && berlin) lines.push(...BERLIN_VTIMEZONE);
  lines.push(
    'BEGIN:VEVENT',
    `UID:${escapeText(event.uid)}@${UID_DOMAIN}`,
    `DTSTAMP:${stamp(options.now)}`,
  );
  if (event.time !== undefined) {
    const end = endOf({ ...event, time: event.time });
    lines.push(`DTSTART${at(event.date, event.time)}`, `DTEND${at(end.date, end.time)}`);
  } else {
    lines.push(
      `DTSTART;VALUE=DATE:${compactDate(event.date)}`,
      `DTEND;VALUE=DATE:${compactDate(allDayEnd(event))}`,
    );
  }
  lines.push(`SUMMARY:${escapeText(event.title)}`);
  if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
  if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
  if (event.url) lines.push(`URL:${event.url.replace(/[\r\n]/g, '')}`);
  for (const alarm of event.alarms) {
    lines.push(
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `TRIGGER:${trigger(event, alarm)}`,
      `DESCRIPTION:${escapeText(alarm.text)}`,
      'END:VALARM',
    );
  }
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

/**
 * "In Google Kalender" (REQ-002): the template link; times on the household's clock with `ctz`,
 * all-day without. Google takes no alarm from it (Decision 7).
 */
export function googleCalendarUrl(event: CalendarEvent, timeZone: string): string {
  const params: [string, string][] = [
    ['action', 'TEMPLATE'],
    ['text', event.title],
  ];
  if (event.time !== undefined) {
    const end = endOf({ ...event, time: event.time });
    params.push(
      [
        'dates',
        `${compactDate(event.date)}T${compactTime(event.time)}/${compactDate(end.date)}T${compactTime(end.time)}`,
      ],
      ['ctz', timeZone],
    );
  } else {
    params.push(['dates', `${compactDate(event.date)}/${compactDate(allDayEnd(event))}`]);
  }
  const details = [event.description, event.url].filter(Boolean).join('\n');
  if (details) params.push(['details', details]);
  if (event.location) params.push(['location', event.location]);
  // Form encoding as URLSearchParams writes it (core has no URL globals).
  const encode = (value: string) => encodeURIComponent(value).replace(/%20/g, '+');
  const query = params.map(([key, value]) => `${key}=${encode(value)}`).join('&');
  return `https://calendar.google.com/calendar/render?${query}`;
}

/** "Geburtstag-Mama-Café-Lisa.ics": letters and digits, at most 60, else "Termin". */
export function icsFileName(title: string): string {
  const name = [...title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '')]
    .slice(0, MAX_FILE_NAME)
    .join('')
    .replace(/-+$/, '');
  return `${name || 'Termin'}.ics`;
}
