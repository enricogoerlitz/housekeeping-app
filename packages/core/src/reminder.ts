import { z } from 'zod';

import {
  addDays,
  daysBetween,
  formatLongDate,
  formatShortDate,
  weekdayLong,
  weekdayShort,
} from './dates';
import { withNote } from './meal-plan';
import { parseTimeInput } from './notifications';
import {
  TimeOfDaySchema,
  type Id,
  type ISODate,
  type MealPlanEntry,
  type TimeOfDay,
} from './types';

// Spec 0017 "Erinnerungen an Kalendereinträgen": defaults, day chips, labels, checks and the text
// of the notification. A reminder stores the distance in days before the entry's day and a time
// (plan, Decision 1), so it moves along when the entry is moved (REQ-006). Every judgement of
// "past" uses the household's time zone (`households.timezone`, Decision 5), never the device's.

/** Offene Frage 7 A: at most a year ahead; the database checks the same bound. */
export const MAX_REMINDER_OFFSET_DAYS = 366;
/** REQ-004: "Woran erinnern?" holds up to 80 characters. */
export const MAX_REMINDER_TEXT = 80;
/** REQ-005: the body of the notification holds at most 400 characters. */
export const MAX_REMINDER_MESSAGE = 400;

// C0, DEL and C1, as the database refuses them (`[[:cntrl:]]`).
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/;

/** Characters as Postgres counts them (`char_length`): code points, not UTF-16 units. */
function charLength(text: string): number {
  return [...text].length;
}

/** The reminder of a plan entry as stored: days before the entry's day, time, optional text. */
export const EntryReminderSchema = z.object({
  offsetDays: z.number().int().min(0).max(MAX_REMINDER_OFFSET_DAYS),
  at: TimeOfDaySchema,
  text: z
    .string()
    .refine((text) => text === text.trim() && text !== '', 'trimmed and not empty')
    .refine((text) => charLength(text) <= MAX_REMINDER_TEXT, 'at most 80 characters')
    .refine((text) => !CONTROL_CHARACTER.test(text), 'no control characters')
    .optional(),
});
export type EntryReminder = z.infer<typeof EntryReminderSchema>;

// ---------- The household's clock ----------

const clockFormats = new Map<string, Intl.DateTimeFormat>();

function clockFormat(timeZone: string): Intl.DateTimeFormat {
  let format = clockFormats.get(timeZone);
  if (!format) {
    // Throws a RangeError for a zone the platform does not know; guessing one would put every
    // reminder at the wrong hour.
    format = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    clockFormats.set(timeZone, format);
  }
  return format;
}

/** The wall clock in the household's time zone: date "YYYY-MM-DD" and time "HH:MM:SS". */
export function householdClock(now: Date, timeZone: string): { date: ISODate; time: string } {
  const parts = clockFormat(timeZone).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((each) => each.type === type)?.value ?? '00';
  // Some engines write midnight as "24" even with h23.
  const hour = part('hour') === '24' ? '00' : part('hour');
  return {
    date: `${part('year')}-${part('month')}-${part('day')}`,
    time: `${hour}:${part('minute')}:${part('second')}`,
  };
}

/**
 * Whether the reminder's moment is not in the future (REQ-003): compared as wall-clock time in
 * the household's zone, like the scheduler (`(day + time) at time zone households.timezone`).
 */
export function isReminderPast(
  entryDate: ISODate,
  reminder: Pick<EntryReminder, 'offsetDays' | 'at'>,
  now: Date,
  timeZone: string,
): boolean {
  const clock = householdClock(now, timeZone);
  const moment = `${reminderDay(entryDate, reminder.offsetDays)} ${reminder.at}:00`;
  return moment <= `${clock.date} ${clock.time}`;
}

// ---------- Defaults and days ----------

const DEFAULT_TIMES: Record<string, TimeOfDay> = {
  Vormittag: '08:00',
  Mittag: '11:00',
  Abend: '17:00',
};
const FALLBACK_TIME: TimeOfDay = '08:00';

