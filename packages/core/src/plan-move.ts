import { formatPickerDate } from './calendar';
import { formatShortDate, weekdayShort } from './dates';
import { isReminderPast } from './reminder';
import { isOnTrip } from './trips';
import type { Id, ISODate, MealPlanEntry, Trip } from './types';

// Moving a plan entry by dragging or "Anderes Datum …" (spec 0016, REQ-001 to REQ-005).

/** Why a target does not take the entry (REQ-004, AC-015). */
export type MoveBlockReason =
  /**
   * The dish would land on or after the place of its leftovers, or lose its day while they have
   * one.
   */
  | { kind: 'leftovers-planned'; leftoversDate: ISODate }
  /** The leftovers would land on or before the place of their dish. */
  | { kind: 'before-dish'; dishDate: ISODate };

/** A place in the plan: a day and the position of its Tageszeit in the household's order. */
export interface PlanPlace {
  date: ISODate;
  /** Index in the slot order; an unknown Tageszeit counts as the last one. */
  slot: number;
}

export interface MoveBound {
  /** Exclusive: the place itself does not take the entry either. */
  place: PlanPlace;
  reason: MoveBlockReason;
}

/**
 * Where an entry may move: strictly after `after` and strictly before `before`; a missing bound
 * means no limit, a missing `parked` means it may be "vorgemerkt". `slot` is the entry's own
 * Tageszeit, which a day of month or year and "Anderes Datum …" keep.
 */
export interface MoveBounds {
  after?: MoveBound;
  before?: MoveBound;
  /** Why the entry cannot lose its day. */
  parked?: MoveBlockReason;
  slot: number;
  slotOrder: readonly Id[];
}

/** Where an entry is dropped: a field of the week, a day of month or year, or "Vorgemerkt". */
export type DropTarget =
  { kind: 'slot'; date: ISODate; slotId: Id } | { kind: 'day'; date: ISODate } | { kind: 'parked' };

export type DropOutcome =
  | { kind: 'same' }
  | { kind: 'blocked'; reason: MoveBlockReason }
  | { kind: 'move'; date: ISODate | null; slotId: Id };

/** The position of a Tageszeit; unknown ones come last, as in `entriesForDay`. */
export function slotPosition(slotOrder: readonly Id[], slotId: Id): number {
  const index = slotOrder.indexOf(slotId);
  return index === -1 ? slotOrder.length : index;
}

/** Negative when a lies before b, 0 for the same place. */
export function comparePlaces(a: PlanPlace, b: PlanPlace): number {
  return a.date < b.date ? -1 : a.date > b.date ? 1 : a.slot - b.slot;
}

/**
 * The leftovers rule (spec 0010, REQ-011; spec 0021, REQ-012) as bounds for one entry: leftovers
 * lie after their dish, on a later day or the same day in a later Tageszeit; there is no limit in
 * days any more (Decision 10). It binds leftovers to their dish and a dish to its leftovers; an
 * entry without a day binds nothing (spec 0016, open question 6), a dish with leftovers on a day
 * cannot be "vorgemerkt" (REQ-004).
 */
export function moveBounds(
  entry: MealPlanEntry,
  entries: readonly MealPlanEntry[],
  slotOrder: readonly Id[] = [],
): MoveBounds {
  const placeOf = (candidate: MealPlanEntry): PlanPlace | undefined =>
    candidate.date === null
      ? undefined
      : { date: candidate.date, slot: slotPosition(slotOrder, candidate.slotId) };
  const bounds: MoveBounds = { slot: slotPosition(slotOrder, entry.slotId), slotOrder };

  const dish =
    entry.leftoversOfEntryId === undefined
      ? undefined
      : entries.find((candidate) => candidate.id === entry.leftoversOfEntryId);
  const dishPlace = dish ? placeOf(dish) : undefined;
  if (dishPlace) {
    bounds.after = { place: dishPlace, reason: { kind: 'before-dish', dishDate: dishPlace.date } };
  }

  const first = entries
    .flatMap((candidate) => {
      const place =
        candidate.id !== entry.id && candidate.leftoversOfEntryId === entry.id
          ? placeOf(candidate)
          : undefined;
      return place ? [place] : [];
    })
    .sort(comparePlaces)[0];
  if (first) {
    const reason: MoveBlockReason = { kind: 'leftovers-planned', leftoversDate: first.date };
    bounds.before = { place: first, reason };
    bounds.parked = reason;
  }
  return bounds;
}

