import { dateRangeLabel, monthTitle } from './calendar';
import {
  addDays,
  addMonths,
  isoWeekNumber,
  parseISODate,
  startOfWeek,
  weekdayShort,
} from './dates';
import type { ChoreEvent, ISODate } from './types';

// The history of the household plan (spec 0011, REQ-010): months, within them weeks, a year
// divider at the turn of the year. Nothing is folded away.

export interface HistoryRow {
  event: ChoreEvent;
  /** "Fr 20." */
  dayLabel: string;
}

export interface HistoryWeek {
  /** The first day of the week within the month, e.g. "2026-11-16" or "2026-11-01". */
  key: string;
  /** "KW 47 · 16.–22. Nov", cut to the month: "KW 44 · 1. Nov". */
  title: string;
  rows: HistoryRow[];
}

export interface HistoryMonth {
  /** "2026-11". */
  key: string;
  /** "November 2026". */
  title: string;
  /** "2025" before the newest month of a year other than today's (AC-057). */
  yearDivider?: string;
  weeks: HistoryWeek[];
}

function bookedTime(event: ChoreEvent): number {
  if (event.createdAt === undefined) return Number.POSITIVE_INFINITY;
  const time = Date.parse(event.createdAt);
  return Number.isNaN(time) ? 0 : time;
}

/** Newest day first; on the same day the later booking first, then by id. */
function newestFirst(a: ChoreEvent, b: ChoreEvent): number {
  return (
    b.doneOn.localeCompare(a.doneOn) ||
    bookedTime(b) - bookedTime(a) ||
    (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)
  );
}

function weekOf(date: ISODate): { key: ISODate; title: string } {
  const monday = startOfWeek(date);
  const monthStart = `${date.slice(0, 7)}-01`;
  const monthEnd = addDays(addMonths(monthStart, 1), -1);
  const sunday = addDays(monday, 6);
  const from = monday < monthStart ? monthStart : monday;
  const to = sunday > monthEnd ? monthEnd : sunday;
  // The number is the whole week's, also where the month cuts it.
  return { key: from, title: `KW ${isoWeekNumber(monday)} · ${dateRangeLabel(from, to)}` };
}

/** The history grouped by month and week, newest first (AC-056 to AC-058). */
export function historyGroups(events: ChoreEvent[], today: ISODate): HistoryMonth[] {
  const months: HistoryMonth[] = [];
  const dividedYears = new Set<string>();
  for (const event of [...events].sort(newestFirst)) {
    const monthKey = event.doneOn.slice(0, 7);
    let month = months[months.length - 1];
    if (month === undefined || month.key !== monthKey) {
      const year = monthKey.slice(0, 4);
      const divide = year !== today.slice(0, 4) && !dividedYears.has(year);
      if (divide) dividedYears.add(year);
      month = {
        key: monthKey,
        title: monthTitle(event.doneOn),
        ...(divide ? { yearDivider: year } : {}),
        weeks: [],
      };
      months.push(month);
    }
    const { key, title } = weekOf(event.doneOn);
    let week = month.weeks[month.weeks.length - 1];
    if (week === undefined || week.key !== key) {
      week = { key, title, rows: [] };
      month.weeks.push(week);
    }
    week.rows.push({
      event,
      dayLabel: `${weekdayShort(event.doneOn)} ${parseISODate(event.doneOn).getDate()}.`,
    });
  }
  return months;
}
