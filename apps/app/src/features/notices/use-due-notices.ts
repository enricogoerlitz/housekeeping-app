import {
  useAcknowledgedNotices,
  useActivities,
  useChores,
  useCurrentMemberId,
  useHousehold,
  useHouseholdClock,
  usePackingItems,
  usePackingListBags,
  useRecipeBook,
  useRestaurants,
  useToday,
} from '@housekeeping/api';
import { addDays, dueNotices, SERIES_NOTICE_DAYS, type Notice } from '@housekeeping/core';
import { useEffect, useMemo, useState } from 'react';

import { useChoreAway } from '@/features/chores/use-chore-away';
import { usePlanEntriesWithSeries } from '@/features/meal-plan/series-entries';

/** The clock moves on while the app stays open, so a chore at 19:00 shows by 19:01 (AC-016). */
const TICK_MS = 60_000;

/** The household's time "HH:MM", read again every minute. */
function useMinuteClock(read: () => { time: string }): string {
  const [now, setNow] = useState(() => read().time.slice(0, 5));
  useEffect(() => {
    const timer = setInterval(() => setNow(read().time.slice(0, 5)), TICK_MS);
    return () => clearInterval(timer);
  }, [read]);
  return now;
}

/**
 * The open notices of the signed-in person in the shown household (spec 0051, REQ-002), from the
 * local cache only, so they show offline too. Recomputed every minute and on every change.
 */
export function useDueNotices(): Notice[] {
  const me = useCurrentMemberId();
  const today = useToday();
  const clock = useHouseholdClock();
  const household = useHousehold();
  // Yesterday on covers today's items and the activities of tomorrow; the Termine of the series
  // reach 30 days ahead for their "Erinnern" (spec 0059, Decision 2).
  const entries = usePlanEntriesWithSeries(addDays(today, -1), addDays(today, SERIES_NOTICE_DAYS));
  const chores = useChores();
  const book = useRecipeBook();
  const restaurants = useRestaurants();
  const activities = useActivities();
  const away = useChoreAway();
  const acknowledged = useAcknowledgedNotices();
  const listBags = usePackingListBags();
  const items = usePackingItems();
  const packing = useMemo(() => ({ listBags, items }), [listBags, items]);
  const now = useMinuteClock(clock);
  const restaurantsById = useMemo(
    () => Object.fromEntries(restaurants.map((restaurant) => [restaurant.id, restaurant])),
    [restaurants],
  );
  const activitiesById = useMemo(
    () => Object.fromEntries(activities.map((activity) => [activity.id, activity])),
    [activities],
  );
  return useMemo(
    () =>
      dueNotices({
        me,
        today,
        now,
        entries,
        chores,
        book,
        slots: household.mealSlots,
        restaurantsById,
        activitiesById,
        away,
        acknowledged,
        packing,
      }),
    [
      me,
      today,
      now,
      entries,
      chores,
      book,
      household.mealSlots,
      restaurantsById,
      activitiesById,
      away,
      acknowledged,
      packing,
    ],
  );
}
