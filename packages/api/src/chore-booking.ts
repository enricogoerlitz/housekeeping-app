// Booking a chore entry (spec 0011): the local effect and the complete_chore op carrying the state
// the device saw. Date and person afterwards come from core (completionOutcome); the server only
// checks that the chore still shows the seen state. Shared by the chore commands and the
// assistant; not exported from index.ts.
import {
  completionOutcome,
  fasterNotice,
  latestBookedEvent,
  type Chore,
  type ChoreEvent,
  type Id,
  type ISODate,
} from '@housekeeping/core';

import { choreToRow } from './db/mapping';
import { getData, getState, newId, peekState, updateData } from './store';
import {
  AlreadyDoneDetailSchema,
  TransportError,
  type ChangeOp,
  type ChoreCompletion,
} from './transport';

export interface BookingInput {
  kind: 'done' | 'skipped';
  doneOn: ISODate;
  doneBy: Id;
}

export interface Booking {
  eventId: Id;
  choreId: Id;
  /** The ops of the one apply_changes call: the insert of a new chore, then complete_chore. */
  ops: ChangeOp[];
  /** "Rückgängig": remove the entry (the server restores the state before), mend the chore. */
  undo: ChangeOp[];
}

/** The state of a chore as complete_chore compares it, with its latest booked entry in `events`. */
export function seenState(chore: Chore, events: readonly ChoreEvent[]): ChoreCompletion['seen'] {
  return {
    next_due_on: chore.nextDueOn ?? null,
    last_done_on: chore.lastDoneOn ?? null,
    next_assignee_id: chore.nextAssigneeId ?? null,
    latest_event_id: latestBookedEvent([...events], chore.id)?.id ?? null,
  };
}

/**
 * The complete_chore op for an entry; "skipped" keeps the person, so it sends none. `events` are
 * the entries the device sees before this one.
 */
export function completionOp(
  chore: Chore,
  events: readonly ChoreEvent[],
  eventId: Id,
  input: BookingInput,
  after: { nextDueOn?: ISODate; nextAssigneeId?: Id },
): ChangeOp {
  return {
    kind: 'complete_chore',
    completion: {
      chore_id: chore.id,
      event_id: eventId,
      kind: input.kind,
      done_on: input.doneOn,
      done_by: input.doneBy,
      seen: seenState(chore, events),
      next_due_on: after.nextDueOn ?? null,
      ...(input.kind === 'done' ? { next_assignee_id: after.nextAssigneeId ?? null } : {}),
    },
  };
}

/**
 * Books an entry locally (inside a commit) and returns the ops that book it on the server.
 * `isNew`: the chore does not exist yet ("Was anderes erledigt?" without a hit) and is inserted in
 * the same call, as it was before the entry. A done one-off chore disappears, as on the server.
 */
export function bookLocally(chore: Chore, input: BookingInput, isNew = false): Booking {
  const householdId = getState().activeHouseholdId;
  const seenEvents = isNew ? [] : getData().choreEvents;
  const outcome = completionOutcome(chore, input);
  const event: ChoreEvent = {
    id: newId(),
    choreId: chore.id,
    title: chore.title,
    kind: input.kind,
    doneOn: input.doneOn,
    doneBy: input.doneBy,
  };
  const after: Chore | undefined = outcome.deletesChore
    ? undefined
    : input.kind === 'done'
      ? {
          ...chore,
          nextDueOn: outcome.nextDueOn,
          lastDoneOn: outcome.lastDoneOn,
          nextAssigneeId: outcome.nextAssigneeId,
        }
      : { ...chore, nextDueOn: outcome.nextDueOn };
  updateData((data) => {
    const others = data.chores.filter((candidate) => candidate.id !== chore.id);
    const chores = isNew
      ? [...data.chores, ...(after ? [after] : [])]
      : after
        ? data.chores.map((candidate) => (candidate.id === chore.id ? after : candidate))
        : others;
    return { ...data, choreEvents: [event, ...data.choreEvents], chores };
  });

  const insert: ChangeOp = { kind: 'insert', table: 'chores', row: choreToRow(householdId, chore) };
  const remove: ChangeOp = { kind: 'remove_chore_event', id: event.id };
  const complete = completionOp(chore, seenEvents, event.id, input, outcome);
  let undo: ChangeOp[];
  if (isNew) undo = [remove, { kind: 'delete', table: 'chores', id: chore.id }];
  else if (outcome.deletesChore) undo = [insert, remove];
  else undo = [remove];
  return {
    eventId: event.id,
    choreId: chore.id,
    ops: isNew ? [insert, complete] : [complete],
    undo,
  };
}

/**
 * The hint for a refused booking: already_done names who was faster and when (AC-031), e.g.
 * „Nadja war schneller (10:02)“; any other refusal gets the general hint.
 */
export function bookingRejected(error: unknown): string | undefined {
  if (!(error instanceof TransportError) || error.code !== 'already_done') return undefined;
  const detail = AlreadyDoneDetailSchema.safeParse(error.detail);
  if (!detail.success) return fasterNotice('Jemand', undefined);
  const name = peekState()?.members.find((member) => member.id === detail.data.done_by)?.name;
  return fasterNotice(name ?? 'Jemand', detail.data.done_at);
}
