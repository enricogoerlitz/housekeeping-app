import { stripesOn, tripEndLabel, tripStripes } from './trips';
import { dayKinds, entryKindRole, monthName, type KindRole } from './calendar';
import { dueChores, householdAwayNotice } from './chore-schedule';
import {
  addDays,
  daysBetween,
  formatLongDate,
  formatShortDate,
  parseISODate,
  weekdayLong,
  weekdayShort,
} from './dates';
import { householdRow, type HouseholdRowItem } from './household-row';
import { entriesForDay } from './meal-plan';
import type { Chore, ChoreEvent, Id, ISODate, MealPlanEntry, Member, Recipe, Trip } from './types';

// The "Übersicht" (spec 0011, REQ-001, REQ-002): one shown day, as if it were today, and the
// week around it. Nothing here is stored; the shown day lives only while the app runs.

/** The months of the short title: abbreviated with a dot, short ones written out (Duden). */
const TITLE_MONTHS_SHORT = [
  'Jan.',
  'Feb.',
  'März',
  'Apr.',
  'Mai',
  'Juni',
  'Juli',
  'Aug.',
  'Sept.',
  'Okt.',
  'Nov.',
  'Dez.',
];

/** "21. November", "21. Nov." short, with the year when it is not the year of today. */
function dayWithMonth(shown: ISODate, today: ISODate, short: boolean): string {
  const date = parseISODate(shown);
  const year = shown.slice(0, 4) === today.slice(0, 4) ? '' : ` ${shown.slice(0, 4)}`;
  const month = short ? (TITLE_MONTHS_SHORT[date.getMonth()] ?? '') : monthName(date.getMonth());
  return `${date.getDate()}. ${month}${year}`;
}

/**
 * The title of the shown day: always weekday and date, "Freitag, 20. November", in another year
 * "Freitag, 8. Januar 2027". No "Morgen"/"Gestern" prefix, so the heading keeps one line and does
 * not jump between days (spec 0035, AC-014; replaces spec 0011, Offene Frage 2 c). Phones take the
 * short form "Fr., 20. Nov.", which fits one line beside the header's buttons (spec 0057, REQ-005).
 */
export function overviewTitle(
  shown: ISODate,
  today: ISODate,
  form: 'long' | 'short' = 'long',
): string {
  const short = form === 'short';
  const weekday = short ? `${weekdayShort(shown)}.` : weekdayLong(shown);
  return `${weekday}, ${dayWithMonth(shown, today, short)}`;
}

// ---------- Seven days from yesterday (spec 0020, REQ-001, REQ-002) ----------

/** Days of a section of the Tagesleiste and how far ‹ › go. */
export const OVERVIEW_DAYS = 7;

export interface OverviewSection {
  from: ISODate;
  to: ISODate;
  /** The seven days in order. */
  dates: ISODate[];
}

/**
 * The Abschnitt of the shown day (AC-001, AC-005, AC-006): the sections are laid from yesterday
 * on in steps of seven days, so today's section runs from yesterday to today + 5 and every other
 * one keeps that rhythm.
 */
export function overviewSection(shown: ISODate, today: ISODate): OverviewSection {
  const anchor = addDays(today, -1);
  const steps = Math.floor(daysBetween(anchor, shown) / OVERVIEW_DAYS);
  const from = addDays(anchor, steps * OVERVIEW_DAYS);
  const dates = Array.from({ length: OVERVIEW_DAYS }, (_, index) => addDays(from, index));
  return { from, to: addDays(from, OVERVIEW_DAYS - 1), dates };
}

/** ‹ › move section and shown day by seven days (AC-002, AC-003). */
export function shiftOverview(shown: ISODate, steps: number): ISODate {
  return addDays(shown, OVERVIEW_DAYS * steps);
}

function isInTodaysSection(shown: ISODate, today: ISODate): boolean {
  return overviewSection(shown, today).from === overviewSection(today, today).from;
}

/**
 * What stands between ‹ and › (AC-007, AC-011): "Sa 21.11. – Fr 27.11." without week number and
 * year, read out as "Samstag, 21. November, bis Freitag, 27. November". "Heute" can be tapped only
 * outside today's section (Entscheidung 1).
 */
