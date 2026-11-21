import { formatShortDate, daysBetween, weekdayShort } from './dates';
import type { Absence, Id, ISODate, Member } from './types';

// Absences in the calendar (spec 0010, REQ-009, REQ-010; D22, D23): a stripe stands for all
// absences with the same from, to and note; writing follows "all chosen = whole household".

export interface AbsenceStripe {
  /** Stable key: household or people, from, to and note. */
  key: string;
  absenceIds: Id[];
  /** The people on the stripe in household order; empty for the whole household. */
  memberIds: Id[];
  household: boolean;
  from: ISODate;
  to: ISODate;
  note?: string;
}

/** Groups absences into stripes, earliest first (then the one that ends first). */
export function absenceStripes(absences: Absence[], members: Member[]): AbsenceStripe[] {
  const order = (id: Id) => {
    const index = members.findIndex((member) => member.id === id);
    return index === -1 ? members.length : index;
  };
  const groups = new Map<string, AbsenceStripe>();
  for (const absence of absences) {
    const household = absence.memberId === undefined;
    const note = absence.note?.trim() || undefined;
    const group = `${household ? 'h' : 'm'}|${absence.from}|${absence.to}|${note ?? ''}`;
    const stripe = groups.get(group) ?? {
      key: group,
      absenceIds: [],
      memberIds: [],
      household,
      from: absence.from,
      to: absence.to,
      note,
    };
    stripe.absenceIds.push(absence.id);
    if (absence.memberId !== undefined && !stripe.memberIds.includes(absence.memberId)) {
      stripe.memberIds.push(absence.memberId);
    }
    groups.set(group, stripe);
  }
  return [...groups.values()]
    .map((stripe) => ({
      ...stripe,
      memberIds: [...stripe.memberIds].sort((a, b) => order(a) - order(b)),
    }))
    .sort(
      (a, b) =>
        a.from.localeCompare(b.from) ||
        a.to.localeCompare(b.to) ||
        (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
    );
}

/** The text on a stripe: its note, else "abwesend" (D22). */
export function stripeText(stripe: Pick<AbsenceStripe, 'note'>): string {
  return stripe.note ?? 'abwesend';
}

/** "bis Mo 4.1.": every stripe shows its end. */
export function absenceEndLabel(to: ISODate): string {
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
  stripe: Pick<AbsenceStripe, 'from' | 'to'>,
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
export function stripeLabelDate(stripe: Pick<AbsenceStripe, 'from'>, rangeStart: ISODate): ISODate {
  return stripe.from < rangeStart ? rangeStart : stripe.from;
}

/** Stripes that cover the date. */
export function stripesOn(stripes: AbsenceStripe[], date: ISODate): AbsenceStripe[] {
  return stripes.filter((stripe) => stripe.from <= date && date <= stripe.to);
}

export type YearDayAbsence =
  | { kind: 'none' }
  | { kind: 'household' }
  | { kind: 'one'; memberId: Id }
  | { kind: 'several'; memberIds: Id[] };

/**
 * How a day of the year view is coloured (REQ-005): the whole household → neutral, exactly one
 * person → her colour, several people → one fine line each.
 */
export function yearDayAbsence(date: ISODate, absences: Absence[]): YearDayAbsence {
  const covering = absences.filter((absence) => absence.from <= date && date <= absence.to);
  if (covering.some((absence) => absence.memberId === undefined)) return { kind: 'household' };
  const memberIds = [...new Set(covering.flatMap((absence) => absence.memberId ?? []))];
  if (memberIds.length === 0) return { kind: 'none' };
  const [only] = memberIds;
  if (memberIds.length === 1 && only !== undefined) return { kind: 'one', memberId: only };
  return { kind: 'several', memberIds };
}

/** Stripes that touch the year, in the order of absenceStripes (AC-016: both years). */
export function stripesOfYear(stripes: AbsenceStripe[], year: number): AbsenceStripe[] {
  const first = `${String(year).padStart(4, '0')}-01-01`;
  const last = `${String(year).padStart(4, '0')}-12-31`;
  return stripes.filter((stripe) => stripe.to >= first && stripe.from <= last);
}

/** "Kommend" (running and future, earliest first) and "Vergangen" (newest first). */
export function splitUpcomingPast(
  stripes: AbsenceStripe[],
  today: ISODate,
): { upcoming: AbsenceStripe[]; past: AbsenceStripe[] } {
  const upcoming = stripes.filter((stripe) => stripe.to >= today);
  const past = stripes
    .filter((stripe) => stripe.to < today)
    .sort((a, b) => b.to.localeCompare(a.to) || b.from.localeCompare(a.from));
  return { upcoming, past };
}

export interface AbsenceDraft {
  from: ISODate;
  to: ISODate;
  note?: string;
}

export interface AbsenceWritePlan {
  /** Existing rows that stay, with the new dates and note. */
  update: Absence[];
  create: (AbsenceDraft & { memberId?: Id })[];
  removeIds: Id[];
}

/**
 * What saving the absence window writes (D23): all members chosen → one absence of the whole
 * household, otherwise one per chosen person. When editing a stripe, its rows are reused for the
 * same person (or the household) and the rest are removed.
 */
export function planAbsenceWrite(
  input: AbsenceDraft & { existing: Absence[]; memberIds: Id[]; allMemberIds: Id[] },
): AbsenceWritePlan {
  const everyone =
    input.allMemberIds.length > 0 && input.allMemberIds.every((id) => input.memberIds.includes(id));
  const targets: (Id | undefined)[] = everyone
    ? [undefined]
    : input.allMemberIds.filter((id) => input.memberIds.includes(id));
  const draft: AbsenceDraft = { from: input.from, to: input.to, note: input.note };

  const plan: AbsenceWritePlan = { update: [], create: [], removeIds: [] };
  const left = [...input.existing];
  for (const memberId of targets) {
    const index = left.findIndex((absence) => absence.memberId === memberId);
    const reuse = index === -1 ? undefined : left.splice(index, 1)[0];
    if (reuse) plan.update.push({ ...reuse, ...draft });
    else plan.create.push({ memberId, ...draft });
  }
  plan.removeIds = left.map((absence) => absence.id);
  return plan;
}

/** Problems of the absence window (AC-035, AC-044); "Von" and "Bis" may be the same day. */
export function validateAbsenceDraft(input: { memberIds: Id[]; from: ISODate; to: ISODate }): {
  toBeforeFrom: boolean;
  noOne: boolean;
} {
  return { toBeforeFrom: input.to < input.from, noOne: input.memberIds.length === 0 };
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
