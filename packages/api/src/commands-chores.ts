// Chore commands (spec 0003, spec 0011). Entries are booked only by the domain op complete_chore
// with the state the device saw and removed only by remove_chore_event; chores themselves are
// rows. Every command is one apply_changes call (ADR-0011). Dates and persons come from core.
// Spec 0026: entries go 30 days back and change their day by change_chore_event_day; „Später“
// takes a day; the form sets „Nächstes Mal“, „Zuletzt erledigt“ and „Als Nächstes dran“.
import {
  assigneeAfterAssignmentChange,
  dayChangeOutcome,
  firstDueOn,
  isBackfillDay,
  reassignOutcome,
  remindAtDueTimeFor,
  removalOutcome,
  validateChoreDraft,
  type Assignment,
  type Chore,
  type Id,
  type ISODate,
  type Recurrence,
  type TimeOfDay,
} from '@housekeeping/core';

import {
  bookingRejected,
  bookLocally,
  completionOp,
  seenState,
  type Booking,
  type BookingInput,
} from './chore-booking';
import { commit, getData, getState, newId, updateData } from './store';
import { checkTime } from './times';
import { TransportError, type ChangeOp } from './transport';

export interface CompletionOptions {
  /** Today back to today − 30 (spec 0026, REQ-007); default today. Other days throw before sending. */
  doneOn?: ISODate;
  /** Who did it ("Erledigt von"); default the signed-in member. */
  doneBy?: Id;
}

export interface ChoreInput {
  title: string;
  room?: string;
  recurrence: Recurrence;
  assignment: Assignment;
  effort?: 1 | 2 | 3;
  /** Saison: months 1–12; empty or undefined = all year. */
  activeMonths?: number[];
  /**
   * "Uhrzeit" of the reminder on the due day (spec 0013, REQ-007), five-minute steps. When
   * editing, undefined keeps the chore's time and null removes it (✕); a new chore has none
   * without one.
   */
  dueTime?: TimeOfDay | null;
  /**
   * „Erinnern“ (spec 0027, REQ-009). Editing without it keeps the chore's; without a time it is
   * always saved as on (AC-038).
   */
  remindAtDueTime?: boolean;
  /**
   * „Nächstes Mal“ (spec 0026, REQ-002): today or later. Creating without one takes
   * core.firstDueOn; editing without one keeps the date unless the rhythm changed.
   */
  nextDueOn?: ISODate;
  /** „Zuletzt erledigt“ when creating: up to today, without a history entry (decision 9). */
  lastDoneOn?: ISODate;
  /** „Als Nächstes dran“ of an alternating chore (REQ-003): a person of the rotation. */
  nextAssigneeId?: Id;
}

/** A chore that does not exist yet, from „Was anderes erledigt?“; default „bei Bedarf“, anyone. */
export type NewChoreInput = Omit<ChoreInput, 'recurrence' | 'assignment'> & {
  recurrence?: Recurrence;
  assignment?: Assignment;
};

/** What „Was anderes erledigt?“ books: a hit of the search, or a new chore. */
export type DoneTarget = { choreId: Id } | NewChoreInput;

export interface LoggedEntry {
  eventId: Id;
  choreId: Id;
}

export interface ChoreEventRemoval {
  /** The latest booked entry: date, last time and person of before come back (AC-060). */
  restoresChore: boolean;
  /** "Rückgängig" can book it again: it restored the chore and lies within the last 30 days. */
  undoable: boolean;
}

function checkDay(doneOn: ISODate, today: ISODate): void {
  if (!isBackfillDay(doneOn, today)) throw new Error('Nur bis 30 Tage zurück');
}

/** „Nächstes Mal“ and „Später“ take today or a later day. */
function checkNextDue(day: ISODate | undefined, today: ISODate): void {
  if (day !== undefined && day < today) throw new Error('Nur ab heute');
}

/** „Als Nächstes dran“ counts only for a person of the rotation. */
function chosenTurn(assignment: Assignment, nextAssigneeId: Id | undefined): Id | undefined {
  return assignment.type === 'rotating' &&
    nextAssigneeId !== undefined &&
    assignment.memberIds.includes(nextAssigneeId)
    ? nextAssigneeId
    : undefined;
}

/** One booking as one apply_changes call; undo removes the entry again. */
function commitBooking(run: () => Booking): Booking {
  return commit<Booking>(
    {
      path: 'rpc',
      send: (transport, context) => transport.applyChanges(context.householdId, context.result.ops),
      inverse: (transport, context) =>
        transport.applyChanges(context.householdId, context.result.undo),
      rejectedMessage: bookingRejected,
    },
    run,
  );
}

