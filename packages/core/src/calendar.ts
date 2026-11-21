import {
  addDays,
  addMonths,
  isoWeekNumber,
  parseISODate,
  startOfWeek,
  toISODate,
  weekdayShort,
} from './dates';
import { collectionEntryLabel, contentsInBook, type RecipeBook } from './collections';
import type { Id, ISODate, MealPlanEntry, Recipe } from './types';

// The calendar (spec 0010): week, month and year, their labels and how they lead into each other.

export type CalendarView = 'week' | 'month' | 'year';

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
const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mär',
  'Apr',
  'Mai',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Okt',
  'Nov',
  'Dez',
];

const day = (iso: ISODate) => parseISODate(iso).getDate();
const monthIndex = (iso: ISODate) => parseISODate(iso).getMonth();

/** "Januar" … "Dezember" for a month index 0…11; "" otherwise. */
export function monthName(index: number): string {
  return MONTHS[index] ?? '';
}
/** "Jan" … "Dez" for a month index 0…11; "" otherwise. */
export function monthShortName(index: number): string {
  return MONTHS_SHORT[index] ?? '';
}

/** First day of the date's month. */
export function startOfMonth(iso: ISODate): ISODate {
  return `${iso.slice(0, 7)}-01`;
}

/** The first day of the week (Monday), month or year that holds the date. */
export function periodStart(view: CalendarView, iso: ISODate): ISODate {
  if (view === 'week') return startOfWeek(iso);
  if (view === 'month') return startOfMonth(iso);
  return `${iso.slice(0, 4)}-01-01`;
}

/** The period `steps` weeks, months or years after the one starting at `start`; no limit. */
export function shiftPeriod(view: CalendarView, start: ISODate, steps: number): ISODate {
  if (view === 'week') return addDays(startOfWeek(start), 7 * steps);
  return addMonths(periodStart(view, start), view === 'month' ? steps : 12 * steps);
}

/** True when the date lies in the period that holds `start`. */
export function periodContains(view: CalendarView, start: ISODate, iso: ISODate): boolean {
  return periodStart(view, start) === periodStart(view, iso);
}

/**
 * Where a change of view leads (spec 0010, rules): week → month the month with most days of the
 * week (the one of its Thursday); month → week the week with today when today lies in the month,
 * else the week with the first; to the year its year; year → month or week the period with today
 * when today lies in that year, else January or the week with 1 January.
 */
export function switchView(
  from: CalendarView,
  to: CalendarView,
  start: ISODate,
  today: ISODate,
): ISODate {
  const reference = from === 'week' ? addDays(startOfWeek(start), 3) : periodStart(from, start);
  if (to === 'year') return periodStart('year', reference);
  if (from === 'week') return periodStart(to, reference);
  return periodStart(to, periodContains(from, reference, today) ? today : reference);
}

/** Weeks (Monday…Sunday) that cover the date's month, from the week with the 1st on. */
export function monthGrid(iso: ISODate): ISODate[][] {
  const first = startOfMonth(iso);
  const last = addDays(addMonths(first, 1), -1);
  const weeks: ISODate[][] = [];
  for (let monday = startOfWeek(first); monday <= last; monday = addDays(monday, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, offset) => addDays(monday, offset)));
  }
  return weeks;
}

/** The first days of the twelve months of a year. */
export function yearMonths(year: number): ISODate[] {
  return Array.from({ length: 12 }, (_, index) => toISODate(new Date(year, index, 1, 12)));
}

/** "November 2026". */
export function monthTitle(iso: ISODate): string {
  return `${monthName(monthIndex(iso))} ${iso.slice(0, 4)}`;
}

/** "1.–4. Jan", "28. Dez – 3. Jan", "1. Jan" (one day); both days inclusive. */
export function dateRangeLabel(from: ISODate, to: ISODate): string {
  const end = `${day(to)}. ${monthShortName(monthIndex(to))}`;
  if (from === to) return end;
  if (from.slice(0, 7) === to.slice(0, 7)) return `${day(from)}.–${end}`;
  return `${day(from)}. ${monthShortName(monthIndex(from))} – ${end}`;
}

/** "KW 47 · 16.–22. Nov", "KW 53 · 28. Dez – 3. Jan". */
export function weekRangeLabel(iso: ISODate): string {
  const monday = startOfWeek(iso);
  return `KW ${isoWeekNumber(monday)} · ${dateRangeLabel(monday, addDays(monday, 6))}`;
}

/** "Mo 16. Nov": day heads of the week and the title of the add window. */
export function dayMonthLabel(iso: ISODate): string {
  return `${weekdayShort(iso)} ${day(iso)}. ${monthShortName(monthIndex(iso))}`;
}

/** "Fr 1. Januar": the head of the day list under the month on phones. */
export function dayMonthLongLabel(iso: ISODate): string {
  return `${weekdayShort(iso)} ${day(iso)}. ${monthName(monthIndex(iso))}`;
}

/** "Fr 1.1.2027": the date fields of the absence window. */
export function formatPickerDate(iso: ISODate): string {
  return `${weekdayShort(iso)} ${day(iso)}.${monthIndex(iso) + 1}.${iso.slice(0, 4)}`;
}

/** The kinds the calendar tells apart by symbol and colour (D19). */
export type KindRole = 'activity' | 'recipe' | 'collection' | 'restaurant' | 'chore';

/** Order of the dots under a day (spec 0010, rules). */
export const KIND_ROLES: KindRole[] = ['activity', 'recipe', 'collection', 'restaurant', 'chore'];

/**
 * Free text and leftovers look like recipes (spec 0010, rules); an entry of a collection has the
 * role "Sammlung" (spec 0009, E8). A recipe missing from `recipesById` counts as a recipe.
 */
export function entryKindRole(
  entry: Pick<MealPlanEntry, 'kind' | 'recipeId'>,
  recipesById: Readonly<Record<Id, Pick<Recipe, 'kind'>>>,
): KindRole {
  switch (entry.kind) {
    case 'activity':
      return 'activity';
    case 'restaurant':
      return 'restaurant';
    case 'recipe': {
      const recipe = entry.recipeId === undefined ? undefined : recipesById[entry.recipeId];
      return recipe?.kind === 'collection' ? 'collection' : 'recipe';
    }
    default:
      return 'recipe';
  }
}

/**
 * The text of a calendar row (spec 0009, AC-022, AC-024): an entry of a collection with the number
 * of its recipes, "Grillabend · 2 Rezepte", "Sommerfest" without; every other entry its title.
 */
export function entryLineLabel(
  entry: Pick<MealPlanEntry, 'kind' | 'recipeId'>,
  title: string,
  book: RecipeBook,
): string {
  if (entryKindRole(entry, book.recipesById) !== 'collection') return title;
  const collection = entry.recipeId === undefined ? undefined : book.recipesById[entry.recipeId];
  return collection ? collectionEntryLabel(title, contentsInBook(collection, book).length) : title;
}

/** Dots of a day: one per kind, in the fixed order, at most three. */
export function dayKinds(roles: KindRole[], max = 3): KindRole[] {
  return KIND_ROLES.filter((role) => roles.includes(role)).slice(0, max);
}

/** The first `max` items and how many more there are ("+2 weitere"); all when they fit. */
export function overflow<T>(items: readonly T[], max = 3): { shown: T[]; more: number } {
  if (items.length <= max) return { shown: [...items], more: 0 };
  return { shown: items.slice(0, max), more: items.length - max };
}
