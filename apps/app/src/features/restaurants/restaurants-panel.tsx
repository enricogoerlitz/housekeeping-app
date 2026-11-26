import { useCurrentMember, usePlanEntries, useRestaurants, useToday } from '@housekeeping/api';
import {
  applyRestaurantListFilter,
  cuisineFacets,
  tagFacets,
  EMPTY_RESTAURANT_LIST_FILTER,
  filterButtonLabel,
  removeRestaurantFilterChip,
  RESTAURANT_SORTS,
  restaurantCountLabel,
  restaurantEmptyLabel,
  restaurantFilterChips,
  restaurantFilterCount,
  restaurantMatches,
  restaurantShowLabel,
  restaurantVisits,
  sortRestaurantList,
  toggleRestaurantFavorites,
  quickViewOrigin,
  type Id,
  type RecipeKind,
  type Restaurant,
  type RestaurantListSort,
} from '@housekeeping/core';
import {
  Button,
  Chip,
  EmptyState,
  FieldClearButton,
  FilterBar,
  Icon,
  InfiniteList,
  ListDetail,
  Menu,
  Row,
  Screen,
  ScreenHeader,
  Stars,
  Surface,
  Text,
  TextField,
  useBreakpoint,
  useTheme,
  type TabSwipe,
  openKeyboardNow,
} from '@housekeeping/ui';
import { useRouter } from 'expo-router';
import { type ComponentRef, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View, type TextInput } from 'react-native';

import { useOpenRecipe } from '@/features/recipes/navigation';
import { rememberBrowseOrder } from '@/lib/browse-order';
import { afterWindowClosed, useOriginBack, usePageParams } from '@/lib/url-state';
import { NewRecipeSheet } from '@/features/recipes/new-recipe-sheet';
import { FoodNewMenu, type FoodNewKind } from '@/features/recipes/new-menu';
import { StartPageActions } from '@/features/shell/profile-button';
import { useOnlineOnly } from '@/features/shell/offline';
import { OwnPhoto } from '@/features/shell/own-photo';
import { ListViewSwitch, PlaceTile, TILE_MIN_WIDTH, useListView } from '@/features/shell/list-view';

import { AddRestaurantSheet, type AddRestaurantSheetProps } from './add-restaurant-sheet';
import { lastVisitLabel, restaurantMeta } from './labels';
import { RestaurantDetail } from './restaurant-detail';
import { RestaurantFilterPanel } from './restaurant-filter-panel';
import { RESTAURANT_ICON } from './restaurant-form';
import { useRestaurantListState } from './restaurant-list-state';

/** Restaurant cards in the grid: at least this wide (one column on phones, three at 1440 px). */
const CARD_MIN_WIDTH = 320;
/** The list column next to an open restaurant on wide screens ("Liste und Detail"). */
const LIST_COLUMN_WIDTH = 380;

type SheetRequest = Pick<AddRestaurantSheetProps, 'initialText' | 'initialName' | 'focus'>;

/** "↕ Zuletzt ▾": the short text for "Zuletzt besucht", else the menu text (T2, decision 6). */
function sortShortLabel(sort: RestaurantListSort): string {
  if (sort === 'lastVisit') return 'Zuletzt';
  return RESTAURANT_SORTS.find((entry) => entry.value === sort)?.label ?? '';
}

/**
 * "Essen → Restaurants" (spec 0008, REQ-005): the same search and filter row as for recipes,
 * with Favoriten, Küche, Preisniveau and the own rating, the sort menu incl. "Zufall", and an
 * endless list; on wide screens list and detail side by side (spec 0002). Search, filters, sort
 * and the random order stay while the app runs (E14).
 */