function bookExisting(
  choreId: Id,
  kind: BookingInput['kind'],
  options: CompletionOptions,
): Booking | null {
  const state = getState();
  const chore = getData().chores.find((candidate) => candidate.id === choreId);
  if (!chore) return null;
  const doneOn = options.doneOn ?? state.today;
  checkDay(doneOn, state.today);
  const doneBy = options.doneBy ?? state.currentMemberId;
  return commitBooking(() => bookLocally(chore, { kind, doneOn, doneBy }));
}

/**
 * „Erledigt“: books the chore as done (REQ-005), by default today by the signed-in member. Date
 * and turn move on as core computes them; a one-off chore disappears. The server books only while
 * the chore still shows what this device saw; otherwise the entry springs back with
 * „Nadja war schneller (10:02)“ (already_done) or „Hat nicht geklappt – bitte noch einmal
 * versuchen“. Returns the entry's id, null for an unknown chore.
 */
export function completeChore(choreId: Id, options: CompletionOptions = {}): Id | null {
  return bookExisting(choreId, 'done', options)?.eventId ?? null;
}

/** „Überspringen“: booked as skipped, only the date moves (the turn and the last time stay). */
export function skipChore(choreId: Id, options: Pick<CompletionOptions, 'doneOn'> = {}): Id | null {
  return bookExisting(choreId, 'skipped', options)?.eventId ?? null;
}

function newChore(input: ChoreInput, today: ISODate): Chore {
  const errors = validateChoreDraft(input);
  if (errors.title) throw new Error(errors.title);
  checkTime(input.dueTime);
  checkNextDue(input.nextDueOn, today);
  if (input.lastDoneOn !== undefined && input.lastDoneOn > today) {
    throw new Error('Nur bis heute');
  }
  const asNeeded = input.recurrence.type === 'asNeeded';
  return {
    id: newId(),
    title: input.title.trim(),
    room: input.room?.trim() || undefined,
    recurrence: input.recurrence,
    assignment: input.assignment,
    effort: input.effort ?? 1,
    activeMonths: input.activeMonths?.length ? input.activeMonths : undefined,
    nextDueOn: asNeeded
      ? undefined
      : input.recurrence.type === 'once'
        ? input.recurrence.date
        : (input.nextDueOn ?? firstDueOn(input.recurrence, today, input.lastDoneOn)),
    lastDoneOn: input.lastDoneOn,
    nextAssigneeId:
      chosenTurn(input.assignment, input.nextAssigneeId) ??
      assigneeAfterAssignmentChange(input.assignment),
    dueTime: input.dueTime ?? undefined,
    remindAtDueTime: remindAtDueTimeFor(input.dueTime ?? undefined, input.remindAtDueTime ?? true)
      ? undefined
      : false,
  };
}

/**
 * „Als erledigt eintragen“ in „Was hast du erledigt?“ (REQ-006): a hit is booked like checking it
 * off, on the chosen day by the chosen person (AC-036 to AC-038). Without a hit a new chore is
 * created — „bei Bedarf“ for anyone, or planned with „Mehr Angaben“ — and booked in the same call
 * (AC-039, AC-040). Throws „Titel fehlt“ for an empty title. Null for an unknown chore.
 */
export function logDone(target: DoneTarget, options: CompletionOptions = {}): LoggedEntry | null {
  if ('choreId' in target) {
    const booking = bookExisting(target.choreId, 'done', options);
    return booking && { eventId: booking.eventId, choreId: booking.choreId };
  }
  const state = getState();
  const chore = newChore(
    {
      ...target,
      recurrence: target.recurrence ?? { type: 'asNeeded' },
      assignment: target.assignment ?? { type: 'anyone' },
    },
    state.today,
  );
  const doneOn = options.doneOn ?? state.today;
  checkDay(doneOn, state.today);
  const doneBy = options.doneBy ?? state.currentMemberId;
  const booking = commitBooking(() => bookLocally(chore, { kind: 'done', doneOn, doneBy }, true));
  return { eventId: booking.eventId, choreId: booking.choreId };
}

/**
 * „Erledigt von“ of an entry (AC-059): the latest booked „done“ entry of a chore also hands the
 * turn on, counted from the turn before it; an older entry only changes its avatar.
 */
export function reassignChoreEvent(eventId: Id, memberId: Id): void {
  commit({ path: 'diff' }, () =>
    updateData((data) => {
      const event = data.choreEvents.find((candidate) => candidate.id === eventId);
      if (!event) return data;
      const chore = data.chores.find((candidate) => candidate.id === event.choreId);
      const outcome = reassignOutcome({
        chore,
        events: data.choreEvents,
        eventId,
        doneBy: memberId,
      });
      return {
        ...data,
        choreEvents: data.choreEvents.map((candidate) =>
          candidate.id === eventId ? { ...candidate, doneBy: memberId } : candidate,
        ),
        chores: outcome
          ? data.chores.map((candidate) =>
              candidate.id === chore?.id
                ? { ...candidate, nextAssigneeId: outcome.nextAssigneeId }
                : candidate,
            )
          : data.chores,
      };
    }),
  );
}

