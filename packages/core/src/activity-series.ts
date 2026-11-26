import { z } from 'zod';

import { monthName } from './calendar';
import { recurrenceLabel } from './chores';
import { addDays, isoWeekday, parseISODate, startOfWeek, daysBetween } from './dates';
import type {
  ActivitySeries,
  ActivitySeriesException,
  ISODate,
  Id,
  MealPlanEntry,
  Member,
  SeriesRule,
  TimeOfDay,
} from './types';

// Series of activities (spec 0041, REQ-003, Entscheidung 3): a rule with start and end, and
// exceptions for single Termine. The Termine are computed here for the range on screen; nothing
// is written ahead. Every date is a calendar day ("2027-03-14") and every time a local "18:00",
// so a clock change cannot move a Termin (AC-011).

/** The rule as the database checks it (private.is_series_rule). */
export const SeriesRuleSchema: z.ZodType<SeriesRule> = z.union([
  z.strictObject({
    type: z.literal('weekly'),
    every: z.number().int().min(1).max(52),
    weekdays: z
      .array(z.number().int().min(1).max(7))
      .min(1)
      .max(7)
      .refine((days) => new Set(days).size === days.length),
  }),
  z.strictObject({ type: z.literal('monthly'), day: z.number().int().min(1).max(31) }),
  z.strictObject({ type: z.literal('yearly') }),
]);

/** One Termin of a series in a range. */
export interface SeriesOccurrence {
  seriesId: Id;
  /** The day the rule gives it. */
  on: ISODate;
  /** The day it stands on: `on`, or where it was moved to. */
  date: ISODate;
  slotId: Id;
  startsAt?: TimeOfDay;
  moved: boolean;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function lastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0, 12).getDate();
}

/** Whether the rule gives a Termin on `date`, ignoring start and end. */
function matchesRule(series: Pick<ActivitySeries, 'rule' | 'startsOn'>, date: ISODate): boolean {
  const { rule } = series;
  const day = parseISODate(date);
  switch (rule.type) {
    case 'weekly': {
      if (!rule.weekdays.includes(isoWeekday(date))) return false;
      const weeks = Math.round(daysBetween(startOfWeek(series.startsOn), startOfWeek(date)) / 7);
      return weeks % Math.max(1, rule.every) === 0;
    }
    case 'monthly':
      return (
        day.getDate() === Math.min(rule.day, lastDayOfMonth(day.getFullYear(), day.getMonth()))
      );
    case 'yearly': {
      const start = parseISODate(series.startsOn);
      if (day.getMonth() !== start.getMonth()) return false;
      if (day.getDate() === start.getDate()) return true;
      // AC-010: the 29th of February falls on the 28th in other years.
      return (
        start.getMonth() === 1 &&
        start.getDate() === 29 &&
        day.getDate() === 28 &&
        !isLeapYear(day.getFullYear())
      );
    }
  }
}

/** Whether `date` is a Termin of the series by its rule, start and end (before exceptions). */
export function isSeriesDay(series: ActivitySeries, date: ISODate): boolean {
  if (date < series.startsOn) return false;
  if (series.endsOn !== undefined && date > series.endsOn) return false;
  return matchesRule(series, date);
}

/**
 * The Termine of a series from…to (both inclusive), by date: the rule's days without the
 * cancelled ones, a moved one on its new day (also when its own day lies outside the range).
 * Exceptions of other series and of days the rule does not give are ignored.
 */
