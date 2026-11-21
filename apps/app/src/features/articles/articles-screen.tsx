import { useAreas, useArticles } from '@housekeeping/api';
import {
  articleFilterCounts,
  filterArticles,
  searchArticleList,
  similarArticleNames,
  sortArticles,
  type Article,
  type ArticleFilter,
  type ArticleSort,
  type Id,
} from '@housekeeping/core';
import {
  Badge,
  Button,
  Chip,
  EmptyState,
  Icon,
  IconButton,
  InfiniteList,
  List,
  ListDetail,
  ListRow,
  Menu,
  Screen,
  ScreenHeader,
  Stack,
  Text,
  TextField,
  useBreakpoint,
} from '@housekeeping/ui';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { useBackToManage } from '@/features/manage/navigation';
import { useOnlineOnly } from '@/features/shell/offline';

import { ArticlePanel, ArticleSheet } from './article-sheet';
import {
  articleRowDetail,
  emptyFilterTitle,
  filterChipLabel,
  filterFromParam,
  FILTERS,
  SIMILAR_PREFIX,
  SORT_OPTIONS,
} from './labels';
import { MergeArticleDialog } from './merge-article-dialog';
import { NewArticleSheet } from './new-article-sheet';

interface ArticleRow {
  article: Article;
  /** The synonym the search matched: "auch: Karotten" (AC-022). */
  matchedSynonym?: string;
}

const firstParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

/**
 * "Zurück" of the page: opened from "Liste" ⋯ (`?von=liste`) it leads to the list, otherwise to
 * the page it was opened from under "Verwalten" (AC-021, E12).
 */
function useArticlesBack(from: string | undefined): { label?: string; back: () => void } {
  const router = useRouter();
  const backToManage = useBackToManage();
  if (from === 'liste') {
    return {
      label: 'Liste',
      back: () => (router.canGoBack() ? router.back() : router.replace('/liste')),
    };
  }
  return { back: backToManage };
}

/**
 * "Verwalten" → "Artikel" (REQ-005): all articles of the household with search, sort and filter
 * chips; a row opens "Artikel bearbeiten", on wide screens in the right column ("Liste und
 * Detail", AC-025). Reading and searching work offline; editing needs the network.
 */
