import { formatShortDate, daysBetween, weekdayShort } from './dates';
import type { Absence, Id, ISODate, Member, PackingItem, PackingListBag } from './types';

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

/** The text on a stripe: its note, else "unterwegs" (D22; spec 0016, REQ-008). */
export function stripeText(stripe: Pick<AbsenceStripe, 'note'>): string {
  return stripe.note ?? 'unterwegs';
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
  /** Existing rows that stay, with the new dates, note and person. */
  update: Absence[];
  create: (AbsenceDraft & { memberId?: Id })[];
  removeIds: Id[];
  /**
   * Bags of a packing list that move to another written absence (patch `absence_id`, sent before
   * the removals): the row of `toMemberId` in `update` or `create`, undefined = the household's.
   */
  moveListBags: { listBagId: Id; toMemberId?: Id }[];
  /** Removed rows whose packing list is deleted with them; the window names them (decision 8). */
  droppedPackingLists: DroppedPackingList[];
}

export interface DroppedPackingList {
  absenceId: Id;
  memberId?: Id;
  /** Packstücke of the bags that are deleted with the absence. */
  itemCount: number;
}

/**
 * What saving the absence window writes (D23): all members chosen → one absence of the whole
 * household, otherwise one per chosen person. When editing a stripe, its rows are reused: first
 * for the same person (or the household), then for another one (`member_id` is patched),
 * preferring a row with a packing list, so the list stays (spec 0012, AC-039, decision 8).
 * Bags of a removed row move to the household's absence when rows become one, and a bag "für" a
 * chosen person moves to her row; what is left of a removed row's list is reported.
 * `packingList` holds the bags and Packstücke of the stripe's absences.
 */
export function planAbsenceWrite(
  input: AbsenceDraft & {
    existing: Absence[];
    memberIds: Id[];
    allMemberIds: Id[];
    packingList?: { listBags: readonly PackingListBag[]; items: readonly PackingItem[] };
  },
): AbsenceWritePlan {
  const everyone =
    input.allMemberIds.length > 0 && input.allMemberIds.every((id) => input.memberIds.includes(id));
  const targets: (Id | undefined)[] = everyone
    ? [undefined]
    : input.allMemberIds.filter((id) => input.memberIds.includes(id));
  const draft: AbsenceDraft = { from: input.from, to: input.to, note: input.note };
  const listBags = input.packingList?.listBags ?? [];
  const hasList = (absence: Absence) => listBags.some((bag) => bag.absenceId === absence.id);

  const left = [...input.existing];
  const rowOf = new Map<Id | undefined, Absence>();
  for (const memberId of targets) {
    const index = left.findIndex((absence) => absence.memberId === memberId);
    if (index !== -1) rowOf.set(memberId, left.splice(index, 1)[0] as Absence);
  }
  for (const memberId of targets) {
    if (rowOf.has(memberId) || left.length === 0) continue;
    const withList = left.findIndex(hasList);
    rowOf.set(memberId, left.splice(withList === -1 ? 0 : withList, 1)[0] as Absence);
  }

  const plan: AbsenceWritePlan = {
    update: [],
    create: [],
    removeIds: left.map((absence) => absence.id),
    moveListBags: [],
    droppedPackingLists: [],
  };
  for (const memberId of targets) {
    const reuse = rowOf.get(memberId);
    if (reuse) plan.update.push({ ...reuse, ...draft, memberId });
    else plan.create.push({ memberId, ...draft });
  }

  for (const bag of listBags) {
    const from = input.existing.find((absence) => absence.id === bag.absenceId);
    if (!from) continue;
    const removed = left.includes(from);
    const own = bag.memberId !== undefined && targets.includes(bag.memberId);
    if (everyone && removed) plan.moveListBags.push({ listBagId: bag.id, toMemberId: undefined });
    else if (own && rowOf.get(bag.memberId) !== from) {
      plan.moveListBags.push({ listBagId: bag.id, toMemberId: bag.memberId });
    }
  }

  const moved = new Set(plan.moveListBags.map((move) => move.listBagId));
  for (const absence of left) {
    const kept = listBags.filter((bag) => bag.absenceId === absence.id && !moved.has(bag.id));
    if (kept.length === 0) continue;
    const keptIds = new Set(kept.map((bag) => bag.id));
    const itemCount = (input.packingList?.items ?? []).filter((item) =>
      keptIds.has(item.listBagId),
    ).length;
    plan.droppedPackingLists.push({ absenceId: absence.id, memberId: absence.memberId, itemCount });
  }
  return plan;
}

/** Problems of the absence window (AC-035, AC-044); "Von" and "Bis" may be the same day. */
export function validateAbsenceDraft(input: { memberIds: Id[]; from: ISODate; to: ISODate }): {
  toBeforeFrom: boolean;
  noOne: boolean;
} {
  return { toBeforeFrom: input.to < input.from, noOne: input.memberIds.length === 0 };
}

/**
 * The hint under "Wer?" in "Reise eintragen" describes who is chosen (spec 0018, AC-021):
 * "Nur Enrico", "Nur Enrico und Vera", everyone "Ganzer Haushalt"; names in household order.
 */
export function absenceWhoHint(memberIds: readonly Id[], members: readonly Member[]): string {
  const chosen = members.filter((member) => memberIds.includes(member.id));
  if (chosen.length === 0) return 'Wähle, wer weg ist';
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
