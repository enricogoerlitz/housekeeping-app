import {
  useActivities,
  useActivityKindsById,
  useCurrentMember,
  usePlanEntries,
  useToday,
} from '@housekeeping/api';
import {
  ACTIVITY_SORTS,
  activityMatches,
  filterRemembered,
  REMEMBER_FILTERS,
  sortActivities,
  type RememberFilter,
  visitsOf,
  type Activity,
  type ActivitySort,
  type Id,
  type Visits,
} from '@housekeeping/core';
import {
  Button,
  CreateButton,
  Chip,
  columnsFor,
  EmptyState,
  Icon,
  IconButton,
  ListDetail,
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
  FieldClearButton,
  openKeyboardNow,
} from '@housekeeping/ui';
import { useIsFocused, useRouter } from 'expo-router';
import { type ComponentRef, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, View, type TextInput } from 'react-native';

import { ListViewSwitch, PlaceTile, TILE_MIN_WIDTH, useListView } from '@/features/shell/list-view';
import { useOnlineOnly } from '@/features/shell/offline';
import { ScrollColumn } from '@/features/shell/scroll-column';
import { useSettings } from '@/lib/settings';
import { useOriginBack, usePageParams } from '@/lib/url-state';

import { ActivityDetail } from './activity-detail';
import { ActivityFormSheet } from './activity-form';
import { ActivityKindsSheet } from './activity-kinds-sheet';
import { ActivityPhoto, useActivityIcon } from './activity-photo';
import { activityPlaceLine, activityVisitsLabel } from './labels';

const SORT_OF_SLUG = { name: 'name', bewertung: 'rating', zuletzt: 'recent' } as const;
const SLUG_OF_SORT = { name: 'name', rating: 'bewertung', recent: 'zuletzt' } as const;

/** "↕ Zuletzt ▾": the short text for "Zuletzt besucht", as for restaurants. */
function sortShortLabel(sort: ActivitySort): string {
  if (sort === 'recent') return 'Zuletzt';
  return ACTIVITY_SORTS.find((entry) => entry.value === sort)?.label ?? '';
}

const rememberLabel = (filter: RememberFilter) =>
  REMEMBER_FILTERS.find((entry) => entry.value === filter)?.label ?? '';

/** The list column next to a chosen activity on wide screens ("Liste und Detail"). */
const LIST_COLUMN_WIDTH = 380;
/** Space between the cards and tiles, across and down. */
const GAP = 12;

/**
 * "Aktivitäten" as its own page under "Verwalten" (spec 0024, REQ-008, REQ-009; spec 0004,
 * AC-004, AC-005): search, favourites, sort. On phones an activity opens as its own page; from
 * 700 px the grid of cards, and with a chosen activity the list on the left (chosen one
 * highlighted) and the activity on the right with ✕ back to the grid.
 */
