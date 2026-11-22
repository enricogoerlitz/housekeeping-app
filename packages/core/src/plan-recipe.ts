import { formatPickerDate, weekRangeLabel } from './calendar';
import { addDays, formatShortDate, startOfWeek, weekDates, weekdayShort } from './dates';
import { defaultEaters } from './meal-plan';
import type { Id, ISODate, MealSlot, Member, Trip } from './types';

// The window "Einplanen" on the recipe page (spec 0008, REQ-009, E11): weeks from Monday, the
// preselection and the texts of the button and the notice.

export interface PlanWeek {
  /** Monday of the week. */
  start: ISODate;
  /** "KW 47 · 16.–22. Nov". */
  label: string;
}

/** The week `offset` weeks from the one holding today; ‹ › page without limit (AC-035). */
export function planWeek(today: ISODate, offset: number): PlanWeek {
  const start = addDays(startOfWeek(today), 7 * offset);
  return { start, label: weekRangeLabel(start) };
}

/** The day chips Mo … So of the week that holds the date. */
export function weekDays(weekStart: ISODate): { date: ISODate; label: string }[] {
  return weekDates(weekStart).map((date) => ({ date, label: weekdayShort(date) }));
}

/** Ids for "Wer isst mit?": everyone not on a trip that day; everyone without a day (AC-036). */
export function eatersForDay(
  members: readonly Member[],
  date: ISODate | null,
  trips: readonly Trip[],
): Id[] {
  return defaultEaters(members, date, trips).map((member) => member.id);
}

export interface PlanChoice {
  /** null = "Ohne Tag vormerken". */
  date: ISODate | null;
  /** Undefined only for a household without Tageszeiten. */
  slotId?: Id;
  eaterIds: Id[];
  guests: number;
  /** Undefined = "niemand". */
  cookId?: Id;
}

/**
 * What the window opens with (AC-034, E11): today, the household's last Tageszeit ("Abend"), the
 * members present today, no guests and nobody cooking. Portions follow from eaters and guests.
 */
export function defaultPlanChoice(
  today: ISODate,
  slots: readonly MealSlot[],
  members: readonly Member[],
  trips: readonly Trip[],
): PlanChoice {
  const last = [...slots].sort((a, b) => a.sort - b.sort).at(-1);
  return {
    date: today,
    slotId: last?.id,
    eaterIds: eatersForDay(members, today, trips),
    guests: 0,
    cookId: undefined,
  };
}

/** "Am Sa Abend einplanen"; "Vormerken" without a day (AC-034, AC-037). */
export function planButtonLabel(date: ISODate | null, slotName: string): string {
  return date === null ? 'Vormerken' : `Am ${weekdayShort(date)} ${slotName} einplanen`;
}

/**
 * The notice after planning, before "Ansehen": "Eingeplant: Mi 25.11., Abend" (spec 0018,
 * AC-025) or "Vorgemerkt".
 */
export function plannedNotice(date: ISODate | null, slotName: string): string {
  if (date === null) return 'Vorgemerkt';
  return `Eingeplant: ${weekdayShort(date)} ${formatShortDate(date)}, ${slotName}`;
}

/**
 * The notice after adding from the calendar: "„Lasagne“ steht am Sa 28.11.", with the year when it
 * is not the current one ("Sa 16.1.2027"), "„Shakshuka“ ist vorgemerkt" without a day (spec 0016:
 * the calendar pages over months and years, a weekday and day alone are ambiguous).
 */
export function addedNotice(title: string, date: ISODate | null, today: ISODate): string {
  if (date === null) return `„${title}“ ist vorgemerkt`;
  const day =
    date.slice(0, 4) === today.slice(0, 4)
      ? `${weekdayShort(date)} ${formatShortDate(date)}`
      : formatPickerDate(date);
  return `„${title}“ steht am ${day}`;
}

/**
 * Another day, or null for "Ohne Tag vormerken": "Wer isst mit?" goes back to those present that
 * day, so nobody travelling stays chosen without notice; guests, Tageszeit and cook stay (E11, AC-036).
 */
export function withPlanDay(
  choice: PlanChoice,
  date: ISODate | null,
  members: readonly Member[],
  trips: readonly Trip[],
): PlanChoice {
  return { ...choice, date, eaterIds: eatersForDay(members, date, trips) };
}

/**
 * ‹ ›: a chosen day moves by whole weeks to the same weekday, so the chosen chip stays in the
 * shown week and the button never names a day out of sight (AC-035). Without a day nothing
 * changes.
 */
export function pagePlanChoice(
  choice: PlanChoice,
  weeks: number,
  members: readonly Member[],
  trips: readonly Trip[],
): PlanChoice {
  if (choice.date === null) return choice;
  return withPlanDay(choice, addDays(choice.date, 7 * weeks), members, trips);
}
