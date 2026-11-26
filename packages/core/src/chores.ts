import { monthName } from './calendar';
import { addDays, addMonths, dayInMonth, isoWeekday, weekdayShortName } from './dates';
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
// ---------- Spec 0011: completing, changing and the history chain ----------

/**
 * The suggested first date when a chore is created or its rhythm changes (spec 0011, Offene Frage
 * 4 A and 11 A; spec 0026, REQ-002, decision 8). Counted from today, or from tomorrow when the
 * chore was already done today, never before that start:
 * - weekly: the next configured weekday (the start itself when nothing is configured);
 * - monthly: the configured day, this month or the next, clamped to the month's length;
 * - everyMonths: `every` months after the last time, without one `every` months after today;
 * - flexible: the interval after the last time, without one the interval after today;
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
      return notBefore(addMonths(lastDoneOn ?? today, Math.max(1, Math.floor(recurrence.every))));
    case 'flexible':
      return notBefore(addDays(lastDoneOn ?? today, Math.max(1, recurrence.everyDays)));
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

/** How many days back an entry can be booked or moved (REQ-007, decision 11). */
export const BACKFILL_DAYS = 30;

/** A day an entry may stand on: today back to today − 30 (AC-020). */
export function isBackfillDay(day: ISODate, today: ISODate): boolean {
  return day <= today && day >= addDays(today, -BACKFILL_DAYS);
}

/**
 * What a tap on a done entry in the calendar or the overview offers (spec 0035, REQ-001):
 * "Zurücknehmen" only for the latest booked entry of its chore within the last 30 days, which
 * brings date, last time and person of before back (glossary, Erledigung); any other entry opens
 * the history. Undefined for an unknown entry.
 */
export function choreEventTakeBack(
  events: ChoreEvent[],
  eventId: Id,
  today: ISODate,
): 'takeBack' | 'history' | undefined {
  const event = events.find((candidate) => candidate.id === eventId);
  if (!event) return undefined;
  // An entry of a deleted chore brings nothing back; the history can still remove it.
  const latest = event.choreId === undefined ? undefined : latestBookedEvent(events, event.choreId);
  return latest?.id === event.id && isBackfillDay(event.doneOn, today) ? 'takeBack' : 'history';
}

export interface DoneOnChoice {
  date: ISODate;
  label: 'heute' | 'gestern' | 'vorgestern';
}

/** The quick days of "Was anderes erledigt?" before „Datum …“ (REQ-007). */
export function doneOnChoices(today: ISODate): DoneOnChoice[] {
  return [
    { date: today, label: 'heute' },
    { date: addDays(today, -1), label: 'gestern' },
    { date: addDays(today, -2), label: 'vorgestern' },
  ];
}

/**
 * What moving an entry to another day does to its chore (REQ-007, AC-021, AC-022): for the latest
 * booked entry of a chore that still exists and recorded its state before, date and last time are
 * computed again from that state, as if it had been booked on the new day (the turn stays).
 * Undefined when only the day of the entry changes.
 */
export function dayChangeOutcome(input: {
  chore: Chore | undefined;
  events: ChoreEvent[];
  eventId: Id;
  doneOn: ISODate;
}): { nextDueOn: ISODate | undefined; lastDoneOn: ISODate | undefined } | undefined {
  const { chore } = input;
  if (chore === undefined) return undefined;
  const latest = latestBookedEvent(input.events, chore.id);
  if (latest === undefined || latest.id !== input.eventId || latest.previous === undefined) {
    return undefined;
  }
  const before: Chore = {
    ...chore,
    nextDueOn: latest.previous.nextDueOn,
    lastDoneOn: latest.previous.lastDoneOn,
    nextAssigneeId: latest.previous.nextAssigneeId,
  };
  const outcome = completionOutcome(before, {
    kind: latest.kind,
    doneOn: input.doneOn,
    doneBy: latest.doneBy,
  });
  return {
    nextDueOn: chore.recurrence.type === 'asNeeded' ? undefined : outcome.nextDueOn,
    lastDoneOn: latest.kind === 'done' ? outcome.lastDoneOn : chore.lastDoneOn,
  };
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
