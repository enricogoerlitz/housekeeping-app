import { useActivities, useCurrentMember, usePlanEntries, useToday } from '@housekeeping/api';
import { fuzzyIncludes, visitsOf, type Activity, type Id, type Visits } from '@housekeeping/core';
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
import { useState } from 'react';

import { useOpenActivity } from './navigation';
import { Pressable, ScrollView, View } from 'react-native';

import { useOnlineOnly } from '@/features/shell/offline';

import { ActivityFormSheet } from './activity-form';
import { ActivityPhoto } from './activity-photo';
import { activityPlaceLine, activityVisitsLabel } from './labels';

type ActivitySort = 'name' | 'rating' | 'recent';

const SORTS: { value: ActivitySort; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'rating', label: 'Bewertung' },
  { value: 'recent', label: 'Zuletzt' },
];

function matches(query: string, activity: Activity): boolean {
  return [
    activity.name,
    activity.description,
    activity.placeName,
    activity.address,
    ...activity.tags,
  ].some((field) => field !== undefined && fuzzyIncludes(query, field));
}

/**
 * "Back" of the page "Aktivitäten" (spec 0010, REQ-008): opened from "Verwalten" on a phone it
 * leads there ("‹ Verwalten"), otherwise back to the calendar underneath ("‹ Kalender"), which
 * still shows the view and period it had (AC-025, AC-040).
 */
function useActivitiesBack(): { label: string; back: () => void } {
  const router = useRouter();
  const { isPhone } = useBreakpoint();
  const params = useLocalSearchParams<{ von?: string | string[] }>();
  const from = Array.isArray(params.von) ? params.von[0] : params.von;
  if (from === 'verwalten' && isPhone) {
    return {
      label: 'Verwalten',
      back: () => {
        // The calendar's tab gets its first page back before "Verwalten" shows, so the tab shows
        // the calendar again later instead of this page.
        router.replace('/kalender');
        router.navigate('/verwalten');
      },
    };
  }
  return {
    label: 'Kalender',
    back: () => (router.canGoBack() ? router.back() : router.replace('/kalender')),
  };
}

/**
 * "Aktivitäten" as its own page in the calendar's area (spec 0010, REQ-008; spec 0004, AC-004,
 * AC-005): search, favourites, sort; an activity opens as its own page.
 */
export function ActivitiesScreen() {
  const router = useRouter();
  const { isPhone, bp } = useBreakpoint();
  const online = useOnlineOnly();
  const activities = useActivities();
  const entries = usePlanEntries();
  const today = useToday();
  const me = useCurrentMember();
  const { label: backLabel, back } = useActivitiesBack();

  const [query, setQuery] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [sort, setSort] = useState<ActivitySort>('name');
  const [creating, setCreating] = useState(false);

  const open = useOpenActivity();

  const visitsById = new Map<Id, Visits>(
    activities.map((activity) => [activity.id, visitsOf('activity', activity.id, entries, today)]),
  );
  const results = activities
    .filter(
      (activity) =>
        (!favoritesOnly || activity.favoriteOf.includes(me.id)) &&
        (!query.trim() || matches(query, activity)),
    )
    .sort((a, b) => {
      if (sort === 'rating') {
        const byRating = (b.ratings[me.id] ?? 0) - (a.ratings[me.id] ?? 0);
        if (byRating !== 0) return byRating;
      }
      if (sort === 'recent') {
        // Never done goes last.
        const daysA = visitsById.get(a.id)?.daysSince ?? Number.POSITIVE_INFINITY;
        const daysB = visitsById.get(b.id)?.daysSince ?? Number.POSITIVE_INFINITY;
        if (daysA !== daysB) return daysA - daysB;
      }
      return a.name.localeCompare(b.name, 'de');
    });

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

  const columns = isPhone ? 1 : bp === 'desktop' ? 3 : 2;
  const sortLabel = SORTS.find((entry) => entry.value === sort)?.label ?? '';
  const toolbar = (
    <Stack gap={8}>
      <TextField
        round
        value={query}
        onChangeText={setQuery}
        placeholder="Aktivitäten suchen …"
        accessibilityLabel="Aktivitäten suchen"
        returnKeyType="search"
        left={<Icon name="search" size={19} color="muted" />}
        right={
          query ? (
            <IconButton
              icon="x"
              label="Suche leeren"
              onPress={() => setQuery('')}
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
          options={SORTS}
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
                onPress={() => open(activity.id)}
              />
            </View>
          ))}
        </View>
      )}
    </>
  );

  return (
    <Screen testID="activities-screen" tone="plan" header={header} toolbar={toolbar}>
      {offlineHint}
      {listBody}
      {sheet}
    </Screen>
  );
}

function ActivityCard(props: {
  activity: Activity;
  myRating: number;
  isFavorite: boolean;
  visits?: Visits;
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
      onPress={props.onPress}
      style={(state) => ({
        opacity: state.pressed ? 0.75 : 1,
        borderRadius: theme.shape.radius.card,
      })}
    >
      <Surface padding={12} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
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
