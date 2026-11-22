import { formatPickerDate, joinNames } from './calendar';
import { addDays, formatShortDate, weekdayShort } from './dates';
import { isAbsent, LEFTOVER_DAYS } from './meal-plan';
import type { Absence, Id, ISODate, MealPlanEntry } from './types';

// Moving a plan entry by dragging or "Anderes Datum …" (spec 0016, REQ-001 to REQ-005).

/** Why a target does not take the entry (REQ-004, AC-015). */
export type MoveBlockReason =
  /** The dish would land on or after a day with its leftovers, or lose its day while they have one. */
  | { kind: 'leftovers-planned'; leftoversDate: ISODate }
  /** The leftovers would land on or before the day of their dish. */
  | { kind: 'before-dish'; dishDate: ISODate }
  /** Dish and leftovers would be more than seven days apart. */
  | { kind: 'too-far' };

export interface MoveBound {
  /** Inclusive. */
  date: ISODate;
  reason: MoveBlockReason;
}

/**
 * The days an entry may move to; a missing bound means no limit, a missing `parked` means it may
 * be "vorgemerkt".
 */
export interface MoveBounds {
  earliest?: MoveBound;
  latest?: MoveBound;
  /** Why the entry cannot lose its day. */
  parked?: MoveBlockReason;
}

/** Where an entry is dropped: a field of the week, a day of month or year, or "Vorgemerkt". */
export type DropTarget =
  { kind: 'slot'; date: ISODate; slotId: Id } | { kind: 'day'; date: ISODate } | { kind: 'parked' };

export type DropOutcome =
  | { kind: 'same' }
  | { kind: 'blocked'; reason: MoveBlockReason }
  | { kind: 'move'; date: ISODate | null; slotId: Id };

const later = (a: MoveBound | undefined, b: MoveBound): MoveBound =>
  a === undefined || b.date > a.date ? b : a;
const earlier = (a: MoveBound | undefined, b: MoveBound): MoveBound =>
  a === undefined || b.date < a.date ? b : a;

/**
 * The leftovers rule (spec 0010, REQ-011) as bounds for one entry: leftovers lie after their dish
 * and at most seven days after it. It binds leftovers to their dish and a dish to its leftovers;
 * an entry without a day binds nothing (spec 0016, open question 6), a dish with leftovers on a
 * day cannot be "vorgemerkt" (REQ-004).
 */
export function moveBounds(entry: MealPlanEntry, entries: readonly MealPlanEntry[]): MoveBounds {
  let earliest: MoveBound | undefined;
  let latest: MoveBound | undefined;
  let parked: MoveBlockReason | undefined;

  const dish =
    entry.leftoversOfEntryId === undefined
      ? undefined
      : entries.find((candidate) => candidate.id === entry.leftoversOfEntryId);
  if (dish?.date) {
    earliest = later(earliest, {
      date: addDays(dish.date, 1),
      reason: { kind: 'before-dish', dishDate: dish.date },
    });
    latest = earlier(latest, {
      date: addDays(dish.date, LEFTOVER_DAYS),
      reason: { kind: 'too-far' },
    });
  }

  const leftoversDates = entries
    .flatMap((candidate) =>
      candidate.id !== entry.id && candidate.leftoversOfEntryId === entry.id && candidate.date
        ? [candidate.date]
        : [],
    )
    .sort();
  const first = leftoversDates[0];
  const last = leftoversDates[leftoversDates.length - 1];
  if (first !== undefined && last !== undefined) {
    const reason: MoveBlockReason = { kind: 'leftovers-planned', leftoversDate: first };
    latest = earlier(latest, { date: addDays(first, -1), reason });
    earliest = later(earliest, {
      date: addDays(last, -LEFTOVER_DAYS),
      reason: { kind: 'too-far' },
    });
    parked = reason;
  }

  return {
    ...(earliest && { earliest }),
    ...(latest && { latest }),
    ...(parked && { parked }),
  };
}

function blockReason(bounds: MoveBounds, date: ISODate): MoveBlockReason | undefined {
  if (bounds.earliest && date < bounds.earliest.date) return bounds.earliest.reason;
  if (bounds.latest && date > bounds.latest.date) return bounds.latest.reason;
  return undefined;
}

/** True when the day takes the entry: in the drag targets and in "Anderes Datum …" (AC-021). */
export function isSelectableMoveDay(bounds: MoveBounds, date: ISODate): boolean {
  return blockReason(bounds, date) === undefined;
}

/**
 * What dropping the entry on the target does (REQ-002 to REQ-004): a field of the week sets day
 * and Tageszeit, a day of month or year and "Vorgemerkt" keep the Tageszeit. The old place is
 * `same`, and nothing is saved.
 */
export function dropOutcome(
  entry: MealPlanEntry,
  target: DropTarget,
  entries: readonly MealPlanEntry[],
): DropOutcome {
  const date = target.kind === 'parked' ? null : target.date;
  const slotId = target.kind === 'slot' ? target.slotId : entry.slotId;
  if (date === entry.date && slotId === entry.slotId) return { kind: 'same' };

  const bounds = moveBounds(entry, entries);
  const reason = date === null ? bounds.parked : blockReason(bounds, date);
  if (reason) return { kind: 'blocked', reason };
  return { kind: 'move', date, slotId };
}

const shortDay = (iso: ISODate) => `${weekdayShort(iso)} ${formatShortDate(iso)}`;

/** "Fr 27.11. · Abend" at the dragged entry; "Vormerken" over "Vorgemerkt" (AC-001, AC-013). */
export function moveTargetLabel(date: ISODate | null, slotName: string): string {
  return date === null ? 'Vormerken' : `${shortDay(date)} · ${slotName}`;
}

/**
 * The toast after a move (AC-001, AC-013, AC-016, AC-019): "Lasagne → Fr 27.11., Abend", with the
 * year when it is not the current one ("Fr 8.1.2027"), "Lasagne vorgemerkt" without a day, and
 * " · Nadja ist dann auf Reise" for eaters travelling on that day.
 */
export function moveToastText(input: {
  title: string;
  date: ISODate | null;
  slotName: string;
  today: ISODate;
  travellerNames?: readonly string[];
}): string {
  if (input.date === null) return `${input.title} vorgemerkt`;
  const day =
    input.date.slice(0, 4) === input.today.slice(0, 4)
      ? shortDay(input.date)
      : formatPickerDate(input.date);
  const names = input.travellerNames ?? [];
  const travel =
    names.length === 0
      ? ''
      : ` · ${joinNames(names)} ${names.length === 1 ? 'ist' : 'sind'} dann auf Reise`;
  return `${input.title} → ${day}, ${input.slotName}${travel}`;
}

/** Why the target refused the entry (AC-015); `dishTitle` is the title of the dish. */
export function blockedText(reason: MoveBlockReason, dishTitle: string): string {
  switch (reason.kind) {
    case 'leftovers-planned':
      return `Reste von ${dishTitle} stehen schon am ${shortDay(reason.leftoversDate)}`;
    case 'before-dish':
      return 'Reste stehen immer nach ihrem Gericht';
    case 'too-far':
      return 'Reste gehen bis sieben Tage nach dem Gericht';
  }
}

/** Eaters travelling on the day, in the order of `eaterIds`; nobody without a day (AC-016). */
export function travellersOn(
  eaterIds: readonly Id[],
  date: ISODate | null,
  absences: Absence[],
): Id[] {
  if (date === null) return [];
  return eaterIds.filter((id) => isAbsent(id, date, absences));
}
