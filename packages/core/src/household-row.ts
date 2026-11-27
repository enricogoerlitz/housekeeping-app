import {
  canDoChoreOn,
  choreIsPaused,
  choreMemberIds,
  choreTurn,
  firstFreeDay,
  storedDueOn,
  type ChoreAway,
} from './chore-schedule';
import { nextAssignee, nextDueAfter } from './chores';
import { addDays } from './dates';
import { withTime } from './notifications';
import type { Chore, ChoreEvent, Id, ISODate, Member, Trip } from './types';

// The household row of the calendar (spec 0010, REQ-006): past days show what was done, today what
// is due or overdue, future days the dates computed from each chore's rhythm. Trips move every
// date to the first day somebody who can do the chore is at home (spec 0026, REQ-011, REQ-012).
// Nothing is stored.

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
  /** A done item's entry in the history, to take it back (spec 0035, REQ-001). */
  eventId?: Id;
}

/**
 * The title a row shows: a flexible chore's date is approximate, said after a dot like other
 * details ("Pflanzen gießen · ungefähr"); a trailing ", etwa" read like cut-off text (D-09).
 */
export function householdItemTitle(item: HouseholdRowItem): string {
  return item.approximate ? `${item.title} · ungefähr` : item.title;
}

// Guards the stepping through a rhythm against broken dates; a range is at most a year.
const MAX_STEPS = 400;

/** Whose turn it is for the avatar on `day`; "egal wer" shows nobody, "zu zweit" everyone. */
function avatarsOn(chore: Chore, day: ISODate, away: ChoreAway): Id[] {
  return choreMemberIds(chore, day, away);
}

/** Open today: its date is reached and somebody who can do it is at home (AC-028, AC-037). */
function isOpenToday(chore: Chore, today: ISODate, away: ChoreAway): boolean {
  // "bei Bedarf" is never due, even with a stray date (spec 0011, AC-043).
  if (chore.recurrence.type === 'asNeeded' || choreIsPaused(chore, today)) return false;
  const stored = storedDueOn(chore);
  return stored !== undefined && stored <= today && canDoChoreOn(chore, today, away);
}

/**
 * The days a chore shows up after today up to `to`, each moved to its first free day, with who
 * does it. The rhythm goes on as if it was done on that day by that person, so dates of a trip
 * that land on the same day show once (AC-034, AC-048).
 */
function futureDates(
  chore: Chore,
  today: ISODate,
  to: ISODate,
  away: ChoreAway,
): { date: ISODate; scheduled: ISODate; memberIds: Id[] }[] {
  const result: { date: ISODate; scheduled: ISODate; memberIds: Id[] }[] = [];
  let date = storedDueOn(chore);
  if (date === undefined) return result;
  let current: Chore = chore;
  const advance = (doneOn: ISODate) => {
    const doer = choreTurn(current, doneOn, away).actingId;
    const scheduled: Chore = { ...current, nextDueOn: date };
    const nextAssigneeId =
      doer !== undefined
        ? (nextAssignee(scheduled, doer) ?? current.nextAssigneeId)
        : current.nextAssigneeId;
    date =
      chore.recurrence.type === 'flexible'
        ? addDays(doneOn, Math.max(1, Math.floor(chore.recurrence.everyDays)))
        : nextDueAfter(scheduled, doneOn);
    current = { ...current, nextDueOn: date, nextAssigneeId };
  };
  // Due or overdue and done today: the rhythm goes on from today (OFFEN in spec 0010's plan).
  if (date <= today && isOpenToday(chore, today, away)) advance(today);
  for (let step = 0; step < MAX_STEPS && date !== undefined; step++) {
    const shown = firstFreeDay(current, date > today ? date : addDays(today, 1), away);
    if (shown > to) break;
    result.push({ date: shown, scheduled: date, memberIds: avatarsOn(current, shown, away) });
    advance(shown);
  }
  return result;
}

/**
 * The household row for every day from…to (both inclusive), keyed by date. Days without chores
 * are missing. Today lists the open chores first and what was done today at the end (AC-018).
 * Only the household's own trips count (AC-044); days the whole household is away stay empty but
 * for what was done (AC-051).
 */
export function householdRow(input: {
  chores: Chore[];
  events: ChoreEvent[];
  members: Member[];
  trips: Trip[];
  from: ISODate;
  to: ISODate;
  today: ISODate;
}): Record<ISODate, HouseholdRowItem[]> {
  const { chores, events, from, to, today } = input;
  const away: ChoreAway = { members: input.members, trips: input.trips };
  const row: Record<ISODate, HouseholdRowItem[]> = {};
  const push = (date: ISODate, item: HouseholdRowItem) => {
    (row[date] ??= []).push(item);
  };

  if (from <= today && today <= to) {
    for (const chore of chores) {
      if (!isOpenToday(chore, today, away)) continue;
      push(today, {
        key: `open-${chore.id}`,
        choreId: chore.id,
        title: withTime(chore.title, chore.dueTime),
        memberIds: avatarsOn(chore, today, away),
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
      eventId: event.id,
      title: event.title,
      memberIds: [event.doneBy],
      status: 'done',
      approximate: false,
    });
  }

  if (to > today) {
    const planned: { item: HouseholdRowItem; date: ISODate; stored: ISODate; title: string }[] = [];
    for (const chore of chores) {
      if (chore.recurrence.type === 'asNeeded') continue;
      const approximate = chore.recurrence.type === 'flexible';
      for (const { date, scheduled, memberIds } of futureDates(chore, today, to, away)) {
        if (date < from || choreIsPaused(chore, date)) continue;
        planned.push({
          date,
          stored: scheduled,
          title: chore.title,
          item: {
            key: `plan-${chore.id}-${date}`,
            choreId: chore.id,
            title: withTime(chore.title, chore.dueTime),
            memberIds,
            status: 'planned',
            approximate,
          },
        });
      }
    }
    // Chores moved onto the same day stand by their stored date, then title (REQ-011).
    planned.sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.stored.localeCompare(b.stored) ||
        a.title.localeCompare(b.title, 'de'),
    );
    for (const { date, item } of planned) push(date, item);
  }
  return row;
}