function blockReason(bounds: MoveBounds, place: PlanPlace): MoveBlockReason | undefined {
  if (bounds.after && comparePlaces(place, bounds.after.place) <= 0) return bounds.after.reason;
  if (bounds.before && comparePlaces(place, bounds.before.place) >= 0) return bounds.before.reason;
  return undefined;
}

/**
 * True when the day takes the entry in its own Tageszeit, or in `slotId`: in the drag targets,
 * "Anderes Datum …" (AC-021) and the Tageszeit chips (REQ-012, too early ones are greyed out).
 */
export function isSelectableMoveDay(bounds: MoveBounds, date: ISODate, slotId?: Id): boolean {
  const slot = slotId === undefined ? bounds.slot : slotPosition(bounds.slotOrder, slotId);
  return blockReason(bounds, { date, slot }) === undefined;
}

/**
 * What dropping the entry on the target does (REQ-002 to REQ-004): a field of the week sets day
 * and Tageszeit, a day of month or year and "Vorgemerkt" keep the Tageszeit. The old place is
 * `same`, and nothing is saved. `slotOrder` orders the Tageszeiten of one day (REQ-012).
 */
export function dropOutcome(
  entry: MealPlanEntry,
  target: DropTarget,
  entries: readonly MealPlanEntry[],
  slotOrder: readonly Id[] = [],
): DropOutcome {
  const date = target.kind === 'parked' ? null : target.date;
  const slotId = target.kind === 'slot' ? target.slotId : entry.slotId;
  if (date === entry.date && slotId === entry.slotId) return { kind: 'same' };

  const bounds = moveBounds(entry, entries, slotOrder);
  const reason =
    date === null
      ? bounds.parked
      : blockReason(bounds, { date, slot: slotPosition(slotOrder, slotId) });
  if (reason) return { kind: 'blocked', reason };
  return { kind: 'move', date, slotId };
}
const shortDay = (iso: ISODate) => `${weekdayShort(iso)} ${formatShortDate(iso)}`;

/** "Fr 27.11. · Abend" at the dragged entry; "Vormerken" over "Vorgemerkt" (AC-001, AC-013). */
export function moveTargetLabel(date: ISODate | null, slotName: string): string {
  return date === null ? 'Vormerken' : `${shortDay(date)} · ${slotName}`;
}

const REMINDER_PAST_SUFFIX = ' · Erinnerung liegt in der Vergangenheit';

/**
 * The toast after a move (AC-001, AC-013, AC-019): "Lasagne → Fr 27.11., Abend", with the year
 * when it is not the current one ("Fr 8.1.2027"), "Lasagne vorgemerkt" without a day. Travellers
 * are not named: a trip changes nothing about eating (spec 0030, REQ-008). A reminder that now
 * lies in the past adds " · Erinnerung liegt in der Vergangenheit" (spec 0017, AC-022).
 */
export function moveToastText(input: {
  title: string;
  date: ISODate | null;
  slotName: string;
  today: ISODate;
  reminderPast?: boolean;
}): string {
  if (input.date === null) return `${input.title} vorgemerkt`;
  const day =
    input.date.slice(0, 4) === input.today.slice(0, 4)
      ? shortDay(input.date)
      : formatPickerDate(input.date);
  const reminder = input.reminderPast ? REMINDER_PAST_SUFFIX : '';
  return `${input.title} → ${day}, ${input.slotName}${reminder}`;
}

/** Why the target refused the entry (AC-015); `dishTitle` is the title of the dish. */
export function blockedText(reason: MoveBlockReason, dishTitle: string): string {
  switch (reason.kind) {
    case 'leftovers-planned':
      return `Reste von ${dishTitle} stehen schon am ${shortDay(reason.leftoversDate)}`;
    case 'before-dish':
      return 'Reste stehen immer nach ihrem Gericht';
  }
}

/** Who of `eaterIds` is on a trip that day (a calendar day's screen-reader text); nobody without a day. */
export function travellersOn(
  eaterIds: readonly Id[],
  date: ISODate | null,
  trips: readonly Trip[],
): Id[] {
  if (date === null) return [];
  return eaterIds.filter((id) => isOnTrip(id, date, trips));
}

export type PlanMove =
  | { kind: 'same' }
  | { kind: 'blocked'; message: string }
  | { kind: 'move'; date: ISODate | null; slotId: Id; message: string };

