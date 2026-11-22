import { formatShortDate, daysBetween, weekdayShort } from './dates';
import type { Id, ISODate, Member, Trip } from './types';

// Trips in the calendar (spec 0010, REQ-009, REQ-010; spec 0022, REQ-014, REQ-015): one trip is
// one stripe and one packing list; "Ganzer Haushalt" is derived from its people.

/** The people of a trip, in the order of their rows. */
export function tripMemberIds(trip: Pick<Trip, 'members'>): Id[] {
  return trip.members.map((member) => member.memberId);
}

/** True when the person is on a trip that covers the day; from and to are inclusive. */
export function isOnTrip(memberId: Id, date: ISODate, trips: readonly Trip[]): boolean {
  return trips.some(
    (trip) =>
      trip.from <= date &&
      date <= trip.to &&
      trip.members.some((member) => member.memberId === memberId),
  );
}

/** "Reise-Streifen": one per trip. */
export interface TripStripe {
  /** Stable key: the trip's id. */
  key: string;
  tripId: Id;
  /** The people on the trip in household order. */
  memberIds: Id[];
  /** Every current member is on it (derived, AC-045). */
  household: boolean;
  from: ISODate;
  to: ISODate;
  note?: string;
}

function orderOf(members: readonly Member[]) {
  return (id: Id) => {
    const index = members.findIndex((member) => member.id === id);
    return index === -1 ? members.length : index;
  };
}

/** The stripe of one trip. */
export function stripeOf(trip: Trip, members: readonly Member[]): TripStripe {
  const order = orderOf(members);
  const memberIds = [...new Set(tripMemberIds(trip))].sort((a, b) => order(a) - order(b));
  return {
    key: trip.id,
    tripId: trip.id,
    memberIds,
    household: members.length > 0 && members.every((member) => memberIds.includes(member.id)),
    from: trip.from,
    to: trip.to,
    note: trip.note?.trim() || undefined,
  };
}

