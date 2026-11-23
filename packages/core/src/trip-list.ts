import { dateRangeLabel, monthTitle } from './calendar';
import { weekdayShort } from './dates';
import { tripDays } from './packing';
import { splitUpcomingPast, type TripStripe } from './trips';
import type { ISODate } from './types';

// "Reisen" by month (spec 0030, REQ-003, Entscheidung 4): "Kommend" and "Vergangen", in each the
// trips under the month they start in; the filter "Zeitraum" is a year ("2026") or a month
// ("2026-12") of the start, in the address as `zeitraum`.

const PERIOD = /^\d{4}(-(0[1-9]|1[0-2]))?$/;

/** A valid `zeitraum` ("2026", "2026-12"); anything else is no filter (AC-010). */
export function parseTripPeriod(value: string | undefined): string | undefined {
  return value !== undefined && PERIOD.test(value) ? value : undefined;
}

/** The trip starts in the year or month (AC-009: the month of its start counts). */
function inPeriod(stripe: TripStripe, period: string | undefined): boolean {
  return period === undefined || stripe.from.startsWith(period);
}

export interface TripMonth {
  /** "2026-12". */
  key: string;
  /** "Dezember 2026". */
  title: string;
  stripes: TripStripe[];
}

export interface TripListSection {
  key: 'upcoming' | 'past';
  title: 'Kommend' | 'Vergangen';
  months: TripMonth[];
}

/** Consecutive trips of one start month form one group, in the order given. */
function byMonth(stripes: readonly TripStripe[]): TripMonth[] {
  const months: TripMonth[] = [];
  for (const stripe of stripes) {
    const key = stripe.from.slice(0, 7);
    const last = months.at(-1);
    if (last?.key === key) last.stripes.push(stripe);
    else months.push({ key, title: monthTitle(`${key}-01`), stripes: [stripe] });
  }
  return months;
}

/**
 * The sections of "Reisen" (AC-007 to AC-010): "Kommend" (running and future, earliest first)
 * before "Vergangen" (newest first), each by start month; empty sections are left out, so no
 * trip in the period gives no section.
 */
export function tripListSections(
  stripes: readonly TripStripe[],
  today: ISODate,
  period: string | undefined,
): TripListSection[] {
  const { upcoming, past } = splitUpcomingPast(
    stripes.filter((stripe) => inPeriod(stripe, period)),
    today,
  );
  // Past trips newest first by their start, so the months run backwards without repeating.
  const pastByStart = [...past].sort(
    (a, b) => b.from.localeCompare(a.from) || b.to.localeCompare(a.to),
  );
  const sections: TripListSection[] = [
    { key: 'upcoming', title: 'Kommend', months: byMonth(upcoming) },
    { key: 'past', title: 'Vergangen', months: byMonth(pastByStart) },
  ];
  return sections.filter((section) => section.months.length > 0);
}

export interface TripPeriodOption {
  /** undefined = "Alle Zeiträume". */
  value: string | undefined;
  label: string;
  /** 1 = a month under its year. */
  depth: 0 | 1;
}

/** "Alle Zeiträume", then each year with trips and under it its months, newest first (AC-008). */
export function tripPeriodOptions(stripes: readonly TripStripe[]): TripPeriodOption[] {
  const months = [...new Set(stripes.map((stripe) => stripe.from.slice(0, 7)))].sort().reverse();
  const options: TripPeriodOption[] = [{ value: undefined, label: 'Alle Zeiträume', depth: 0 }];
  for (const month of months) {
    const year = month.slice(0, 4);
    if (options.at(-1)?.value?.slice(0, 4) !== year) {
      options.push({ value: year, label: year, depth: 0 });
    }
    options.push({ value: month, label: monthTitle(`${month}-01`), depth: 1 });
  }
  return options;
}

/** The label of the chosen period: "Dezember 2026", "2026", "Alle Zeiträume". */
export function tripPeriodLabel(period: string | undefined): string {
  if (period === undefined) return 'Alle Zeiträume';
  return period.length === 4 ? period : monthTitle(`${period}-01`);
}

/** The date tile of a row: weekday and day of the start ("SA", "12", AC-011). */
export function tripDateTile(from: ISODate): { weekday: string; day: string } {
  return { weekday: weekdayShort(from).toUpperCase(), day: String(Number(from.slice(8, 10))) };
}

/** "12.–19. Dez · 8 Tage · Ganzer Haushalt" (AC-011); `who` as the stripe's people. */
export function tripRowDetail(stripe: Pick<TripStripe, 'from' | 'to'>, who: string): string {
  const days = tripDays(stripe.from, stripe.to);
  return `${dateRangeLabel(stripe.from, stripe.to)} · ${days} ${days === 1 ? 'Tag' : 'Tage'} · ${who}`;
}
