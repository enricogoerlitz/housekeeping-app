import { monthName } from './calendar';
import {
  addDays,
  addMonths,
  dayInMonth,
  daysBetween,
  isoWeekday,
  parseISODate,
  startOfWeek,
  weekdayShortName,
} from './dates';
import { compareTimestamps } from './sync-delta';
import type {
  Assignment,
  Chore,
  ChoreEvent,
  ChoreEventPrevious,
  Id,
  ISODate,
  Member,
  Recurrence,
} from './types';

// Upper bound for stepping an "every n months" chore past a very late completion (200 years of
// monthly steps); it only guards against looping on broken dates.
const MAX_MONTH_STEPS = 2400;

function isPaused(chore: Chore, today: ISODate): boolean {
  const { activeMonths } = chore;
  // An empty list is treated like a missing one: a chore that is active in no month is not a
  // schedule anyone means.
  if (activeMonths === undefined || activeMonths.length === 0) return false;
  return !activeMonths.includes(parseISODate(today).getMonth() + 1);
}

export type ChoreBucket =
  'today' | 'overdue' | 'flexible' | 'thisWeek' | 'later' | 'paused' | 'asNeeded';
/**
 * Where a chore shows up. "bei Bedarf" is never due and has its own bucket, whatever its season
 * or a stray date, so it never counts among the chores "später" (spec 0011, AC-043).
 * Chores outside their activeMonths are "paused", flexible ones too.
 * Otherwise flexible chores are always "flexible". Fixed chores: due today → "today",
 * earlier → "overdue", within the current Monday–Sunday week → "thisWeek", otherwise "later"
 * (also when no due date is set).
 */
export function choreBucket(chore: Chore, today: ISODate): ChoreBucket {
  if (chore.recurrence.type === 'asNeeded') return 'asNeeded';
  if (isPaused(chore, today)) return 'paused';
  if (chore.recurrence.type === 'flexible') return 'flexible';

  const due = chore.nextDueOn;
  if (due === undefined) return 'later';
  if (due === today) return 'today';
  if (due < today) return 'overdue';
  return due <= addDays(startOfWeek(today), 6) ? 'thisWeek' : 'later';
}
/**
 * Share of the flexible interval that has passed since lastDoneOn: 0…1 and beyond when overdue.
 * 1 when the chore was never done, 0 for chores that are not flexible.
 */
export function flexibleProgress(chore: Chore, today: ISODate): number {
  if (chore.recurrence.type !== 'flexible') return 0;
  if (chore.lastDoneOn === undefined || chore.recurrence.everyDays <= 0) return 1;
  return Math.max(0, daysBetween(chore.lastDoneOn, today) / chore.recurrence.everyDays);
}
/** Days a fixed chore is overdue (0 when not, and for flexible and "bei Bedarf" chores). */
export function daysOverdue(chore: Chore, today: ISODate): number {
  const { type } = chore.recurrence;
  if (type === 'flexible' || type === 'asNeeded' || chore.nextDueOn === undefined) return 0;
  return Math.max(0, daysBetween(chore.nextDueOn, today));
}

function nextWeekly(reference: ISODate, every: number, weekdays: number[]): ISODate {
  const weeksToSkip = Math.max(1, Math.floor(every)) - 1;
  for (let offset = 1; offset <= 7; offset++) {
    const candidate = addDays(reference, offset);
    if (weekdays.includes(isoWeekday(candidate))) return addDays(candidate, 7 * weeksToSkip);
  }
  // No usable weekday configured: keep the weekday of the reference date.
  return addDays(reference, 7 * (weeksToSkip + 1));
}

function nextEveryMonths(scheduled: ISODate, every: number, doneOn: ISODate): ISODate {
  const step = Math.max(1, Math.floor(every));
  // Always counted from the scheduled date, so a clamped day ("31." → "28.") does not stick.
  for (let steps = 1; steps <= MAX_MONTH_STEPS; steps++) {
    const candidate = addMonths(scheduled, steps * step);
    if (candidate > doneOn) return candidate;
  }
  return addMonths(doneOn, step);
}

