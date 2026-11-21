import type { StarterCatalogEntry } from '@housekeeping/core';

import { starterAreas } from './areas';
import { starterCatalog } from './catalog';

const areaNames = new Map(starterAreas.map((area) => [area.key, area.name]));

/**
 * The starter catalog as core's search sees it (spec 0007, E10): the area by its name, so a chosen
 * entry lands in the household's area of that name.
 */
export const starterCatalogEntries: StarterCatalogEntry[] = starterCatalog.map((entry) => ({
  name: entry.name,
  synonyms: entry.synonyms ?? [],
  areaName: areaNames.get(entry.area),
  diet: entry.diet,
  isPantry: entry.pantry ?? false,
}));