/**
 * One move as dragging and "Anderes Datum …" do it (REQ-004, REQ-005): where the entry lands and
 * the toast after it, or why the target refuses it. `title` is the entry's name in the plan. The
 * reminder keeps its distance in days and is judged at the new day in the household's zone
 * `timeZone` (spec 0017, REQ-006); parking clears it, so then nothing is added (AC-023).
 */
export function planMove(input: {
  entry: MealPlanEntry;
  target: DropTarget;
  entries: readonly MealPlanEntry[];
  slots: readonly { id: Id; name: string }[];
  title: string;
  today: ISODate;
  now: Date;
  timeZone: string;
}): PlanMove {
  const outcome = dropOutcome(
    input.entry,
    input.target,
    input.entries,
    input.slots.map((slot) => slot.id),
  );
  if (outcome.kind === 'same') return outcome;
  if (outcome.kind === 'blocked') {
    return { kind: 'blocked', message: blockedText(outcome.reason, input.title) };
  }
  const message = moveToastText({
    title: input.title,
    date: outcome.date,
    slotName: input.slots.find((slot) => slot.id === outcome.slotId)?.name ?? '',
    today: input.today,
    reminderPast:
      input.entry.reminder !== undefined &&
      outcome.date !== null &&
      isReminderPast(outcome.date, input.entry.reminder, input.now, input.timeZone),
  });
  return { ...outcome, message };
}

/** What the calendar drags: an entry, or the first day of a trip drawn across days (REQ-007). */
export type CalendarDragSource = { kind: 'entry'; entryId: Id } | { kind: 'trip'; date: ISODate };

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The id a drag source registers under: "entry:<id>" or "trip:<date>". */
export function dragSourceKey(source: CalendarDragSource): string {
  return source.kind === 'entry' ? `entry:${source.entryId}` : `trip:${source.date}`;
}

/** The source behind a key of `dragSourceKey`, or null for any other text. */
export function parseDragSourceKey(key: string): CalendarDragSource | null {
  const colon = key.indexOf(':');
  if (colon < 0) return null;
  const kind = key.slice(0, colon);
  const value = key.slice(colon + 1);
  if (kind === 'entry' && value !== '') return { kind: 'entry', entryId: value };
  if (kind === 'trip' && ISO_DAY.test(value)) return { kind: 'trip', date: value };
  return null;
}

/** The id a drop target registers under: "slot:<date>:<slotId>", "day:<date>" or "parked". */
export function moveTargetKey(target: DropTarget): string {
  if (target.kind === 'parked') return 'parked';
  if (target.kind === 'day') return `day:${target.date}`;
  return `slot:${target.date}:${target.slotId}`;
}

/** The target behind a key of `moveTargetKey`, or null (e.g. the own id of a grid of days). */
export function parseMoveTargetKey(key: string): DropTarget | null {
  if (key === 'parked') return { kind: 'parked' };
  const [kind, date, ...rest] = key.split(':');
  if (date === undefined || !ISO_DAY.test(date)) return null;
  if (kind === 'day' && rest.length === 0) return { kind: 'day', date };
  const slotId = rest.join(':');
  if (kind === 'slot' && slotId !== '') return { kind: 'slot', date, slotId };
  return null;
}

/**
 * The label on the dragged entry, because the finger covers the target (AC-001, AC-013,
 * AC-015): where it would land ("Fr 27.11. · Abend", "Vormerken"), or why the target refuses
 * it. `title` is the entry's name in the plan.
 */
export function dragTargetText(input: {
  entry: MealPlanEntry;
  target: DropTarget;
  entries: readonly MealPlanEntry[];
  slots: readonly { id: Id; name: string }[];
  title: string;
}): { allowed: boolean; label: string } {
  const outcome = dropOutcome(
    input.entry,
    input.target,
    input.entries,
    input.slots.map((slot) => slot.id),
  );
  if (outcome.kind === 'blocked') {
    return { allowed: false, label: blockedText(outcome.reason, input.title) };
  }
  const date = outcome.kind === 'move' ? outcome.date : input.entry.date;
  const slotId = outcome.kind === 'move' ? outcome.slotId : input.entry.slotId;
  const slotName = input.slots.find((slot) => slot.id === slotId)?.name ?? '';
  return { allowed: true, label: moveTargetLabel(date, slotName) };
}
