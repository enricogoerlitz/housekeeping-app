import {
  useActivitiesById,
  useMembersById,
  usePlanEntries,
  useRecipesById,
  useRestaurantsById,
} from '@housekeeping/api';
import {
  entryKindRole,
  formatLongDate,
  plannedAllLabel,
  withTime,
  type Activity,
  type ISODate,
  type MealPlanEntry,
  type Recipe,
} from '@housekeeping/core';
import { Avatar, Badge, Button, Row, Section, Surface, Text, useTheme } from '@housekeeping/ui';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { hasPlace } from '@/features/activities/labels';
import { useOpenActivity } from '@/features/activities/navigation';
import { EntryPicture } from '@/features/meal-plan/entry-picture';
import { kindBadge } from '@/features/meal-plan/kind-badges';
import { useOpenRecipe } from '@/features/recipes/navigation';
import { entryTime } from '@/features/meal-plan/labels';
import { useOpenRestaurant } from '@/features/restaurants/navigation';
import { RouteSheet, type RouteTarget } from '@/features/restaurants/route-sheet';
import { useOnlineOnly } from '@/features/shell/offline';

import { plannedTitle } from './planned-title';
import { useOpenCalendarAt } from './today-header';

export interface TodayMealsProps {
  shown: ISODate;
  /** "Heute geplant" or "Geplant am Samstag". */
  title: string;
  /** The shown day's plan entries in the order of the day (Tageszeit, then kind). */
  entries: MealPlanEntry[];
  slotNames: Record<string, string>;
  /** "Hinzufügen" of an empty day: the add window for the shown day (spec 0020, REQ-005). */
  onAdd: () => void;
  /** Phone: one row to swipe sideways (D7); wider: a grid with 16:10 photos (AC-010). */
  grid: boolean;
}

/** Phone cards keep one width, so the third of three is cut at the edge (AC-010). */
const PHONE_CARD_WIDTH = 156;
const PHOTO_RATIO = 16 / 10;
const GRID_COLUMNS = 3;
const GRID_GAP = 14;

function gridRows(entries: MealPlanEntry[]): MealPlanEntry[][] {
  const rows: MealPlanEntry[][] = [];
  for (let index = 0; index < entries.length; index += GRID_COLUMNS) {
    rows.push(entries.slice(index, index + GRID_COLUMNS));
  }
  return rows;
}

/**
 * The card's Kennzeichen (AC-009): leftovers are a recipe too; free text ("Pizza bestellen") has
 * none, it may be anything. A planned collection reads "Sammlung" (AC-012, spec 0009 AC-022).
 */
function badgeFor(entry: MealPlanEntry, collection: boolean) {
  if (entry.kind === 'text') return undefined;
  const role = collection && entry.kind === 'recipe' ? 'collection' : entryKindRole(entry, {});
  return { ...kindBadge(role), testID: `today-badge-${entry.id}` };
}

/**
 * "Heute geplant" / "Geplant am Samstag" (spec 0011, REQ-002): everything planned for the shown
 * day in the order of the day, each card with kind, Tageszeit, Zusatz, cook and "Route"; from four
 * entries "Alle n ›" opens the day in the calendar (AC-011). An empty day reads "Nichts geplant"
 * with "Hinzufügen" (spec 0020, REQ-005, AC-022), online only.
 */
