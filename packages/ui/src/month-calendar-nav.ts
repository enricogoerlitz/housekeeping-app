// Keyboard of the month calendar (spec 0016, REQ-005, AC-021). Pure, so it is tested in Node.
// Dates are ISO days ("2026-11-26"); the calendar has no bounds, so moving past the shown month
// is the caller's cue to page. Blocked days come from the feature (e.g. the leftovers rule).

export type MonthCalendarKeyResult = { focus: string } | { select: string };

/** How far an arrow looks for a free day before it gives up and stays. */
const SEARCH_STEPS = 366;

function parse(date: string): { year: number; month: number; day: number } {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number);
  return { year, month: month - 1, day };
}

function format(utc: number): string {
  return new Date(utc).toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const { year, month, day } = parse(date);
  return format(Date.UTC(year, month, day + days));
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** The first free day `step` days apart, going on in steps of the same size; else null. */
function nextFree(
  from: string,
  step: number,
  isDisabled: (date: string) => boolean,
): string | null {
  let date = from;
  for (let index = 0; index < SEARCH_STEPS; index += 1) {
    date = addDays(date, step);
    if (!isDisabled(date)) return date;
  }
  return null;
}

/**
 * The same day a month away (clamped to the month's length), or the nearest free day of that
 * month; of two equally near ones the one in the direction of travel. Null if the month has none.
 */
function monthAway(
  from: string,
  months: 1 | -1,
  isDisabled: (date: string) => boolean,
): string | null {
  const { year, month, day } = parse(from);
  const targetYear = year + Math.floor((month + months) / 12);
  const targetMonth = (((month + months) % 12) + 12) % 12;
  const length = daysInMonth(targetYear, targetMonth);
  const wanted = Math.min(day, length);
  const at = (d: number) => format(Date.UTC(targetYear, targetMonth, d));
  for (let offset = 0; offset < length; offset += 1) {
    for (const candidate of [wanted + offset * months, wanted - offset * months]) {
      if (candidate >= 1 && candidate <= length && !isDisabled(at(candidate))) return at(candidate);
    }
  }
  return null;
}

/** The first day of the month `date` lies in. */
export function monthOf(date: string): string {
  const { year, month } = parse(date);
  return format(Date.UTC(year, month, 1));
}

/** The first day of the month `months` away from the month of `date`; no limit either way. */
export function shiftMonth(date: string, months: number): string {
  const { year, month } = parse(date);
  return format(Date.UTC(year, month + months, 1));
}

/**
 * The weeks of the month of `month`, Monday to Sunday; days of the neighbouring months are null,
 * so the grid shows only the month itself.
 */
export function monthCalendarWeeks(month: string): (string | null)[][] {
  const { year, month: index } = parse(month);
  const length = daysInMonth(year, index);
  // getUTCDay: Sunday 0; the grid starts on Monday.
  const lead = (new Date(Date.UTC(year, index, 1)).getUTCDay() + 6) % 7;
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length }, (_, day) => format(Date.UTC(year, index, day + 1))),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let start = 0; start < cells.length; start += 7) weeks.push(cells.slice(start, start + 7));
  return weeks;
}

/**
 * The day of the shown month that Tab enters on (roving focus): the marked day, else today, else
 * the first free day; a blocked day never. Null when the month has no free day.
 */
export function monthCalendarFocusDay(
  month: string,
  marked: string | undefined,
  today: string | undefined,
  isDisabled: (date: string) => boolean,
): string | null {
  const shown = monthOf(month);
  for (const candidate of [marked, today]) {
    if (candidate !== undefined && monthOf(candidate) === shown && !isDisabled(candidate)) {
      return candidate;
    }
  }
  const { year, month: index } = parse(shown);
  for (let day = 1; day <= daysInMonth(year, index); day += 1) {
    const date = format(Date.UTC(year, index, day));
    if (!isDisabled(date)) return date;
  }
  return null;
}

/**
 * What a key does while day `focused` has the focus. Arrows move a day or a week and skip blocked
 * days, PageUp and PageDown move a month; with no free day to go to, the focus stays. Enter picks
 * the focused day if it is free. Undefined: the key is not the calendar's.
 */
export function monthCalendarKey(
  key: string,
  focused: string,
  isDisabled: (date: string) => boolean,
): MonthCalendarKeyResult | undefined {
  const steps: Record<string, number> = {
    ArrowLeft: -1,
    ArrowRight: 1,
    ArrowUp: -7,
    ArrowDown: 7,
  };
  const step = steps[key];
  if (step !== undefined) return { focus: nextFree(focused, step, isDisabled) ?? focused };
  if (key === 'PageUp' || key === 'PageDown') {
    return { focus: monthAway(focused, key === 'PageDown' ? 1 : -1, isDisabled) ?? focused };
  }
  if (key === 'Enter') return isDisabled(focused) ? undefined : { select: focused };
  return undefined;
}