export function ActivitiesScreen() {
  const searchInput = useRef<ComponentRef<typeof TextInput>>(null);
  const { isPhone, isWide, bp } = useBreakpoint();
  const router = useRouter();
  const online = useOnlineOnly();
  const activities = useActivities();
  const entries = usePlanEntries();
  const today = useToday();
  const me = useCurrentMember();
  // Search, favourites, sort and "Neue Aktivität" stand in the address (spec 0019, REQ-011).
  const address = usePageParams('aktivitaeten');
  const { params } = address;
  // "‹ Verwalten", or the section it was opened from (spec 0019, REQ-006).
  const { label: backLabel, back } = useOriginBack(params.von, 'verwalten');
  const focused = useIsFocused();
  // "Kacheln" open the activity's page, "Liste" beside the list on wide screens (spec 0038).
  const listView = useListView('activities');
  const tiles = listView.view === 'tiles';
  const [listWidth, setListWidth] = useState(0);
  // "Gemerkt", "Alle", "Nicht gemerkt" (spec 0041, REQ-004): never in the address, and back to
  // "Gemerkt" whenever the list is left (AC-013).
  const [remember, setRemember] = useState<RememberFilter>('remembered');
  const [wasFocused, setWasFocused] = useState(focused);
  if (focused !== wasFocused) {
    setWasFocused(focused);
    if (!focused) setRemember('remembered');
  }

  const query = params.suche ?? '';
  const favoritesOnly = params.favoriten === '1';
  // Without a sort in the address the one chosen last on this device applies (spec 0036, REQ-002).
  const settings = useSettings();
  const sort: ActivitySort = params.sortierung
    ? SORT_OF_SLUG[params.sortierung]
    : (settings.listSorts.activities ?? 'name');
  const creating = params.fenster === 'neu-aktivitaet' && focused;
  const kindsOpen = params.fenster === 'arten' && focused;
  const setQuery = (next: string) => address.replace({ suche: next });
  const setFavoritesOnly = (next: boolean) =>
    address.replace({ favoriten: next ? '1' : undefined });
  const setSort = (next: ActivitySort) => {
    settings.update({ listSorts: { ...settings.listSorts, activities: next } });
    address.replace({ sortierung: SLUG_OF_SORT[next] });
  };
  const setCreating = (open: boolean) =>
    open ? address.open({ fenster: 'neu-aktivitaet' }) : address.close({ fenster: undefined });

  // On wide screens the chosen activity stands in the address and replaces the entry (spec 0019,
  // REQ-014); on phones the same address opens its page, with the list underneath.
  const selectedId = listView.quick ? params.aktivitaet : undefined;
  const addressed = params.aktivitaet;
  const replace = address.replace;
  useEffect(() => {
    if (isWide || !addressed) return;
    replace({ aktivitaet: undefined });
    router.push({ pathname: '/aktivitaet/[id]', params: { id: addressed } }, { withAnchor: true });
  }, [isWide, addressed, replace, router]);
  // From a new activity on to it: the window leaves the address first.
  const open = (activityId: Id) => {
    if (listView.quick) address.replace({ fenster: undefined, aktivitaet: activityId });
    else {
      address.replace({ fenster: undefined });
      router.push({ pathname: '/aktivitaet/[id]', params: { id: activityId } });
    }
  };
  const closeDetail = () => address.replace({ aktivitaet: undefined, fenster: undefined });
  // Spec 0038, AC-005: "Kacheln" close the activity beside the list; the tiles fill the width.
  const changeView = (next: typeof listView.view) => {
    if (selectedId) closeDetail();
    listView.setView(next);
  };

  const visitsById = new Map<Id, Visits>(
    activities.map((activity) => [activity.id, visitsOf('activity', activity.id, entries, today)]),
  );
  const results = sortActivities(
    filterRemembered(
      activities.filter(
        (activity) =>
          (!favoritesOnly || activity.favoriteOf.includes(me.id)) &&
          activityMatches(query, activity),
      ),
      remember,
    ),
    sort,
    { me: me.id, entries, today },
  );

  // The window's name field gets the keyboard with the tap (spec 0033, REQ-006).
  const startCreating = () => {
    openKeyboardNow();
    setCreating(true);
  };
  const empty = activities.length === 0;
  const addButton = empty ? null : (
    <CreateButton
      label="Aktivität anlegen"
      disabled={online.disabled}
      hint={online.hint}
      onPress={startCreating}
      testID="activity-add"
    />
  );
  // Spec 0041, REQ-001: the kinds are renamed and deleted here.
  // On wide screens with its word, like "Aktivität anlegen" next to it (review 0003).
  const kindsButton = isPhone ? (
    <IconButton
      icon="layers"
      label="Arten"
      variant="soft"
      onPress={() => address.open({ fenster: 'arten' })}
      testID="activity-kinds-open"
    />
  ) : (
    <Button
      label="Arten"
      icon="layers"
      size="sm"
      variant="secondary"
      onPress={() => address.open({ fenster: 'arten' })}
      testID="activity-kinds-open"
    />
  );
  const header = (
    <ScreenHeader
      title="Aktivitäten"
      backLabel={backLabel}
      onBack={back}
      right={
        <Row gap={8}>
          {kindsButton}
          {addButton}
        </Row>
      }
      testID="activities-title"
    />
  );
  const offlineHint = online.hint ? (
    <Text variant="small" color="warn" testID="activity-offline-hint" style={{ marginBottom: 12 }}>
      {online.hint}
    </Text>
  ) : null;

  const sheet = creating ? (
    <ActivityFormSheet
      start
      onClose={() => setCreating(false)}
      onSaved={open}
      onOpenExisting={open}
    />
  ) : kindsOpen ? (
    <ActivityKindsSheet onClose={() => address.close({ fenster: undefined })} />
  ) : null;

  if (empty) {
    return (
      <Screen testID="activities-screen" tone="plan" header={header}>
        {offlineHint}
        <EmptyState
          icon="mountain"
          title="Noch keine Aktivitäten"
          text="Eislaufen, Bouldern, Spieleabend: Leg an, was ihr gern unternehmt, und plant es in die Woche."
          testID="activities-empty"
        >
          <Button
            label="Aktivität anlegen"
            icon="plus"
            disabled={online.disabled}
            hint={online.hint}
            onPress={startCreating}
            testID="activity-add"
          />
        </EmptyState>
        {sheet}
      </Screen>
    );
  }

  const split = selectedId !== undefined;
  const columns = tiles
    ? columnsFor(listWidth, { minColumnWidth: TILE_MIN_WIDTH, gap: GAP, minColumns: 2 })
    : isPhone || split
      ? 1
      : bp === 'desktop'
        ? 3
        : 2;
  const cellWidth =
    columns === 1
      ? '100%'
      : listWidth > 0
        ? Math.floor((listWidth - GAP * (columns - 1)) / columns)
        : columns === 2
          ? '48.5%'
          : '31.8%';
  const sortLabel = sortShortLabel(sort);
  const toolbar = (
    <Stack gap={8}>
      <TextField
        round
        inputRef={searchInput}
        value={query}
        onChangeText={setQuery}
        placeholder="Aktivitäten suchen …"
        accessibilityLabel="Aktivitäten suchen"
        returnKeyType="search"
        left={<Icon name="search" size={19} color="muted" />}
        right={
          query ? (
            <FieldClearButton
              label="Suche leeren"
              onClear={() => setQuery('')}
              inputRef={searchInput}
              testID="activity-search-clear"
            />
          ) : undefined
        }
        testID="activity-search"
      />
      <Row gap={8}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingBottom: 2 }}
          style={{ flexGrow: 0, flexShrink: 1 }}
        >
          <Menu
            label={sortLabel}
            accessibilityLabel={`Sortierung: ${sortLabel}`}
            icon="arrow-up-down"
            value={sort}
            onChange={setSort}
            options={[...ACTIVITY_SORTS]}
            testID="activity-sort"
          />
          <Menu
            label={rememberLabel(remember)}
            accessibilityLabel={`Merken: ${rememberLabel(remember)}`}
            icon="bookmark"
            value={remember}
            onChange={setRemember}
            options={[...REMEMBER_FILTERS]}
            testID="activity-remember"
          />
          <Chip
            label="Favoriten"
            icon="heart"
            selected={favoritesOnly}
            onPress={() => setFavoritesOnly(!favoritesOnly)}
            testID="afilter-favorites"
          />
        </ScrollView>
        <View style={{ flex: 1 }} />
        <ListViewSwitch value={listView.view} onChange={changeView} testID="activity-view" />
      </Row>
    </Stack>
  );
  const listBody = (
    <>
      <Text variant="small" color="muted" testID="activity-count" style={{ marginBottom: 12 }}>
        {results.length === 1 ? '1 Aktivität' : `${results.length} Aktivitäten`}
      </Text>
      {results.length === 0 ? (
        <EmptyState
          icon="search"
          title="Nichts gefunden"
          text="Probiere ein anderes Wort oder nimm den Filter heraus."
          testID="activities-no-results"
        />
      ) : (
        <View
          onLayout={(event) => setListWidth(event.nativeEvent.layout.width)}
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}
        >
          {results.map((activity) => (
            <View key={activity.id} style={{ width: cellWidth }}>
              {tiles ? (
                <ActivityTile
                  activity={activity}
                  myRating={activity.ratings[me.id] ?? 0}
                  isFavorite={activity.favoriteOf.includes(me.id)}
                  visits={visitsById.get(activity.id)}
                  onPress={() => open(activity.id)}
                />
              ) : (
                <ActivityCard
                  activity={activity}
                  myRating={activity.ratings[me.id] ?? 0}
                  isFavorite={activity.favoriteOf.includes(me.id)}
                  visits={visitsById.get(activity.id)}
                  selected={activity.id === selectedId}
                  onPress={() => open(activity.id)}
                />
              )}
            </View>
          ))}
        </View>
      )}
    </>
  );

  const detailWindow =
    params.fenster === 'bearbeiten' || params.fenster === 'einplanen' ? params.fenster : undefined;
  return (
    <Screen
      testID="activities-screen"
      tone="plan"
      header={header}
      toolbar={toolbar}
      scroll={!split}
      style={split ? { flex: 1, paddingBottom: 0 } : undefined}
    >
      {split ? (
        <ListDetail
          list={
            <ScrollColumn>
              {offlineHint}
              {listBody}
            </ScrollColumn>
          }
          detail={
            <ActivityDetail
              activityId={selectedId}
              onClose={closeDetail}
              window={detailWindow}
              onWindow={(window) =>
                window ? address.open({ fenster: window }) : address.close({ fenster: undefined })
              }
              // Spec 0024, REQ-010: after "Löschen" the grid, with search and filter.
              onDeleted={closeDetail}
              onOpen={open}
            />
          }
          placeholder={{ icon: 'mountain', title: 'Wähl eine Aktivität aus' }}
          listWidth={LIST_COLUMN_WIDTH}
          testID="activities-split"
        />
      ) : (
        <>
          {offlineHint}
          {listBody}
        </>
      )}
      {sheet}
    </Screen>
  );
}

