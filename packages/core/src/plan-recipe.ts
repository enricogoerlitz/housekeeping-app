import { weekRangeLabel } from './calendar';
import { addDays, startOfWeek, weekDates, weekdayShort } from './dates';
import { defaultEaters } from './meal-plan';
import type { Absence, Id, ISODate, MealSlot, Member } from './types';

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

/** Ids for "Wer isst mit?": everyone not absent that day; everyone without a day (AC-036). */
export function eatersForDay(
  members: readonly Member[],
  date: ISODate | null,
  absences: readonly Absence[],
): Id[] {
  return defaultEaters([...members], date, [...absences]).map((member) => member.id);
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
  absences: readonly Absence[],
): PlanChoice {
  const last = [...slots].sort((a, b) => a.sort - b.sort).at(-1);
  return {
    date: today,
    slotId: last?.id,
    eaterIds: eatersForDay(members, today, absences),
    guests: 0,
    cookId: undefined,
  };
}

/** "Am Sa Abend einplanen"; "Vormerken" without a day (AC-034, AC-037). */
export function planButtonLabel(date: ISODate | null, slotName: string): string {
  return date === null ? 'Vormerken' : `Am ${weekdayShort(date)} ${slotName} einplanen`;
}

/** The notice after planning, before "Ansehen": "Eingeplant: Sa Abend" or "Vorgemerkt". */
export function plannedNotice(date: ISODate | null, slotName: string): string {
  return date === null ? 'Vorgemerkt' : `Eingeplant: ${weekdayShort(date)} ${slotName}`;
}
