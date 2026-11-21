import { nextAssignee, nextDueAfter } from './chores';
import { addDays, parseISODate } from './dates';
import { withTime } from './notifications';
import type { Chore, ChoreEvent, Id, ISODate, Member } from './types';

// The household row of the calendar (spec 0010, REQ-006): past days show what was done, today what
// is due or overdue, future days the dates computed from each chore's rhythm. Nothing is stored.

export interface HouseholdRowItem {
  key: string;
  choreId?: Id;
  /** With the chore's time on open and planned days: "Müll rausbringen · 19:00" (spec 0013). */
  title: string;
  /** Avatars: who did it, or whose turn it is. */
  memberIds: Id[];
  /** done = from the history; open = due today, can be checked; planned = a computed date. */
  status: 'done' | 'open' | 'planned';
  /** Flexible chores: "etwa", drawn dashed. */
  approximate: boolean;
}

// Guards the stepping through a rhythm against broken dates; a range is at most a year.
const MAX_STEPS = 400;

function isActiveIn(chore: Chore, date: ISODate): boolean {
  const months = chore.activeMonths;
  if (months === undefined || months.length === 0) return true;
  return months.includes(parseISODate(date).getMonth() + 1);
}

/** Whose turn it is for the avatar; "egal wer" shows nobody, "zu zweit" everyone. */
function turnOf(chore: Chore, assigneeId: Id | undefined, members: Member[]): Id[] {
  const { assignment } = chore;
  if (assignment.type === 'together') return members.map((member) => member.id);
  if (assignment.type === 'anyone') return [];
  if (assignment.type === 'fixed') return [assignment.memberId];
  const id = assigneeId ?? assignment.memberIds[0];
  return id === undefined ? [] : [id];
}

/** When a flexible chore is due next: the interval after the last time, else its due date. */
function flexibleDue(chore: Chore, everyDays: number): ISODate | undefined {
  return chore.lastDoneOn !== undefined ? addDays(chore.lastDoneOn, everyDays) : chore.nextDueOn;
}

function isDueToday(chore: Chore, today: ISODate): boolean {
  // "bei Bedarf" is never due, even with a stray date (spec 0011, AC-043).
  if (chore.recurrence.type === 'asNeeded' || !isActiveIn(chore, today)) return false;
  const due =
    chore.recurrence.type === 'flexible'
      ? flexibleDue(chore, Math.max(1, chore.recurrence.everyDays))
      : (chore.nextDueOn ?? (chore.recurrence.type === 'once' ? chore.recurrence.date : undefined));
  return due !== undefined && due <= today;
}

/** Computed dates of one chore after today up to `to`, with the person whose turn it is. */
function futureDates(
  chore: Chore,
  today: ISODate,
  to: ISODate,
): { date: ISODate; assigneeId?: Id }[] {
  const { recurrence } = chore;
  const result: { date: ISODate; assigneeId?: Id }[] = [];
  if (recurrence.type === 'asNeeded') return result;
  if (recurrence.type === 'once') {
    const date = chore.nextDueOn ?? recurrence.date;
    if (date !== undefined && date > today) result.push({ date, assigneeId: chore.nextAssigneeId });
    return result;
  }
  if (recurrence.type === 'flexible') {
    const every = Math.max(1, recurrence.everyDays);
    let date = flexibleDue(chore, every);
    if (date === undefined) return result;
    if (date <= today) date = addDays(today, every);
    for (let step = 0; step < MAX_STEPS && date <= to; step++) {
      result.push({ date, assigneeId: chore.nextAssigneeId });
      date = addDays(date, every);
    }
    return result;
  }

  let date = chore.nextDueOn;
  if (date === undefined) return result;
  let assigneeId = chore.nextAssigneeId;
  const advance = (doneOn: ISODate) => {
    const current: Chore = { ...chore, nextDueOn: date, nextAssigneeId: assigneeId };
    const doer = turnOf(chore, assigneeId, [])[0];
    if (doer !== undefined) assigneeId = nextAssignee(current, doer) ?? assigneeId;
    date = nextDueAfter(current, doneOn);
  };
  // Due or overdue: the rhythm goes on as if it were done today (OFFEN in plan.md).
  if (date <= today) advance(today);
  for (let step = 0; step < MAX_STEPS && date !== undefined && date <= to; step++) {
    result.push({ date, assigneeId });
    advance(date);
  }
  return result;
}

/**
 * The household row for every day from…to (both inclusive), keyed by date. Days without chores
 * are missing. Today lists the open chores first and what was done today at the end (AC-018).
 */
export function householdRow(input: {
  chores: Chore[];
  events: ChoreEvent[];
  members: Member[];
  from: ISODate;
  to: ISODate;
  today: ISODate;
}): Record<ISODate, HouseholdRowItem[]> {
  const { chores, events, members, from, to, today } = input;
  const row: Record<ISODate, HouseholdRowItem[]> = {};
  const push = (date: ISODate, item: HouseholdRowItem) => {
    (row[date] ??= []).push(item);
  };

  if (from <= today && today <= to) {
    for (const chore of chores) {
      if (!isDueToday(chore, today)) continue;
      push(today, {
        key: `open-${chore.id}`,
        choreId: chore.id,
        title: withTime(chore.title, chore.dueTime),
        memberIds: turnOf(chore, chore.nextAssigneeId, members),
        status: 'open',
        approximate: false,
      });
    }
  }

  const done = events
    .filter(
      (event) =>
        event.kind !== 'skipped' &&
        event.doneOn >= from &&
        event.doneOn <= to &&
        event.doneOn <= today,
    )
    .sort((a, b) => a.doneOn.localeCompare(b.doneOn));
  for (const event of done) {
    push(event.doneOn, {
      key: `done-${event.id}`,
      choreId: event.choreId,
      title: event.title,
      memberIds: [event.doneBy],
      status: 'done',
      approximate: false,
    });
  }

  if (to > today) {
    for (const chore of chores) {
      const approximate = chore.recurrence.type === 'flexible';
      for (const { date, assigneeId } of futureDates(chore, today, to)) {
        if (date < from || !isActiveIn(chore, date)) continue;
        push(date, {
          key: `plan-${chore.id}-${date}`,
          choreId: chore.id,
          title: withTime(chore.title, chore.dueTime),
          memberIds: turnOf(chore, assigneeId, members),
          status: 'planned',
          approximate,
        });
      }
    }
  }
  return row;
}
