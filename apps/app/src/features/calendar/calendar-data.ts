import {
  useAbsences,
  useActivitiesById,
  useChoreEvents,
  useChores,
  useHousehold,
  useMembers,
  useMembersById,
  usePackingListBags,
  usePlanEntries,
  useRecipeBook,
  useRecipesById,
  useRestaurantsById,
  useToday,
} from '@housekeeping/api';
import {
  absenceStripes,
  entriesForDay,
  entryLineLabel,
  householdRow,
  stripeHasPackingList,
  withTime,
  type AbsenceStripe,
  type HouseholdRowItem,
  type Id,
  type ISODate,
  type MealPlanEntry,
  type Member,
} from '@housekeeping/core';
import { useMemo } from 'react';

import { entryTitle, reservationTime } from '@/features/meal-plan/labels';

/** Everything the three views read, resolved once per render of the calendar (spec 0010). */
export function useCalendarData() {
  const today = useToday();
  const household = useHousehold();
  const entries = usePlanEntries();
  const recipesById = useRecipesById();
  const book = useRecipeBook();
  const restaurantsById = useRestaurantsById();
  const activitiesById = useActivitiesById();
  const members = useMembers();
  const membersById = useMembersById();
  const absences = useAbsences();
  const chores = useChores();
  const events = useChoreEvents();
  const listBags = usePackingListBags();

  const slots = useMemo(
    () => [...household.mealSlots].sort((a, b) => a.sort - b.sort),
    [household.mealSlots],
  );
  const slotOrder = useMemo(() => slots.map((slot) => slot.id), [slots]);
  const stripes = useMemo(() => absenceStripes(absences, members), [absences, members]);
  const byDate = useMemo(() => {
    const map = new Map<ISODate, MealPlanEntry[]>();
    for (const entry of entries) {
      if (entry.date === null) continue;
      const list = map.get(entry.date) ?? [];
      list.push(entry);
      map.set(entry.date, list);
    }
    return map;
  }, [entries]);

  return {
    today,
    household,
    entries,
    /** For the kind role of an entry: a collection is "Sammlung" (spec 0009, E8). */
    recipesById,
    members,
    membersById,
    absences,
    chores,
    events,
    slots,
    slotOrder,
    stripes,
    /** The entries of a day, by Tageszeit and kind (spec 0004, AC-002). */
    dayEntries: (date: ISODate) => entriesForDay(byDate.get(date) ?? [], date, slotOrder),
    /**
     * The text of an entry's row: a collection with the number of its recipes (spec 0009,
     * AC-022), a reserved restaurant with its time, "Trattoria Da Enzo · 19:30" (spec 0013, AC-027).
     */
    lineTitleOf: (entry: MealPlanEntry) =>
      withTime(
        entryLineLabel(
          entry,
          entryTitle(entry, recipesById, entries, restaurantsById, activitiesById),
          book,
        ),
        reservationTime(entry),
      ),
    slotName: (slotId: Id) => slots.find((slot) => slot.id === slotId)?.name ?? '',
    /** The stripe carries the bag icon: one of its absences has a packing list (spec 0012, AC-046). */
    hasPackingList: (stripe: AbsenceStripe) => stripeHasPackingList(stripe, listBags),
    /** The household row from…to (both inclusive), by date. */
    householdRow: (from: ISODate, to: ISODate): Record<ISODate, HouseholdRowItem[]> =>
      householdRow({ chores, events, members, from, to, today }),
  };
}

export type CalendarData = ReturnType<typeof useCalendarData>;

/** "Enrico", "Enrico und Nadja", "Ganzer Haushalt": who a stripe stands for. */
export function stripeWho(stripe: AbsenceStripe, membersById: Record<Id, Member>): string {
  if (stripe.household) return 'Ganzer Haushalt';
  const names = stripe.memberIds.map((id) => membersById[id]?.name ?? 'Jemand');
  if (names.length <= 1) return names[0] ?? 'Jemand';
  return `${names.slice(0, -1).join(', ')} und ${names[names.length - 1] ?? ''}`;
}
