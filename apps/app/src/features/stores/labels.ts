import { orderAnnouncement } from '@housekeeping/core';
import type { ReorderListLabels } from '@housekeeping/ui';

/** "Märkte · Bereiche" (E12): the view is in the address, `?ansicht=bereiche`. */
export type StoresView = 'maerkte' | 'bereiche';

export const VIEW_OPTIONS: { value: StoresView; label: string }[] = [
  { value: 'maerkte', label: 'Märkte' },
  { value: 'bereiche', label: 'Bereiche' },
];

export function viewFromParam(value: string | undefined): StoresView {
  return value === 'bereiche' ? 'bereiche' : 'maerkte';
}

/** The words of the ordering list (AC-046, AC-053). */
export const ORDER_LABELS: ReorderListLabels = {
  handle: (name) => `${name} verschieben`,
  up: (name) => `${name} nach oben`,
  down: (name) => `${name} nach unten`,
  position: orderAnnouncement,
};

export const articleCount = (count: number) => (count === 1 ? '1 Artikel' : `${count} Artikel`);

export const FAILED = 'Das hat nicht geklappt.';
export const messageOf = (error: unknown) => (error instanceof Error ? error.message : FAILED);