/**
 * „Eintrag entfernen“ (AC-060): removes an entry; when it is the latest booked one of a chore that
 * still exists, date, last time and person of before come back (decided by the server, shown at
 * once as core predicts it). „Rückgängig“ (snapshot) books it again with the same id while
 * `undoable`. Null for an unknown entry.
 */
export function removeChoreEvent(eventId: Id): ChoreEventRemoval | null {
  const state = getState();
  const data = getData();
  const event = data.choreEvents.find((candidate) => candidate.id === eventId);
  if (!event) return null;
  const chore = data.chores.find((candidate) => candidate.id === event.choreId);
  const restored = removalOutcome({ chore, events: data.choreEvents, eventId });
  const after: Chore | undefined =
    chore && restored
      ? {
          ...chore,
          nextDueOn: restored.nextDueOn,
          lastDoneOn: restored.lastDoneOn,
          nextAssigneeId: restored.nextAssigneeId,
        }
      : undefined;
  const undoable =
    chore !== undefined &&
    after !== undefined &&
    event.doneBy !== '' &&
    isBackfillDay(event.doneOn, state.today) &&
    (chore.nextDueOn === undefined || chore.nextDueOn > event.doneOn);
  const rebook: ChangeOp | undefined =
    undoable && chore && after
      ? completionOp(
          after,
          data.choreEvents.filter((candidate) => candidate.id !== eventId),
          event.id,
          { kind: event.kind, doneOn: event.doneOn, doneBy: event.doneBy },
          chore,
        )
      : undefined;
  commit(
    {
      path: 'rpc',
      send: (transport, context) =>
        transport.applyChanges(context.householdId, [{ kind: 'remove_chore_event', id: eventId }]),
      ...(rebook && {
        inverse: (transport, context) => transport.applyChanges(context.householdId, [rebook]),
      }),
    },
    () =>
      updateData((current) => ({
        ...current,
        choreEvents: current.choreEvents.filter((candidate) => candidate.id !== eventId),
        chores: after
          ? current.chores.map((candidate) => (candidate.id === after.id ? after : candidate))
          : current.chores,
      })),
  );
  return { restoresChore: restored !== undefined, undoable };
}

/**
 * „Später“ (spec 0026, REQ-005): moves only the next date to `day` (today or later, as chosen in
 * the menu); rhythm, last time and person stay, nothing goes into the history. „Bei Bedarf“ has
 * no date to move. Throws for a day before today.
 */
export function postponeChore(choreId: Id, day: ISODate): void {
  checkNextDue(day, getState().today);
  commit({ path: 'diff' }, () =>
    updateData((data) => ({
      ...data,
      chores: data.chores.map((chore) =>
        chore.id !== choreId || chore.recurrence.type === 'asNeeded'
          ? chore
          : { ...chore, nextDueOn: day },
      ),
    })),
  );
}

/**
 * „Datum ändern“ of a history entry (spec 0026, REQ-007): the entry moves to `doneOn` (today back
 * to today − 30). For the latest booked entry of a chore that still exists, date and last time
 * are computed again from the state before it (core dayChangeOutcome); otherwise only the day
 * changes. The server refuses when the chore changed meanwhile or the entry is gone (AC-023);
 * the change then springs back with the general hint. False for an unknown entry.
 */
export function changeChoreEventDay(eventId: Id, doneOn: ISODate): boolean {
  const state = getState();
  const data = getData();
  const event = data.choreEvents.find((candidate) => candidate.id === eventId);
  if (!event) return false;
  checkDay(doneOn, state.today);
  const chore = data.chores.find((candidate) => candidate.id === event.choreId);
  const outcome = dayChangeOutcome({ chore, events: data.choreEvents, eventId, doneOn });
  const change: ChangeOp = {
    kind: 'change_chore_event_day',
    change: {
      event_id: eventId,
      done_on: doneOn,
      ...(chore && { seen: seenState(chore, data.choreEvents) }),
      ...(outcome && { next_due_on: outcome.nextDueOn ?? null }),
    },
  };
  commit(
    {
      path: 'rpc',
      send: (transport, context) => transport.applyChanges(context.householdId, [change]),
    },
    () =>
      updateData((current) => ({
        ...current,
        choreEvents: current.choreEvents.map((candidate) =>
          candidate.id === eventId ? { ...candidate, doneOn } : candidate,
        ),
        chores:
          chore && outcome
            ? current.chores.map((candidate) =>
                candidate.id === chore.id
                  ? { ...candidate, nextDueOn: outcome.nextDueOn, lastDoneOn: outcome.lastDoneOn }
                  : candidate,
              )
            : current.chores,
      })),
  );
  return true;
}