/** REQ-003, Offene Frage 1 A and 6 A: by the Tageszeit's name; renamed or own ones get 08:00. */
export function defaultReminderTime(slotName: string): TimeOfDay {
  return DEFAULT_TIMES[slotName.trim()] ?? FALLBACK_TIME;
}

/**
 * The values when "Erinnern" is switched on (REQ-003): "Am Tag" and the default time; a default
 * already in the past leaves the time empty, and the switch saves only with a valid time.
 */
export function initialReminder(
  entryDate: ISODate,
  slotName: string,
  now: Date,
  timeZone: string,
): { offsetDays: number; at: TimeOfDay | undefined } {
  const at = defaultReminderTime(slotName);
  const past = isReminderPast(entryDate, { offsetDays: 0, at }, now, timeZone);
  return { offsetDays: 0, at: past ? undefined : at };
}

/** The day the reminder is sent on: `offsetDays` before the entry's day. */
export function reminderDay(entryDate: ISODate, offsetDays: number): ISODate {
  return addDays(entryDate, -offsetDays);
}

/** The stored distance for a day chosen in "Anderes Datum …". */
export function offsetFor(entryDate: ISODate, reminderDate: ISODate): number {
  return daysBetween(reminderDate, entryDate);
}

export type ReminderDayChipKey = 'sameDay' | 'dayBefore' | 'otherDate';

const OTHER_DATE_LABEL = 'Anderes Datum …';

/**
 * The chip a distance belongs to (REQ-003): "Am Tag", "Am Vortag", otherwise the date ("Do 26.11.").
 * A date chosen in the calendar that hits the entry's day or the day before therefore shows as
 * "Am Tag" or "Am Vortag".
 */
export function dayChipFor(
  entryDate: ISODate,
  offsetDays: number,
): { key: ReminderDayChipKey; label: string } {
  if (offsetDays === 0) return { key: 'sameDay', label: 'Am Tag' };
  if (offsetDays === 1) return { key: 'dayBefore', label: 'Am Vortag' };
  const day = reminderDay(entryDate, offsetDays);
  return { key: 'otherDate', label: `${weekdayShort(day)} ${formatShortDate(day)}` };
}

/** The three chips of "Tag" (AC-002, AC-010); without a reminder none is chosen. */
export function reminderDayChips(
  entryDate: ISODate,
  offsetDays: number | undefined,
): { key: ReminderDayChipKey; label: string; selected: boolean }[] {
  const chosen = offsetDays === undefined ? undefined : dayChipFor(entryDate, offsetDays);
  return [
    { key: 'sameDay', label: 'Am Tag', selected: chosen?.key === 'sameDay' },
    { key: 'dayBefore', label: 'Am Vortag', selected: chosen?.key === 'dayBefore' },
    {
      key: 'otherDate',
      label: chosen?.key === 'otherDate' ? chosen.label : OTHER_DATE_LABEL,
      selected: chosen?.key === 'otherDate',
    },
  ];
}

/**
 * The days "Anderes Datum …" offers (AC-010): from today to the entry's day, at most 366 days
 * before it; undefined when the entry's day has passed (AC-007). `today` is the household's date.
 */
export function selectableReminderDays(
  entryDate: ISODate,
  today: ISODate,
): { from: ISODate; to: ISODate } | undefined {
  if (entryDate < today) return undefined;
  const earliest = addDays(entryDate, -MAX_REMINDER_OFFSET_DAYS);
  return { from: earliest > today ? earliest : today, to: entryDate };
}

// ---------- Checks ----------

export type ReminderValidation =
  | { ok: true; reminder: { offsetDays: number; at: TimeOfDay } }
  | { ok: false; field: 'day' | 'time'; error: string };

const PAST_ERROR = 'Liegt in der Vergangenheit';

/**
 * Checks day and typed time before saving (REQ-003). The time follows the time field of spec 0013
 * (5-minute steps, its messages) and is required; the day lies neither after the entry's day nor
 * more than 366 days before it; the moment lies in the future in the household's zone (AC-011).
 * The day errors cannot be reached through the chips; they mirror the database (AC-013).
 */
