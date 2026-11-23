import { formatPickerDate, weekRangeLabel } from './calendar';
import {
  addDays,
  daysBetween,
  formatShortDate,
  startOfWeek,
  weekDates,
  weekdayShort,
} from './dates';
import type { Id, ISODate, MealSlot, Member } from './types';

// The window "Einplanen" (spec 0008, REQ-009, E11; spec 0023, REQ-013): weeks from Monday, the
// preselection and the texts of the button and the notice. One window for recipes and collections;
// restaurants and activities use it too (spec 0023, Decision 14; their extras come with spec 0024).

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

/** The day chips Mo … So of the week that holds the date, the date under the weekday (AC-053). */
export function weekDays(weekStart: ISODate): { date: ISODate; label: string; detail: string }[] {
  return weekDates(weekStart).map((date) => ({
    date,
    label: weekdayShort(date),
    detail: formatShortDate(date),
  }));
}

/** The week offset (planWeek) of the week that holds `date`: "Anderes Datum …" shows it (AC-054). */
export function weekOffsetFor(today: ISODate, date: ISODate): number {
  return Math.round(daysBetween(startOfWeek(today), startOfWeek(date)) / 7);
}

/**
 * Ids for "Wer isst mit?": the whole household, on any day. A trip changes nothing about eating
 * (spec 0030, REQ-008; replaces spec 0008, AC-036).
 */
export function eatersForDay(members: readonly Member[]): Id[] {
  return members.map((member) => member.id);
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
 * whole household, no guests and nobody cooking. Portions follow from eaters and guests. An
 * activity opens on the first Tageszeit ("Vormittag", spec 0024, REQ-006).
 */
export function defaultPlanChoice(
  today: ISODate,
  slots: readonly MealSlot[],
  members: readonly Member[],
  slot: 'first' | 'last' = 'last',
): PlanChoice {
  const sorted = [...slots].sort((a, b) => a.sort - b.sort);
  const chosen = slot === 'first' ? sorted[0] : sorted.at(-1);
  return {
    date: today,
    slotId: chosen?.id,
    eaterIds: eatersForDay(members),
    guests: 0,
    cookId: undefined,
  };
}

/** "Am Mi 25.11. Abend einplanen"; "Vormerken" without a day (AC-037; spec 0023, AC-053). */
export function planButtonLabel(date: ISODate | null, slotName: string): string {
  if (date === null) return 'Vormerken';
  return `Am ${weekdayShort(date)} ${formatShortDate(date)} ${slotName} einplanen`;
}

/**
 * Members arrived after the window opened (a sync after reloading, AC-055): while "Wer isst mit?"
 * is untouched the preselection follows them; a choice made by hand stays (AC-056). The same
 * choice when nothing changes.
 */
export function refreshPlanEaters(
  choice: PlanChoice,
  touched: boolean,
  members: readonly Member[],
): PlanChoice {
  if (touched) return choice;
  const eaterIds = eatersForDay(members);
  const same =
    eaterIds.length === choice.eaterIds.length &&
    eaterIds.every((id, index) => id === choice.eaterIds[index]);
  return same ? choice : { ...choice, eaterIds };
}

/**
 * The notice after planning, before "Ansehen": "Eingeplant: Mi 25.11., Abend" (spec 0018,
 * AC-025), with the year when it is not the current one ("Fr 15.1.2027", spec 0024, AC-018), or
 * "Vorgemerkt".
 */
export function plannedNotice(date: ISODate | null, slotName: string, today: ISODate): string {
  if (date === null) return 'Vorgemerkt';
  const day =
    date.slice(0, 4) === today.slice(0, 4)
      ? `${weekdayShort(date)} ${formatShortDate(date)}`
      : formatPickerDate(date);
  return `Eingeplant: ${day}, ${slotName}`;
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
 * Another day, or null for "Ohne Tag vormerken": only the day changes. "Wer isst mit?", guests,
 * Tageszeit and cook stay, because the preselection no longer depends on the day (spec 0030,
 * REQ-008, AC-031).
 */
export function withPlanDay(choice: PlanChoice, date: ISODate | null): PlanChoice {
  return { ...choice, date };
}

/**
 * ‹ ›: a chosen day moves by whole weeks to the same weekday, so the chosen chip stays in the
 * shown week and the button never names a day out of sight (AC-035). Without a day nothing
 * changes.
 */
export function pagePlanChoice(choice: PlanChoice, weeks: number): PlanChoice {
  if (choice.date === null) return choice;
  return withPlanDay(choice, addDays(choice.date, 7 * weeks));
}
