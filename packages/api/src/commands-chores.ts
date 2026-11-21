import {
  addDays,
  isoWeekday,
  nextAssignee,
  nextDueAfter,
  type Assignment,
  type Chore,
  type ChoreEvent,
  type Id,
  type ISODate,
  type Recurrence,
} from '@housekeeping/core';

import { commit, getData, getState, newId, updateData } from './store';

/**
 * Marks a chore as done today: writes the history entry, computes the next due date and, for
 * rotating chores, hands the turn to the next person. One-off chores disappear.
 */
export function completeChore(choreId: Id, doneBy?: Id): Id | null {
  const state = getState();
  const chore = getData().chores.find((candidate) => candidate.id === choreId);
  if (!chore) return null;
  const memberId = doneBy ?? state.currentMemberId;
  const once = chore.recurrence.type === 'once';
  return commit({ path: 'diff', maxDeletes: { chores: once ? 1 : 0 } }, () => {
    const event: ChoreEvent = {
      id: newId(),
      choreId,
      title: chore.title,
      kind: 'done',
      doneOn: state.today,
      doneBy: memberId,
    };
    updateData((data) => ({
      ...data,
      choreEvents: [event, ...data.choreEvents],
      chores: once
        ? data.chores.filter((candidate) => candidate.id !== choreId)
        : data.chores.map((candidate) =>
            candidate.id === choreId
              ? {
                  ...candidate,
                  lastDoneOn: state.today,
                  nextDueOn: nextDueAfter(candidate, state.today),
                  nextAssigneeId: nextAssignee(candidate, memberId) ?? candidate.nextAssigneeId,
                }
              : candidate,
          ),
    }));
    return event.id;
  });
}

/** Books a history entry onto another person; a rotation continues after that person. */
export function reassignChoreEvent(eventId: Id, memberId: Id): void {
  commit({ path: 'diff' }, () =>
    updateData((data) => {
      const event = data.choreEvents.find((candidate) => candidate.id === eventId);
      if (!event) return data;
      return {
        ...data,
        choreEvents: data.choreEvents.map((candidate) =>
          candidate.id === eventId ? { ...candidate, doneBy: memberId } : candidate,
        ),
        chores: data.chores.map((chore) =>
          chore.id === event.choreId
            ? { ...chore, nextAssigneeId: nextAssignee(chore, memberId) ?? chore.nextAssigneeId }
            : chore,
        ),
      };
    }),
  );
}

/** "Später": moves only this occurrence by one day. */
export function postponeChore(choreId: Id): void {
  const today = getState().today;
  commit({ path: 'diff' }, () =>
    updateData((data) => ({
      ...data,
      chores: data.chores.map((chore) => {
        if (chore.id !== choreId) return chore;
        const from = chore.nextDueOn && chore.nextDueOn > today ? chore.nextDueOn : today;
        return { ...chore, nextDueOn: addDays(from, 1) };
      }),
    })),
  );
}

/** "Überspringen": recorded as skipped, not as done; the next regular date applies. */
export function skipChore(choreId: Id): void {
  const state = getState();
  const chore = getData().chores.find((candidate) => candidate.id === choreId);
  if (!chore) return;
  const event: ChoreEvent = {
    id: newId(),
    choreId,
    title: chore.title,
    kind: 'skipped',
    doneOn: state.today,
    doneBy: state.currentMemberId,
  };
  commit({ path: 'diff' }, () =>
    updateData((data) => ({
      ...data,
      choreEvents: [event, ...data.choreEvents],
      chores: data.chores.map((candidate) =>
        candidate.id === choreId
          ? { ...candidate, nextDueOn: nextDueAfter(candidate, state.today) }
          : candidate,
      ),
    })),
  );
}

export interface ChoreInput {
  title: string;
  room?: string;
  recurrence: Recurrence;
  assignment: Assignment;
  effort?: 1 | 2 | 3;
}

function firstDueOn(recurrence: Recurrence, today: ISODate): ISODate | undefined {
  switch (recurrence.type) {
    case 'once':
      return recurrence.date;
    case 'weekly': {
      for (let offset = 0; offset < 7; offset += 1) {
        const date = addDays(today, offset);
        if (recurrence.weekdays.includes(isoWeekday(date))) return date;
      }
      return today;
    }
    case 'monthly':
    case 'everyMonths':
    case 'flexible':
      return today;
  }
}

export function createChore(input: ChoreInput): Id {
  const title = input.title.trim();
  if (!title) throw new Error('Titel fehlt');
  const today = getState().today;
  const chore: Chore = {
    id: newId(),
    title,
    room: input.room?.trim() || undefined,
    recurrence: input.recurrence,
    assignment: input.assignment,
    effort: input.effort ?? 1,
    nextDueOn: firstDueOn(input.recurrence, today),
    nextAssigneeId:
      input.assignment.type === 'fixed'
        ? input.assignment.memberId
        : input.assignment.type === 'rotating'
          ? input.assignment.memberIds[0]
          : undefined,
  };
  commit({ path: 'diff' }, () =>
    updateData((data) => ({ ...data, chores: [...data.chores, chore] })),
  );
  return chore.id;
}

/** "Hab gerade …": something done without a matching chore. */
export function logSpontaneous(title: string): Id {
  const trimmed = title.trim();
  if (!trimmed) throw new Error('Der Text fehlt.');
  const state = getState();
  const event: ChoreEvent = {
    id: newId(),
    title: trimmed,
    kind: 'spontaneous',
    doneOn: state.today,
    doneBy: state.currentMemberId,
  };
  commit({ path: 'diff' }, () =>
    updateData((data) => ({ ...data, choreEvents: [event, ...data.choreEvents] })),
  );
  return event.id;
}