/**
 * Next due date after completing the chore on doneOn; always after doneOn.
 * flexible → doneOn + everyDays; once and "bei Bedarf" → undefined. The others keep their rhythm:
 * - weekly: the next configured weekday after the later of doneOn and the scheduled date
 *   (chore.nextDueOn), so an early completion counts for the occurrence still ahead; with
 *   `every` > 1 that many weeks minus one are added.
 * - monthly: the configured day in the month after the later of doneOn and the scheduled date;
 *   "monthly day 31" clamps to the last day of shorter months.
 * - everyMonths: the scheduled date plus `every` months, repeated until it lies after doneOn
 *   (from doneOn when nothing is scheduled).
 */
export function nextDueAfter(chore: Chore, doneOn: ISODate): ISODate | undefined {
  const { recurrence, nextDueOn } = chore;
  const reference = nextDueOn !== undefined && nextDueOn > doneOn ? nextDueOn : doneOn;

  switch (recurrence.type) {
    case 'once':
    case 'asNeeded':
      return undefined;
    case 'flexible':
      return addDays(doneOn, Math.max(1, recurrence.everyDays));
    case 'weekly':
      return nextWeekly(reference, recurrence.every, recurrence.weekdays);
    case 'monthly':
      return dayInMonth(reference, 1, recurrence.day);
    case 'everyMonths':
      return nextEveryMonths(nextDueOn ?? doneOn, recurrence.every, doneOn);
  }
}
/**
 * Rotating: the member after doneBy in the rotation (the current turn stays when doneBy is not
 * part of it); fixed: that member; otherwise undefined.
 */
export function nextAssignee(chore: Chore, doneBy: Id): Id | undefined {
  const { assignment } = chore;
  if (assignment.type === 'fixed') return assignment.memberId;
  if (assignment.type !== 'rotating') return undefined;

  const { memberIds } = assignment;
  const index = memberIds.indexOf(doneBy);
  if (index >= 0) return memberIds[(index + 1) % memberIds.length];
  // Someone outside the rotation helped out, which is nobody's turn.
  const current = chore.nextAssigneeId;
  return current !== undefined && memberIds.includes(current) ? current : memberIds[0];
}

function weekdayList(weekdays: number[]): string {
  return [...new Set(weekdays)]
    .sort((a, b) => a - b)
    .map(weekdayShortName)
    .filter((name) => name !== '')
    .join(', ');
}

/**
 * "einmalig", "bei Bedarf", "wöchentlich Fr", "wöchentlich Mo, Do", "alle 2 Wochen Mo", "monatlich am 1.",
 * "monatlich", "alle 6 Monate", "jährlich", "etwa alle 10 Tage", "etwa wöchentlich",
 * "etwa alle 2 Wochen" (whole weeks are named as weeks).
 */
export function recurrenceLabel(recurrence: Recurrence): string {
  switch (recurrence.type) {
    case 'once':
      return 'einmalig';
    case 'asNeeded':
      return 'bei Bedarf';
    case 'weekly': {
      const rhythm = recurrence.every === 1 ? 'wöchentlich' : `alle ${recurrence.every} Wochen`;
      return `${rhythm} ${weekdayList(recurrence.weekdays)}`.trim();
    }
    case 'monthly':
      return `monatlich am ${recurrence.day}.`;
    case 'everyMonths':
      if (recurrence.every === 1) return 'monatlich';
      if (recurrence.every === 12) return 'jährlich';
      return `alle ${recurrence.every} Monate`;
    case 'flexible': {
      const days = recurrence.everyDays;
      if (days === 1) return 'etwa täglich';
      if (days === 7) return 'etwa wöchentlich';
      if (days % 7 === 0) return `etwa alle ${days / 7} Wochen`;
      return `etwa alle ${days} Tage`;
    }
  }
}
/** "Enrico", "abwechselnd", "egal wer", "zu zweit"; "" when the fixed member is unknown. */
export function assignmentLabel(assignment: Assignment, members: Member[]): string {
  switch (assignment.type) {
    case 'fixed':
      return members.find((member) => member.id === assignment.memberId)?.name ?? '';
    case 'rotating':
      return 'abwechselnd';
    case 'anyone':
      return 'egal wer';
    case 'together':
      return 'zu zweit';
  }
}
/**
 * Member ids shown as avatars for a chore: the next assignee, both for "together", and for
 * rotating only whose turn it is (spec 0018, AC-016) — the next assignee when it is in the
 * rotation, else the first rotation member, as in the household row. Ids that are not among the
 * given members are left out.
 */
