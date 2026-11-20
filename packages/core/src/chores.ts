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
import type { Assignment, Chore, Id, ISODate, Member, Recurrence } from './types';

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

export type ChoreBucket = 'today' | 'overdue' | 'flexible' | 'thisWeek' | 'later' | 'paused';
/**
 * Where a chore shows up. Chores outside their activeMonths are "paused", flexible ones too.
 * Otherwise flexible chores are always "flexible". Fixed chores: due today → "today",
 * earlier → "overdue", within the current Monday–Sunday week → "thisWeek", otherwise "later"
 * (also when no due date is set).
 */
export function choreBucket(chore: Chore, today: ISODate): ChoreBucket {
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
/** Days a fixed chore is overdue (0 when not, and for flexible chores). */
export function daysOverdue(chore: Chore, today: ISODate): number {
  if (chore.recurrence.type === 'flexible' || chore.nextDueOn === undefined) return 0;
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
 * flexible → doneOn + everyDays; once → undefined. The others keep their rhythm:
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
 * "einmalig", "wöchentlich Fr", "wöchentlich Mo, Do", "alle 2 Wochen Mo", "monatlich am 1.",
 * "monatlich", "alle 6 Monate", "jährlich", "etwa alle 10 Tage", "etwa wöchentlich",
 * "etwa alle 2 Wochen" (whole weeks are named as weeks).
 */
export function recurrenceLabel(recurrence: Recurrence): string {
  switch (recurrence.type) {
    case 'once':
      return 'einmalig';
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
 * Member ids shown as avatars for a chore: the next assignee, both for "together", all rotation
 * members for rotating. Ids that are not among the given members are left out.
 */
export function choreMemberIds(chore: Chore, members: Member[]): Id[] {
  const { assignment } = chore;
  if (assignment.type === 'together') return members.map((member) => member.id);

  const ids =
    assignment.type === 'rotating'
      ? assignment.memberIds
      : [chore.nextAssigneeId ?? (assignment.type === 'fixed' ? assignment.memberId : undefined)];
  return ids.filter(
    (id): id is Id => id !== undefined && members.some((member) => member.id === id),
  );
}
