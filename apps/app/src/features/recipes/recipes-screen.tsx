import {
  useArticlesById,
  useCurrentMember,
  useMembers,
  usePlanEntries,
  useRecipeBook,
  useRecipes,
  useToday,
} from '@housekeeping/api';
import {
  activeFilterChips,
  activeFilterCount,
  applyRecipeListFilter,
  canReshuffle,
  cookingHistory,
  cuisineFacets,
  tagFacets,
  EMPTY_RECIPE_LIST_FILTER,
  filterButtonLabel,
  isQuickFilterActive,
  QUICK_FILTERS,
  RECIPE_SORTS,
  recipeEmptyLabel,
  recipeListCountLabel,
  recipeShowLabel,
  recipeSortShortLabel,
  FOOD_LIST_CLEARED,
  removeFilterChip,
  searchRecipes,
  sortRecipeList,
  toggleQuickFilter,
  withCookingHistory,
  type Id,
  type ListView,
  type Recipe,
  type RecipeKind,
} from '@housekeeping/core';
import {
  Button,
  Chip,
  EmptyState,
  FieldClearButton,
  FilterBar,
  Icon,
  IconButton,
  InfiniteList,
  ListDetail,
  Menu,
  Notice,
  Screen,
  ScreenHeader,
  Stack,
  Text,
  TextField,
  TypingIndicator,
  ViewTabs,
  tabSwipe,
  useBreakpoint,
  openKeyboardNow,
} from '@housekeeping/ui';
import { useRouter } from 'expo-router';
import { type ComponentRef, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View, type TextInput } from 'react-native';

import { RestaurantsPanel } from '@/features/restaurants/restaurants-panel';
import { ListViewSwitch, TILE_MIN_WIDTH, useListView } from '@/features/shell/list-view';
import { StartPageActions } from '@/features/shell/profile-button';
import { useOnlineOnly } from '@/features/shell/offline';
import { useAssistant } from '@/lib/assistant';
import { features } from '@/lib/features';
import { useSettings } from '@/lib/settings';
import { usePageParams, type PageAddress } from '@/lib/url-state';

import { AiSearchPanel } from './ai-search-panel';
import { useOpenRecipe } from './navigation';
import { FoodNewMenu, type FoodNewKind } from './new-menu';
import { NewRecipeSheet } from './new-recipe-sheet';
import { RecipeFilterPanel } from './recipe-filter-panel';
import { RecipeDetail } from './recipe-detail';
import { RecipeRow, RecipeTile } from './recipe-grid';
import { useRecipeListState } from './recipe-list-state';
import { useAiSearch } from './use-ai-search';

type FoodView = 'recipes' | 'restaurants';

const FOOD_VIEWS: { value: FoodView; label: string }[] = [
  { value: 'recipes', label: 'Rezepte' },
  { value: 'restaurants', label: 'Restaurants' },
];

type FoodParams = PageAddress<'rezepte'>['params'];

/**
 * The list parameters of each view as last left while the app runs: both views share the names
 * (`suche`, `favoriten`, …), so switching the view swaps them (spec 0019, REQ-005, REQ-011).
 */
const leftView: Partial<Record<FoodView, FoodParams>> = {};

function listParams(params: FoodParams): FoodParams {
  const kept: Record<string, unknown> = {};
  for (const name of Object.keys(FOOD_LIST_CLEARED)) {
    const value = (params as Record<string, unknown>)[name];
    if (value !== undefined) kept[name] = value;
  }
  return kept as FoodParams;
}

/** List entries in the grid without a recipe beside it: as wide as the restaurant cards. */
const ROW_MIN_WIDTH = 320;
/** The list column next to the recipe in the quick view (as for restaurants). */
const LIST_COLUMN_WIDTH = 380;

/** Closes the recipe beside the list, with what its page kept in the address (spec 0038). */
const QUICK_VIEW_CLEARED: FoodParams = {
  rezept: undefined,
  portionen: undefined,
  variante: undefined,
};

