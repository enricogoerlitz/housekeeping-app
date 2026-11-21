import type { ISODate } from './types';

const WEEKDAYS_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const WEEKDAYS_LONG = [
  'Montag',
  'Dienstag',
  'Mittwoch',
  'Donnerstag',
  'Freitag',
  'Samstag',
  'Sonntag',
];
const MONTHS = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
];
const MS_PER_DAY = 86_400_000;

// Noon keeps calendar-day arithmetic clear of daylight-saving changes, which shift local midnight
// by an hour twice a year and would otherwise move a date to the day before.
function localNoon(year: number, monthIndex: number, day: number): Date {
  return new Date(year, monthIndex, day, 12);
}

/** When something was created, in ms, for sorting by age; an unparsable timestamp counts as 0. */
export function createdTime(entity: { createdAt: string }): number {
  const time = Date.parse(entity.createdAt);
  return Number.isNaN(time) ? 0 : time;
}

/** Local calendar date of a Date as "YYYY-MM-DD" (no UTC shift). */
export function toISODate(date: Date): ISODate {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
/** Parses "YYYY-MM-DD" into a local Date at noon (safe against DST). */
export function parseISODate(iso: ISODate): Date {
  return localNoon(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
}
export function addDays(iso: ISODate, days: number): ISODate {
  const date = parseISODate(iso);
  return toISODate(localNoon(date.getFullYear(), date.getMonth(), date.getDate() + days));
}
/**
 * The given day of the month that lies `monthOffset` months after the date's month, clamped to
 * that month's length: ("2026-01-15", 1, 31) → "2026-02-28".
 */
export function dayInMonth(iso: ISODate, monthOffset: number, day: number): ISODate {
  const date = parseISODate(iso);
  const monthIndex = date.getMonth() + monthOffset;
  const lastDay = localNoon(date.getFullYear(), monthIndex + 1, 0).getDate();
  return toISODate(localNoon(date.getFullYear(), monthIndex, Math.min(Math.max(day, 1), lastDay)));
}
/** Adds calendar months; the day is clamped to the target month ("2026-01-31" + 1 → "2026-02-28"). */
export function addMonths(iso: ISODate, months: number): ISODate {
  return dayInMonth(iso, months, parseISODate(iso).getDate());
}
/** Whole days from a to b (b − a); negative when b is earlier. */
export function daysBetween(a: ISODate, b: ISODate): number {
  // Rounding absorbs the hour that a daylight-saving change adds or removes in between.
  return Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / MS_PER_DAY);
}
/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function isoWeekday(iso: ISODate): number {
  const day = parseISODate(iso).getDay();
  return day === 0 ? 7 : day;
}
/** Monday of the week containing the date. */
export function startOfWeek(iso: ISODate): ISODate {
  return addDays(iso, 1 - isoWeekday(iso));
}
/** The seven dates Monday…Sunday of the week containing the date. */
export function weekDates(iso: ISODate): ISODate[] {
  const monday = startOfWeek(iso);
  return Array.from({ length: 7 }, (_, offset) => addDays(monday, offset));
}
/** ISO 8601 week number. */
export function isoWeekNumber(iso: ISODate): number {
  // A week belongs to the year that holds its Thursday, so count from that year's 1 January.
  const thursday = addDays(startOfWeek(iso), 3);
  const firstOfYear = `${thursday.slice(0, 4)}-01-01`;
  return Math.floor(daysBetween(firstOfYear, thursday) / 7) + 1;
}
/** Short name of an ISO weekday: 1 → "Mo" … 7 → "So"; "" for any other number. */
export function weekdayShortName(weekday: number): string {
  return WEEKDAYS_SHORT[weekday - 1] ?? '';
}
/** "Mo", "Di", "Mi", "Do", "Fr", "Sa", "So". */
export function weekdayShort(iso: ISODate): string {
  return weekdayShortName(isoWeekday(iso));
}
/** "Montag" … "Sonntag". */
export function weekdayLong(iso: ISODate): string {
  return WEEKDAYS_LONG[isoWeekday(iso) - 1] ?? '';
}
/** "Donnerstag, 20. November". */
export function formatLongDate(iso: ISODate): string {
  const date = parseISODate(iso);
  const weekday = WEEKDAYS_LONG[isoWeekday(iso) - 1] ?? '';
  return `${weekday}, ${date.getDate()}. ${MONTHS[date.getMonth()] ?? ''}`;
}
/** "20.11.", without leading zeros: "5.3." */
export function formatShortDate(iso: ISODate): string {
  const date = parseISODate(iso);
  return `${date.getDate()}.${date.getMonth() + 1}.`;
}
/**
 * "heute", "morgen", "gestern", "vor 3 Tagen", "in 2 Tagen" (up to 6 days away), otherwise
 * "Do 20.11.".
 */
export function relativeDayLabel(iso: ISODate, today: ISODate): string {
  const days = daysBetween(today, iso);
  if (days === 0) return 'heute';
  if (days === 1) return 'morgen';
  if (days === -1) return 'gestern';
  if (days < 0 && days >= -6) return `vor ${-days} Tagen`;
  if (days > 0 && days <= 6) return `in ${days} Tagen`;
  return `${weekdayShort(iso)} ${formatShortDate(iso)}`;
}
