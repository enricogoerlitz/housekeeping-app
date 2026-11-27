import {
  useAreas,
  useArticles,
  useRecipes,
  useRecurringItems,
  useShoppingItems,
} from '@housekeeping/api';
import {
  articleFilterCounts,
  articlesInArea,
  filterArticles,
  usedArticleIds,
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
  CreateButton,
  Chip,
  EmptyState,
  Icon,
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
  FieldClearButton,
  openKeyboardNow,
} from '@housekeeping/ui';
import { type ComponentRef, useMemo, useRef, useState } from 'react';
import { ScrollView, View, type TextInput } from 'react-native';

import { useOnlineOnly } from '@/features/shell/offline';
import { useAddressedId, useMissingObject } from '@/lib/addressed';
import { useOriginBack, usePageParams } from '@/lib/url-state';

import { ArticlePanel, ArticleSheet } from './article-sheet';
import {
  articleRowDetail,
  emptyFilterTitle,
  filterChipLabel,
  filterFromParam,
  filterParam,
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

/**
 * "Verwalten" → "Artikel" (REQ-005): all articles of the household with search, sort and filter
 * chips; a row opens "Artikel bearbeiten", on wide screens in the right column ("Liste und
 * Detail", AC-025). Reading and searching work offline; editing needs the network.
 */
export function ArticlesScreen() {
  const searchInput = useRef<ComponentRef<typeof TextInput>>(null);
  const allArticles = useArticles();
  const areas = useAreas();
  const recipes = useRecipes();
  const items = useShoppingItems();
  const online = useOnlineOnly();
  const { isPhone } = useBreakpoint();
  // Filter, search, sort, the chosen article and "Neuer Artikel" stand in the address (spec 0019,
  // REQ-011, REQ-014); "Ohne Bereich ›" on "Bereiche" opens `/artikel?filter=ohne-bereich`.
  const address = usePageParams('artikel');
  const { params } = address;
  // "‹ Liste" from the list's ⋯ (`von=liste`), otherwise "‹ Verwalten" (AC-021, E12).
  const { label: backLabel, back } = useOriginBack(params.von, 'verwalten');

  const filter: ArticleFilter = filterFromParam(params.filter);
  // "Bereich: Obst & Gemüse ✕" from a row on "Bereiche" or "Bereich ▾" (spec 0025, AC-045).
  const areaFilter = areas.find((area) => area.id === params.bereich);
  const setAreaFilter = (areaId: Id | undefined) => address.replace({ bereich: areaId });
  const articles = useMemo(
    () => articlesInArea(allArticles, areaFilter?.id),
    [allArticles, areaFilter],
  );
  const sort: ArticleSort = params.sortierung === 'neu' ? 'new' : 'name';
  const query = params.suche ?? '';
  const selectedId = params.artikel;
  const setFilter = (next: ArticleFilter) => address.replace({ filter: filterParam(next) });
  const setSort = (next: ArticleSort) =>
    address.replace({ sortierung: next === 'new' ? 'neu' : undefined });
  const setQuery = (next: string) => address.replace({ suche: next });
  // On phones the article opens as a window (a history entry); on wide screens it is selected.
  const setSelectedId = (id: Id | undefined) => {
    if (!isPhone) address.replace({ artikel: id });
    else if (id) address.open({ artikel: id });
    else address.close({ artikel: undefined });
  };
  /** From one window to the next (new → its article, merged → the target): one entry. */
  const showArticle = (id: Id) => address.replace({ fenster: undefined, artikel: id });
  const [newName, setNewName] = useState('');
  const creating = params.fenster === 'neu-artikel' ? { name: newName } : undefined;
  const [merging, setMerging] = useState<{ sourceId: Id; targetId: Id } | undefined>();
  // The merged article leaves the data before the address names the target: not "missing", or
  // clearing the address would close the target as well (spec 0007, AC-037).
  const [mergedAway, setMergedAway] = useState<Id | undefined>();
  const found = useAddressedId('articles', params.artikel);
  useMissingObject(
    params.artikel,
    found !== 'missing' || params.artikel === mergedAway,
    'Diesen Artikel gibt es nicht mehr',
    () => address.replace({ artikel: undefined }),
  );

  // "Ähnliche Namen" compares every name with every other: once per data state.
  const similar = useMemo(() => similarArticleNames(articles), [articles]);
  // "Unbenutzt": in no recipe and not open on the list (AC-046).
  // Spec 0060, AC-011: an article with a Dauerposten is not "Unbenutzt".
  const recurringItems = useRecurringItems();
  const usedIds = useMemo(
    () => usedArticleIds(recipes, items, recurringItems),
    [recipes, items, recurringItems],
  );
  const context = useMemo(() => ({ similar, areas, usedIds }), [similar, areas, usedIds]);
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
  const selected = allArticles.find((article) => article.id === selectedId);

  const startCreating = (name = '') => {
    openKeyboardNow();
    setNewName(name);
    address.open({ fenster: 'neu-artikel' });
  };
  const sortLabel = SORT_OPTIONS.find((option) => option.value === sort)?.label ?? '';

  const addButton = (
    <CreateButton
      label="Artikel anlegen"
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
        inputRef={searchInput}
        value={query}
        onChangeText={setQuery}
        placeholder="Artikel suchen …"
        accessibilityLabel="Artikel suchen"
        returnKeyType="search"
        left={<Icon name="search" size={19} color="muted" />}
        right={
          query ? (
            <FieldClearButton
              label="Suche leeren"
              onClear={() => setQuery('')}
              inputRef={searchInput}
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
        {areaFilter ? (
          <Chip
            label={`Bereich: ${areaFilter.name} ✕`}
            selected
            accessibilityLabel={`Bereich ${areaFilter.name}, Filter entfernen`}
            onPress={() => setAreaFilter(undefined)}
            testID="articles-area-filter"
          />
        ) : (
          <Menu
            // The menu draws its own chevron (I-21: "Bereich ▾ ⌄").
            label="Bereich"
            accessibilityLabel="Nach Bereich filtern"
            icon="map-pin"
            value=""
            onChange={(areaId: string) => setAreaFilter(areaId || undefined)}
            options={[...areas]
              .sort((a, b) => a.sort - b.sort)
              .map((area) => ({ value: area.id, label: area.name }))}
            testID="articles-area-menu"
          />
        )}
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
      />
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
            setMergedAway(merging.sourceId);
            setMerging(undefined);
            showArticle(targetId);
          }}
        />
      ) : null}
      {creating ? (
        <NewArticleSheet
          initialName={creating.name}
          onClose={() => address.close({ fenster: undefined })}
          onOpen={showArticle}
        />
      ) : null}
    </Screen>
  );
}
