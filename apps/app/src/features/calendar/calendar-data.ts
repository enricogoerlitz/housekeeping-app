import {
  useTrips,
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
  tripStripes,
  dayA11yLabel,
  entriesForDay,
  entryKindRole,
  entryLineLabel,
  householdRow,
  stripeHasPackingList,
  travellersOn,
  withTime,
  type TripStripe,
  type HouseholdRowItem,
  type Id,
  type ISODate,
  type KindRole,
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
  const trips = useTrips();
  const chores = useChores();
  const events = useChoreEvents();
  const listBags = usePackingListBags();

  const slots = useMemo(
    () => [...household.mealSlots].sort((a, b) => a.sort - b.sort),
    [household.mealSlots],
  );
  const slotOrder = useMemo(() => slots.map((slot) => slot.id), [slots]);
  const stripes = useMemo(() => tripStripes(trips, members), [trips, members]);
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
    trips,
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
    /** The stripe carries the bag icon: its trip has a packing list (spec 0012, AC-046). */
    hasPackingList: (stripe: TripStripe) => stripeHasPackingList(stripe, listBags),
    /** Names of the members away on that day, for the day's screen-reader text (spec 0016). */
    travellerNames: (date: ISODate): string[] =>
      travellersOn(
        members.map((member) => member.id),
        date,
        trips,
      ).map((id) => membersById[id]?.name ?? 'Jemand'),
    /** The household row from…to (both inclusive), by date. */
    householdRow: (from: ISODate, to: ISODate): Record<ISODate, HouseholdRowItem[]> =>
      householdRow({ chores, events, members, from, to, today }),
  };
}

export type CalendarData = ReturnType<typeof useCalendarData>;

/** One kind role per item of the day, `choreCount` chores included (dots and screen readers). */
export function dayRoles(data: CalendarData, date: ISODate, choreCount = 0): KindRole[] {
  const roles = data.dayEntries(date).map((entry) => entryKindRole(entry, data.recipesById));
  return choreCount > 0 ? [...roles, ...Array<KindRole>(choreCount).fill('chore')] : roles;
}

/** "Freitag, 27. November: 1 Aktivität, 1 Rezept, Nadja unterwegs" (spec 0016, platforms). */
export function dayLabel(data: CalendarData, date: ISODate, choreCount = 0): string {
  return dayA11yLabel(date, dayRoles(data, date, choreCount), data.travellerNames(date));
}

/** "Enrico", "Enrico und Nadja", "Ganzer Haushalt": who a stripe stands for. */
export function stripeWho(stripe: TripStripe, membersById: Record<Id, Member>): string {
  if (stripe.household) return 'Ganzer Haushalt';
  const names = stripe.memberIds.map((id) => membersById[id]?.name ?? 'Jemand');
  if (names.length <= 1) return names[0] ?? 'Jemand';
  return `${names.slice(0, -1).join(', ')} und ${names[names.length - 1] ?? ''}`;
}
