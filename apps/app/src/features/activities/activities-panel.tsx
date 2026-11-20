import { useActivities, useCurrentMember, usePlanEntries, useToday } from '@housekeeping/api';
import { fuzzyIncludes, visitsOf, type Activity, type Id, type Visits } from '@housekeeping/core';
import {
  Button,
  Chip,
  EmptyState,
  Icon,
  IconButton,
  Row,
  Screen,
  Segmented,
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

import { ProfileButton } from '@/features/shell/profile-button';
import { useOnlineOnly } from '@/features/shell/offline';

import { ActivityDetail } from './activity-detail';
import { ActivityFormSheet } from './activity-form';
import { ActivityPhoto } from './activity-photo';
import { activityPlaceLine, activityVisitsLabel } from './labels';

type ActivitySort = 'name' | 'rating' | 'recent';

const SORTS: { value: ActivitySort; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'rating', label: 'Bewertung' },
  { value: 'recent', label: 'Zuletzt' },
];

const LIST_COLUMN_WIDTH = 380;

function param(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

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
 * "Plan → Aktivitäten" (AC-004, AC-005): search, favourites, sort; on wide screens list and
 * detail side by side, on phones the detail is its own page inside the plan tab.
 */
export function ActivitiesPanel(props: { header: (right: ReactNode) => ReactNode }) {
  const router = useRouter();
  const params = useLocalSearchParams<{ aid?: string | string[] }>();
  const { isWide, isPhone, bp } = useBreakpoint();
  const online = useOnlineOnly();
  const activities = useActivities();
  const entries = usePlanEntries();
  const today = useToday();
  const me = useCurrentMember();

  const [query, setQuery] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [sort, setSort] = useState<ActivitySort>('name');
  const [creating, setCreating] = useState(false);

  const selectedId = isWide ? param(params.aid) : undefined;

  const open = (activityId: Id) => {
    if (isWide) router.setParams({ aid: activityId });
    else router.push({ pathname: '/plan/aktivitaet/[id]', params: { id: activityId } });
  };

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
  const top = (
    <>
      {props.header(
        <>
          {addButton}
          {isPhone ? <ProfileButton /> : null}
        </>,
      )}
      {online.hint ? (
        <Text
          variant="small"
          color="warn"
          testID="activity-offline-hint"
          style={{ marginTop: -4, marginBottom: 12 }}
        >
          {online.hint}
        </Text>
      ) : null}
    </>
  );

  const sheet = creating ? (
    <ActivityFormSheet onClose={() => setCreating(false)} onSaved={open} onOpenExisting={open} />
  ) : null;

  if (empty) {
    return (
      <Screen testID="activities-screen">
        {top}
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

  const compact = selectedId !== undefined;
  const columns = isPhone || compact ? 1 : bp === 'desktop' ? 3 : 2;
  const listBody = (
    <>
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
        style={{ marginBottom: 12 }}
        testID="activity-search"
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingBottom: 2 }}
        style={{ marginBottom: 12, flexGrow: 0 }}
      >
        <Chip
          label="Favoriten"
          icon="heart"
          selected={favoritesOnly}
          onPress={() => setFavoritesOnly(!favoritesOnly)}
          testID="afilter-favorites"
        />
      </ScrollView>
      <View style={{ marginBottom: 12, maxWidth: compact || isPhone ? undefined : 420 }}>
        <Segmented
          label="Sortierung"
          value={sort}
          onChange={setSort}
          options={SORTS}
          testID="activity-sort"
        />
      </View>
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

  if (compact && selectedId !== undefined) {
    return (
      <Screen testID="activities-screen" scroll={false} style={{ flex: 1, paddingBottom: 0 }}>
        <View style={{ flex: 1, flexDirection: 'row', gap: 32 }}>
          <View style={{ width: LIST_COLUMN_WIDTH }}>
            <ScrollColumn>
              {top}
              {listBody}
            </ScrollColumn>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <ScrollColumn>
              <View style={{ paddingTop: 16 }}>
                <ActivityDetail
                  activityId={selectedId}
                  onClose={() => router.setParams({ aid: undefined })}
                  onOpen={open}
                />
              </View>
            </ScrollColumn>
          </View>
        </View>
        {sheet}
      </Screen>
    );
  }

  return (
    <Screen testID="activities-screen">
      {top}
      {listBody}
      {sheet}
    </Screen>
  );
}

function ScrollColumn(props: { children: ReactNode }) {
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: 96 }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {props.children}
    </ScrollView>
  );
}

function ActivityCard(props: {
  activity: Activity;
  myRating: number;
  isFavorite: boolean;
  visits?: Visits;
  selected: boolean;
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