export function ArticlesScreen() {
  const articles = useArticles();
  const areas = useAreas();
  const online = useOnlineOnly();
  const { isPhone } = useBreakpoint();
  const params = useLocalSearchParams<{ von?: string | string[]; filter?: string | string[] }>();
  const from = firstParam(params.von);
  const filterParam = firstParam(params.filter);
  const { label: backLabel, back } = useArticlesBack(from);

  const [filter, setFilter] = useState<ArticleFilter>(filterFromParam(filterParam));
  const [sort, setSort] = useState<ArticleSort>('name');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<Id | undefined>();
  const [creating, setCreating] = useState<{ name: string } | undefined>();
  const [merging, setMerging] = useState<{ sourceId: Id; targetId: Id } | undefined>();

  // Opened again with another filter in the address ("Ohne Bereich ›", AC-051).
  const [shownParam, setShownParam] = useState(filterParam);
  if (shownParam !== filterParam) {
    setShownParam(filterParam);
    setFilter(filterFromParam(filterParam));
  }

  // "Ähnliche Namen" compares every name with every other: once per data state.
  const similar = useMemo(() => similarArticleNames(articles), [articles]);
  const context = useMemo(() => ({ similar, areas }), [similar, areas]);
  const counts = useMemo(() => articleFilterCounts(articles, context), [articles, context]);
  const areaNames = useMemo(() => new Map(areas.map((area) => [area.id, area.name])), [areas]);

  const rows = useMemo((): ArticleRow[] => {
    const filtered = filterArticles(articles, filter, context);
    if (query.trim()) {
      return searchArticleList(query, filtered).map((match) => ({
        article: match.item,
        matchedSynonym: match.matchedSynonym,
      }));
    }
    return sortArticles(filtered, sort).map((article) => ({ article }));
  }, [articles, filter, context, query, sort]);

  // Deleted or merged on another device while it was open: the editor just closes.
  const selected = articles.find((article) => article.id === selectedId);

  const startCreating = (name = '') => setCreating({ name });
  const sortLabel = SORT_OPTIONS.find((option) => option.value === sort)?.label ?? '';

  const addButton = isPhone ? (
    <IconButton
      icon="plus"
      label="Neuer Artikel"
      variant="soft"
      disabled={online.disabled}
      hint={online.hint}
      onPress={() => startCreating()}
      testID="articles-new"
    />
  ) : (
    <Button
      label="Neu"
      icon="plus"
      size="sm"
      disabled={online.disabled}
      hint={online.hint}
      onPress={() => startCreating()}
      testID="articles-new"
    />
  );
  const header = (
    <ScreenHeader
      title="Artikel"
      backLabel={backLabel}
      onBack={back}
      right={addButton}
      testID="articles-title"
    />
  );

  const toolbar = (
    <Stack gap={8}>
      <TextField
        round
        value={query}
        onChangeText={setQuery}
        placeholder="Artikel suchen …"
        accessibilityLabel="Artikel suchen"
        returnKeyType="search"
        left={<Icon name="search" size={19} color="muted" />}
        right={
          query ? (
            <IconButton
              icon="x"
              label="Suche leeren"
              onPress={() => setQuery('')}
              testID="articles-search-clear"
            />
          ) : undefined
        }
        testID="articles-search"
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ gap: 8, paddingBottom: 2 }}
        style={{ flexGrow: 0 }}
      >
        <Menu
          label={sortLabel}
          accessibilityLabel={`Sortierung: ${sortLabel}`}
          icon="arrow-up-down"
          value={sort}
          onChange={setSort}
          options={SORT_OPTIONS}
          testID="articles-sort"
        />
        {FILTERS.map((key) => (
          <Chip
            key={key}
            label={filterChipLabel(key, counts)}
            selected={filter === key}
            onPress={() => setFilter(key)}
            testID={`articles-filter-${key}`}
          />
        ))}
      </ScrollView>
    </Stack>
  );

  const empty =
    articles.length === 0 ? (
      <EmptyState
        icon="package"
        title="Noch keine Artikel"
        text="Artikel entstehen, wenn du etwas auf die Liste setzt oder Zutaten in ein Rezept schreibst."
        testID="articles-empty"
      >
        <Button
          label="Artikel anlegen"
          icon="plus"
          disabled={online.disabled}
          hint={online.hint}
          onPress={() => startCreating()}
          testID="articles-empty-new"
        />
      </EmptyState>
    ) : query.trim() ? (
      <EmptyState
        icon="search"
        title="Nichts gefunden"
        text={
          filter === 'all'
            ? 'Probier ein anderes Wort oder leg den Artikel an.'
            : 'Probier ein anderes Wort oder nimm den Filter heraus.'
        }
        testID="articles-no-results"
      >
        <Button
          label={`„${query.trim()}“ neu anlegen`}
          icon="plus"
          variant="secondary"
          disabled={online.disabled}
          hint={online.hint}
          onPress={() => startCreating(query.trim())}
          testID="articles-no-results-new"
        />
      </EmptyState>
    ) : (
      <EmptyState
        icon="list-filter"
        title={emptyFilterTitle(filter)}
        text="Hier ist gerade nichts zu tun."
        testID="articles-filter-empty"
      >
        <Button
          label="Alle zeigen"
          variant="secondary"
          onPress={() => setFilter('all')}
          testID="articles-filter-empty-all"
        />
      </EmptyState>
    );

  const renderRow = ({ article, matchedSynonym }: ArticleRow) => {
    const lookAlikes = similar.get(article.id);
    return (
      <View style={{ marginBottom: 6 }}>
        <List>
          <ListRow
            title={article.name}
            subtitle={
              <View style={{ marginTop: 1 }}>
                <Text variant="small" color="muted" numberOfLines={1}>
                  {articleRowDetail(
                    article.areaId === undefined ? undefined : areaNames.get(article.areaId),
                    article.diet,
                  )}
                </Text>
                {matchedSynonym ? (
                  <Text variant="small" color="muted" numberOfLines={1}>
                    auch: {matchedSynonym}
                  </Text>
                ) : null}
                {lookAlikes ? (
                  <Text variant="small" color="muted" numberOfLines={1}>
                    {SIMILAR_PREFIX} {lookAlikes.map((other) => other.name).join(', ')}
                  </Text>
                ) : null}
              </View>
            }
            trailing={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {article.needsReview ? (
                  <View accessibilityLabel="Neu aus Rezepten" accessibilityRole="image">
                    <Icon name="circle-alert" size={16} color="warn" />
                  </View>
                ) : null}
                {article.isPantry ? <Badge label="Vorrat" /> : null}
                {isPhone ? <Icon name="chevron-right" size={18} color="muted" /> : null}
              </View>
            }
            selected={!isPhone && article.id === selectedId}
            onPress={() => setSelectedId(article.id)}
            testID={`article-${article.id}`}
          />
        </List>
      </View>
    );
  };

  const list = (
    <InfiniteList
      data={rows}
      keyExtractor={(row) => row.article.id}
      renderItem={renderRow}
      restoreKey="articles"
      ListHeaderComponent={
        <View style={{ gap: 6, marginBottom: 10 }}>
          {online.hint ? (
            <Text variant="small" color="warn" testID="articles-offline-hint">
              {online.hint}
            </Text>
          ) : null}
          {rows.length > 0 ? (
            <Text variant="small" color="muted" testID="articles-count">
              {rows.length === 1 ? '1 Artikel' : `${rows.length} Artikel`}
            </Text>
          ) : null}
        </View>
      }
      ListEmptyComponent={empty}
      testID="articles-list"
    />
  );

  const closeEditor = () => setSelectedId(undefined);
  const askMerge = (targetId: Id) => {
    if (selectedId) setMerging({ sourceId: selectedId, targetId });
  };
  const editorProps = { onClose: closeEditor, onMerge: askMerge };

  return (
    <Screen
      testID="articles-screen"
      clearFab={false}
      header={header}
      toolbar={toolbar}
      scroll={false}
      style={{ flex: 1, paddingTop: 0, paddingBottom: 0 }}
    >
      <ListDetail
        list={list}
        detail={
          selected ? (
            <ArticlePanel key={selected.id} articleId={selected.id} {...editorProps} />
          ) : undefined
        }
        placeholder={{
          icon: 'package',
          title: 'Wähl einen Artikel aus',
          text: 'Hier kannst du ihn umbenennen, Synonyme pflegen, zusammenführen oder löschen.',
        }}
        testID="articles-split"
      />
      {isPhone && selected ? (
        <ArticleSheet
          key={selected.id}
          visible={merging === undefined}
          articleId={selected.id}
          {...editorProps}
        />
      ) : null}
      {merging ? (
        <MergeArticleDialog
          sourceId={merging.sourceId}
          targetId={merging.targetId}
          onCancel={() => setMerging(undefined)}
          onMerged={(targetId) => {
            setMerging(undefined);
            setSelectedId(targetId);
          }}
        />
      ) : null}
      {creating ? (
        <NewArticleSheet
          initialName={creating.name}
          onClose={() => setCreating(undefined)}
          onOpen={(articleId) => {
            setCreating(undefined);
            setSelectedId(articleId);
          }}
        />
      ) : null}
    </Screen>
  );
}
