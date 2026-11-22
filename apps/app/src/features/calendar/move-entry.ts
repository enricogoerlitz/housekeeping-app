import {
  movePlanEntry,
  OfflineError,
  snapshot,
  useAbsences,
  useActivitiesById,
  useHousehold,
  useMembers,
  usePlanEntries,
  useRecipesById,
  useRestaurantsById,
  useToday,
} from '@housekeeping/api';
import { planMove, type DropTarget, type MealPlanEntry } from '@housekeeping/core';
import { toast } from '@housekeeping/ui';

import { entryTitle } from '@/features/meal-plan/labels';
import { OFFLINE_EDIT_HINT, undoAction } from '@/features/shell/offline';

/** A move the device could not even start (the server's refusals come from onWriteRejected). */
const MOVE_FAILED = 'Hat nicht geklappt – bitte noch einmal versuchen';

/** What happened: moved, refused by the leftovers rule, the old place, or it failed. */
export type MoveEntryResult = 'moved' | 'blocked' | 'same' | 'failed';

/**
 * Moves a plan entry the way dragging and "Anderes Datum …" do (spec 0016, REQ-004, REQ-005):
 * the toast "Lasagne → Fr 8.1.2027, Abend" with who is travelling then and "Rückgängig" (5 s),
 * the reason when the leftovers rule refuses the target, nothing for the old place. When the
 * server refuses the move, the entry springs back and the general hint "Hat nicht geklappt –
 * bitte noch einmal versuchen" comes from onWriteRejected (AC-018).
 */
export function useMoveEntry(): (entry: MealPlanEntry, target: DropTarget) => MoveEntryResult {
  const entries = usePlanEntries();
  const absences = useAbsences();
  const members = useMembers();
  const household = useHousehold();
  const today = useToday();
  const recipesById = useRecipesById();
  const restaurantsById = useRestaurantsById();
  const activitiesById = useActivitiesById();

  return (entry, target) => {
    const move = planMove({
      entry,
      target,
      entries,
      absences,
      members,
      slots: household.mealSlots,
      title: entryTitle(entry, recipesById, entries, restaurantsById, activitiesById),
      today,
    });
    if (move.kind === 'same') return 'same';
    if (move.kind === 'blocked') {
      toast.show({ message: move.message });
      return 'blocked';
    }
    const restore = snapshot();
    try {
      movePlanEntry(entry.id, move.date, move.slotId);
    } catch (error) {
      toast.show({ message: error instanceof OfflineError ? OFFLINE_EDIT_HINT : MOVE_FAILED });
      return 'failed';
    }
    toast.show({
      message: move.message,
      actionLabel: 'Rückgängig',
      onAction: undoAction(restore),
    });
    return 'moved';
  };
}