export function seriesOccurrences(
  series: ActivitySeries,
  exceptions: readonly ActivitySeriesException[],
  from: ISODate,
  to: ISODate,
): SeriesOccurrence[] {
  if (from > to) return [];
  const own = exceptions.filter((exception) => exception.seriesId === series.id);
  const changed = new Set(own.map((exception) => exception.on));
  const result: SeriesOccurrence[] = [];
  const first = from > series.startsOn ? from : series.startsOn;
  const last = series.endsOn !== undefined && series.endsOn < to ? series.endsOn : to;
  for (let date = first; date <= last; date = addDays(date, 1)) {
    if (changed.has(date) || !matchesRule(series, date)) continue;
    result.push({
      seriesId: series.id,
      on: date,
      date,
      slotId: series.slotId,
      startsAt: series.startsAt,
      moved: false,
    });
  }
  for (const exception of own) {
    const target = exception.movedTo;
    if (target === undefined || target < from || target > to) continue;
    if (!isSeriesDay(series, exception.on)) continue;
    result.push({
      seriesId: series.id,
      on: exception.on,
      date: target,
      slotId: exception.slotId ?? series.slotId,
      startsAt: exception.startsAt ?? series.startsAt,
      moved: true,
    });
  }
  return result.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** The id a Termin carries as a plan entry: series and its own day. */
export function seriesEntryId(seriesId: Id, on: ISODate): string {
  return `${seriesId}:${on}`;
}

/** A plan entry computed from a series (it has no row of its own). */
export function isSeriesEntry(entry: Pick<MealPlanEntry, 'series'>): boolean {
  return entry.series !== undefined;
}

/**
 * The Termine of every series from…to as activity entries of the plan, so the calendar shows them
 * like planned activities (with Zusatz, time and people).
 */
export function seriesPlanEntries(
  seriesList: readonly ActivitySeries[],
  exceptions: readonly ActivitySeriesException[],
  from: ISODate,
  to: ISODate,
): MealPlanEntry[] {
  return seriesList.flatMap((series) =>
    seriesOccurrences(series, exceptions, from, to).map((occurrence) => ({
      id: seriesEntryId(series.id, occurrence.on),
      date: occurrence.date,
      slotId: occurrence.slotId,
      kind: 'activity' as const,
      activityId: series.activityId,
      note: series.note,
      eaterIds: series.eaterIds,
      guests: series.guests,
      portions: 0,
      variants: [],
      sort: 0,
      startsAt: occurrence.startsAt,
      series: { seriesId: series.id, on: occurrence.on },
    })),
  );
}

// Long enough for a yearly Termin (also the 28th after a 29th) and "alle 52 Wochen".
const SEARCH_DAYS = 800;

function nextSeriesDay(series: ActivitySeries, from: ISODate): ISODate | undefined {
  const start = from > series.startsOn ? from : series.startsOn;
  for (let step = 0; step < SEARCH_DAYS; step++) {
    const date = addDays(start, step);
    if (series.endsOn !== undefined && date > series.endsOn) return undefined;
    if (matchesRule(series, date)) return date;
  }
  return undefined;
}

/** What "Serie bearbeiten" may change; the activity and the start stay. */
export type SeriesChanges = Partial<Omit<ActivitySeries, 'id' | 'activityId' | 'startsOn'>>;

export type SeriesEditPlan =
  /** The series has not started yet: change it as a whole. */
  | { kind: 'update'; changes: SeriesChanges }
  /**
   * End the series yesterday and start `next` (none when the new end lies before it) for the
   * Termine from today on; the exceptions of those Termine move to `next`.
   */
  | {
      kind: 'split';
      endsOld: ISODate;
      next?: Omit<ActivitySeries, 'id'>;
      movedExceptionIds: Id[];
    }
  /** No Termin from today on: nothing is left to change. */
  | { kind: 'ended' };

/**
 * "Serie bearbeiten" changes only the Termine from today on (AC-009). The new series starts today;
 * "alle N Wochen" starts in the week of its next Termin so its weeks stay, and a yearly series on
 * its next Termin so its day stays.
 */
export function planSeriesEdit(
  series: ActivitySeries,
  exceptions: readonly ActivitySeriesException[],
  changes: SeriesChanges,
  today: ISODate,
): SeriesEditPlan {
  if (today <= series.startsOn) return { kind: 'update', changes };
  const upcoming = nextSeriesDay(series, today);
  if (upcoming === undefined) return { kind: 'ended' };
  let startsOn = today;
  if (series.rule.type === 'yearly') startsOn = upcoming;
  else if (series.rule.type === 'weekly' && series.rule.every > 1) {
    const week = startOfWeek(upcoming);
    startsOn = week > today ? week : today;
  }
  const { id: _id, ...rest } = series;
  const next: Omit<ActivitySeries, 'id'> = { ...rest, ...changes, startsOn };
  const endsBefore = next.endsOn !== undefined && next.endsOn < startsOn;
  return {
    kind: 'split',
    endsOld: addDays(today, -1),
    next: endsBefore ? undefined : next,
    movedExceptionIds: endsBefore
      ? []
      : exceptions
          .filter((exception) => exception.seriesId === series.id && exception.on >= today)
          .map((exception) => exception.id),
  };
}

/** Why a series cannot be saved, in the words of the form; undefined when it can. */
export function seriesDraftProblem(
  series: Pick<ActivitySeries, 'rule' | 'startsOn' | 'endsOn'>,
): string | undefined {
  const { rule } = series;
  if (rule.type === 'weekly') {
    if (rule.weekdays.length === 0) return 'Wähl mindestens einen Wochentag.';
    if (!Number.isInteger(rule.every) || rule.every < 1 || rule.every > 52) {
      return 'Alle 1 bis 52 Wochen.';
    }
  }
  if (rule.type === 'monthly' && (rule.day < 1 || rule.day > 31)) return 'Ein Tag von 1 bis 31.';
  if (series.endsOn !== undefined && series.endsOn < series.startsOn) {
    return '„Bis“ liegt vor dem Start.';
  }
  return undefined;
}

/** "wöchentlich Di", "alle 2 Wochen Mo, Do", "monatlich am 15.", "jährlich am 14. März". */
export function seriesRuleLabel(rule: SeriesRule, startsOn: ISODate): string {
  if (rule.type !== 'yearly') return recurrenceLabel(rule);
  const start = parseISODate(startsOn);
  return `jährlich am ${start.getDate()}. ${monthName(start.getMonth())}`;
}

/** AC-014: "Enrico + 2", "Enrico, Nadja", "2 Gäste"; "" when nobody is named. */
export function peopleLabel(
  eaterIds: readonly Id[],
  guests: number,
  membersById: Record<Id, Member | undefined>,
): string {
  const names = eaterIds.flatMap((id) => membersById[id]?.name ?? []);
  if (names.length === 0) {
    if (guests <= 0) return '';
    return guests === 1 ? '1 Gast' : `${guests} Gäste`;
  }
  return guests > 0 ? `${names.join(', ')} + ${guests}` : names.join(', ');
}

/** "Wiederholen" when planning an activity (REQ-003). */
export type RepeatKind = 'none' | 'weekly' | 'monthly' | 'yearly';

export const REPEAT_OPTIONS: readonly { value: RepeatKind; label: string }[] = [
  { value: 'none', label: 'Einmalig' },
  { value: 'weekly', label: 'Wöchentlich' },
  { value: 'monthly', label: 'Monatlich' },
  { value: 'yearly', label: 'Jährlich' },
];

/** The fields of "Wiederholen"; `until` undefined = "dauerhaft". */
export interface RepeatDraft {
  kind: RepeatKind;
  /** "alle N Wochen". */
  every: number;
  weekdays: number[];
  /** "am Tag X". */
  monthDay: number;
  until?: ISODate;
}

/** "Einmalig"; for the others the chosen day gives weekday and day of month. */
export function defaultRepeat(day: ISODate): RepeatDraft {
  return {
    kind: 'none',
    every: 1,
    weekdays: [isoWeekday(day)],
    monthDay: parseISODate(day).getDate(),
  };
}

/** The rule of the draft; undefined for "Einmalig". A yearly series takes the date of its start. */
export function repeatRule(repeat: RepeatDraft): SeriesRule | undefined {
  switch (repeat.kind) {
    case 'none':
      return undefined;
    case 'weekly':
      return {
        type: 'weekly',
        every: repeat.every,
        weekdays: [...new Set(repeat.weekdays)].sort((a, b) => a - b),
      };
    case 'monthly':
      return { type: 'monthly', day: repeat.monthDay };
    case 'yearly':
      return { type: 'yearly' };
  }
}
