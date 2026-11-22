import { stripesOn, type TripStripe } from './trips';
import {
  addDays,
  addMonths,
  daysBetween,
  formatLongDate,
  formatShortDate,
  isoWeekNumber,
  parseISODate,
  startOfWeek,
  toISODate,
  weekDates,
  weekdayShort,
} from './dates';
import { collectionEntryLabel, contentsInBook, type RecipeBook } from './collections';
import { orderSlotEntries } from './meal-plan';
import type { Id, ISODate, MealPlanEntry, MealSlot, Recipe } from './types';

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
 * when today lies in that year, else January or the week with 1 January. A day chosen in the
 * day window leads to its week, month or year instead (spec 0016, AC-027).
 */
export function switchView(
  from: CalendarView,
  to: CalendarView,
  start: ISODate,
  today: ISODate,
  selected?: ISODate,
): ISODate {
  if (selected !== undefined) return periodStart(to, selected);
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

/**
 * The period the grid shows after a day was chosen in the day window's week strip (spec 0016,
 * AC-023): it stays while the grid shows the day (the month with the days of its first and last
 * week, the year), otherwise it moves to the period with the day, so the day is marked.
 */
export function periodForDay(view: CalendarView, start: ISODate, iso: ISODate): ISODate {
  if (view === 'month') {
    const weeks = monthGrid(start);
    const first = weeks[0]?.[0] ?? start;
    const last = weeks[weeks.length - 1]?.[6] ?? start;
    return iso >= first && iso <= last ? periodStart('month', start) : periodStart('month', iso);
  }
  return periodContains(view, start, iso) ? periodStart(view, start) : periodStart(view, iso);
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

/** "Fr 1.1.2027": the date fields of the trip window. */
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

/** "Nadja", "Enrico und Nadja", "Enrico, Nadja und Vera". */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} und ${names[names.length - 1] ?? ''}`;
}

/**
 * What a day's item counts as in its screen-reader text: its kind role, but free text and leftovers
 * are "Essen" (spec 0021, REQ-005, Decision 11), while their dot stays that of a recipe.
 */
export type CountRole = KindRole | 'meal';

/** Order of the counts: as the dots, with "Essen" after the recipes. */
const COUNT_ROLES: CountRole[] = [
  'activity',
  'recipe',
  'meal',
  'collection',
  'restaurant',
  'chore',
];

/** The count role of an entry: "Essen" for free text and leftovers, else `entryKindRole`. */
export function entryCountRole(
  entry: Pick<MealPlanEntry, 'kind' | 'recipeId'>,
  recipesById: Readonly<Record<Id, Pick<Recipe, 'kind'>>>,
): CountRole {
  return entry.kind === 'text' || entry.kind === 'leftovers'
    ? 'meal'
    : entryKindRole(entry, recipesById);
}

const KIND_NAMES: Record<CountRole, [one: string, many: string]> = {
  activity: ['Aktivität', 'Aktivitäten'],
  recipe: ['Rezept', 'Rezepte'],
  meal: ['Essen', 'Essen'],
  collection: ['Sammlung', 'Sammlungen'],
  restaurant: ['Restaurant', 'Restaurants'],
  chore: ['Aufgabe', 'Aufgaben'],
};

/**
 * The text of a day for screen readers (spec 0016, platforms): "Freitag, 27. November: 1 Aktivität,
 * 1 Rezept, Nadja unterwegs"; `roles` holds one role per item of the day.
 */
export function dayA11yLabel(
  date: ISODate,
  roles: readonly CountRole[],
  travellerNames: readonly string[],
): string {
  const parts = COUNT_ROLES.flatMap((role) => {
    const count = roles.filter((candidate) => candidate === role).length;
    if (count === 0) return [];
    const [one, many] = KIND_NAMES[role];
    return [`${count} ${count === 1 ? one : many}`];
  });
  if (travellerNames.length > 0) parts.push(`${joinNames(travellerNames)} unterwegs`);
  const head = formatLongDate(date);
  return parts.length > 0 ? `${head}: ${parts.join(', ')}` : head;
}

/**
 * The days a drag over the grid covers (spec 0016, REQ-007): start and current day inclusive, in
 * either direction; in the year view (`clampYear`) it ends at the edge of the year.
 */
export function dragRange(
  anchor: ISODate,
  current: ISODate,
  clampYear?: number,
): { from: ISODate; to: ISODate } {
  const clamp = (iso: ISODate): ISODate => {
    if (clampYear === undefined) return iso;
    const year = String(clampYear).padStart(4, '0');
    if (iso < `${year}-01-01`) return `${year}-01-01`;
    if (iso > `${year}-12-31`) return `${year}-12-31`;
    return iso;
  };
  const [from, to] = [clamp(anchor), clamp(current)].sort();
  return { from: from ?? anchor, to: to ?? anchor };
}

const shortDay = (iso: ISODate) => `${weekdayShort(iso)} ${formatShortDate(iso)}`;

/** "Mo 7.12. – Fr 11.12. · 5 Tage", "Mo 7.12. · 1 Tag": over the grid while dragging (REQ-007). */
export function rangeLabel(from: ISODate, to: ISODate): string {
  const days = daysBetween(from, to) + 1;
  const span = from === to ? shortDay(from) : `${shortDay(from)} – ${shortDay(to)}`;
  return `${span} · ${days === 1 ? '1 Tag' : `${days} Tage`}`;
}

/** The month "Anderes Datum …" opens with: the entry's, for a "vorgemerkt" entry today's (REQ-005). */
export function monthPickerStart(date: ISODate | null, today: ISODate): ISODate {
  return startOfMonth(date ?? today);
}

/**
 * The Tageszeit the add window preselects when a day is chosen without one (spec 0020, REQ-005;
 * spec 0021, REQ-003): the one named "Abend", else the household's last.
 */
export function addPresetSlot(
  slots: readonly Pick<MealSlot, 'id' | 'name' | 'sort'>[],
): Id | undefined {
  const evening = slots.find((slot) => slot.name === 'Abend');
  if (evening) return evening.id;
  return [...slots].sort((a, b) => a.sort - b.sort)[slots.length - 1]?.id;
}

/**
 * The height each of `count` rows gets from `available` px on the desktop (spec 0021, REQ-001):
 * an equal share, at least `min`.
 */
export function sharedHeight(available: number, count: number, min: number): number {
  if (count <= 0) return min;
  return Math.max(min, Math.floor(available / count));
}

/**
 * How many of `count` lines of a desktop month day show in `height` px (spec 0021, REQ-001,
 * AC-003): all when they fit, else as many as fit beside "+n weitere", at least three.
 */
export function fittingItems(
  count: number,
  height: number,
  lineHeight: number,
  moreHeight: number,
  min = 3,
): number {
  if (count * lineHeight <= height) return count;
  const fit = Math.floor((height - moreHeight) / lineHeight);
  return Math.min(count, Math.max(min, fit));
}

/**
 * The label in the middle of the phone header (spec 0021, REQ-018, AC-046): "16.–22. Nov",
 * "November 2026", "2026"; `today` when the period holds today, else it leads back to it.
 */
export function periodNavLabel(
  view: CalendarView,
  start: ISODate,
  today: ISODate,
): { label: string; today: boolean } {
  const first = periodStart(view, start);
  const label =
    view === 'week'
      ? dateRangeLabel(first, addDays(first, 6))
      : view === 'month'
        ? monthTitle(first)
        : first.slice(0, 4);
  return { label, today: periodContains(view, first, today) };
}

export interface DaySheetContent {
  /** "Fr 27. November"; the window shows it in capitals. */
  title: string;
  /** Monday … Sunday of the day's week, for the week strip. */
  week: ISODate[];
  stripes: TripStripe[];
  /** Every Tageszeit of the household in its order, also the empty ones. */
  slots: { slot: MealSlot; entries: MealPlanEntry[] }[];
  /** No plan entry on that day. */
  empty: boolean;
  emptyText: string;
}

/**
 * What the day window shows (spec 0016, REQ-006, AC-022, AC-026): the day, its week, the trips
 * covering it and all Tageszeiten with their entries in display order. Entries of a Tageszeit the
 * household no longer has are left out, as in the week.
 */
export function daySheetContent(input: {
  date: ISODate;
  entries: readonly MealPlanEntry[];
  slots: readonly MealSlot[];
  stripes: TripStripe[];
}): DaySheetContent {
  const ofDay = input.entries.filter((entry) => entry.date === input.date);
  const slots = [...input.slots]
    .sort((a, b) => a.sort - b.sort)
    .map((slot) => ({
      slot,
      entries: orderSlotEntries(ofDay.filter((entry) => entry.slotId === slot.id)),
    }));
  return {
    title: dayMonthLongLabel(input.date),
    week: weekDates(input.date),
    stripes: stripesOn(input.stripes, input.date),
    slots,
    empty: slots.every((group) => group.entries.length === 0),
    emptyText: 'Noch nichts geplant',
  };
}
