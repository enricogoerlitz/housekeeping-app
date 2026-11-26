import { useActivitySeries, useActivitySeriesExceptions, usePlanEntries } from '@housekeeping/api';
import { seriesPlanEntries, type ISODate, type MealPlanEntry } from '@housekeeping/core';
import { useMemo } from 'react';

/**
 * The plan with the Termine of every series from…to (spec 0041, REQ-003): for the "Übersicht",
 * which shows the same activities as the calendar.
 */
export function usePlanEntriesWithSeries(from: ISODate, to: ISODate): MealPlanEntry[] {
  const entries = usePlanEntries();
  const series = useActivitySeries();
  const exceptions = useActivitySeriesExceptions();
  return useMemo(() => {
    const termine = seriesPlanEntries(series, exceptions, from, to);
    return termine.length === 0 ? entries : [...entries, ...termine];
  }, [entries, series, exceptions, from, to]);
}