export function RestaurantsPanel(props: { switcher: ReactNode; swipe: TabSwipe }) {
  const searchInput = useRef<ComponentRef<typeof TextInput>>(null);
  const router = useRouter();
  const address = usePageParams('rezepte');
  const { params } = address;
  const { isWide } = useBreakpoint();
  const online = useOnlineOnly();
  const restaurants = useRestaurants();
  const entries = usePlanEntries();
  const today = useToday();
  const me = useCurrentMember();
  const list = useRestaurantListState();
  const openRecipe = useOpenRecipe();
  // "Kacheln" open the restaurant's page, "Liste" beside the list on wide screens (spec 0038).
  const listView = useListView('restaurants');

  // Where "Restaurant hinzufügen" puts the cursor: a new restaurant starts with its name; only
  // "Link einfügen" in the empty state starts with the link. The window stands in the address.
  const [focus, setFocus] = useState<SheetRequest['focus']>('name');
  const [newRecipe, setNewRecipe] = useState<{ open: boolean; kind: RecipeKind }>({
    open: false,
    kind: 'recipe',
  });

  // On wide screens the chosen restaurant stands in the address and replaces the entry (spec 0019,
  // REQ-014, AC-043); on phones the same address opens its page, with the list underneath (AC-044).
  const selectedId = listView.quick ? params.restaurant : undefined;
  // Opened from another section ("Öffnen" in the calendar): "‹ Kalender" and ✕ lead back there,
  // as for activities (spec 0035, REQ-002).
  const origin = useOriginBack(params.von, 'essen');
  const fromOther = selectedId !== undefined && quickViewOrigin(params.von, 'essen') !== undefined;
  const closeDetail = () =>
    fromOther ? origin.back() : address.replace({ restaurant: undefined, fenster: undefined });
  const addressed = params.restaurant;
  const replace = address.replace;
  useEffect(() => {
    if (isWide || !addressed) return;
    replace({ restaurant: undefined });
    router.push({ pathname: '/restaurant/[id]', params: { id: addressed } }, { withAnchor: true });
  }, [isWide, addressed, replace, router]);
  // "+ → Restaurant", the empty state and the share target open the window through the address,
  // so a reload keeps it open (spec 0002, AC-008); a shared link fills it.
  const shared = params.link !== undefined || params.name !== undefined;
  const sheetRequest: SheetRequest | undefined =
    params.fenster === 'neu-restaurant'
      ? { initialText: params.link, initialName: params.name, focus: shared ? 'name' : focus }
      : undefined;
  const setSheet = (request: { focus: SheetRequest['focus'] }) => {
    openKeyboardNow();
    setFocus(request.focus);
    address.open({ fenster: 'neu-restaurant' });
  };

  const open = (restaurantId: Id) => {
    if (listView.quick) address.replace({ restaurant: restaurantId });
    else router.push({ pathname: '/restaurant/[id]', params: { id: restaurantId } });
  };
  // The window closes first (back one entry); the restaurant opens after that, not under it.
  const openFromSheet = (restaurantId: Id) => afterWindowClosed(() => open(restaurantId));
  const closeSheet = () => address.close({ fenster: undefined, link: undefined, name: undefined });

  const { query, filter, sort } = list;
  const shuffle = list.shuffleFor(restaurants.map((restaurant) => restaurant.id));
  const cuisines = useMemo(() => cuisineFacets(restaurants), [restaurants]);
  const tags = useMemo(() => tagFacets(restaurants), [restaurants]);
  const visitsById = useMemo(
    () =>
      new Map(
        restaurants.map((restaurant) => [
          restaurant.id,
          restaurantVisits(restaurant.id, entries, today),
        ]),
      ),
    [restaurants, entries, today],
  );
  const results = useMemo(() => {
    const searched = restaurants.filter((restaurant) => restaurantMatches(query, restaurant));
    const filtered = applyRestaurantListFilter(searched, filter, me.id);
    return sortRestaurantList(filtered, sort, { me: me.id, entries, today, shuffle });
  }, [query, restaurants, filter, me.id, sort, entries, today, shuffle]);

  // From the list: the restaurant's page swipes through it in this order (spec 0034, REQ-008).
  const openFromList = (restaurantId: Id) => {
    rememberBrowseOrder(
      'restaurants',
      results.map((restaurant) => restaurant.id),
    );
    open(restaurantId);
  };

  const onNew = (kind: FoodNewKind) => {
    if (kind === 'recipe' || kind === 'collection') setNewRecipe({ open: true, kind });
    else setSheet({ focus: 'name' });
  };

  // The same "+" as on "Essen → Rezepte" (spec 0008, AC-003): one header for both views.
  const header = (
    <ScreenHeader
      title="Essen"
      backLabel={fromOther ? origin.label : undefined}
      onBack={fromOther ? origin.back : undefined}
      right={
        <>
          <FoodNewMenu onNew={onNew} />
          <StartPageActions />
        </>
      }
    />
  );
  const offlineHint = online.hint ? (
    <Text variant="small" color="warn" testID="restaurant-offline-hint">
      {online.hint}
    </Text>
  ) : null;

  const sheets = (
    <>
      {sheetRequest ? (
        <AddRestaurantSheet
          key={`${sheetRequest.initialText ?? ''}|${sheetRequest.initialName ?? ''}`}
          {...sheetRequest}
          onClose={closeSheet}
          onCreated={openFromSheet}
          onOpenExisting={openFromSheet}
        />
      ) : null}
      <NewRecipeSheet
        visible={newRecipe.open}
        kind={newRecipe.kind}
        onClose={() => setNewRecipe({ ...newRecipe, open: false })}
        onCreated={openRecipe}
      />
    </>
  );

  // Nothing created yet: no search and no filter row, only the first step (AC-018).
  if (restaurants.length === 0) {
    return (
      <Screen
        testID="restaurants-screen"
        tone="essen"
        header={header}
        tabs={props.switcher}
        tabSwipe={props.swipe}
      >
        {offlineHint ? <View style={{ marginBottom: 12 }}>{offlineHint}</View> : null}
        <EmptyState
          icon="utensils"
          title="Noch keine Restaurants"
          text="Tipp: In Google Maps oder Apple Karten bei einem Ort auf „Teilen“ tippen und den Link hier einfügen."
          testID="restaurants-empty"
        >
          <Button
            label="Link einfügen"
            icon="link"
            disabled={online.disabled}
            hint={online.hint}
            onPress={() => setSheet({ focus: 'link' })}
            testID="restaurant-empty-link"
          />
          <Button
            label="Von Hand anlegen"
            icon="pencil"
            variant="secondary"
            disabled={online.disabled}
            hint={online.hint}
            onPress={() => setSheet({ focus: 'name' })}
            testID="restaurant-empty-manual"
          />
        </EmptyState>
        {sheets}
      </Screen>
    );
  }

  const ids = restaurants.map((restaurant) => restaurant.id);
  // Spec 0038, AC-005: "Kacheln" close the restaurant beside the list; the tiles fill the width.
  const changeView = (next: typeof listView.view) => {
    if (selectedId) address.replace({ restaurant: undefined, fenster: undefined });
    listView.setView(next);
  };
  const filterCount = restaurantFilterCount(filter);
  const sortLabel = sortShortLabel(sort);
  const toolbar = (
    <FilterBar
      search={
        <TextField
          round
          inputRef={searchInput}
          value={query}
          onChangeText={list.setQuery}
          placeholder="Restaurants suchen …"
          accessibilityLabel="Restaurants suchen"
          returnKeyType="search"
          left={<Icon name="search" size={19} color="muted" />}
          right={
            query ? (
              <FieldClearButton
                label="Suche leeren"
                onClear={() => list.setQuery('')}
                inputRef={searchInput}
                testID="restaurant-search-clear"
              />
            ) : undefined
          }
          testID="restaurant-search"
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
          options={[...RESTAURANT_SORTS]}
          testID="restaurant-sort"
        />
      }
      chips={
        <>
          {sort === 'random' ? (
            <Chip
              label="Neu mischen"
              icon="refresh-cw"
              onPress={() => list.reshuffle(ids)}
              testID="restaurant-reshuffle"
            />
          ) : null}
          {restaurantFilterChips(filter, cuisines, tags).map((chip) => (
            <Chip
              key={`${chip.kind}-${chip.value}`}
              label={chip.label}
              selected
              removable
              accessibilityLabel={`${chip.label} entfernen`}
              onPress={() => list.setFilter(removeRestaurantFilterChip(filter, chip))}
              testID={`restaurant-chip-${chip.kind}-${String(chip.value).replace('.', '-')}`}
            />
          ))}
          <Chip
            label="Favoriten"
            icon="heart"
            selected={filter.favorites}
            onPress={() => list.setFilter(toggleRestaurantFavorites(filter))}
            testID="restaurant-quick-favorites"
          />
        </>
      }
      panelTitle="Filter"
      panel={
        <RestaurantFilterPanel
          filter={filter}
          onChange={list.setFilter}
          cuisines={cuisines}
          tags={tags}
        />
      }
      resetLabel="Zurücksetzen"
      onReset={() => list.setFilter(EMPTY_RESTAURANT_LIST_FILTER)}
      applyLabel={restaurantShowLabel(results.length)}
      collapseLabel="Einklappen"
      trailing={
        <ListViewSwitch value={listView.view} onChange={changeView} testID="restaurant-view" />
      }
      testID="restaurant-filters"
    />
  );

  const empty = (
    <EmptyState
      icon={query.trim() ? 'search' : 'list-filter'}
      title={restaurantEmptyLabel(query)}
      text={query.trim() ? 'Probiere ein anderes Wort.' : undefined}
      testID="restaurants-no-results"
    >
      {filterCount > 0 ? (
        <Button
          label="Filter zurücksetzen"
          variant="secondary"
          onPress={() => list.setFilter(EMPTY_RESTAURANT_LIST_FILTER)}
          testID="restaurants-reset-filters"
        />
      ) : null}
    </EmptyState>
  );

  const split = selectedId !== undefined;
  const tiles = listView.view === 'tiles';
  const layout = tiles ? 'tiles' : split ? 'column' : 'grid';
  const restaurantList = (
    <InfiniteList<Restaurant>
      // A new round (filter, sort, mixing) starts at the top; its place is kept per round. The
      // tiles, the grid and the narrow list column keep separate places.
      key={`${layout}-${list.round}`}
      restoreKey={`restaurants-${layout}-${list.round}`}
      data={results}
      keyExtractor={(restaurant) => restaurant.id}
      renderItem={(restaurant) =>
        tiles ? (
          <RestaurantTile
            restaurant={restaurant}
            myRating={restaurant.ratings[me.id] ?? 0}
            isFavorite={restaurant.favoriteOf.includes(me.id)}
            lastVisit={lastVisitLabel(visitsById.get(restaurant.id)?.daysSince)}
            onPress={() => openFromList(restaurant.id)}
          />
        ) : (
          // The grid spaces its rows itself; the plain column needs the gap per card.
          <View style={split ? { marginBottom: 12 } : { flexGrow: 1 }}>
            <RestaurantCard
              restaurant={restaurant}
              myRating={restaurant.ratings[me.id] ?? 0}
              isFavorite={restaurant.favoriteOf.includes(me.id)}
              lastVisit={lastVisitLabel(visitsById.get(restaurant.id)?.daysSince)}
              selected={restaurant.id === selectedId}
              onPress={() => openFromList(restaurant.id)}
            />
          </View>
        )
      }
      minColumnWidth={tiles ? TILE_MIN_WIDTH : split ? undefined : CARD_MIN_WIDTH}
      minColumns={tiles ? 2 : undefined}
      ListHeaderComponent={
        <View style={{ gap: 6, marginBottom: 12 }}>
          {offlineHint}
          {results.length > 0 ? (
            <Text variant="small" color="muted" testID="restaurant-count">
              {restaurantCountLabel(results.length)}
            </Text>
          ) : null}
        </View>
      }
      ListEmptyComponent={empty}
      testID="restaurant-list"
    />
  );

  return (
    <Screen
      testID="restaurants-screen"
      tone="essen"
      header={header}
      tabs={props.switcher}
      tabSwipe={props.swipe}
      toolbar={toolbar}
      scroll={false}
      clearFab={false}
      style={{ flex: 1, paddingTop: 0, paddingBottom: 0 }}
    >
      {split ? (
        <ListDetail
          list={restaurantList}
          detail={
            <RestaurantDetail
              restaurantId={selectedId}
              onClose={closeDetail}
              window={
                params.fenster === 'bearbeiten' || params.fenster === 'einplanen'
                  ? params.fenster
                  : undefined
              }
              onWindow={(window) =>
                window ? address.open({ fenster: window }) : address.close({ fenster: undefined })
              }
              // Spec 0024, REQ-010: after "Löschen" the grid, with search and filter.
              onDeleted={() => address.replace({ restaurant: undefined, fenster: undefined })}
              onOpen={open}
            />
          }
          placeholder={{ icon: 'utensils', title: 'Wähl ein Restaurant aus' }}
          listWidth={LIST_COLUMN_WIDTH}
          testID="restaurants-split"
        />
      ) : (
        restaurantList
      )}
      {sheets}
    </Screen>
  );
}