export function overviewNav(
  shown: ISODate,
  today: ISODate,
): { label: string; a11yLabel: string; todayActive: boolean } {
  const { from, to } = overviewSection(shown, today);
  return {
    label: `${weekdayShort(from)} ${formatShortDate(from)} – ${weekdayShort(to)} ${formatShortDate(to)}`,
    a11yLabel: `${formatLongDate(from)}, bis ${formatLongDate(to)}`,
    todayActive: !isInTodaysSection(shown, today),
  };
}

/**
 * The one line under the title (AC-007, AC-008, Entscheidung 2): the greeting in today's section,
 * whichever day of it is chosen; outside "In 7 Tagen" / "Vor 8 Tagen".
 */
export function overviewSubline(shown: ISODate, today: ISODate, greeting: string): string {
  if (isInTodaysSection(shown, today)) return greeting;
  const days = daysBetween(today, shown);
  return days > 0 ? `In ${days} Tagen` : `Vor ${-days} Tagen`;
}

/**
 * Section titles of the shown day (AC-002, AC-032): "Heute geplant" / "Geplant am Samstag",
 * "Zu tun" / "Zu tun am Samstag" for later days, "Erledigt am Mittwoch" for past days.
 */
export function overviewSections(
  shown: ISODate,
  today: ISODate,
): { planned: string; chores: string } {
  if (shown === today) return { planned: 'Heute geplant', chores: 'Zu tun' };
  const weekday = weekdayLong(shown);
  return {
    planned: `Geplant am ${weekday}`,
    chores: shown < today ? `Erledigt am ${weekday}` : `Zu tun am ${weekday}`,
  };
}

/**
 * The dots under a day of the week strip: one per kind of plan entry, at most three (AC-005); a
 * collection has its own (spec 0009).
 */
export function dayDots(
  entries: MealPlanEntry[],
  date: ISODate,
  recipesById: Readonly<Record<Id, Pick<Recipe, 'kind'>>>,
): KindRole[] {
  return dayKinds(
    entries
      .filter((entry) => entry.date === date)
      .map((entry) => entryKindRole(entry, recipesById)),
  );
}

/**
 * Rank of an entry in a tile (REQ-003, Entscheidung 4): first the meals proper (collection,
 * recipe, restaurant), then leftovers and free text, then activities; lower is more important.
 */
function tileGroup(
  entry: MealPlanEntry,
  recipesById: Readonly<Record<Id, Pick<Recipe, 'kind'>>>,
): { group: number; inGroup: number } {
  switch (entry.kind) {
    case 'recipe':
      return { group: 0, inGroup: entryKindRole(entry, recipesById) === 'collection' ? 0 : 1 };
    case 'restaurant':
      return { group: 0, inGroup: 2 };
    case 'leftovers':
      return { group: 1, inGroup: 0 };
    case 'text':
      return { group: 1, inGroup: 1 };
    case 'activity':
      return { group: 2, inGroup: 0 };
  }
}

/**
 * The desktop tile (REQ-003, AC-012–AC-016): the most important entry of the day and how many
 * others it has. Within a group the later Tageszeit wins, then the kind, then the calendar order
 * of the Tageszeit. Chores, trips and reserved entries are no plan entries of the day.
 */
export function tileEntry(
  entries: MealPlanEntry[],
  date: ISODate,
  slotOrder: Id[],
  recipesById: Readonly<Record<Id, Pick<Recipe, 'kind'>>>,
): { entry: MealPlanEntry | undefined; more: number } {
  const ofDay = entriesForDay(entries, date, slotOrder);
  // Calendar order of the day, so equal ranks keep it.
  const position = new Map(ofDay.map((entry, index) => [entry.id, index]));
  const slotRank = (entry: MealPlanEntry) => slotOrder.indexOf(entry.slotId);
  const ranked = [...ofDay].sort((a, b) => {
    const ra = tileGroup(a, recipesById);
    const rb = tileGroup(b, recipesById);
    return (
      ra.group - rb.group ||
      slotRank(b) - slotRank(a) ||
      ra.inGroup - rb.inGroup ||
      (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0)
    );
  });
  return { entry: ranked[0], more: Math.max(0, ofDay.length - 1) };
}