/**
 * "Kacheln" (spec 0038, AC-006): the own photo big in 4:3, else the symbol of its kind or its own
 * symbol (spec 0041, AC-005); kind, place, favourite, rating and visits below the name.
 */
function ActivityTile(props: {
  activity: Activity;
  myRating: number;
  isFavorite: boolean;
  visits?: Visits;
  onPress: () => void;
}) {
  const kindsById = useActivityKindsById();
  const { activity } = props;
  const id = activity.id;
  const icon = useActivityIcon(activity);
  const kind = activity.kindId === undefined ? undefined : kindsById[activity.kindId];
  const placeLine = [kind?.name, activityPlaceLine(activity)].filter(Boolean).join(' · ');
  const last = props.visits ? activityVisitsLabel(props.visits) : undefined;
  const signals = props.isFavorite || props.myRating > 0 || last !== undefined;
  return (
    <PlaceTile
      testID={`activity-${id}`}
      name={activity.name}
      photoPath={activity.photoPath}
      placeholderIcon={icon}
      meta={
        <View style={{ gap: 4 }}>
          {placeLine ? (
            <Text variant="caption" color="muted" numberOfLines={1} testID={`activity-${id}-place`}>
              {placeLine}
            </Text>
          ) : null}
          {signals ? (
            <Row gap={8} wrap>
              {props.isFavorite ? (
                <View
                  testID={`activity-${id}-favorite`}
                  accessibilityLabel="Favorit"
                  accessibilityRole="image"
                >
                  <Icon name="heart" size={15} color="accent" filled />
                </View>
              ) : null}
              {props.myRating ? (
                <Stars value={props.myRating} size={13} testID={`activity-${id}-stars`} />
              ) : null}
              {last ? (
                <Text variant="caption" color="muted" testID={`activity-${id}-last`}>
                  {last}
                </Text>
              ) : null}
            </Row>
          ) : null}
        </View>
      }
      onPress={props.onPress}
    />
  );
}