/** One stripe per trip, earliest first (then the one that ends first, then by id). */
export function tripStripes(trips: readonly Trip[], members: readonly Member[]): TripStripe[] {
  return trips
    .map((trip) => stripeOf(trip, members))
    .sort(
      (a, b) =>
        a.from.localeCompare(b.from) ||
        a.to.localeCompare(b.to) ||
        (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
    );
}

/** The text on a stripe: its note, else "unterwegs" (D22; spec 0016, REQ-008). */
export function stripeText(stripe: Pick<TripStripe, 'note'>): string {
  return stripe.note ?? 'unterwegs';
}

/** "bis Mo 4.1.": every stripe shows its end. */
export function tripEndLabel(to: ISODate): string {
  return `bis ${weekdayShort(to)} ${formatShortDate(to)}`;
}

export interface StripeSegment {
  /** Index of the first and last shown day within the range (0 = rangeStart). */
  start: number;
  end: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
}

/** The part of a stripe within rangeStart…rangeEnd (both inclusive); undefined outside. */
export function stripeSegment(
  stripe: Pick<TripStripe, 'from' | 'to'>,
  rangeStart: ISODate,
  rangeEnd: ISODate,
): StripeSegment | undefined {
  if (stripe.to < rangeStart || stripe.from > rangeEnd) return undefined;
  const first = stripe.from < rangeStart ? rangeStart : stripe.from;
  const last = stripe.to > rangeEnd ? rangeEnd : stripe.to;
  return {
    start: daysBetween(rangeStart, first),
    end: daysBetween(rangeStart, last),
    continuesBefore: stripe.from < rangeStart,
    continuesAfter: stripe.to > rangeEnd,
  };
}

/** Phones label a stripe on its first day, or on the first shown day when it began earlier. */
export function stripeLabelDate(stripe: Pick<TripStripe, 'from'>, rangeStart: ISODate): ISODate {
  return stripe.from < rangeStart ? rangeStart : stripe.from;
}

/** Stripes that cover the date. */
export function stripesOn(stripes: readonly TripStripe[], date: ISODate): TripStripe[] {
  return stripes.filter((stripe) => stripe.from <= date && date <= stripe.to);
}

export type YearDayTrip =
  | { kind: 'none' }
  | { kind: 'household' }
  | { kind: 'one'; memberId: Id }
  | { kind: 'several'; memberIds: Id[] };

/**
 * How a day of the year view is coloured (REQ-005): a trip of the whole household → neutral,
 * exactly one person → her colour, several people → one fine line each.
 */
export function yearDayTrip(date: ISODate, stripes: readonly TripStripe[]): YearDayTrip {
  const covering = stripesOn(stripes, date);
  if (covering.some((stripe) => stripe.household)) return { kind: 'household' };
  const memberIds = [...new Set(covering.flatMap((stripe) => stripe.memberIds))];
  if (memberIds.length === 0) return { kind: 'none' };
  const [only] = memberIds;
  if (memberIds.length === 1 && only !== undefined) return { kind: 'one', memberId: only };
  return { kind: 'several', memberIds };
}

/** Stripes that touch the year, in the order of tripStripes (AC-016: both years). */
export function stripesOfYear(stripes: readonly TripStripe[], year: number): TripStripe[] {
  const first = `${String(year).padStart(4, '0')}-01-01`;
  const last = `${String(year).padStart(4, '0')}-12-31`;
  return stripes.filter((stripe) => stripe.to >= first && stripe.from <= last);
}

/** "Kommend" (running and future, earliest first) and "Vergangen" (newest first). */
export function splitUpcomingPast(
  stripes: readonly TripStripe[],
  today: ISODate,
): { upcoming: TripStripe[]; past: TripStripe[] } {
  const upcoming = stripes.filter((stripe) => stripe.to >= today);
  const past = stripes
    .filter((stripe) => stripe.to < today)
    .sort((a, b) => b.to.localeCompare(a.to) || b.from.localeCompare(a.from));
  return { upcoming, past };
}

export interface TripDraft {
  from: ISODate;
  to: ISODate;
  note?: string;
}

/** Problems of the trip window (AC-010); "Von" and "Bis" may be the same day. */
export function validateTripDraft(input: {
  memberIds: readonly Id[];
  from: ISODate;
  to: ISODate;
}): {
  toBeforeFrom: boolean;
  noOne: boolean;
} {
  return { toBeforeFrom: input.to < input.from, noOne: input.memberIds.length === 0 };
}

/**
 * The hint under "Wer?" describes who is chosen (spec 0018, AC-021; spec 0022, AC-009, AC-010):
 * "Nur Enrico", "Nur Enrico und Vera", everyone "Ganzer Haushalt"; names in household order.
 */
export function tripWhoHint(memberIds: readonly Id[], members: readonly Member[]): string {
  const chosen = members.filter((member) => memberIds.includes(member.id));
  if (chosen.length === 0) return 'Wähle, wer unterwegs ist';
  if (chosen.length === members.length) return 'Ganzer Haushalt';
  const names = chosen.map((member) => member.name);
  const last = names.pop();
  return `Nur ${names.length > 0 ? `${names.join(', ')} und ${last}` : last}`;
}

/** The two date fields and which one the open month calendar is choosing (null = closed). */
export interface RangePick {
  from: ISODate;
  to: ISODate;
  editing: 'from' | 'to' | null;
}

/** A tap on "Von" or "Bis" opens the month calendar for that field. */
export function openRangeField(state: RangePick, field: 'from' | 'to'): RangePick {
  return { ...state, editing: field };
}

/** A tap on a day: "Von" goes on to "Bis", "Bis" closes the calendar (REQ-010). */
export function pickRangeDate(state: RangePick, date: ISODate): RangePick {
  if (state.editing === 'from') return { ...state, from: date, editing: 'to' };
  if (state.editing === 'to') return { ...state, to: date, editing: null };
  return state;
}

/** True when the day lies within from…to (both inclusive); never for an inverted range. */
export function inRange(date: ISODate, from: ISODate, to: ISODate): boolean {
  return from <= date && date <= to;
}