export function validateReminder(input: {
  entryDate: ISODate;
  offsetDays: number;
  time: string;
  now: Date;
  timeZone: string;
}): ReminderValidation {
  const { offsetDays } = input;
  if (!Number.isInteger(offsetDays) || offsetDays < 0) {
    return { ok: false, field: 'day', error: 'Liegt nach dem Tag des Eintrags' };
  }
  if (offsetDays > MAX_REMINDER_OFFSET_DAYS) {
    return { ok: false, field: 'day', error: 'Höchstens 366 Tage vorher' };
  }
  const parsed = parseTimeInput(input.time, { required: true });
  if (!parsed.ok) return { ok: false, field: 'time', error: parsed.error };
  // `required` guarantees a time; the check keeps the type honest.
  if (parsed.time === undefined) return { ok: false, field: 'time', error: PAST_ERROR };
  const reminder = { offsetDays, at: parsed.time };
  if (isReminderPast(input.entryDate, reminder, input.now, input.timeZone)) {
    return { ok: false, field: 'time', error: PAST_ERROR };
  }
  return { ok: true, reminder };
}

/**
 * "Woran erinnern?" (REQ-004): edges trimmed, empty is no text, at most 80 characters, no line
 * breaks or other control characters. Counted in code points, like the database.
 */
export function cleanReminderText(
  input: string,
): { ok: true; text: string | undefined } | { ok: false; error: string } {
  const text = input.trim();
  if (CONTROL_CHARACTER.test(text)) return { ok: false, error: 'Ohne Zeilenumbrüche' };
  if (charLength(text) > MAX_REMINDER_TEXT) return { ok: false, error: 'Höchstens 80 Zeichen' };
  return { ok: true, text: text === '' ? undefined : text };
}

/** The counter under "Woran erinnern?": "16/80", "80/80" (AC-015). */
export function reminderTextCounter(text: string): string {
  return `${charLength(text)}/${MAX_REMINDER_TEXT}`;
}

// ---------- The bell ----------

const PAST_LABEL = 'Erinnerung vorbei';
/** REQ-002: up to six days before the entry the weekday is unambiguous; beyond, the date too. */
const WEEKDAY_ONLY_DAYS = 6;

/**
 * Next to the bell (REQ-002, REQ-006): "Erinnerung Fr 18:00"; more than six days before the entry
 * "Erinnerung Fr 20.11. 18:00"; once the moment has passed "Erinnerung vorbei".
 */
export function reminderLabel(
  entryDate: ISODate,
  reminder: Pick<EntryReminder, 'offsetDays' | 'at'>,
  now: Date,
  timeZone: string,
): string {
  if (isReminderPast(entryDate, reminder, now, timeZone)) return PAST_LABEL;
  const day = reminderDay(entryDate, reminder.offsetDays);
  const date = reminder.offsetDays > WEEKDAY_ONLY_DAYS ? ` ${formatShortDate(day)}` : '';
  return `Erinnerung ${weekdayShort(day)}${date} ${reminder.at}`;
}

/** "18 Uhr", "9 Uhr 30": how a time is spoken. */
function spokenTime(time: TimeOfDay): string {
  const [hour = '0', minute = '00'] = time.split(':');
  return minute === '00' ? `${Number(hour)} Uhr` : `${Number(hour)} Uhr ${Number(minute)}`;
}

/**
 * The bell for screen readers (Plattformen): "Lasagne, Erinnerung Freitag 18 Uhr"; more than six
 * days ahead "Lasagne, Erinnerung Freitag, 20. November, 9 Uhr 30"; passed
 * "Lasagne, Erinnerung vorbei".
 */
export function reminderAccessibilityLabel(
  title: string,
  entryDate: ISODate,
  reminder: Pick<EntryReminder, 'offsetDays' | 'at'>,
  now: Date,
  timeZone: string,
): string {
  if (isReminderPast(entryDate, reminder, now, timeZone)) return `${title}, ${PAST_LABEL}`;
  const day = reminderDay(entryDate, reminder.offsetDays);
  const when =
    reminder.offsetDays > WEEKDAY_ONLY_DAYS ? `${formatLongDate(day)},` : weekdayLong(day);
  return `${title}, Erinnerung ${when} ${spokenTime(reminder.at)}`;
}