export function choreMemberIds(chore: Chore, members: Member[]): Id[] {
  const { assignment } = chore;
  if (assignment.type === 'together') return members.map((member) => member.id);
  const known = (id: Id | undefined): id is Id =>
    id !== undefined && members.some((member) => member.id === id);

  if (assignment.type === 'rotating') {
    const rotation = assignment.memberIds.filter(known);
    const turn = rotation.find((id) => id === chore.nextAssigneeId) ?? rotation[0];
    return turn === undefined ? [] : [turn];
  }
  const id =
    chore.nextAssigneeId ?? (assignment.type === 'fixed' ? assignment.memberId : undefined);
  return known(id) ? [id] : [];
}

/**
 * What the screen reader says for the avatar of an alternating chore: "dran: Nadja" (spec 0018,
 * AC-016); undefined for every other assignment, whose avatars are read by name.
 */
export function choreTurnLabel(chore: Chore, members: Member[]): string | undefined {
  if (chore.assignment.type !== 'rotating') return undefined;
  const [turn] = choreMemberIds(chore, members);
  const member = members.find((candidate) => candidate.id === turn);
  return member ? `dran: ${member.name}` : undefined;
}

// ---------- Spec 0011: completing, changing and the history chain ----------

/**
 * The first due date when a chore is created or its rhythm changes (spec 0011, Offene Frage 4 A
 * and 11 A). Counted from today, or from tomorrow when the chore was already done today:
 * - weekly: the next configured weekday (the start itself when nothing is configured);
 * - monthly: the configured day, this month or the next, clamped to the month's length;
 * - everyMonths: `every` months after the last time, never before the start; the start when it
 *   was never done;
 * - flexible: the interval after the last time, never before the start (a never done or
 *   overdue chore is due right away, as flexibleProgress already shows it);
 * - once: its own date; "bei Bedarf": none.
 */
export function firstDueOn(
  recurrence: Recurrence,
  today: ISODate,
  lastDoneOn?: ISODate,
): ISODate | undefined {
  const start = lastDoneOn !== undefined && lastDoneOn >= today ? addDays(today, 1) : today;
  const notBefore = (date: ISODate) => (date > start ? date : start);
  switch (recurrence.type) {
    case 'asNeeded':
      return undefined;
    case 'once':
      return recurrence.date;
    case 'weekly': {
      for (let offset = 0; offset < 7; offset++) {
        const date = addDays(start, offset);
        if (recurrence.weekdays.includes(isoWeekday(date))) return date;
      }
      return start;
    }
    case 'monthly': {
      const thisMonth = dayInMonth(start, 0, recurrence.day);
      return thisMonth >= start ? thisMonth : dayInMonth(start, 1, recurrence.day);
    }
    case 'everyMonths':
      if (lastDoneOn === undefined) return start;
      return notBefore(addMonths(lastDoneOn, Math.max(1, Math.floor(recurrence.every))));
    case 'flexible':
      if (lastDoneOn === undefined) return start;
      return notBefore(addDays(lastDoneOn, Math.max(1, recurrence.everyDays)));
  }
}

/** Whose turn it is after the assignment changed (or for a new chore). */
export function assigneeAfterAssignmentChange(
  assignment: Assignment,
  currentAssigneeId?: Id,
): Id | undefined {
  if (assignment.type === 'fixed') return assignment.memberId;
  if (assignment.type !== 'rotating') return undefined;
  const { memberIds } = assignment;
  return currentAssigneeId !== undefined && memberIds.includes(currentAssigneeId)
    ? currentAssigneeId
    : memberIds[0];
}

