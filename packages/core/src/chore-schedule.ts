import {
  addDays,
  daysBetween,
  formatShortDate,
  isoWeekday,
  parseISODate,
  startOfWeek,
  weekdayShort,
} from './dates';
import { isOnTrip } from './trips';
import type { Chore, Id, ISODate, Member, Trip } from './types';

// When a chore is due (spec 0026, REQ-009 to REQ-014): the stored date (next_due_on) waits on
// trips until the first day somebody who can do the chore is at home ("frei"). Nothing is
// stored; a changed trip takes effect at once. The same rules live in SQL for the notification
// scheduler (private.chore_can_do_on, chore_first_free_day, chore_due_state,
// chore_acting_assignee, chore_due_text; ADR-0014) — a change here needs the other place, and
// notification_parity.test.sql carries the names of these tests.

/** Who is away when: the household's members and its trips (only its own, AC-044). */
export interface ChoreAway {
  members: readonly Member[];
  trips: readonly Trip[];
}

/** No trips: every day is free (for callers that do not look at trips). */
export function withoutTrips(members: readonly Member[]): ChoreAway {
  return { members, trips: [] };
}

/** The search for a free day gives up after this many days (a very long trip, broken data). */
export const MAX_WAIT_DAYS = 400;

/** Flexible chores show up under "Zu tun" once this share of their interval has passed. */
export const FLEXIBLE_DUE_FROM = 0.8;

function isAway(id: Id | undefined, day: ISODate, away: ChoreAway): boolean {
  return id !== undefined && isOnTrip(id, day, away.trips);
}

function knows(away: ChoreAway, id: Id): boolean {
  return away.members.some((member) => member.id === id);
}

/** The rotation in its order, only people who are (still) members. */
function rotationOf(chore: Chore, away: ChoreAway): Id[] {
  const { assignment } = chore;
  return assignment.type === 'rotating' ? assignment.memberIds.filter((id) => knows(away, id)) : [];
}

function fixedPerson(chore: Chore): Id | undefined {
  const { assignment } = chore;
  return assignment.type === 'fixed' ? (chore.nextAssigneeId ?? assignment.memberId) : undefined;
}

/**
 * Whether somebody who can do the chore is at home that day ("frei", REQ-011): fixed — the fixed
 * person; alternating — anyone of the rotation; anyone — anyone of the household; together —
 * everyone. Nobody to wait for (an empty rotation or household) counts as free.
 */
export function canDoChoreOn(chore: Chore, day: ISODate, away: ChoreAway): boolean {
  switch (chore.assignment.type) {
    case 'fixed':
      return !isAway(fixedPerson(chore), day, away);
    case 'rotating': {
      const rotation = rotationOf(chore, away);
      return rotation.length === 0 || rotation.some((id) => !isAway(id, day, away));
    }
    case 'anyone':
      return away.members.length === 0 || away.members.some((m) => !isAway(m.id, day, away));
    case 'together':
      return away.members.every((member) => !isAway(member.id, day, away));
  }
}

/** Every member is on a trip that day, whichever trips (REQ-013, AC-041). */
export function householdAwayOn(day: ISODate, away: ChoreAway): boolean {
  return away.members.length > 0 && away.members.every((m) => isAway(m.id, day, away));
}

/** The first day from `day` on when not the whole household is away (bounded like MAX_WAIT_DAYS). */
export function householdBackOn(day: ISODate, away: ChoreAway): ISODate {
  for (let step = 0; step < MAX_WAIT_DAYS; step++) {
    const candidate = addDays(day, step);
    if (!householdAwayOn(candidate, away)) return candidate;
  }
  return addDays(day, MAX_WAIT_DAYS);
}

/** The first free day of the chore from `from` on, also across overlapping trips (REQ-011). */
export function firstFreeDay(chore: Chore, from: ISODate, away: ChoreAway): ISODate {
  for (let step = 0; step < MAX_WAIT_DAYS; step++) {
    const candidate = addDays(from, step);
    if (canDoChoreOn(chore, candidate, away)) return candidate;
  }
  return addDays(from, MAX_WAIT_DAYS);
}

