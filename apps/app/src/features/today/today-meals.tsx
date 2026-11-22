import {
  useActivitiesById,
  useMembersById,
  usePhoto,
  usePlanEntries,
  useRecipesById,
  useRestaurantsById,
} from '@housekeeping/api';
import {
  formatLongDate,
  plannedAllLabel,
  withNote,
  withTime,
  type Activity,
  type Restaurant,
  type ISODate,
  type MealPlanEntry,
  type Recipe,
} from '@housekeeping/core';
import {
  Avatar,
  Badge,
  Button,
  Icon,
  Photo,
  PhotoCollage,
  Row,
  Section,
  Surface,
  Text,
  useTheme,
  type IconName,
} from '@housekeeping/ui';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { hasPlace } from '@/features/activities/labels';
import { useOpenActivity } from '@/features/activities/navigation';
import { useOpenRecipe } from '@/features/recipes/navigation';
import { useCoverSources } from '@/features/recipes/recipe-cover';
import { entryTime } from '@/features/meal-plan/labels';
import { useOpenRestaurant } from '@/features/restaurants/navigation';
import { RouteSheet, type RouteTarget } from '@/features/restaurants/route-sheet';

import { useOpenCalendarAt } from './today-header';

export interface TodayMealsProps {
  shown: ISODate;
  /** "Heute geplant" or "Geplant am Samstag". */
  title: string;
  /** The shown day's plan entries in the order of the day (Tageszeit, then kind). */
  entries: MealPlanEntry[];
  /** Plan entries of the day after the shown one, for the lead-time hints (AC-014). */
  nextDayEntries: MealPlanEntry[];
  slotNames: Record<string, string>;
  /** Phone: one row to swipe sideways (D7); wider: a grid with 16:10 photos (AC-010). */
  grid: boolean;
}

const BADGES = {
  recipe: { label: 'Rezept', icon: 'cooking-pot' },
  collection: { label: 'Sammlung', icon: 'layers' },
  restaurant: { label: 'Restaurant', icon: 'utensils' },
  activity: { label: 'Aktivität', icon: 'mountain' },
} as const;

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
  const kind =
    entry.kind === 'leftovers'
      ? 'recipe'
      : collection && entry.kind === 'recipe'
        ? 'collection'
        : entry.kind;
  return kind === 'text' ? undefined : { ...BADGES[kind], testID: `today-badge-${entry.id}` };
}

/**
 * "Heute geplant" / "Geplant am Samstag" (spec 0011, REQ-002): everything planned for the shown
 * day in the order of the day, each card with kind, Tageszeit, Zusatz, cook and "Route"; from four
 * entries "Alle n ›" opens the day in the calendar (AC-011), an empty day "Im Kalender planen ›"
 * (AC-013). Below: "Für morgen" for the day after the shown one (AC-014).
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
  const [routeFor, setRouteFor] = useState<RouteTarget | undefined>();
  const allLabel = plannedAllLabel(props.entries.length);

  const prep = props.nextDayEntries.flatMap((entry) => {
    const recipe =
      entry.recipeId && entry.kind === 'recipe' ? recipesById[entry.recipeId] : undefined;
    return recipe?.leadTime ? [{ entry, recipe, leadTime: recipe.leadTime }] : [];
  });

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
        <RestaurantCard
          entry={entry}
          restaurant={restaurant}
          // "Vormittag · 10:30": the time of a restaurant or activity (spec 0021, AC-035).
          kicker={withTime(slotName, entryTime(entry))}
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
            label="Im Kalender planen ›"
            variant="link"
            size="sm"
            onPress={() => openCalendarAt(props.shown)}
            testID="today-plan"
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
      {prep.length > 0 ? (
        <View testID="today-prep" style={{ marginTop: 14, gap: 6 }}>
          {prep.map((item) => (
            <Row key={item.entry.id} gap={8} align="flex-start">
              <Icon name="alarm-clock" size={18} color="accent" />
              <Text style={{ flex: 1 }} testID={`today-prep-${item.entry.id}`}>
                <Text variant="bodyStrong">Für morgen: </Text>
                {item.leadTime.text} ({item.leadTime.hoursBefore} h)
                <Text color="muted"> · {item.recipe.title}</Text>
              </Text>
            </Row>
          ))}
        </View>
      ) : null}
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
  image?: number | { uri: string };
  /** A recipe's or collection's cover (spec 0009, E14): one photo, a collage or none. */
  images?: readonly (number | { uri: string })[];
  placeholderIcon: IconName;
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
        {props.images ? (
          <PhotoCollage
            sources={props.images}
            placeholderIcon={props.placeholderIcon}
            aspectRatio={PHOTO_RATIO}
            radius={0}
          />
        ) : (
          <Photo
            source={props.image}
            placeholderIcon={props.placeholderIcon}
            aspectRatio={PHOTO_RATIO}
            radius={0}
          />
        )}
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

/** A planned restaurant with its own photo, else the cutlery (spec 0024, REQ-004). */
function RestaurantCard(props: {
  entry: MealPlanEntry;
  restaurant: Restaurant;
  kicker: string;
  onPress: () => void;
  corner: ReactNode;
}) {
  const photo = usePhoto(props.restaurant.photoPath);
  return (
    <PlannedCard
      entry={props.entry}
      kicker={props.kicker}
      title={props.restaurant.name}
      meta={props.restaurant.cuisine}
      image={photo.uri ? { uri: photo.uri } : undefined}
      placeholderIcon="utensils"
      onPress={props.onPress}
      corner={props.corner}
    />
  );
}

/** An activity: its own photo, "Bouldern (Boulderhalle Ost)", the place (AC-009). */
function ActivityCard(props: {
  entry: MealPlanEntry;
  activity?: Activity;
  slotName: string;
  onPress?: () => void;
  /** Only when the activity has a place. */
  onRoute?: () => void;
}) {
  const { entry, activity } = props;
  const photo = usePhoto(activity?.photoPath);
  return (
    <PlannedCard
      entry={entry}
      kicker={props.slotName}
      title={withNote(activity?.name ?? entry.text ?? 'Aktivität', entry.note)}
      meta={activity?.placeName ?? activity?.address}
      image={photo.uri ? { uri: photo.uri } : undefined}
      placeholderIcon="mountain"
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
  slotName: string;
  onPress?: () => void;
}) {
  const { entry, recipe } = props;
  const membersById = useMembersById();
  const planEntries = usePlanEntries();
  const images = useCoverSources(recipe);
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
      title={recipe?.title ?? entry.text ?? 'Essen'}
      meta={meta}
      images={images}
      placeholderIcon={collection ? 'layers' : 'utensils'}
      collection={collection}
      onPress={props.onPress}
    />
  );
}

function weekdayName(date: ISODate): string {
  return formatLongDate(date).split(',')[0] ?? '';
}