export interface CompletionOutcome {
  /** A one-off chore is gone once it is done. */
  deletesChore: boolean;
  nextDueOn: ISODate | undefined;
  lastDoneOn: ISODate | undefined;
  nextAssigneeId: Id | undefined;
}

/**
 * The chore's new state after an entry for doneOn (REQ-005, REQ-006): "done" moves the date on
 * (nextDueAfter), keeps the later of the old last time and doneOn, and hands a rotation on;
 * "skipped" only moves the date. A flexible interval runs from the later of both days, so a late
 * entry for an earlier day does not pull the date back. Done "einmalig" deletes the chore.
 */
export function completionOutcome(
  chore: Chore,
  input: { kind: 'done' | 'skipped'; doneOn: ISODate; doneBy: Id },
): CompletionOutcome {
  const { kind, doneOn, doneBy } = input;
  if (kind === 'skipped') {
    return {
      deletesChore: false,
      nextDueOn: nextDueAfter(chore, doneOn),
      lastDoneOn: chore.lastDoneOn,
      nextAssigneeId: chore.nextAssigneeId,
    };
  }
  const lastDoneOn =
    chore.lastDoneOn !== undefined && chore.lastDoneOn > doneOn ? chore.lastDoneOn : doneOn;
  return {
    deletesChore: chore.recurrence.type === 'once',
    nextDueOn: nextDueAfter(chore, chore.recurrence.type === 'flexible' ? lastDoneOn : doneOn),
    lastDoneOn,
    nextAssigneeId: nextAssignee(chore, doneBy) ?? chore.nextAssigneeId,
  };
}

const EPOCH = '1970-01-01T00:00:00Z';

/** Microseconds, as the database orders created_at; complete_chore compares the latest event. */
function bookedTime(event: ChoreEvent): number {
  // Not yet confirmed by the server: it was just booked on this device, so it is the latest.
  if (event.createdAt === undefined) return Number.POSITIVE_INFINITY;
  try {
    return compareTimestamps(event.createdAt, EPOCH);
  } catch {
    return 0;
  }
}

/**
 * The entry of a chore that was booked last (createdAt, then id), not the one with the latest
 * day: only so the recorded states form a clean chain (spec 0011, Offene Frage 9).
 */
export function latestBookedEvent(events: ChoreEvent[], choreId: Id): ChoreEvent | undefined {
  let latest: ChoreEvent | undefined;
  for (const event of events) {
    if (event.choreId !== choreId) continue;
    if (
      latest === undefined ||
      bookedTime(event) > bookedTime(latest) ||
      (bookedTime(event) === bookedTime(latest) && event.id > latest.id)
    ) {
      latest = event;
    }
  }
  return latest;
}

/**
 * What changing "Erledigt von" does to the chore (AC-059): only the latest booked "done" entry of
 * a chore that still exists hands the turn on, counted from the turn before that entry. Undefined
 * when only the avatar of the entry changes.
 */
export function reassignOutcome(input: {
  chore: Chore | undefined;
  events: ChoreEvent[];
  eventId: Id;
  doneBy: Id;
}): { nextAssigneeId: Id } | undefined {
  const { chore } = input;
  if (chore === undefined) return undefined;
  const latest = latestBookedEvent(input.events, chore.id);
  if (latest === undefined || latest.id !== input.eventId || latest.kind !== 'done') {
    return undefined;
  }
  const before: Chore = {
    ...chore,
    nextAssigneeId: latest.previous?.nextAssigneeId ?? chore.nextAssigneeId,
  };
  const nextAssigneeId = nextAssignee(before, input.doneBy);
  return nextAssigneeId === undefined ? undefined : { nextAssigneeId };
}