function flexibleEvery(chore: Chore): number | undefined {
  return chore.recurrence.type === 'flexible'
    ? Math.max(1, Math.floor(chore.recurrence.everyDays))
    : undefined;
}

/**
 * The stored date the trip rule starts from: next_due_on; a flexible chore without one counts
 * from its last time (decision 7). None for "bei Bedarf" and a one-off chore without a date.
 */
export function storedDueOn(chore: Chore): ISODate | undefined {
  if (chore.recurrence.type === 'asNeeded') return undefined;
  if (chore.nextDueOn !== undefined) return chore.nextDueOn;
  const every = flexibleEvery(chore);
  return every !== undefined && chore.lastDoneOn !== undefined
    ? addDays(chore.lastDoneOn, every)
    : undefined;
}

/**
 * "Termin nach REQ-011" and the day overdue days are counted from ("Zähltag"): the first free day
 * from the stored date on. A date before a trip stays (AC-036).
 */
export function choreDueOn(chore: Chore, away: ChoreAway): ISODate | undefined {
  const stored = storedDueOn(chore);
  return stored === undefined ? undefined : firstFreeDay(chore, stored, away);
}

function isPaused(chore: Chore, day: ISODate): boolean {
  const { activeMonths } = chore;
  // An empty list is treated like a missing one: a chore that is active in no month is not a
  // schedule anyone means.
  if (activeMonths === undefined || activeMonths.length === 0) return false;
  return !activeMonths.includes(parseISODate(day).getMonth() + 1);
}

/** True outside the chore's season (activeMonths) on that day. */
export function choreIsPaused(chore: Chore, day: ISODate): boolean {
  return isPaused(chore, day);
}

/**
 * Share of the flexible interval that has passed on `day`: 0…1 and beyond when due. Counted back
 * from the stored date (decision 7: next_due_on, so "Später" and "Nächstes Mal etwa" move it); the
 * clock keeps running during a trip (decision 6). 1 without any date, 0 for other rhythms.
 */
export function flexibleProgress(chore: Chore, day: ISODate): number {
  if (chore.recurrence.type !== 'flexible') return 0;
  if (chore.recurrence.everyDays <= 0) return 1;
  const every = Math.max(1, Math.floor(chore.recurrence.everyDays));
  const due = storedDueOn(chore);
  if (due === undefined) return 1;
  return Math.max(0, daysBetween(addDays(due, -every), day) / every);
}

export type ChoreDueState = 'overdue' | 'today' | 'flexibleDue';

/**
 * Whether the chore is due on `day` (core dueChores, SQL private.chore_due_state): never "bei
 * Bedarf", never outside its season, never on a day nobody who can do it is at home (REQ-011);
 * flexible from FLEXIBLE_DUE_FROM of its interval; otherwise "today" on its Zähltag and
 * "overdue" after it.
 */
export function choreDueState(
  chore: Chore,
  day: ISODate,
  away: ChoreAway,
): ChoreDueState | undefined {
  if (chore.recurrence.type === 'asNeeded' || isPaused(chore, day)) return undefined;
  if (!canDoChoreOn(chore, day, away)) return undefined;
  if (chore.recurrence.type === 'flexible') {
    return flexibleProgress(chore, day) >= FLEXIBLE_DUE_FROM ? 'flexibleDue' : undefined;
  }
  const due = choreDueOn(chore, away);
  if (due === undefined || due > day) return undefined;
  return due === day ? 'today' : 'overdue';
}

/** Days since the Zähltag of an overdue chore (0 when it is not overdue on `day`). */
export function daysOverdue(chore: Chore, day: ISODate, away: ChoreAway): number {
  if (choreDueState(chore, day, away) !== 'overdue') return 0;
  const due = choreDueOn(chore, away);
  return due === undefined ? 0 : daysBetween(due, day);
}

/**
 * The day the chore shows up next from `day` on: `day` itself while it is due; else the first
 * free day from the later of its Zähltag and `day`. The person whose turn it is counts for this
 * day (decision 16).
 */