export function TodayMeals(props: TodayMealsProps) {
  const theme = useTheme();
  const recipesById = useRecipesById();
  const restaurantsById = useRestaurantsById();
  const activitiesById = useActivitiesById();
  const openRecipe = useOpenRecipe();
  const openRestaurant = useOpenRestaurant();
  const openActivity = useOpenActivity();
  const openCalendarAt = useOpenCalendarAt();
  const online = useOnlineOnly();
  const planEntries = usePlanEntries();
  const [routeFor, setRouteFor] = useState<RouteTarget | undefined>();
  const allLabel = plannedAllLabel(props.entries.length);
  const titleOf = (entry: MealPlanEntry) =>
    plannedTitle(entry, recipesById, planEntries, restaurantsById, activitiesById);

  const card = (entry: MealPlanEntry) => {
    const slotName = props.slotNames[entry.slotId] ?? '';
    const restaurant =
      entry.kind === 'restaurant' && entry.restaurantId
        ? restaurantsById[entry.restaurantId]
        : undefined;
    const activity =
      entry.kind === 'activity' && entry.activityId ? activitiesById[entry.activityId] : undefined;
    if (restaurant) {
      return (
        <PlannedCard
          entry={entry}
          // "Vormittag · 10:30": the time of a restaurant or activity (spec 0021, AC-035).
          kicker={withTime(slotName, entryTime(entry))}
          title={titleOf(entry)}
          meta={restaurant.cuisine}
          onPress={() => openRestaurant(restaurant.id)}
          corner={<RouteButton entryId={entry.id} onPress={() => setRouteFor(restaurant)} />}
        />
      );
    }
    if (entry.kind === 'activity') {
      return (
        <ActivityCard
          entry={entry}
          activity={activity}
          title={titleOf(entry)}
          slotName={slotName}
          onPress={activity ? () => openActivity(activity.id) : undefined}
          onRoute={
            activity && hasPlace(activity)
              ? () =>
                  setRouteFor({
                    name: activity.name,
                    address: activity.address,
                    location: activity.location,
                    placeName: activity.placeName,
                  })
              : undefined
          }
        />
      );
    }
    const recipe = entry.recipeId ? recipesById[entry.recipeId] : undefined;
    return (
      <MealCard
        entry={entry}
        recipe={recipe}
        title={titleOf(entry)}
        slotName={slotName}
        onPress={recipe ? () => openRecipe(recipe.id) : undefined}
      />
    );
  };

  return (
    <Section
      title={props.title}
      testID="today-meals"
      action={
        allLabel ? (
          <Button
            label={allLabel}
            variant="link"
            size="sm"
            onPress={() => openCalendarAt(props.shown)}
            testID="today-meals-all"
          />
        ) : undefined
      }
    >
      {props.entries.length === 0 ? (
        <View testID="today-meals-empty" style={{ gap: 4, alignItems: 'flex-start' }}>
          <Text color="muted">Nichts geplant</Text>
          <Button
            label="Hinzufügen"
            icon="plus"
            variant="link"
            size="sm"
            disabled={online.disabled}
            hint={online.hint}
            onPress={props.onAdd}
            testID="today-add"
          />
        </View>
      ) : props.grid ? (
        <View style={{ gap: GRID_GAP }}>
          {gridRows(props.entries).map((row) => (
            <View key={row[0]?.id} style={{ flexDirection: 'row', gap: GRID_GAP }}>
              {Array.from({ length: GRID_COLUMNS }, (_, index) => {
                const entry = row[index];
                // Empty places keep the columns of a shorter last row in line.
                return entry ? (
                  <View key={entry.id} style={{ flex: 1, minWidth: 0 }}>
                    {card(entry)}
                  </View>
                ) : (
                  <View key={`empty-${index}`} style={{ flex: 1 }} />
                );
              })}
            </View>
          ))}
        </View>
      ) : (
        // The row bleeds to the screen edge, so a cut card reads as "there is more" (D7).
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          testID="today-meals-row"
          style={{ marginHorizontal: -theme.shape.gutter }}
          contentContainerStyle={{ gap: 12, paddingHorizontal: theme.shape.gutter }}
        >
          {props.entries.map((entry) => (
            <View key={entry.id} style={{ width: PHONE_CARD_WIDTH }}>
              {card(entry)}
            </View>
          ))}
        </ScrollView>
      )}
      {routeFor ? (
        <RouteSheet restaurant={routeFor} visible onClose={() => setRouteFor(undefined)} />
      ) : null}
    </Section>
  );
}

/**
 * A planned entry: photo 16:10 with the kind over its corner, Tageszeit, title and one line of
 * detail. Kicker, two title lines and the meta line keep their space, so every card has the same
 * height and the page below never moves (AC-010).
 */
