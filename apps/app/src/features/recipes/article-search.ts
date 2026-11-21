import { starterCatalogEntries, useAreas, useArticles } from '@housekeeping/api';
import {
  searchArticleCatalog,
  type Article,
  type CatalogHit,
  type SearchOrCreateResult,
} from '@housekeeping/core';
import type { SearchOrCreateHit } from '@housekeeping/ui';

export const STARTER_DETAIL = 'Aus dem Starter-Katalog';

/**
 * "Suchen oder anlegen" for the article of an ingredient (REQ-001): the household's articles and
 * the starter entries it does not have yet, each hit with its area (AC-001). Reads the local
 * cache only, so it works offline too.
 */
export function useArticleSearch(query: string): {
  result: SearchOrCreateResult<CatalogHit>;
  hits: SearchOrCreateHit[];
  hitFor: (key: string) => CatalogHit | undefined;
  areaOf: (hit: CatalogHit) => string | undefined;
} {
  const articles = useArticles();
  const areas = useAreas();
  const result = searchArticleCatalog(query, articles, starterCatalogEntries);
  const areaOf = (hit: CatalogHit<Article>) =>
    hit.kind === 'article'
      ? areas.find((area) => area.id === hit.article.areaId)?.name
      : hit.entry.areaName;
  return {
    result,
    hits: result.matches.map(({ item, matchedSynonym }) => ({
      key: item.id,
      title: item.name,
      detail: matchedSynonym
        ? `auch: ${matchedSynonym}`
        : item.kind === 'starter'
          ? STARTER_DETAIL
          : undefined,
      meta: areaOf(item),
    })),
    hitFor: (key) => result.matches.find((match) => match.item.id === key)?.item,
    areaOf,
  };
}