export function choreShownOn(chore: Chore, day: ISODate, away: ChoreAway): ISODate {
  if (choreDueState(chore, day, away) !== undefined) return day;
  const due = choreDueOn(chore, away);
  return firstFreeDay(chore, due !== undefined && due > day ? due : day, away);
}

/** The next date of a chore with the day it really is due, and whether a trip moved it. */
export interface ChoreNextDate {
  date: ISODate;
  /** The trip rule moved it past the stored date: "nach der Reise". */
  afterTrip: boolean;
}

/**
 * "Nächstes Mal Fr 11.12. · nach der Reise" (AC-033): the Zähltag while it is due, else the day it
 * shows up next. Undefined without a date.
 */
export function choreNextDate(
  chore: Chore,
  today: ISODate,
  away: ChoreAway,
): ChoreNextDate | undefined {
  const stored = storedDueOn(chore);
  const due = choreDueOn(chore, away);
  if (stored === undefined || due === undefined) return undefined;
  const date =
    choreDueState(chore, today, away) === undefined ? choreShownOn(chore, today, away) : due;
  return { date, afterTrip: date !== stored };
}

/** "Fr 11.12.", with the year when it is not today's: "Di 16.3.2027" (AC-001, AC-017). */
export function choreDayLabel(day: ISODate, today: ISODate): string {
  const year = day.slice(0, 4) === today.slice(0, 4) ? '' : day.slice(0, 4);
  return `${weekdayShort(day)} ${formatShortDate(day)}${year}`;
}

/** "fällig seit gestern", "fällig seit 3 Tagen" (REQ-009; never "überfällig"). */
export function overdueText(days: number): string {
  return days === 1 ? 'fällig seit gestern' : `fällig seit ${days} Tagen`;
}

/**
 * The one wording for what is due (REQ-009): "heute", "heute, nach der Reise", "fällig seit
 * gestern", "fällig seit n Tagen"; before a moved date "nach der Reise am Fr 11.12."; flexible
 * "jetzt fällig" or "bald fällig". Undefined when there is nothing to say.
 */
export function choreDueLabel(chore: Chore, today: ISODate, away: ChoreAway): string | undefined {
  if (chore.recurrence.type === 'asNeeded' || isPaused(chore, today)) return undefined;
  const state = choreDueState(chore, today, away);
  if (state === 'flexibleDue') {
    return flexibleProgress(chore, today) >= 1 ? 'jetzt fällig' : 'bald fällig';
  }
  if (state === 'overdue') return overdueText(daysOverdue(chore, today, away));
  const next = choreNextDate(chore, today, away);
  if (state === 'today') return next?.afterTrip ? 'heute, nach der Reise' : 'heute';
  if (chore.recurrence.type === 'flexible') {
    // A flexible chore waits only when it would be due by now.
    if (flexibleProgress(chore, today) < FLEXIBLE_DUE_FROM || canDoChoreOn(chore, today, away)) {
      return undefined;
    }
    return `nach der Reise am ${choreDayLabel(firstFreeDay(chore, today, away), today)}`;
  }
  return next?.afterTrip ? `nach der Reise am ${choreDayLabel(next.date, today)}` : undefined;
}

export interface ChoreTurn {
  /** Whose turn it is by the rotation (stored as next_assignee_id). */
  regularId?: Id;
  /** Who does it on the day it shows up: the next one of the rotation who is at home (REQ-012). */
  actingId?: Id;
}

/**
 * Fixed: the fixed person. Alternating: the regular person and, when she is away on the day the
 * chore shows up next, the next one of the rotation who is at home; the order never changes.
 * Nobody for "egal wer" and "zu zweit".
 */
export function choreTurn(chore: Chore, today: ISODate, away: ChoreAway): ChoreTurn {
  const { assignment } = chore;
  if (assignment.type === 'fixed') {
    const id = fixedPerson(chore);
    return { regularId: id, actingId: id };
  }
  if (assignment.type !== 'rotating') return {};
  const rotation = rotationOf(chore, away);
  const regular = rotation.find((id) => id === chore.nextAssigneeId) ?? rotation[0];
  if (regular === undefined) return {};
  const day = choreShownOn(chore, today, away);
  const start = rotation.indexOf(regular);
  for (let offset = 0; offset < rotation.length; offset++) {
    const id = rotation[(start + offset) % rotation.length];
    if (id !== undefined && !isAway(id, day, away)) return { regularId: regular, actingId: id };
  }
  return { regularId: regular, actingId: regular };
}

