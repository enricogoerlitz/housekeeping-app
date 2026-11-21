import {
  completeChore,
  OfflineError,
  useChoreEvents,
  useChores,
  useMembersById,
} from '@housekeeping/api';
import { fasterNotice, latestBookedEvent, type Chore, type Id } from '@housekeeping/core';
import { haptic, toast, useCheckWindow, type CheckWindowState } from '@housekeeping/ui';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';

import { checkAnnouncement } from './chore-labels';

const BOOKING_FAILED = 'Hat nicht geklappt – bitte noch einmal versuchen';

type Tapped = Pick<Chore, 'nextDueOn' | 'lastDoneOn' | 'nextAssigneeId'> & {
  latestEventId?: Id;
};

/**
 * Checking chores off with the "Sammel-Fenster" (spec 0011, REQ-005): a tap strikes the row
 * through and keeps it in place, a second tap takes it back; 2 s after the last tap every chore
 * still checked is booked as done today by the signed-in member, and the rows leave (they are
 * due later now). Leaving the screen, also by switching tabs, books at once (AC-030). The
 * booking shows at once and stays shown until the server confirmed it, so the rows do not come
 * back in between; a refusal brings the row back with the server's hint, e.g. „Nadja war
 * schneller (10:02)“ (AC-031, AC-034). The one check list of „Anstehend“, „Zu tun“ and the
 * household row of the calendar.
 */
export function useChoreCheckWindow(chores: readonly Chore[]): CheckWindowState<Chore> {
  const all = useChores();
  const events = useChoreEvents();
  const membersById = useMembersById();
  // What each checked row showed when it was tapped. Another device may book the same chore
  // while the window runs; once the sync brought that here, booking again would count it twice
  // (or mark the next time as done). Such a row is not booked; the hint names who was faster
  // (AC-031). The server makes the same comparison with the state sent at booking time.
  const seen = useRef(new Map<Id, Tapped>());
  const stateOf = (chore: Chore): Tapped => ({
    nextDueOn: chore.nextDueOn,
    lastDoneOn: chore.lastDoneOn,
    nextAssigneeId: chore.nextAssigneeId,
    latestEventId: latestBookedEvent(events, chore.id)?.id,
  });

  const bookOrExplain = (id: Id, tapped: Tapped | undefined) => {
    const chore = all.find((candidate) => candidate.id === id);
    const now = chore && stateOf(chore);
    const unchanged =
      now !== undefined &&
      (tapped === undefined ||
        (Object.keys(now) as (keyof Tapped)[]).every((key) => now[key] === tapped[key]));
    if (unchanged) {
      completeChore(id);
      return;
    }
    const latest = latestBookedEvent(events, id);
    const doneMeanwhile =
      latest !== undefined && latest.kind === 'done' && latest.id !== tapped?.latestEventId;
    const name = latest ? membersById[latest.doneBy]?.name : undefined;
    toast.show({
      message: doneMeanwhile && name ? fasterNotice(name, latest.createdAt) : BOOKING_FAILED,
    });
  };

  const check = useCheckWindow<Chore>({
    items: chores,
    getId: (chore) => chore.id,
    // A chore is never "checked" in the data: once booked it is due on a later day.
    isChecked: () => false,
    onToggle: (chore, checked) => {
      if (checked) {
        seen.current.set(chore.id, stateOf(chore));
        haptic('check');
      }
    },
    onSettle: (ids) => {
      const tapped = seen.current;
      seen.current = new Map();
      for (const id of ids) {
        try {
          bookOrExplain(id, tapped.get(id));
        } catch (error) {
          toast.show({
            message:
              error instanceof OfflineError ? 'Offline – nichts wurde abgehakt' : BOOKING_FAILED,
          });
          return;
        }
      }
    },
    announce: checkAnnouncement,
  });

  // The window object changes on every render; the focus effect must not, or it would settle
  // on every render.
  const settle = useRef(check.settle);
  useEffect(() => {
    settle.current = check.settle;
  });
  useFocusEffect(useCallback(() => () => settle.current(), []));

  return check;
}