function ActivityCard(props: {
  activity: Activity;
  myRating: number;
  isFavorite: boolean;
  visits?: Visits;
  selected?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const kindsById = useActivityKindsById();
  const { activity } = props;
  const id = activity.id;
  const kind = activity.kindId === undefined ? undefined : kindsById[activity.kindId];
  const placeLine = [kind?.name, activityPlaceLine(activity)].filter(Boolean).join(' · ');
  const last = props.visits ? activityVisitsLabel(props.visits) : undefined;
  return (
    <Pressable
      testID={`activity-${id}`}
      accessibilityRole="button"
      accessibilityLabel={activity.name}
      aria-selected={!!props.selected}
      onPress={props.onPress}
      // Cards of one row are as tall as the tallest (review 0003, B-15).
      style={(state) => ({
        flexGrow: 1,
        opacity: state.pressed ? 0.75 : 1,
        borderRadius: theme.shape.radius.card,
      })}
    >
      <Surface
        padding={12}
        style={[
          { flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
          props.selected ? { borderWidth: 1.5, borderColor: theme.colors.accent } : null,
        ]}
      >
        <ActivityPhoto activity={activity} width={56} height={56} testID={`activity-${id}`} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Row gap={6}>
            <Text variant="rowTitle" numberOfLines={1} style={{ flexShrink: 1 }}>
              {activity.name}
            </Text>
            {props.isFavorite ? (
              <View
                testID={`activity-${id}-favorite`}
                accessibilityLabel="Favorit"
                accessibilityRole="image"
              >
                <Icon name="heart" size={15} color="accent" filled />
              </View>
            ) : null}
          </Row>
          {placeLine ? (
            <Text variant="small" color="muted" numberOfLines={1} testID={`activity-${id}-place`}>
              {placeLine}
            </Text>
          ) : null}
          <Row gap={8} wrap>
            {props.myRating ? (
              <Stars value={props.myRating} size={13} testID={`activity-${id}-stars`} />
            ) : null}
            {last ? (
              <Text variant="caption" color="muted" testID={`activity-${id}-last`}>
                {last}
              </Text>
            ) : null}
          </Row>
        </View>
      </Surface>
    </Pressable>
  );
}