function PlannedCard(props: {
  entry: MealPlanEntry;
  kicker: string;
  title: string;
  meta?: ReactNode;
  /** A planned collection: Kennzeichen "Sammlung". */
  collection?: boolean;
  onPress?: () => void;
  corner?: ReactNode;
}) {
  const theme = useTheme();
  const badge = badgeFor(props.entry, props.collection === true);
  const content = (
    <Surface padding={0} style={{ overflow: 'hidden', flex: 1 }}>
      <View>
        <EntryPicture entry={props.entry} aspectRatio={PHOTO_RATIO} radius={0} />
        {badge ? (
          <View style={{ position: 'absolute', bottom: 8, left: 8 }}>
            <Badge label={badge.label} icon={badge.icon} testID={badge.testID} />
          </View>
        ) : null}
      </View>
      <View style={{ padding: 12, paddingTop: 10, gap: 2 }}>
        <Text variant="caption" color="muted" numberOfLines={1}>
          {props.kicker}
        </Text>
        <Text
          variant="cardTitle"
          numberOfLines={2}
          style={{ minHeight: theme.type.cardTitle.lineHeight * 2 }}
        >
          {props.title}
        </Text>
        <View style={{ minHeight: theme.type.caption.lineHeight + 4, justifyContent: 'center' }}>
          {typeof props.meta === 'string' ? (
            <Text variant="caption" color="muted" numberOfLines={1}>
              {props.meta}
            </Text>
          ) : (
            props.meta
          )}
        </View>
      </View>
    </Surface>
  );
  return (
    <View style={{ flex: 1 }}>
      {props.onPress ? (
        <Pressable
          testID={`today-meal-${props.entry.id}`}
          accessibilityRole="button"
          accessibilityLabel={badge ? `${props.title}, ${badge.label}` : props.title}
          onPress={props.onPress}
          style={(state) => ({
            flex: 1,
            opacity: state.pressed ? 0.75 : 1,
            borderRadius: theme.shape.radius.card,
          })}
        >
          {content}
        </Pressable>
      ) : (
        <View testID={`today-meal-${props.entry.id}`} style={{ flex: 1 }}>
          {content}
        </View>
      )}
      {/* Never inside the pressable card: a button in a button is invalid on the web. */}
      {props.corner ? (
        <View style={{ position: 'absolute', top: 8, right: 8 }}>{props.corner}</View>
      ) : null}
    </View>
  );
}

function RouteButton(props: { entryId: string; onPress: () => void }) {
  return (
    <Button
      label="Route"
      icon="map-pin"
      size="sm"
      variant="secondary"
      onPress={props.onPress}
      testID={`today-route-${props.entryId}`}
    />
  );
}

/** An activity: its own photo, "Bouldern (Boulderhalle Ost)", the place (AC-009). */
function ActivityCard(props: {
  entry: MealPlanEntry;
  activity?: Activity;
  title: string;
  slotName: string;
  onPress?: () => void;
  /** Only when the activity has a place. */
  onRoute?: () => void;
}) {
  const { entry, activity } = props;
  return (
    <PlannedCard
      entry={entry}
      kicker={props.slotName}
      title={props.title}
      meta={activity?.placeName ?? activity?.address}
      onPress={props.onPress}
      corner={
        props.onRoute ? <RouteButton entryId={entry.id} onPress={props.onRoute} /> : undefined
      }
    />
  );
}

function MealCard(props: {
  entry: MealPlanEntry;
  recipe?: Recipe;
  title: string;
  slotName: string;
  onPress?: () => void;
}) {
  const { entry, recipe } = props;
  const membersById = useMembersById();
  const planEntries = usePlanEntries();
  const collection = recipe?.kind === 'collection';
  const cook = entry.cookId ? membersById[entry.cookId] : undefined;
  const leftovers = entry.kind === 'leftovers';
  const source = leftovers
    ? planEntries.find((candidate) => candidate.id === entry.leftoversOfEntryId)
    : undefined;

  const kicker = leftovers
    ? `${props.slotName} · Reste`
    : recipe?.totalMinutes !== undefined
      ? `${props.slotName} · ${recipe.totalMinutes} Min`
      : props.slotName;

  const meta = cook ? (
    <Row gap={6} style={{ minWidth: 0 }}>
      <Avatar name={cook.name} color={cook.color} size="xs" />
      <Text variant="caption" color="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
        {cook.name} kocht
      </Text>
    </Row>
  ) : source?.date ? (
    `von ${weekdayName(source.date)}`
  ) : undefined;

  return (
    <PlannedCard
      entry={entry}
      kicker={kicker}
      title={props.title}
      meta={meta}
      collection={collection}
      onPress={props.onPress}
    />
  );
}

function weekdayName(date: ISODate): string {
  return formatLongDate(date).split(',')[0] ?? '';
}