// ---------- The notification ----------

/**
 * What the plan shows as the entry's name, and what the notification names (REQ-004): recipe
 * title, free text, "Reste von Donnerstag", the restaurant's name or the activity with its Zusatz,
 * "Eislaufen (Hohenschönhausen)". Unknown kinds fall back to their text, so a newer entry never
 * breaks the plan. Same behaviour as the app's `entryTitle`, which moves here.
 */
export function planEntryTitle(
  entry: MealPlanEntry,
  recipesById: Record<Id, { title: string }>,
  entries: readonly MealPlanEntry[],
  restaurantsById: Record<Id, { name: string }> = {},
  activitiesById: Record<Id, { name: string }> = {},
): string {
  switch (entry.kind) {
    case 'recipe':
      return (entry.recipeId ? recipesById[entry.recipeId]?.title : undefined) ?? 'Rezept';
    case 'leftovers': {
      const source = entries.find((candidate) => candidate.id === entry.leftoversOfEntryId);
      return source?.date ? `Reste von ${weekdayLong(source.date)}` : 'Reste';
    }
    case 'restaurant':
      return (
        (entry.restaurantId ? restaurantsById[entry.restaurantId]?.name : undefined) ??
        entry.text ??
        'Restaurant'
      );
    case 'activity':
      return withNote(
        (entry.activityId ? activitiesById[entry.activityId]?.name : undefined) ??
          entry.text ??
          'Aktivität',
        entry.note,
      );
    default:
      return entry.text ?? '';
  }
}

const MESSAGE_PREFIX = 'Erinnerung: ';
const ELLIPSIS = '…';

/**
 * The body of the notification (REQ-005); the title is "Housekeeping". The scheduler builds the
 * same text in SQL, and a parity test holds both to this format:
 *
 *   "Erinnerung: " + <name> + " · " + <when> [+ " · " + <text>]
 *
 * - <name>: `planEntryTitle` of the entry.
 * - <when>, by `offsetDays` (the entry lies that many days after the sending day):
 *   0 → "heute <Tageszeit>", 1 → "morgen <Tageszeit>", otherwise
 *   "<Mo|Di|Mi|Do|Fr|Sa|So> <day>.<month>., <Tageszeit>" of the entry's day, day and month without
 *   leading zeros ("Sa 28.11., Abend", "Fr 5.3., Abend"). <Tageszeit> is the slot's name as is;
 *   an empty name (the entry's slot is unknown) leaves it out: "heute", "Sa 28.11.".
 * - <text>: the reminder's text when set (already trimmed, 1–80 characters).
 * - At most 400 characters, counted in code points (`char_length`): when longer, only the name
 *   is cut, to its first (400 − length of the rest − 1) characters followed by "…".
 */
export function reminderMessage(input: {
  title: string;
  entryDate: ISODate;
  slotName: string;
  offsetDays: number;
  text?: string;
}): string {
  const { entryDate, offsetDays } = input;
  // Without a (known) Tageszeit it is left out, as the scheduler does (no trailing space or comma).
  const slot = input.slotName === '' ? undefined : input.slotName;
  const when =
    offsetDays === 0
      ? `heute${slot ? ` ${slot}` : ''}`
      : offsetDays === 1
        ? `morgen${slot ? ` ${slot}` : ''}`
        : `${weekdayShort(entryDate)} ${formatShortDate(entryDate)}${slot ? `, ${slot}` : ''}`;
  const rest = ` · ${when}${input.text ? ` · ${input.text}` : ''}`;
  const room = MAX_REMINDER_MESSAGE - charLength(MESSAGE_PREFIX) - charLength(rest);
  const name = [...input.title];
  const title =
    name.length <= room
      ? input.title
      : `${name.slice(0, Math.max(room - 1, 0)).join('')}${ELLIPSIS}`;
  return `${MESSAGE_PREFIX}${title}${rest}`;
}
