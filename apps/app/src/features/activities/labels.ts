import type { Activity, Visits } from '@housekeeping/core';

import { lastVisitLabel } from '@/features/restaurants/labels';

/** "Zuletzt: vor 12 Tagen · 3-mal" (AC-004, AC-016); undefined when it was never done. */
export function activityVisitsLabel(
  visits: Pick<Visits, 'count' | 'daysSince'>,
): string | undefined {
  const last = lastVisitLabel(visits.daysSince);
  return last ? `${last} · ${visits.count}-mal` : undefined;
}

/** "heute", "gestern", "vor 12 Tagen" for a day that was `days` ago (Verlauf). */
export function daysAgoLabel(days: number): string {
  if (days <= 0) return 'heute';
  if (days === 1) return 'gestern';
  return `vor ${days} Tagen`;
}

/** Where it takes place, for one line: "Eisstadion Hohenschönhausen" or the address. */
export function activityPlaceLine(activity: Activity): string | undefined {
  return activity.placeName || activity.address || undefined;
}

/** "Route" needs somewhere to go: coordinates, an address or a place name (AC-015). */
export function hasPlace(activity: Activity): boolean {
  return !!(activity.location || activity.address || activity.placeName);
}
