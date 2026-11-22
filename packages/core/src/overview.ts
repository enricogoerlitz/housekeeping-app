import { z } from 'zod';

import { stripesOn, tripEndLabel, tripStripes } from './trips';
import {
  dayKinds,
  entryKindRole,
  monthName,
  overflow,
  weekRangeLabel,
  type KindRole,
} from './calendar';
import { dueChores, householdAwayNotice } from './chore-schedule';
import { addDays, isoWeekNumber, parseISODate, startOfWeek, weekdayLong } from './dates';
import { householdRow, type HouseholdRowItem } from './household-row';
import { entriesForDay } from './meal-plan';
import type { Chore, ChoreEvent, Id, ISODate, MealPlanEntry, Member, Recipe, Trip } from './types';

// The "Übersicht" (spec 0011, REQ-001, REQ-002): one shown day, as if it were today, and the
// week around it. Nothing here is stored; the shown day lives only while the app runs.

/** "Samstag 21. November", with the year when it is not the year of today. */
function dayWithMonth(shown: ISODate, today: ISODate): string {
  const date = parseISODate(shown);
  const year = shown.slice(0, 4) === today.slice(0, 4) ? '' : ` ${shown.slice(0, 4)}`;
  return `${date.getDate()}. ${monthName(date.getMonth())}${year}`;
}

/**
 * The title of the shown day (Offene Frage 2 c): "Freitag, 20. November" (also today, which
 * the greeting accompanies), "Morgen, Samstag 21. November", "Gestern, Donnerstag 19. November",
 * in another year "Freitag, 8. Januar 2027". "Morgen" and "Gestern" never need the year.
 */
export function overviewTitle(shown: ISODate, today: ISODate): string {
  const weekday = weekdayLong(shown);
  if (shown === addDays(today, 1)) return `Morgen, ${weekday} ${dayWithMonth(shown, shown)}`;
  if (shown === addDays(today, -1)) return `Gestern, ${weekday} ${dayWithMonth(shown, shown)}`;
  return `${weekday}, ${dayWithMonth(shown, today)}`;
}

/** ‹ › go a whole week back or on and keep the weekday (Offene Frage 2 a, AC-003). */
export function shiftShownDay(shown: ISODate, weeks: number): ISODate {
  return addDays(shown, 7 * weeks);
}

/**
 * What stands between ‹ and ›: "Diese Woche · KW 47" in the week of today, otherwise the
 * week's range ("KW 49 · 30. Nov – 6. Dez", for the screen reader). The button "Heute" takes
 * the middle as soon as any other day is shown (AC-002, AC-062).
 */
export function weekNav(shown: ISODate, today: ISODate): { label: string; showToday: boolean } {
  const label =
    startOfWeek(shown) === startOfWeek(today)
      ? `Diese Woche · KW ${isoWeekNumber(shown)}`
      : weekRangeLabel(shown);
  return { label, showToday: shown !== today };
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

/** A desktop tile: the first entry of the day in the day's order and how many more (AC-006). */
export function dayTile(
  entries: MealPlanEntry[],
  date: ISODate,
  slotOrder: Id[],
): { first: MealPlanEntry | undefined; more: number } {
  const { shown, more } = overflow(entriesForDay(entries, date, slotOrder), 1);
  return { first: shown[0], more };
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
  return stripesOn(tripStripes(input.trips, members), date).map((stripe) => {
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
  /** Today: chores to check off. */
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
    return { kind: 'due', chores: dueChores(input.chores, today, away), items: [] };
  }
  const items = householdRow({ ...input, from: shown, to: shown })[shown] ?? [];
  return shown > today ? { kind: 'planned', items } : { kind: 'done', items };
}

const DayParam = z.iso.date();

/**
 * The day the "Übersicht" hands to the calendar as "/kalender?tag=JJJJ-MM-TT" (AC-004, AC-011,
 * AC-013, plan decision 12): a valid calendar date, else undefined, so the calendar ignores it.
 */
export function calendarDayParam(raw: string | string[] | undefined): ISODate | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const parsed = DayParam.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