/**
 * Member ids shown as avatars: everyone for "together", nobody for "egal wer", the fixed person,
 * and for alternating only who does it next (spec 0018, AC-016; REQ-012: the stand-in when the
 * regular person is away). Ids that are not among the members are left out.
 */
export function choreMemberIds(chore: Chore, today: ISODate, away: ChoreAway): Id[] {
  const { assignment } = chore;
  if (assignment.type === 'together') return away.members.map((member) => member.id);
  if (assignment.type === 'anyone') return [];
  const { actingId } = choreTurn(chore, today, away);
  return actingId !== undefined && knows(away, actingId) ? [actingId] : [];
}

function nameOf(away: ChoreAway, id: Id | undefined): string | undefined {
  return away.members.find((member) => member.id === id)?.name;
}

/** What the screen reader says for the avatar of an alternating chore: "dran: Nadja" (AC-016). */
export function choreTurnLabel(chore: Chore, today: ISODate, away: ChoreAway): string | undefined {
  if (chore.assignment.type !== 'rotating') return undefined;
  const name = nameOf(away, choreTurn(chore, today, away).actingId);
  return name ? `dran: ${name}` : undefined;
}

/** "dran: Nadja", standing in "dran: Nadja (für Enrico, unterwegs)" (AC-045). */
export function choreTurnText(chore: Chore, today: ISODate, away: ChoreAway): string | undefined {
  if (chore.assignment.type !== 'rotating') return undefined;
  const { regularId, actingId } = choreTurn(chore, today, away);
  const acting = nameOf(away, actingId);
  if (!acting) return undefined;
  const regular = regularId !== actingId ? nameOf(away, regularId) : undefined;
  return regular ? `dran: ${acting} (für ${regular}, unterwegs)` : `dran: ${acting}`;
}

/**
 * "Ihr seid unterwegs – Aufgaben warten bis Fr 11.12." on days the whole household is away
 * (REQ-013); undefined otherwise, also for a trip of single people (AC-052).
 */
export function householdAwayNotice(
  day: ISODate,
  today: ISODate,
  away: ChoreAway,
): string | undefined {
  if (!householdAwayOn(day, away)) return undefined;
  return `Ihr seid unterwegs – Aufgaben warten bis ${choreDayLabel(householdBackOn(day, away), today)}`;
}

export type ChoreBucket =
  'today' | 'overdue' | 'flexible' | 'thisWeek' | 'noDate' | 'later' | 'paused' | 'asNeeded';

/**
 * Where a chore stands in "Anstehend" and "Alle" (REQ-006, REQ-011): "bei Bedarf" in its own
 * bucket; outside its season "paused"; flexible chores "flexible"; a one-off chore without a date
 * "noDate" ("Ohne Termin"); due on today "today", "overdue"; otherwise by the day it shows up
 * next: within this Monday–Sunday week "thisWeek", else "later".
 */
export function choreBucket(chore: Chore, today: ISODate, away: ChoreAway): ChoreBucket {
  if (chore.recurrence.type === 'asNeeded') return 'asNeeded';
  if (isPaused(chore, today)) return 'paused';
  if (chore.recurrence.type === 'flexible') return 'flexible';
  if (storedDueOn(chore) === undefined)
    return chore.recurrence.type === 'once' ? 'noDate' : 'later';
  const state = choreDueState(chore, today, away);
  if (state === 'today' || state === 'overdue') return state;
  return choreShownOn(chore, today, away) <= addDays(startOfWeek(today), 6) ? 'thisWeek' : 'later';
}

const RANK: Record<ChoreDueState, number> = { overdue: 0, today: 1, flexibleDue: 2 };

/**
 * "Zu tun" on `today` (REQ-010, REQ-011): overdue chores first (the most recently due first, so
 * "fällig seit gestern" before "fällig seit 3 Tagen"), then due today, then nearly due flexible
 * ones; within that by stored date, then title (chores moved onto the same day, AC-033). "bei
 * Bedarf" never, and nothing on a day nobody who can do it is at home.
 */
