import { orderAnnouncement } from '@housekeeping/core';
import type { ReorderListLabels } from '@housekeeping/ui';

// Words of "Reisetaschen" and the Urlaubsseite (spec 0012). Task 9 appends its own exports at the
// end of this file.

/** The words of the ordering list of a bag's Packstücke (AC-006). */
export const BAG_ITEM_ORDER_LABELS: ReorderListLabels = {
  handle: (name) => `${name} verschieben`,
  up: (name) => `${name} nach oben`,
  down: (name) => `${name} nach unten`,
  position: orderAnnouncement,
};

/** "für" of a bag: everyone, or one member (the chip's value). */
export const FOR_EVERYONE = 'alle';
export const FOR_EVERYONE_LABEL = 'Alle';

export const FAILED = 'Hat nicht geklappt – bitte noch einmal versuchen';
export const messageOf = (error: unknown) => (error instanceof Error ? error.message : FAILED);
