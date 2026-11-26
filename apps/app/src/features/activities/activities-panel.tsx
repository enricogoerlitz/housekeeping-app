import { useActivities, useCurrentMember, usePlanEntries, useToday } from '@housekeeping/api';
import {
  ACTIVITY_SORTS,
  activityMatches,
  sortActivities,
  visitsOf,
  type Activity,
  type ActivitySort,
  type Id,
  type Visits,
} from '@housekeeping/core';
import {
  Button,
  Chip,
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
} from '@housekeeping/ui';
import { useIsFocused, useRouter } from 'expo-router';
import { type ComponentRef, useEffect, useRef } from 'react';
import { Pressable, ScrollView, View, type TextInput } from 'react-native';

import { useOnlineOnly } from '@/features/shell/offline';
import { ScrollColumn } from '@/features/shell/scroll-column';
import { useSettings } from '@/lib/settings';
import { useOriginBack, usePageParams } from '@/lib/url-state';

import { ActivityDetail } from './activity-detail';
import { ActivityFormSheet } from './activity-form';
import { ActivityPhoto } from './activity-photo';
import { activityPlaceLine, activityVisitsLabel } from './labels';

const SORT_OF_SLUG = { name: 'name', bewertung: 'rating', zuletzt: 'recent' } as const;
const SLUG_OF_SORT = { name: 'name', rating: 'bewertung', recent: 'zuletzt' } as const;

/** "↕ Zuletzt ▾": the short text for "Zuletzt besucht", as for restaurants. */
function sortShortLabel(sort: ActivitySort): string {
  if (sort === 'recent') return 'Zuletzt';
  return ACTIVITY_SORTS.find((entry) => entry.value === sort)?.label ?? '';
}

/** The list column next to a chosen activity on wide screens ("Liste und Detail"). */
const LIST_COLUMN_WIDTH = 380;

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

  const query = params.suche ?? '';
  const favoritesOnly = params.favoriten === '1';
  // Without a sort in the address the one chosen last on this device applies (spec 0036, REQ-002).
  const settings = useSettings();
  const sort: ActivitySort = params.sortierung
    ? SORT_OF_SLUG[params.sortierung]
    : (settings.listSorts.activities ?? 'name');
  const creating = params.fenster === 'neu-aktivitaet' && focused;
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
  const selectedId = isWide ? params.aktivitaet : undefined;
  const addressed = params.aktivitaet;
  const replace = address.replace;
  useEffect(() => {
    if (isWide || !addressed) return;
    replace({ aktivitaet: undefined });
    router.push({ pathname: '/aktivitaet/[id]', params: { id: addressed } }, { withAnchor: true });
  }, [isWide, addressed, replace, router]);
  // From a new activity on to it: the window leaves the address first.
  const open = (activityId: Id) => {
    if (isWide) address.replace({ fenster: undefined, aktivitaet: activityId });
    else {
      address.replace({ fenster: undefined });
      router.push({ pathname: '/aktivitaet/[id]', params: { id: activityId } });
    }
  };
  const closeDetail = () => address.replace({ aktivitaet: undefined, fenster: undefined });

  const visitsById = new Map<Id, Visits>(
    activities.map((activity) => [activity.id, visitsOf('activity', activity.id, entries, today)]),
  );
  const results = sortActivities(
    activities.filter(
      (activity) =>
        (!favoritesOnly || activity.favoriteOf.includes(me.id)) && activityMatches(query, activity),
    ),
    sort,
    { me: me.id, entries, today },
  );

  const empty = activities.length === 0;
  const addButton = empty ? null : isPhone ? (
    <IconButton
      icon="plus"
      label="Aktivität anlegen"
      variant="soft"
      disabled={online.disabled}
      hint={online.hint}
      onPress={() => setCreating(true)}
      testID="activity-add"
    />
  ) : (
    <Button
      label="Aktivität anlegen"
      icon="plus"
      size="sm"
      disabled={online.disabled}
      hint={online.hint}
      onPress={() => setCreating(true)}
      testID="activity-add"
    />
  );
  const header = (
    <ScreenHeader
      title="Aktivitäten"
      backLabel={backLabel}
      onBack={back}
      right={addButton}
      testID="activities-title"
    />
  );
  const offlineHint = online.hint ? (
    <Text variant="small" color="warn" testID="activity-offline-hint" style={{ marginBottom: 12 }}>
      {online.hint}
    </Text>
  ) : null;

  const sheet = creating ? (
    <ActivityFormSheet onClose={() => setCreating(false)} onSaved={open} onOpenExisting={open} />
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
            onPress={() => setCreating(true)}
            testID="activity-add"
          />
        </EmptyState>
        {sheet}
      </Screen>
    );
  }

  const split = selectedId !== undefined;
  const columns = isPhone || split ? 1 : bp === 'desktop' ? 3 : 2;
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
          options={[...ACTIVITY_SORTS]}
          testID="activity-sort"
        />
        <Chip
          label="Favoriten"
          icon="heart"
          selected={favoritesOnly}
          onPress={() => setFavoritesOnly(!favoritesOnly)}
          testID="afilter-favorites"
        />
      </ScrollView>
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
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {results.map((activity) => (
            <View
              key={activity.id}
              style={{ width: columns === 1 ? '100%' : columns === 2 ? '48.5%' : '31.8%' }}
            >
              <ActivityCard
                activity={activity}
                myRating={activity.ratings[me.id] ?? 0}
                isFavorite={activity.favoriteOf.includes(me.id)}
                visits={visitsById.get(activity.id)}
                selected={activity.id === selectedId}
                onPress={() => open(activity.id)}
              />
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

function ActivityCard(props: {
  activity: Activity;
  myRating: number;
  isFavorite: boolean;
  visits?: Visits;
  selected?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const { activity } = props;
  const id = activity.id;
  const placeLine = activityPlaceLine(activity);
  const last = props.visits ? activityVisitsLabel(props.visits) : undefined;
  return (
    <Pressable
      testID={`activity-${id}`}
      accessibilityRole="button"
      accessibilityLabel={activity.name}
      aria-selected={!!props.selected}
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