/**
 * What removing a history entry restores (AC-060): the recorded state before it, when it is the
 * latest booked entry of a chore that still exists; without a date when the chore is "bei Bedarf"
 * by now (as remove_chore_event). Undefined when only the entry goes.
 */
export function removalOutcome(input: {
  chore: Chore | undefined;
  events: ChoreEvent[];
  eventId: Id;
}): ChoreEventPrevious | undefined {
  const { chore } = input;
  if (chore === undefined) return undefined;
  const latest = latestBookedEvent(input.events, chore.id);
  if (latest === undefined || latest.id !== input.eventId) return undefined;
  if (latest.previous === undefined) return undefined;
  // A chore that is "bei Bedarf" by now is never due, whatever it was before (as the database).
  if (chore.recurrence.type !== 'asNeeded') return { ...latest.previous };
  const { lastDoneOn, nextAssigneeId } = latest.previous;
  return {
    ...(lastDoneOn !== undefined && { lastDoneOn }),
    ...(nextAssigneeId !== undefined && { nextAssigneeId }),
  };
}

export interface ChoreDraftErrors {
  title?: string;
  /** Only from the form (choreDraftErrors): a weekly rhythm without a day. */
  weekdays?: string;
}

/** Problems of the chore form (AC-052); an empty object when it can be saved. */
export function validateChoreDraft(draft: { title: string }): ChoreDraftErrors {
  return draft.title.trim() === '' ? { title: 'Titel fehlt' } : {};
}

const isMonth = (month: number) => Number.isInteger(month) && month >= 1 && month <= 12;

/**
 * The months of a season from…to (1–12, both inclusive), across the turn of the year when `to`
 * comes before `from`: (10, 3) → [10, 11, 12, 1, 2, 3]. Empty for a month outside 1–12.
 */
export function seasonMonths(from: number, to: number): number[] {
  if (!isMonth(from) || !isMonth(to)) return [];
  const months: number[] = [];
  for (let month = from; ; month = (month % 12) + 1) {
    months.push(month);
    if (month === to) return months;
  }
}

/**
 * "April–September", "Oktober–März", "Mai"; "" for all year (no months or all twelve). Months
 * that do not form one stretch are listed: "Januar, März".
 */
export function seasonLabel(activeMonths: number[] | undefined): string {
  const months = [...new Set(activeMonths ?? [])].filter(isMonth).sort((a, b) => a - b);
  if (months.length === 0 || months.length === 12) return '';
  const name = (month: number) => monthName(month - 1);
  // One stretch, also across the turn of the year, has exactly one month without a predecessor
  // and one without a successor.
  const starts = months.filter((month) => !months.includes(month === 1 ? 12 : month - 1));
  const ends = months.filter((month) => !months.includes(month === 12 ? 1 : month + 1));
  const [start] = starts;
  const [end] = ends;
  if (starts.length !== 1 || start === undefined || end === undefined) {
    return months.map(name).join(', ');
  }
  return start === end ? name(start) : `${name(start)}–${name(end)}`;
}

export interface DoneOnChoice {
  date: ISODate;
  label: 'heute' | 'gestern' | 'vorgestern';
}

/** The days "Als erledigt eintragen" offers (REQ-006): today, yesterday, the day before. */
export function doneOnChoices(today: ISODate): DoneOnChoice[] {
  return [
    { date: today, label: 'heute' },
    { date: addDays(today, -1), label: 'gestern' },
    { date: addDays(today, -2), label: 'vorgestern' },
  ];
}

/** The network dropped while checking off, nothing was booked (spec 0018, AC-024). */
export const OFFLINE_CHECK_NOTICE =
  'Offline – nichts wurde abgehakt. Mit Netz noch einmal abhaken.';

/** "Nadja war schneller (10:02)" in local time (AC-031); without the time when it is unreadable. */
export function fasterNotice(name: string, doneAt: string | undefined): string {
  const date = doneAt === undefined ? undefined : new Date(doneAt);
  if (date === undefined || Number.isNaN(date.getTime())) return `${name} war schneller`;
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return `${name} war schneller (${time})`;
}
