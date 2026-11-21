import { useCurrentMember, usePlanEntries, useRestaurants, useToday } from '@housekeeping/api';
import {
  fuzzyIncludes,
  restaurantVisits,
  routeId,
  type Id,
  type Restaurant,
} from '@housekeeping/core';
import {
  Button,
  Chip,
  EmptyState,
  Icon,
  IconButton,
  Menu,
  Row,
  Screen,
  ScreenHeader,
  Stack,
  Stars,
  Surface,
  Text,
  TextField,
  useBreakpoint,
  useTheme,
} from '@housekeeping/ui';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { StartPageActions } from '@/features/shell/profile-button';
import { ScrollColumn } from '@/features/shell/scroll-column';
import { useOnlineOnly } from '@/features/shell/offline';

import { AddRestaurantSheet, type AddRestaurantSheetProps } from './add-restaurant-sheet';
import { lastVisitLabel, restaurantMeta } from './labels';
import { RestaurantDetail } from './restaurant-detail';

type RestaurantSort = 'name' | 'rating' | 'recent';

const SORTS: { value: RestaurantSort; label: string }[] = [
  { value: 'name', label: 'A–Z' },
  { value: 'rating', label: 'Bewertung' },
  { value: 'recent', label: 'Zuletzt' },
];

const LIST_COLUMN_WIDTH = 380;

type SheetRequest = Pick<AddRestaurantSheetProps, 'initialText' | 'initialName' | 'focus'>;

