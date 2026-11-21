// Chore commands (spec 0003, spec 0011). Entries are booked only by the domain op complete_chore
// with the state the device saw and removed only by remove_chore_event; chores themselves are
// rows. Every command is one apply_changes call (ADR-0011). Dates and persons come from core.
import {
  addDays,
  assigneeAfterAssignmentChange,
  doneOnChoices,
  firstDueOn,
  reassignOutcome,
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
  type Booking,
  type BookingInput,
} from './chore-booking';
import { choreToRow } from './db/mapping';
import { commit, getData, getState, newId, updateData } from './store';
import { checkTime } from './times';
import type { ChangeOp } from './transport';

export interface CompletionOptions {
  /** Heute, gestern or vorgestern (REQ-006); default today. Other days throw before sending. */
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
  /** "Rückgängig" can book it again: it restored the chore and lies within the last three days. */
  undoable: boolean;
}

function checkDay(doneOn: ISODate, today: ISODate): void {
  if (!doneOnChoices(today).some((choice) => choice.date === doneOn)) {
    throw new Error('Nur heute, gestern oder vorgestern');
  }
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
  return {
    id: newId(),
    title: input.title.trim(),
    room: input.room?.trim() || undefined,
    recurrence: input.recurrence,
    assignment: input.assignment,
    effort: input.effort ?? 1,
    activeMonths: input.activeMonths?.length ? input.activeMonths : undefined,
    nextDueOn: firstDueOn(input.recurrence, today),
    nextAssigneeId: assigneeAfterAssignmentChange(input.assignment),
    dueTime: input.dueTime ?? undefined,
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
    doneOnChoices(state.today).some((choice) => choice.date === event.doneOn) &&
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

/** „Später“: moves only this occurrence by one day („bei Bedarf“ has no date to move). */
export function postponeChore(choreId: Id): void {
  const today = getState().today;
  commit({ path: 'diff' }, () =>
    updateData((data) => ({
      ...data,
      chores: data.chores.map((chore) => {
        if (chore.id !== choreId || chore.recurrence.type === 'asNeeded') return chore;
        const from = chore.nextDueOn && chore.nextDueOn > today ? chore.nextDueOn : today;
        return { ...chore, nextDueOn: addDays(from, 1) };
      }),
    })),
  );
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
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  commit({ path: 'diff' }, () =>
    updateData((data) => ({
      ...data,
      chores: data.chores.map((chore): Chore => {
        if (chore.id !== choreId) return chore;
        return {
          ...chore,
          title: input.title.trim(),
          room: input.room?.trim() || undefined,
          recurrence: input.recurrence,
          assignment: input.assignment,
          effort: input.effort ?? chore.effort,
          activeMonths: input.activeMonths?.length ? input.activeMonths : undefined,
          dueTime: input.dueTime === undefined ? chore.dueTime : (input.dueTime ?? undefined),
          nextDueOn: same(chore.recurrence, input.recurrence)
            ? chore.nextDueOn
            : firstDueOn(input.recurrence, today, chore.lastDoneOn),
          nextAssigneeId: same(chore.assignment, input.assignment)
            ? chore.nextAssigneeId
            : assigneeAfterAssignmentChange(input.assignment, chore.nextAssigneeId),
        };
      }),
    })),
  );
}

/**
 * „Löschen“ (AC-053): the chore goes, its entries stay with their title and lose the link (the
 * database clears it). „Rückgängig“ (snapshot) inserts the chore with the same id and links its
 * entries again, in one call.
 */
export function deleteChore(choreId: Id): void {
  const data = getData();
  const chore = data.chores.find((candidate) => candidate.id === choreId);
  if (!chore) return;
  const linked = data.choreEvents.filter((event) => event.choreId === choreId);
  commit(
    {
      path: 'rpc',
      send: (transport, context) =>
        transport.applyChanges(context.householdId, [
          { kind: 'delete', table: 'chores', id: choreId },
        ]),
      inverse: (transport, context) =>
        transport.applyChanges(context.householdId, [
          { kind: 'insert', table: 'chores', row: choreToRow(context.householdId, chore) },
          ...linked.map((event): ChangeOp => ({
            kind: 'patch',
            table: 'chore_events',
            id: event.id,
            changes: { chore_id: choreId },
          })),
        ]),
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
