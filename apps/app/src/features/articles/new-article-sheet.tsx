import {
  catalogChoice,
  createArticle,
  starterCatalogEntries,
  useAreas,
  useArticles,
} from '@housekeeping/api';
import { searchArticleCatalog, type Id } from '@housekeeping/core';
import { SearchOrCreate, Sheet, Stack, Text } from '@housekeeping/ui';
import { useState } from 'react';

import { useOnlineOnly } from '@/features/shell/offline';
import { errorMessage, FAILED_MESSAGE } from '@/features/shell/error-message';

/**
 * "+ Neu" on the page "Artikel" (AC-026): "Suchen oder anlegen" over the household's articles and
 * the starter catalog, so a typed name that exists opens that article instead of a duplicate. A
 * starter entry becomes a household article with its data; then "Artikel bearbeiten" opens.
 */
export function NewArticleSheet(props: {
  initialName?: string;
  onClose: () => void;
  onOpen: (articleId: Id) => void;
}) {
  const articles = useArticles();
  const areas = useAreas();
  const online = useOnlineOnly();
  const [query, setQuery] = useState(props.initialName ?? '');
  const [error, setError] = useState<string | undefined>();
  const result = searchArticleCatalog(query, articles, starterCatalogEntries);
  const name = query.trim();
  const areaName = (areaId: Id | undefined) => areas.find((area) => area.id === areaId)?.name;

  const attempt = (action: () => Id) => {
    try {
      props.onOpen(action());
    } catch (caught) {
      setError(errorMessage(caught, FAILED_MESSAGE));
    }
  };
  const choose = (key: string) => {
    const match = result.matches.find((candidate) => candidate.item.id === key);
    if (match) attempt(() => catalogChoice(match.item).id);
  };

  return (
    <Sheet
      visible
      size="m"
      title="Neuer Artikel"
      onClose={props.onClose}
      testID="new-article-sheet"
    >
      <Stack gap={12}>
        <SearchOrCreate
          query={query}
          onQueryChange={(value) => {
            setQuery(value);
            setError(undefined);
          }}
          label="Name des Artikels"
          placeholder="Name, z. B. Drachenfrucht"
          clearLabel="Eingabe leeren"
          autoFocus
          hits={result.matches.map(({ item, matchedSynonym }) => ({
            key: item.id,
            title: item.name,
            detail: matchedSynonym
              ? `auch: ${matchedSynonym}`
              : item.kind === 'starter'
                ? 'Aus dem Starter-Katalog'
                : undefined,
            meta: item.kind === 'article' ? areaName(item.article.areaId) : item.entry.areaName,
          }))}
          onSelect={choose}
          createOptions={
            result.canCreate ? [{ key: 'article', label: `„${name}“ neu anlegen` }] : []
          }
          onCreate={() => attempt(() => createArticle({ name }))}
          brake={
            result.similar
              ? {
                  question: `Meinst du ${result.similar.name}?`,
                  acceptLabel: 'Ja',
                  createAnywayLabel: 'Trotzdem neu',
                  onAccept: () => {
                    const similar = result.similar;
                    if (similar) attempt(() => catalogChoice(similar).id);
                  },
                }
              : undefined
          }
          createDisabledHint={online.hint}
          testID="new-article-search"
        />
        {error ? (
          <Text variant="small" color="warn" testID="new-article-error">
            {error}
          </Text>
        ) : null}
      </Stack>
    </Sheet>
  );
}