export function dueChores(chores: readonly Chore[], today: ISODate, away: ChoreAway): Chore[] {
  return chores
    .flatMap((chore) => {
      const state = choreDueState(chore, today, away);
      return state === undefined
        ? []
        : [
            {
              chore,
              rank: RANK[state],
              due: choreDueOn(chore, away) ?? '',
              stored: storedDueOn(chore) ?? '',
            },
          ];
    })
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        (a.rank === 0 ? b.due.localeCompare(a.due) : 0) ||
        a.stored.localeCompare(b.stored) ||
        a.chore.title.localeCompare(b.chore.title, 'de'),
    )
    .map((entry) => entry.chore);
}

/**
 * "Was hast du erledigt?" with an empty search (spec 0031, AC-070): every chore of the household,
 * those of "Zu tun" first in its order (dueChores), then the others by name.
 */
export function doneSheetChores(
  chores: readonly Chore[],
  today: ISODate,
  away: ChoreAway,
): Chore[] {
  const due = dueChores(chores, today, away);
  const rest = chores
    .filter((chore) => !due.includes(chore))
    .sort((a, b) => a.title.localeCompare(b.title, 'de'));
  return [...due, ...rest];
}

/** The points of "Zu tun" today: the effort of every due chore (REQ-010). */
export function duePoints(chores: readonly Chore[], today: ISODate, away: ChoreAway): number {
  return dueChores(chores, today, away).reduce((sum, chore) => sum + chore.effort, 0);
}

/** "ca. 5 Punkte", "ca. 1 Punkt"; undefined for none (AC-031, AC-032). */
export function pointsLabel(points: number): string | undefined {
  if (points <= 0) return undefined;
  return `ca. ${points} ${points === 1 ? 'Punkt' : 'Punkte'}`;
}

export interface PostponeOption {
  key: 'plus1' | 'plus2' | 'weekend';
  /** "Morgen · Mo 23.11.", "Einen Tag später · Sa 28.11.", "Am Wochenende · Sa 28.11.". */
  label: string;
  date: ISODate;
}

/**
 * The entries of "Später" before „Datum …“ (REQ-005, decision 10): counted from the later of today
 * and the date after trips, so "Morgen" never pulls a future date forward. +1 and +2 days, and the
 * first Saturday or Sunday after that day unless it is one of them.
 */
export function postponeOptions(chore: Chore, today: ISODate, away: ChoreAway): PostponeOption[] {
  const due = choreDueOn(chore, away);
  const base = due !== undefined && due > today ? due : today;
  const fromToday = base === today;
  const one = addDays(base, 1);
  const two = addDays(base, 2);
  const options: PostponeOption[] = [
    {
      key: 'plus1',
      label: `${fromToday ? 'Morgen' : 'Einen Tag später'} · ${choreDayLabel(one, today)}`,
      date: one,
    },
    {
      key: 'plus2',
      label: `${fromToday ? 'Übermorgen' : 'Zwei Tage später'} · ${choreDayLabel(two, today)}`,
      date: two,
    },
  ];
  let weekend = one;
  while (isoWeekday(weekend) < 6) weekend = addDays(weekend, 1);
  if (weekend !== one && weekend !== two) {
    options.push({
      key: 'weekend',
      label: `Am Wochenende · ${choreDayLabel(weekend, today)}`,
      date: weekend,
    });
  }
  return options;
}

/**
 * The hint after "Später" (AC-013, AC-043): "Verschoben auf Di 24.11.", and when a trip moves it
 * on "Verschoben auf Sa 5.12. – wegen der Reise erst Fr 11.12.".
 */
export function postponedNotice(
  chore: Chore,
  day: ISODate,
  today: ISODate,
  away: ChoreAway,
): string {
  const free = firstFreeDay(chore, day, away);
  const text = `Verschoben auf ${choreDayLabel(day, today)}`;
  return free === day ? text : `${text} – wegen der Reise erst ${choreDayLabel(free, today)}`;
}