/**
 * A new chore (spec 0003, AC-036; spec 0011): its first date from core.firstDueOn (none for
 * „bei Bedarf“), the turn from the assignment. Throws „Titel fehlt“.
 */
export function createChore(input: ChoreInput): Id {
  const chore = newChore(input, getState().today);
  commit({ path: 'diff' }, () =>
    updateData((data) => ({ ...data, chores: [...data.chores, chore] })),
  );
  return chore.id;
}

/**
 * „Bearbeiten“ (AC-050 to AC-052): title, room, rhythm, assignment, effort, season and the time
 * (spec 0013, AC-022, AC-025: null removes it, undefined keeps it). A new rhythm
 * gets a new date as when creating (firstDueOn from the last time, Offene Frage 4), a new
 * assignment a new turn. Throws „Titel fehlt“ and saves nothing. A chore deleted meanwhile is
 * refused by the server (row_not_found) and springs back with the general hint (AC-054).
 */
export function updateChore(choreId: Id, input: ChoreInput): void {
  const errors = validateChoreDraft(input);
  if (errors.title) throw new Error(errors.title);
  checkTime(input.dueTime);
  const today = getState().today;
  const stored = getData().chores.find((chore) => chore.id === choreId);
  // An untouched „Nächstes Mal“ may lie in the past (overdue); only a new day must not.
  if (input.nextDueOn !== stored?.nextDueOn) checkNextDue(input.nextDueOn, today);
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  commit({ path: 'diff' }, () =>
    updateData((data) => ({
      ...data,
      chores: data.chores.map((chore): Chore => {
        if (chore.id !== choreId) return chore;
        const dueTime = input.dueTime === undefined ? chore.dueTime : (input.dueTime ?? undefined);
        return {
          ...chore,
          title: input.title.trim(),
          room: input.room?.trim() || undefined,
          recurrence: input.recurrence,
          assignment: input.assignment,
          effort: input.effort ?? chore.effort,
          activeMonths: input.activeMonths?.length ? input.activeMonths : undefined,
          dueTime,
          remindAtDueTime: remindAtDueTimeFor(
            dueTime,
            input.remindAtDueTime ?? chore.remindAtDueTime !== false,
          )
            ? undefined
            : false,
          nextDueOn:
            input.recurrence.type === 'asNeeded'
              ? undefined
              : input.recurrence.type === 'once' && !same(chore.recurrence, input.recurrence)
                ? input.recurrence.date
                : // A changed day was chosen; the stored day stands for „unchanged“.
                  ((input.nextDueOn !== chore.nextDueOn ? input.nextDueOn : undefined) ??
                  (same(chore.recurrence, input.recurrence)
                    ? chore.nextDueOn
                    : firstDueOn(input.recurrence, today, chore.lastDoneOn))),
          nextAssigneeId:
            chosenTurn(input.assignment, input.nextAssigneeId) ??
            (same(chore.assignment, input.assignment)
              ? chore.nextAssigneeId
              : assigneeAfterAssignmentChange(input.assignment, chore.nextAssigneeId)),
        };
      }),
    })),
  );
}

/**
 * „Löschen“ (AC-053): the chore goes, its entries stay with their title and lose the link (the
 * database clears it). One RPC (spec 0031, REQ-016): the server keeps a snapshot of the chore and
 * its entries for 1 hour, and „Rückgängig“ is restore_chore, which brings the chore back with the
 * same id and links exactly these entries again (AC-040).
 */
export function deleteChore(choreId: Id): void {
  const data = getData();
  const chore = data.chores.find((candidate) => candidate.id === choreId);
  if (!chore) return;
  commit(
    {
      path: 'rpc',
      send: (transport) => transport.deleteChore(choreId),
      // false: it is back by other means; nothing was restored, so it is refused like any refusal.
      inverse: async (transport) => {
        if (!(await transport.restoreChore(choreId))) {
          throw new TransportError('permanent', 'chore_not_restorable');
        }
      },
    },
    () =>
      updateData((current) => ({
        ...current,
        chores: current.chores.filter((candidate) => candidate.id !== choreId),
        choreEvents: current.choreEvents.map((event) =>
          event.choreId === choreId ? { ...event, choreId: undefined } : event,
        ),
      })),
  );
}