/**
 * "Essen": view tabs "Rezepte · Restaurants", and for recipes one search and filter row over an
 * endless grid of tiles (spec 0008, REQ-001 to REQ-004), or a list (spec 0038). A tile opens the
 * recipe's page; an entry of the list opens beside it on wide screens (quick view, address
 * `rezept`) and as its page on phones. Search, filters, sort and the random order stay while the
 * app runs (E14).
 */
export function RecipesScreen() {
  const searchInput = useRef<ComponentRef<typeof TextInput>>(null);
  const address = usePageParams('rezepte');
  const { params } = address;
  const online = useOnlineOnly();
  const assistant = useAssistant();
  const settings = useSettings();
  const stored = useRecipes();
  const book = useRecipeBook();
  const entries = usePlanEntries();
  const articlesById = useArticlesById();
  const members = useMembers();
  const me = useCurrentMember();
  const today = useToday();
  const list = useRecipeListState();
  const openRecipe = useOpenRecipe();
  const { isWide } = useBreakpoint();
  // "Kacheln" or "Liste", chosen on this device (spec 0038, REQ-001).
  const listView = useListView('recipes');
  const selectedId = listView.quick ? params.rezept : undefined;
  // Phones show no quick view: the same address opens the recipe's page (AC-003).
  const addressed = params.rezept;
  const replace = address.replace;
  const router = useRouter();
  useEffect(() => {
    if (isWide || !addressed) return;
    replace(QUICK_VIEW_CLEARED);
    router.push({ pathname: '/rezept/[id]', params: { id: addressed } }, { withAnchor: true });
  }, [isWide, addressed, replace, router]);

  // The window "Neu" with the kind chosen in "+" preselected (spec 0009, AC-001, AC-002); the
  // window stands in the address (`fenster=neu`), the kind only here.
  const [newKind, setNewKind] = useState<RecipeKind>('recipe');
  const newSheet = { open: params.fenster === 'neu', kind: newKind };
  const openNew = (kind: RecipeKind) => {
    openKeyboardNow();
    setNewKind(kind);
    address.open({ fenster: 'neu' });
  };

  const { query, filter, sort } = list;
  // "Zuletzt gekocht" and "Lange nicht gekocht" count what the calendar says was cooked, for a
  // collection also its recipes (spec 0009, E10, AC-031).
  const recipes = useMemo(
    () => withCookingHistory(stored, cookingHistory(entries, book.collectionRecipes, today)),
    [stored, entries, book.collectionRecipes, today],
  );
  const shuffle = list.shuffleFor(recipes.map((recipe) => recipe.id));
  const cuisines = useMemo(() => cuisineFacets(recipes), [recipes]);
  const tags = useMemo(() => tagFacets(recipes), [recipes]);
  const results = useMemo(() => {
    const searched = searchRecipes(query, recipes, articlesById);
    const filtered = applyRecipeListFilter(searched, filter, {
      me: me.id,
      members,
      articlesById,
      today,
      ...book,
    });
    // With a query the search ranking wins; without one the chosen sort applies.
    return query.trim() ? filtered : sortRecipeList(filtered, sort, shuffle);
  }, [query, recipes, articlesById, filter, me.id, members, today, sort, shuffle, book]);

  // With the switch on, a typed query is searched after a short pause; off, nothing is sent.
  // Without the AI switch in code the stored setting stays on the device but has no effect
  // (spec 0005, AC-046).
  const aiSearch = features.ai && settings.aiSearch;
  const { state: ai, runNow: runAi } = useAiSearch(aiSearch && !online.disabled, query);
  const aiVisible = aiSearch && ai.status !== 'idle' && query.trim() !== '';

  // The chosen side lives in the address, so a reload or a deep link keeps it.
  const view: FoodView = params.ansicht === 'restaurants' ? 'restaurants' : 'recipes';
  const viewPatch = (next: FoodView): FoodParams => {
    leftView[view] = listParams(params);
    return {
      ...FOOD_LIST_CLEARED,
      ...leftView[next],
      ansicht: next === 'restaurants' ? 'restaurants' : undefined,
      restaurant: undefined,
      ...QUICK_VIEW_CLEARED,
    };
  };
  const changeView = (next: FoodView) => address.replace(viewPatch(next));
  const switcher = (
    <ViewTabs
      label="Rezepte oder Restaurants"
      value={view}
      onChange={changeView}
      options={FOOD_VIEWS}
      testID="food-switch"
    />
  );
  // On phones a sideways swipe changes the view (spec 0029, REQ-003).
  const swipe = tabSwipe(FOOD_VIEWS, view, changeView);

  if (view === 'restaurants') return <RestaurantsPanel switcher={switcher} swipe={swipe} />;

  const ids = recipes.map((recipe) => recipe.id);
  const onNew = (kind: FoodNewKind) => {
    if (kind === 'recipe' || kind === 'collection') openNew(kind);
    // The restaurant window belongs to the restaurants view; its address opens it (spec 0002).
    // Closing it stays there, so the new restaurant opens beside its list (spec 0036, AC-017).
    else {
      const restaurantsView = viewPatch('restaurants');
      address.open({ ...restaurantsView, fenster: 'neu-restaurant' }, restaurantsView);
    }
  };

  const header = (
    <ScreenHeader
      title="Essen"
      right={
        <>
          <FoodNewMenu onNew={onNew} />
          <StartPageActions />
        </>
      }
    />
  );
  const offlineHint = online.hint ? (
    <Text variant="small" color="warn" testID="recipe-offline-hint">
      {online.hint}
    </Text>
  ) : null;

  const sheets = (
    <NewRecipeSheet
      visible={newSheet.open}
      kind={newSheet.kind}
      onClose={() => address.close({ fenster: undefined })}
      onCreated={openRecipe}
    />
  );

  // Nothing created yet: no search and no filter row, only the first step (AC-018; spec 0023,
  // REQ-011: no starter recipes any more).
  if (recipes.length === 0) {
    return (
      <Screen testID="recipes-screen" tone="essen" header={header} tabs={switcher} tabSwipe={swipe}>
        {offlineHint ? <View style={{ marginBottom: 12 }}>{offlineHint}</View> : null}
        <EmptyState
          icon="book-open"
          title="Noch keine Rezepte"
          text="Legt euer erstes Rezept an. Ein Titel reicht; Zutaten, Schritte und Links kommen später dazu."
          testID="recipes-empty"
        >
          <Button
            label="Rezept anlegen"
            icon="pencil"
            disabled={online.disabled}
            hint={online.hint}
            onPress={() => openNew('recipe')}
            testID="empty-recipe-new"
          />
          <Button
            label="Sammlung anlegen"
            icon="layers"
            variant="secondary"
            disabled={online.disabled}
            hint={online.hint}
            onPress={() => openNew('collection')}
            testID="empty-collection-new"
          />
          {features.ai ? (
            <Button
              label="Beschreiben ✨"
              variant="ghost"
              onPress={() => assistant.open()}
              testID="empty-describe"
            />
          ) : null}
        </EmptyState>
        {sheets}
      </Screen>
    );
  }

  const closeQuick = () => address.replace({ ...QUICK_VIEW_CLEARED, fenster: undefined });
  // A tile opens the recipe's page, which swipes through the list in this order (spec 0034,
  // REQ-008); an entry of the list on wide screens opens beside it (AC-001).
  const openFromList = (recipeId: Id) => {
    if (listView.quick)
      address.replace({ ...QUICK_VIEW_CLEARED, rezept: recipeId, fenster: undefined });
    else
      openRecipe(
        recipeId,
        results.map((entry) => entry.id),
      );
  };
  // "Kacheln" close the recipe beside the list (as for restaurants, AC-005).
  const changeListView = (next: ListView) => {
    if (selectedId) closeQuick();
    listView.setView(next);
  };
  const toggleAi = () => settings.update({ aiSearch: !settings.aiSearch });
  const filterCount = activeFilterCount(filter);
  const sortLabel = recipeSortShortLabel(sort);
  const toolbar = (
    <FilterBar
      search={
        <TextField
          round
          inputRef={searchInput}
          value={query}
          onChangeText={list.setQuery}
          placeholder={aiSearch ? 'Was möchtet ihr essen?' : 'Rezepte suchen …'}
          accessibilityLabel="Rezepte suchen"
          returnKeyType="search"
          onSubmitEditing={() => {
            if (aiSearch) runAi([]);
          }}
          left={<Icon name="search" size={19} color="muted" />}
          right={
            aiSearch ? (
              <IconButton
                icon="sparkles"
                label="Mit KI suchen"
                variant="filled"
                size={40}
                disabled={online.disabled || !query.trim()}
                onPress={() => runAi([])}
                testID="ai-search-run"
              />
            ) : query ? (
              <FieldClearButton
                label="Suche leeren"
                onClear={() => list.setQuery('')}
                inputRef={searchInput}
                testID="recipe-search-clear"
              />
            ) : undefined
          }
          testID="recipe-search"
        />
      }
      filterLabel={filterButtonLabel(filterCount)}
      activeCount={filterCount}
      sort={
        <Menu
          label={sortLabel}
          accessibilityLabel={`Sortierung: ${sortLabel}`}
          icon="arrow-up-down"
          value={sort}
          onChange={(next) => list.setSort(next, ids)}
          options={[...RECIPE_SORTS]}
          testID="recipe-sort"
        />
      }
      chips={
        <>
          {canReshuffle(sort, query) ? (
            <Chip
              label="Neu mischen"
              icon="refresh-cw"
              onPress={() => list.reshuffle(ids)}
              testID="recipe-reshuffle"
            />
          ) : null}
          {activeFilterChips(filter, cuisines, tags).map((chip) => (
            <Chip
              key={`${chip.kind}-${chip.value}`}
              label={chip.label}
              selected
              removable
              accessibilityLabel={`${chip.label} entfernen`}
              onPress={() => list.setFilter(removeFilterChip(filter, chip))}
              testID={`recipe-chip-${chip.kind}-${chip.value}`}
            />
          ))}
          {QUICK_FILTERS.map((chip) => (
            <Chip
              key={chip.value}
              label={chip.label}
              selected={isQuickFilterActive(filter, chip.value)}
              onPress={() => list.setFilter(toggleQuickFilter(filter, chip.value))}
              testID={`recipe-quick-${chip.value}`}
            />
          ))}
          {features.ai ? <AiToggle on={settings.aiSearch} onToggle={toggleAi} /> : null}
        </>
      }
      panelTitle="Filter"
      panel={
        <RecipeFilterPanel
          filter={filter}
          onChange={list.setFilter}
          cuisines={cuisines}
          tags={tags}
        />
      }
      resetLabel="Zurücksetzen"
      onReset={() => list.setFilter(EMPTY_RECIPE_LIST_FILTER)}
      applyLabel={recipeShowLabel(results)}
      collapseLabel="Einklappen"
      trailing={
        <ListViewSwitch value={listView.view} onChange={changeListView} testID="recipe-view" />
      }
      testID="recipe-filters"
    />
  );

  const aiPart =
    aiVisible && ai.status === 'done' ? (
      <View testID="ai-search-results">
        <AiSearchPanel
          result={ai.result}
          disabledChips={ai.disabledChips}
          onRemoveChip={(chipId) => runAi([...ai.disabledChips, chipId])}
          onAgain={() => runAi(ai.disabledChips)}
          onOpen={openRecipe}
        />
      </View>
    ) : aiVisible && ai.status === 'error' ? (
      <Stack gap={8} style={{ marginBottom: 16 }}>
        <Notice icon="circle-alert" text={ai.message} testID="ai-search-error" />
        <Button
          label="Nochmal suchen"
          icon="refresh-cw"
          variant="ghost"
          size="sm"
          onPress={() => runAi(ai.disabledChips)}
          testID="ai-search-retry"
        />
      </Stack>
    ) : aiVisible ? (
      <View style={{ marginBottom: 16 }}>
        <TypingIndicator label="Die KI sucht …" testID="ai-search-loading" />
      </View>
    ) : null;

  const empty = (
    <EmptyState
      icon={query.trim() ? 'search' : 'list-filter'}
      title={recipeEmptyLabel(query)}
      text={query.trim() ? 'Probiere ein anderes Wort.' : undefined}
      testID="recipes-no-results"
    >
      {filterCount > 0 ? (
        <Button
          label="Filter zurücksetzen"
          variant="secondary"
          onPress={() => list.setFilter(EMPTY_RECIPE_LIST_FILTER)}
          testID="recipes-reset-filters"
        />
      ) : null}
    </EmptyState>
  );

  const tiles = listView.view === 'tiles';
  const split = selectedId !== undefined;
  const layout = tiles ? 'tiles' : split ? 'column' : 'grid';
  const recipeList = (
    <InfiniteList<Recipe>
      // A new round (filter, sort, mixing) starts at the top; its place is kept per round.
      // Tiles, the grid of entries and the narrow column keep separate places.
      key={`${layout}-${list.round}`}
      restoreKey={tiles ? `recipes-${list.round}` : `recipes-${layout}-${list.round}`}
      data={aiVisible ? [] : results}
      keyExtractor={(recipe) => recipe.id}
      renderItem={(recipe) =>
        tiles ? (
          <RecipeTile recipe={recipe} articlesById={articlesById} onOpen={openFromList} />
        ) : (
          // The grid spaces its rows itself; the plain column needs the gap per entry.
          <View style={split ? { marginBottom: 12 } : { flexGrow: 1 }}>
            <RecipeRow
              recipe={recipe}
              articlesById={articlesById}
              selected={recipe.id === selectedId}
              onOpen={openFromList}
            />
          </View>
        )
      }
      minColumnWidth={tiles ? TILE_MIN_WIDTH : split ? undefined : ROW_MIN_WIDTH}
      minColumns={tiles ? 2 : undefined}
      ListHeaderComponent={
        <View style={{ gap: 6, marginBottom: 12 }}>
          {offlineHint}
          {aiVisible ? (
            <Text variant="small" color="muted" testID="recipe-count">
              KI-Suche
            </Text>
          ) : results.length > 0 ? (
            <Text variant="small" color="muted" testID="recipe-count">
              {recipeListCountLabel(results)}
            </Text>
          ) : null}
          {aiPart}
        </View>
      }
      ListEmptyComponent={aiVisible ? undefined : empty}
      testID="recipe-list"
    />
  );

  return (
    <Screen
      testID="recipes-screen"
      tone="essen"
      header={header}
      tabs={switcher}
      tabSwipe={swipe}
      toolbar={toolbar}
      scroll={false}
      clearFab={false}
      style={{ flex: 1, paddingTop: 0, paddingBottom: 0 }}
    >
      {split ? (
        <ListDetail
          list={recipeList}
          detail={
            <RecipeDetail
              key={selectedId}
              recipeId={selectedId}
              onBack={closeQuick}
              backLabel="Essen"
              quick
            />
          }
          placeholder={{ icon: 'book-open', title: 'Wähl ein Rezept aus' }}
          listWidth={LIST_COLUMN_WIDTH}
          testID="recipes-split"
        />
      ) : (
        recipeList
      )}
      {sheets}
    </Screen>
  );
}

/** The explicit switch for the AI search; stored on the device and stays on (F11, AC-042). */
function AiToggle(props: { on: boolean; onToggle: () => void }) {
  return (
    <Pressable
      testID="ai-search-toggle"
      role="switch"
      aria-label="KI-Suche"
      aria-checked={props.on}
      onPress={props.onToggle}
      hitSlop={4}
      style={{ minHeight: 50, justifyContent: 'center' }}
    >
      <Chip label={props.on ? 'KI-Suche an' : 'KI-Suche'} icon="sparkles" selected={props.on} />
    </Pressable>
  );
}
