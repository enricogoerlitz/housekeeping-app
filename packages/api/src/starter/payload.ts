import { normalizeText } from '@housekeeping/core';

import { starterAreas } from './areas';
import { starterCatalog } from './catalog';

/**
 * Starter areas and catalog in the format of `private.apply_starter` (keys from core). The app
 * sends it with create_household; scripts/prod-bootstrap.mjs embeds the same payload in its SQL.
 */
export function starterPayload() {
  return {
    areas: starterAreas.map((area) => ({ key: area.key, name: area.name })),
    articles: starterCatalog.map((article) => ({
      name: article.name,
      name_key: normalizeText(article.name),
      synonyms: article.synonyms ?? [],
      synonym_keys: (article.synonyms ?? []).map(normalizeText),
      area: article.area,
      diet: article.diet,
      is_pantry: article.pantry ?? false,
    })),
  };
}