type RestaurantEntryProps = {
  restaurant: Restaurant;
  myRating: number;
  isFavorite: boolean;
  lastVisit?: string;
  onPress: () => void;
};

/** Favourite, own rating and last visit, below the name of a card or a tile. */
function RestaurantSignals(props: RestaurantEntryProps) {
  const id = props.restaurant.id;
  if (!props.isFavorite && !props.myRating && !props.lastVisit) return null;
  return (
    <Row gap={8} wrap>
      {props.isFavorite ? (
        <View
          testID={`restaurant-${id}-favorite`}
          accessibilityLabel="Favorit"
          accessibilityRole="image"
        >
          <Icon name="heart" size={15} color="accent" filled />
        </View>
      ) : null}
      {props.myRating ? (
        <Stars value={props.myRating} size={13} testID={`restaurant-${id}-stars`} />
      ) : null}
      {props.lastVisit ? (
        <Text variant="caption" color="muted" testID={`restaurant-${id}-last`}>
          {props.lastVisit}
        </Text>
      ) : null}
    </Row>
  );
}

/** "Kacheln" (spec 0038, REQ-001): the own photo big in 4:3, else the cutlery. */
function RestaurantTile(props: RestaurantEntryProps) {
  const { restaurant } = props;
  const meta = restaurantMeta(restaurant);
  return (
    <PlaceTile
      testID={`restaurant-${restaurant.id}`}
      name={restaurant.name}
      photoPath={restaurant.photoPath}
      placeholderIcon={RESTAURANT_ICON}
      meta={
        <View style={{ gap: 4 }}>
          {meta ? (
            <Text variant="caption" color="muted" numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
          <RestaurantSignals {...props} />
        </View>
      }
      onPress={props.onPress}
    />
  );
}

function RestaurantCard(props: {
  restaurant: Restaurant;
  myRating: number;
  isFavorite: boolean;
  lastVisit?: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const { restaurant } = props;
  const meta = restaurantMeta(restaurant);
  const id = restaurant.id;
  return (
    <Pressable
      testID={`restaurant-${id}`}
      accessibilityRole="button"
      accessibilityLabel={restaurant.name}
      aria-selected={props.selected}
      onPress={props.onPress}
      style={(state) => ({
        opacity: state.pressed ? 0.75 : 1,
        borderRadius: theme.shape.radius.card,
        // Cards of one grid row share its height.
        flexGrow: 1,
      })}
    >
      <Surface
        padding={12}
        style={[
          { flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
          props.selected ? { borderWidth: 1.5, borderColor: theme.colors.accent } : null,
        ]}
      >
        {/* The own photo, else the cutlery (spec 0024, REQ-004). */}
        <OwnPhoto
          photoPath={restaurant.photoPath}
          name={restaurant.name}
          placeholderIcon={RESTAURANT_ICON}
          width={48}
          height={48}
          testID={`restaurant-${id}`}
        />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Row gap={6}>
            <Text variant="rowTitle" numberOfLines={1} style={{ flexShrink: 1 }}>
              {restaurant.name}
            </Text>
            {props.isFavorite ? (
              <View
                testID={`restaurant-${id}-favorite`}
                accessibilityLabel="Favorit"
                accessibilityRole="image"
              >
                <Icon name="heart" size={15} color="accent" filled />
              </View>
            ) : null}
          </Row>
          {meta ? (
            <Text variant="small" color="muted" numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
          <Row gap={8} wrap>
            {/* The own rating in half stars (spec 0008, REQ-011, AC-041). */}
            {props.myRating ? (
              <Stars value={props.myRating} size={13} testID={`restaurant-${id}-stars`} />
            ) : null}
            {props.lastVisit ? (
              <Text variant="caption" color="muted" testID={`restaurant-${id}-last`}>
                {props.lastVisit}
              </Text>
            ) : null}
          </Row>
        </View>
      </Surface>
    </Pressable>
  );
}