/** From this many entries the planned section links "Alle n ›" into the calendar (AC-011). */
export const PLANNED_ALL_FROM = 4;

/** "Alle 5 ›" from four entries on; undefined below. */
export function plannedAllLabel(count: number): string | undefined {
  return count >= PLANNED_ALL_FROM ? `Alle ${count} ›` : undefined;
}

export interface TripLine {
  key: string;
  /** The people of the line; empty for the whole household. */
  memberIds: Id[];
  text: string;
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} und ${names[names.length - 1] ?? ''}`;
}

/**
 * The quiet lines about trips on the shown day (AC-007, Offene Frage 2 e): "Nadja · Urlaub
 * Mallorca · bis Do 26.11.", without a note "Nadja ist unterwegs bis Do 26.11."; several people
 * "Enrico und Vera sind unterwegs …", the whole household "Alle …". One line per stripe.
 */
export function tripLines(input: { trips: Trip[]; members: Member[]; date: ISODate }): TripLine[] {
  const { members, date } = input;
  // A draft has no effect, so nobody is "unterwegs" yet (spec 0030, AC-013).
  const confirmed = tripStripes(input.trips, members).filter((stripe) => !stripe.draft);
  return stripesOn(confirmed, date).map((stripe) => {
    const names = stripe.household
      ? ['Alle']
      : stripe.memberIds.map((id) => members.find((member) => member.id === id)?.name ?? '');
    const who = joinNames(names.filter((name) => name !== ''));
    const end = tripEndLabel(stripe.to);
    const plural = stripe.household || stripe.memberIds.length > 1;
    const text =
      stripe.note !== undefined
        ? `${who} · ${stripe.note} · ${end}`
        : `${who} ${plural ? 'sind' : 'ist'} unterwegs ${end}`;
    return { key: stripe.key, memberIds: stripe.household ? [] : stripe.memberIds, text };
  });
}

export type ChoresOfDay =
  /** Today: chores to check off, and in `items` what was done today (spec 0035, AC-002). */
  | { kind: 'due'; chores: Chore[]; items: HouseholdRowItem[] }
  /** A later day: the dates computed from each rhythm, only to look at. */
  | { kind: 'planned'; items: HouseholdRowItem[] }
  /** A past day: what was done, only to look at. */
  | { kind: 'done'; items: HouseholdRowItem[] }
  /**
   * Today or a later day the whole household is away (REQ-013): instead of the list "Ihr seid
   * unterwegs – Aufgaben warten bis Fr 11.12.".
   */
  | { kind: 'away'; notice: string; items: HouseholdRowItem[] };

/**
 * The chores of the shown day (AC-032): today what is due, later days the planned dates and past
 * days what was done, both from the household row (spec 0010). "bei Bedarf" never shows.
 * For today `items` is empty; the rows come from `chores`. Days of a trip of the whole household
 * from today on show the notice instead (spec 0026, AC-049, AC-050).
 */
export function choresOfDay(input: {
  chores: Chore[];
  events: ChoreEvent[];
  members: Member[];
  trips: Trip[];
  shown: ISODate;
  today: ISODate;
}): ChoresOfDay {
  const { shown, today } = input;
  const away = { members: input.members, trips: input.trips };
  const notice = shown >= today ? householdAwayNotice(shown, today, away) : undefined;
  if (notice !== undefined) return { kind: 'away', notice, items: [] };
  if (shown === today) {
    const done = (householdRow({ ...input, from: today, to: today })[today] ?? []).filter(
      (item) => item.status === 'done',
    );
    return { kind: 'due', chores: dueChores(input.chores, today, away), items: done };
  }
  const items = householdRow({ ...input, from: shown, to: shown })[shown] ?? [];
  return shown > today ? { kind: 'planned', items } : { kind: 'done', items };
}
