import type { KindRole } from '@housekeeping/core';
import { KIND_ICONS, type IconName } from '@housekeeping/ui';

/** The German name of each kind of calendar entry: Kennzeichen, screen reader labels. */
export const KIND_LABELS: Record<KindRole, string> = {
  recipe: 'Rezept',
  collection: 'Sammlung',
  restaurant: 'Restaurant',
  activity: 'Aktivität',
  chore: 'Aufgabe',
};

/** The Kennzeichen of a planned entry: one table for cards, tiles and "Wie war's?" (spec 0020). */
export function kindBadge(kind: KindRole): { label: string; icon: IconName } {
  return { label: KIND_LABELS[kind], icon: KIND_ICONS[kind] };
}