function param(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function matches(query: string, restaurant: Restaurant): boolean {
  return [restaurant.name, restaurant.cuisine, restaurant.address, ...restaurant.tags].some(
    (field) => field !== undefined && fuzzyIncludes(query, field),
  );
}

/** "Essen → Restaurants": search, favourites, sort; on wide screens list and detail side by side. */
export function RestaurantsPanel(props: { switcher: ReactNode }) {
  const router = useRouter();
  const params = useLocalSearchParams<{
    rid?: string | string[];
    add?: string | string[];
    share?: string | string[];
    shareName?: string | string[];
  }>();
  const { isWide, isPhone, bp } = useBreakpoint();
  const online = useOnlineOnly();
  const restaurants = useRestaurants();
  const entries = usePlanEntries();
  const today = useToday();
  const me = useCurrentMember();

  const [query, setQuery] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [sort, setSort] = useState<RestaurantSort>('name');
  const [sheet, setSheet] = useState<SheetRequest | undefined>();

  const selectedId = isWide ? routeId(params.rid) : undefined;
  // The share target opens the sheet through the URL, so a reload keeps it open (AC-008).
  const shared: SheetRequest | undefined =
    param(params.add) === '1'
      ? { initialText: param(params.share), initialName: param(params.shareName), focus: 'name' }
      : undefined;
  const sheetRequest = sheet ?? shared;

  const open = (restaurantId: Id) => {
    if (isWide) router.setParams({ rid: restaurantId });
    else router.push({ pathname: '/restaurant/[id]', params: { id: restaurantId } });
  };
  const closeSheet = () => {
    setSheet(undefined);
    if (shared) router.setParams({ add: undefined, share: undefined, shareName: undefined });
  };

  const visitsById = new Map(
    restaurants.map((restaurant) => [
      restaurant.id,
      restaurantVisits(restaurant.id, entries, today),
    ]),
  );
  const filtered = restaurants.filter(
    (restaurant) =>
      (!favoritesOnly || restaurant.favoriteOf.includes(me.id)) &&
      (!query.trim() || matches(query, restaurant)),
  );
  const results = [...filtered].sort((a, b) => {
    if (sort === 'rating') {
      const byRating = (b.ratings[me.id] ?? 0) - (a.ratings[me.id] ?? 0);
      if (byRating !== 0) return byRating;
    }
    if (sort === 'recent') {
      // Never visited goes last.
      const daysA = visitsById.get(a.id)?.daysSince ?? Number.POSITIVE_INFINITY;
      const daysB = visitsById.get(b.id)?.daysSince ?? Number.POSITIVE_INFINITY;
      if (daysA !== daysB) return daysA - daysB;
    }
    return a.name.localeCompare(b.name, 'de');
  });

  const header = (
    <ScreenHeader
      title="Essen"
      right={
        <>
          {isPhone ? (
            <IconButton
              icon="plus"
              label="Restaurant hinzufügen"
              variant="soft"
              disabled={online.disabled}
              hint={online.hint}
              onPress={() => setSheet({ focus: 'link' })}
              testID="restaurant-add"
            />
          ) : (
            <Button
              label="Restaurant hinzufügen"
              icon="plus"
              size="sm"
              disabled={online.disabled}
              hint={online.hint}
              onPress={() => setSheet({ focus: 'link' })}
              testID="restaurant-add"
            />
          )}
          <StartPageActions />
        </>
      }
    />
  );
  const offlineHint = online.hint ? (
    <Text
      variant="small"
      color="warn"
      testID="restaurant-offline-hint"
      style={{ marginBottom: 12 }}
    >
      {online.hint}
    </Text>
  ) : null;

  const sheets = sheetRequest ? (
    <AddRestaurantSheet
      key={`${sheetRequest.initialText ?? ''}|${sheetRequest.initialName ?? ''}`}
      {...sheetRequest}
      onClose={closeSheet}
      onCreated={open}
      onOpenExisting={open}
    />
  ) : null;

  if (restaurants.length === 0) {
    return (
      <Screen testID="restaurants-screen" tone="essen" header={header} tabs={props.switcher}>
        {offlineHint}
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

  const compact = selectedId !== undefined;
  const columns = isPhone || compact ? 1 : bp === 'desktop' ? 3 : 2;
  const sortLabel = SORTS.find((entry) => entry.value === sort)?.label ?? '';
  const toolbar = (
    <Stack gap={8}>
      <TextField
        round
        value={query}
        onChangeText={setQuery}
        placeholder="Restaurants suchen …"
        accessibilityLabel="Restaurants suchen"
        returnKeyType="search"
        left={<Icon name="search" size={19} color="muted" />}
        right={
          query ? (
            <IconButton
              icon="x"
              label="Suche leeren"
              onPress={() => setQuery('')}
              testID="restaurant-search-clear"
            />
          ) : undefined
        }
        testID="restaurant-search"
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingBottom: 2 }}
        style={{ flexGrow: 0 }}
      >
        <Menu
          label={sortLabel}
          accessibilityLabel={`Sortierung: ${sortLabel}`}
          icon="arrow-up-down"
          value={sort}
          onChange={setSort}
          options={SORTS}
          testID="restaurant-sort"
        />
        <Chip
          label="Favoriten"
          icon="heart"
          selected={favoritesOnly}
          onPress={() => setFavoritesOnly(!favoritesOnly)}
          testID="rfilter-favorites"
        />
      </ScrollView>
    </Stack>
  );
  const listBody = (
    <>
      <Text variant="small" color="muted" testID="restaurant-count" style={{ marginBottom: 12 }}>
        {results.length === 1 ? '1 Restaurant' : `${results.length} Restaurants`}
      </Text>
      {results.length === 0 ? (
        <EmptyState
          icon="search"
          title="Nichts gefunden"
          text="Probiere ein anderes Wort oder nimm den Filter heraus."
          testID="restaurants-no-results"
        />
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {results.map((restaurant) => (
            <View
              key={restaurant.id}
              style={{ width: columns === 1 ? '100%' : columns === 2 ? '48.5%' : '31.8%' }}
            >
              <RestaurantCard
                restaurant={restaurant}
                myRating={restaurant.ratings[me.id] ?? 0}
                isFavorite={restaurant.favoriteOf.includes(me.id)}
                lastVisit={lastVisitLabel(visitsById.get(restaurant.id)?.daysSince)}
                selected={restaurant.id === selectedId}
                onPress={() => open(restaurant.id)}
              />
            </View>
          ))}
        </View>
      )}
    </>
  );

  if (compact && selectedId !== undefined) {
    return (
      <Screen
        testID="restaurants-screen"
        tone="essen"
        header={header}
        tabs={props.switcher}
        scroll={false}
        style={{ flex: 1, paddingBottom: 0 }}
      >
        <View style={{ flex: 1, flexDirection: 'row', gap: 32 }}>
          <View style={{ width: LIST_COLUMN_WIDTH }}>
            <ScrollColumn>
              <View style={{ paddingVertical: 8 }}>{toolbar}</View>
              {offlineHint}
              {listBody}
            </ScrollColumn>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <ScrollColumn>
              <View style={{ paddingTop: 8 }}>
                <RestaurantDetail
                  restaurantId={selectedId}
                  onClose={() => router.setParams({ rid: undefined })}
                />
              </View>
            </ScrollColumn>
          </View>
        </View>
        {sheets}
      </Screen>
    );
  }

  return (
    <Screen
      testID="restaurants-screen"
      tone="essen"
      header={header}
      tabs={props.switcher}
      toolbar={toolbar}
    >
      {offlineHint}
      {listBody}
      {sheets}
    </Screen>
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
      accessibilityState={{ selected: props.selected }}
      onPress={props.onPress}
      style={(state) => ({
        opacity: state.pressed ? 0.75 : 1,
        borderRadius: theme.shape.radius.card,
      })}
    >
      <Surface
        padding={12}
        style={[
          { flexDirection: 'row', alignItems: 'center', gap: 12 },
          props.selected ? { borderWidth: 1.5, borderColor: theme.colors.accent } : null,
        ]}
      >
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: theme.shape.radius.photo,
            backgroundColor: theme.colors.surfaceSunken,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="utensils" size={22} color="muted" />
        </View>
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
