import {
  movePlanEntry,
  OfflineError,
  snapshot,
  useActivitiesById,
  useHousehold,
  usePlanEntries,
  useRecipesById,
  useRestaurantsById,
  useToday,
} from '@housekeeping/api';
import { planMove, type DropTarget, type MealPlanEntry } from '@housekeeping/core';
import { announce, toast } from '@housekeeping/ui';

import { entryTitle } from '@/features/meal-plan/labels';
import { OFFLINE_EDIT_HINT, undoAction } from '@/features/shell/offline';

/** A move the device could not even start (the server's refusals come from onWriteRejected). */
const MOVE_FAILED = 'Hat nicht geklappt – bitte noch einmal versuchen';

/** What happened: moved, refused by the leftovers rule, the old place, or it failed. */
export type MoveEntryResult = 'moved' | 'blocked' | 'same' | 'failed';

/** The name of an entry in the plan, as moving and its texts use it ("Reste von Lasagne"). */
export function useEntryTitle(): (entry: MealPlanEntry) => string {
  const entries = usePlanEntries();
  const recipesById = useRecipesById();
  const restaurantsById = useRestaurantsById();
  const activitiesById = useActivitiesById();
  return (entry) => entryTitle(entry, recipesById, entries, restaurantsById, activitiesById);
}

/**
 * Moves a plan entry the way dragging and "Anderes Datum …" do (spec 0016, REQ-004, REQ-005):
 * the toast "Lasagne → Fr 8.1.2027, Abend" (no travellers, spec 0030, AC-028), whether its reminder
 * now lies in the past (spec 0017, AC-022) and "Rückgängig" (5 s), the reason when the leftovers
 * rule refuses the target, nothing for the old place. When the server refuses the move, the entry
 * springs back and the general hint "Hat nicht geklappt – bitte noch einmal versuchen" comes from
 * onWriteRejected (AC-018).
 */
export function useMoveEntry(): (entry: MealPlanEntry, target: DropTarget) => MoveEntryResult {
  const entries = usePlanEntries();
  const household = useHousehold();
  const today = useToday();
  const titleOf = useEntryTitle();

  return (entry, target) => {
    const move = planMove({
      entry,
      target,
      entries,
      // In the household's order: it decides what "later" means (spec 0021, REQ-012).
      slots: household.mealSlots,
      title: titleOf(entry),
      today,
      now: new Date(),
      timeZone: household.timeZone,
    });
    if (move.kind === 'same') return 'same';
    if (move.kind === 'blocked') {
      toast.show({ message: move.message });
      announce(move.message);
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
    announce(move.message);
    return 'moved';
  };
}
